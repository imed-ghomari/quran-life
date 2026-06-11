'use client';

import { useContext, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { db } from '@/lib/instant';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { OnlineStatusContext } from '@/components/Providers';

const PUBLIC_PATHS = new Set(['/', '/auth']);
const OFFLINE_ACCESS_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const OFFLINE_ACCESS_KEY = 'auth:offlineAccess';
const FORCE_OFFLINE_OPEN_KEY = 'auth:forceOfflineOpen';
const FORCE_OFFLINE_OPEN_TTL_MS = 20 * 1000;
const SIGNING_OUT_KEY = 'auth:signingOut';
const POST_SIGN_OUT_UNTIL_KEY = 'auth:postSignOutUntil';
const AUTH_RESOLVED_ONCE_KEY = 'auth:resolvedOnce';

let hasClientHydratedOnce = false;

function readAuthResolvedOnceMarker() {
  if (typeof window === 'undefined') return false;
  try {
    return (
      window.sessionStorage.getItem(AUTH_RESOLVED_ONCE_KEY) === '1'
      || window.localStorage.getItem(AUTH_RESOLVED_ONCE_KEY) === '1'
    );
  } catch {
    return false;
  }
}

function writeAuthResolvedOnceMarker() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(AUTH_RESOLVED_ONCE_KEY, '1');
  } catch {
    // Best-effort cache write.
  }
  try {
    window.localStorage.setItem(AUTH_RESOLVED_ONCE_KEY, '1');
  } catch {
    // Best-effort cache write.
  }
}

function hasValidOfflineAccessMarker() {
  if (typeof window === 'undefined') return false;
  const raw = window.localStorage.getItem(OFFLINE_ACCESS_KEY);
  if (!raw) return false;

  try {
    const parsed = JSON.parse(raw) as { userId?: string; updatedAt?: number };
    const updatedAt = Number(parsed?.updatedAt ?? 0);
    const hasValidTimestamp = Number.isFinite(updatedAt) && Date.now() - updatedAt <= OFFLINE_ACCESS_TTL_MS;
    const hasUserId = typeof parsed?.userId === 'string' && parsed.userId.length > 0;
    return hasValidTimestamp && hasUserId;
  } catch {
    return false;
  }
}
type AuthGateProps = {
  children: React.ReactNode;
};

export default function AuthGate({ children }: AuthGateProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isOnline = useContext(OnlineStatusContext);
  const { user, isLoading: isAuthLoading } = db.useAuth();
  const [isHydrated, setIsHydrated] = useState(() => hasClientHydratedOnce);
  const [hasResolvedAuthOnce, setHasResolvedAuthOnce] = useState(false);
  const [hasOfflineAccess, setHasOfflineAccess] = useState(false);
  const [hasForcedOfflineOpen, setHasForcedOfflineOpen] = useState(false);

  const isPublic = useMemo(() => PUBLIC_PATHS.has(pathname), [pathname]);

  useEffect(() => {
    setIsHydrated(true);
    hasClientHydratedOnce = true;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setHasResolvedAuthOnce(readAuthResolvedOnceMarker());
    setHasOfflineAccess(hasValidOfflineAccessMarker());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (user?.id) {
      const marker = JSON.stringify({ userId: user.id, updatedAt: Date.now() });
      window.localStorage.setItem(OFFLINE_ACCESS_KEY, marker);
      setHasOfflineAccess(true);
      return;
    }

    const valid = hasValidOfflineAccessMarker();
    setHasOfflineAccess(valid);
    if (!valid) {
      window.localStorage.removeItem(OFFLINE_ACCESS_KEY);
    }
  }, [user?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(FORCE_OFFLINE_OPEN_KEY);
    if (!raw) {
      setHasForcedOfflineOpen(false);
      return;
    }
    const timestamp = Number(raw);
    const valid = Number.isFinite(timestamp) && Date.now() - timestamp <= FORCE_OFFLINE_OPEN_TTL_MS;
    setHasForcedOfflineOpen(valid);
    if (!valid) {
      window.localStorage.removeItem(FORCE_OFFLINE_OPEN_KEY);
    }
  }, [pathname]);

  const shouldTreatAsOffline = !isOnline || (hasOfflineAccess && hasForcedOfflineOpen);
  const shouldBlockOnAuthLoad = isAuthLoading && !user && !hasOfflineAccess;

  useEffect(() => {
    if (!isAuthLoading) {
      setHasResolvedAuthOnce(true);
      writeAuthResolvedOnceMarker();
    }
  }, [isAuthLoading]);

  useEffect(() => {
    if (isPublic) return;
    if (isAuthLoading) return;
    if (!isOnline || (hasOfflineAccess && hasForcedOfflineOpen)) return;

    if (typeof window !== 'undefined') {
      const isSigningOut = window.localStorage.getItem(SIGNING_OUT_KEY) === '1';
      const postSignOutUntil = Number(window.localStorage.getItem(POST_SIGN_OUT_UNTIL_KEY) ?? 0);
      const hasPostSignOutWindow = Number.isFinite(postSignOutUntil) && postSignOutUntil > Date.now();

      if (isSigningOut || hasPostSignOutWindow) {
        router.replace('/');
        return;
      }

      if (Number.isFinite(postSignOutUntil) && postSignOutUntil <= Date.now()) {
        window.localStorage.removeItem(SIGNING_OUT_KEY);
        window.localStorage.removeItem(POST_SIGN_OUT_UNTIL_KEY);
      }
    }

    if (!user) {
      router.replace('/auth');
      return;
    }
  }, [
    isPublic,
    isAuthLoading,
    isOnline,
    hasOfflineAccess,
    hasForcedOfflineOpen,
    user,
    router,
  ]);

  if (!isHydrated) {
    return <PageSkeleton />;
  }

  if (isPublic) {
    return <>{children}</>;
  }

  const isRedirecting =
    !shouldTreatAsOffline
    && !user
    && hasResolvedAuthOnce;

  if (shouldBlockOnAuthLoad || isRedirecting) {
    return <PageSkeleton />;
  }

  if (shouldTreatAsOffline) {
    if (!user && !hasOfflineAccess) {
      return <PageSkeleton />;
    }
    return <>{children}</>;
  }

  if (!user) {
    return <PageSkeleton />;
  }

  return <>{children}</>;
}
