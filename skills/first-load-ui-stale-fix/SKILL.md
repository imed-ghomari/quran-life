---
name: first-load-ui-stale-fix
description: Diagnose and fix cases where first load shows old UI styles while reload shows new UI, usually due to CSS leakage from landing/public routes into app routes in Next.js apps.
metadata:
  short-description: Fix first-load old UI/CSS leakage
---

# First-Load UI Stale Fix

Use this skill when the app shows an old UI on first navigation/open, but looks correct after reload.

## Signals this skill matches

- First visit to `/` or app shell shows outdated layout/styles.
- Reload immediately shows the new UI.
- Issue appears in many app pages except one or two pages.
- User suspects PWA/service worker, but behavior persists without PWA.

## Primary hypothesis

This is often CSS cascade contamination, not stale JS bundles:

- Marketing/landing components import global CSS with generic selectors (`.card`, `.btn`, `.container`, etc.).
- Logged-in users hit `/`, auth redirects to app pages.
- Landing module is imported before redirect resolves, so its CSS remains active and overrides app UI.

## Workflow

1. Find risky imports and selectors.
- Search for global landing CSS imports.
- Search for generic class selectors in that CSS.
- Search where landing components are imported by home/app routes.

2. Isolate landing render path for authenticated users.
- In the home client wrapper, dynamically import landing component.
- Return `null` while auth is loading or user is authenticated.
- Only render landing when user is definitively unauthenticated.

3. Validate no regression.
- Run project build/typecheck.
- Confirm first load of `/` while logged in no longer applies old landing styling to app routes.

4. If issue remains, scope landing CSS.
- Prefix broad selectors under `.landing-wrapper`.
- Keep landing styles local and non-generic where possible.

## Minimal patch pattern

```tsx
'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

const LandingPage = dynamic(() => import('./LandingPage'), { ssr: false });

export default function HomePageClient() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (user) router.replace('/dashboard');
  }, [isLoading, user, router]);

  if (isLoading || user) return null;
  return <LandingPage onBuy={...} />;
}
```

## Guardrails

- Do not start with service worker deletion unless CSS leakage is ruled out.
- Avoid full-page forced reload hacks unless explicitly requested.
- Prefer deterministic fixes: import boundary + selector scoping.
- Keep changes focused to home/landing path first.

## Completion checklist

- Landing is no longer statically imported on authenticated first-load path.
- Build passes.
- First navigation to `/` while logged in renders new UI directly (no old style flash).
