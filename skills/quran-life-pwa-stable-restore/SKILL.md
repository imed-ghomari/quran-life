---
name: quran-life-pwa-stable-restore
description: Restore Quran Life to the known stable PWA/auth baseline (offline access works, auth stays secure, no stale checkout/loop regressions) after risky changes.
---

# Quran Life PWA Stable Restore

Use this skill when the app regresses after PWA/auth/cache changes and you want to return to the currently validated baseline quickly.

## What this baseline guarantees

1. Offline PWA access is available for previously authenticated users.
2. Auth remains secure (no offline sign-in, no anonymous premium access).
3. `/checkout` never shows legacy UI and resolves to `/auth`.
4. Bypass/payment-bypass users are redirected away from checkout to `/dashboard`.
5. Service worker updates avoid stale UI and cache poisoning from old builds.

## Golden architecture

### App gating

- `src/app/(app)/layout.tsx` returns `<AuthGate>{children}</AuthGate>` only.
- Do not add server redirects in app layout.

### Auth/offline flow ownership

- `src/components/AuthGate.tsx` owns protected route redirect decisions.
- Offline markers:
  - `auth:offlineAccess` (userId + updatedAt, TTL)
  - `auth:forceOfflineOpen` (short TTL)
- `/auth` offline action routes users through `/offline-app`, then to `/dashboard`.

### Access state loading

- `src/components/Providers.tsx` computes subscription loading as online-blocking only:

```ts
isAuthLoading || (isOnline && (...access state still loading...))
```

- Never reintroduce timeout-based auth/subscription bypass on `/auth`.
- Access refresh should be keyed by stable auth identity, not raw object identity.

### PWA stack (next-pwa)

- PWA plugin: `@ducanh2912/next-pwa` in `next.config.js`.
- Keep auth-sensitive routes out of stale cached auth-page behavior.
- Keep API routes network-only.
- Cache core app documents and app-router route data (`?_rsc`) for offline tab switching.
- Bump SW migration key in `Providers` whenever runtime caching strategy changes.

## Fast restore checklist

1. Confirm `next.config.js` uses `@ducanh2912/next-pwa` (not Serwist).
2. Confirm app route caching includes:
   - `/dashboard`, `/todo`, `/statistics`, `/settings`, `/docs`, `/docs/*`, `/offline-app`
3. Confirm runtime caching includes `?_rsc` requests for those app routes with `ignoreSearch: true`.
4. Confirm API runtime caching is `NetworkOnly`.
5. Confirm `src/app/(public-auth)/checkout/page.tsx` redirects to `/auth`.
6. Confirm `/auth` redirects authenticated premium/bypass users to `/dashboard`.
7. Confirm `AuthGate` is the only protected-route gatekeeper.
8. Bump `SW_MIGRATION_KEY` in `src/components/Providers.tsx`.
9. Run build.

## Verification commands

```bash
rg -n "next-pwa|runtimeCaching|_rsc|NetworkOnly|offline-app" next.config.js -S
rg -n "SW_MIGRATION_KEY|auth:offlineAccess|auth:forceOfflineOpen|isSubscriptionLoading" src/components/Providers.tsx src/components/AuthGate.tsx -S
rg -n "redirect\('/auth'\)" 'src/app/(public-auth)/checkout/page.tsx' -S
rg -n "isPaymentBypass|window.location.replace\('/dashboard'\)" 'src/app/(public-auth)/auth/page.tsx' -S
npm run build
```

## Playwright sanity checks

Use `[$playwright](/Users/Apple/.codex/skills/playwright/SKILL.md)` for scripted checks:

1. `/checkout` resolves to `/auth`.
2. Unauthenticated `/dashboard` resolves to auth flow.
3. Offline warm session can open dashboard via `/offline-app` path.

## Known follow-up

This skill captures the stable baseline now. If you validate additional improvements manually, update this skill immediately so rollback targets the newest known-good state.
