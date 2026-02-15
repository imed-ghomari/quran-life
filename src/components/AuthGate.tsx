'use client';

import { useContext, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { db } from '@/lib/instant';
import Spinner from '@/components/ui/Spinner';
import { AccessStateContext, OnlineStatusContext } from '@/components/Providers';

const PUBLIC_PATHS = new Set(['/', '/auth']);
const CHECKOUT_GRACE_PERIOD_MS = 10 * 60 * 1000;
const OFFLINE_ACCESS_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const OFFLINE_ACCESS_KEY = 'auth:offlineAccess';
const FORCE_OFFLINE_OPEN_KEY = 'auth:forceOfflineOpen';
const FORCE_OFFLINE_OPEN_TTL_MS = 20 * 1000;
const SIGNING_OUT_KEY = 'auth:signingOut';
const POST_SIGN_OUT_UNTIL_KEY = 'auth:postSignOutUntil';
const AUTH_RESOLVED_ONCE_KEY = 'auth:resolvedOnce';

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
  const { hasActiveSubscription, isPaymentBypass, isSubscriptionLoading } = useContext(AccessStateContext);
  const { user, isLoading: isAuthLoading } = db.useAuth();
  const [hasResolvedAuthOnce, setHasResolvedAuthOnce] = useState(false);
  const [hasRecentCheckout, setHasRecentCheckout] = useState(false);
  const [hasCheckedCheckout, setHasCheckedCheckout] = useState(false);
  const [hasOfflineAccess, setHasOfflineAccess] = useState(false);
  const [hasForcedOfflineOpen, setHasForcedOfflineOpen] = useState(false);

  const isPublic = useMemo(() => PUBLIC_PATHS.has(pathname), [pathname]);
  const isCheckoutRoute = useMemo(() => pathname === '/checkout', [pathname]);
  const hasAccess = hasActiveSubscription || isPaymentBypass || hasRecentCheckout;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setHasResolvedAuthOnce(window.sessionStorage.getItem(AUTH_RESOLVED_ONCE_KEY) === '1');
    setHasOfflineAccess(hasValidOfflineAccessMarker());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (hasActiveSubscription) {
      window.localStorage.removeItem('checkout:completed');
      setHasRecentCheckout(false);
      setHasCheckedCheckout(true);
      return;
    }
    const raw = window.localStorage.getItem('checkout:completed');
    if (!raw) {
      setHasRecentCheckout(false);
      setHasCheckedCheckout(true);
      return;
    }
    const timestamp = Number(raw);
    if (!Number.isFinite(timestamp)) {
      window.localStorage.removeItem('checkout:completed');
      setHasRecentCheckout(false);
      setHasCheckedCheckout(true);
      return;
    }
    const isFresh = Date.now() - timestamp <= CHECKOUT_GRACE_PERIOD_MS;
    setHasRecentCheckout(isFresh);
    setHasCheckedCheckout(true);
  }, [hasActiveSubscription]);

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
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(AUTH_RESOLVED_ONCE_KEY, '1');
      }
    }
  }, [isAuthLoading]);

  useEffect(() => {
    if (isPublic) return;
    if (isAuthLoading) return;
    if (!hasActiveSubscription && !isPaymentBypass && !hasCheckedCheckout) return;
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

    if (isSubscriptionLoading) return;

    if (!hasAccess && !isCheckoutRoute) {
      router.replace('/auth');
      return;
    }

    if (hasAccess && isCheckoutRoute) {
      router.replace('/dashboard');
      return;
    }
  }, [
    isPublic,
    isAuthLoading,
    isSubscriptionLoading,
    hasActiveSubscription,
    isPaymentBypass,
    hasCheckedCheckout,
    isOnline,
    hasOfflineAccess,
    hasForcedOfflineOpen,
    user,
    hasAccess,
    isCheckoutRoute,
    router,
  ]);

  if (!isHydrated) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--background)',
      }}>
        <Spinner text="Verifying access..." />
      </div>
    );
  }

  if (isPublic) {
    return <>{children}</>;
  }

  const needsCheckoutDecision =
    !hasActiveSubscription && !isPaymentBypass && !hasCheckedCheckout;
  const shouldBlockOnCheckoutDecision = !shouldTreatAsOffline && needsCheckoutDecision && !user && !hasResolvedAuthOnce;
  const shouldBlockOnSubscriptionLoad = !shouldTreatAsOffline && isSubscriptionLoading;
  const isRedirecting =
    !shouldTreatAsOffline
    && user
    && !shouldBlockOnCheckoutDecision
    && ((hasAccess && isCheckoutRoute) || (!hasAccess && !isCheckoutRoute));

  if (shouldBlockOnAuthLoad || shouldBlockOnSubscriptionLoad || shouldBlockOnCheckoutDecision || isRedirecting) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--background)',
      }}>
        <Spinner text="Verifying access..." />
      </div>
    );
  }

  if (shouldTreatAsOffline) {
    if (!user && !hasOfflineAccess) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--background)',
        }}>
          <Spinner text="Offline access unavailable. Connect once to sign in." />
        </div>
      );
    }
    return <>{children}</>;
  }

  if (!user) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--background)',
      }}>
        <Spinner text="Redirecting to sign in..." />
      </div>
    );
  }

  return <>{children}</>;
}
