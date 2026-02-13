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
type AuthGateProps = {
  children: React.ReactNode;
};

export default function AuthGate({ children }: AuthGateProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isOnline = useContext(OnlineStatusContext);
  const { hasActiveSubscription, isPaymentBypass, isSubscriptionLoading } = useContext(AccessStateContext);
  const { user, isLoading: isAuthLoading } = db.useAuth();
  const [hasRecentCheckout, setHasRecentCheckout] = useState(false);
  const [hasCheckedCheckout, setHasCheckedCheckout] = useState(false);
  const [hasOfflineAccess, setHasOfflineAccess] = useState(false);

  const isPublic = useMemo(() => PUBLIC_PATHS.has(pathname), [pathname]);
  const isCheckoutRoute = useMemo(() => pathname === '/checkout', [pathname]);
  const hasAccess = hasActiveSubscription || isPaymentBypass || hasRecentCheckout;

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

    const raw = window.localStorage.getItem(OFFLINE_ACCESS_KEY);
    if (!raw) {
      setHasOfflineAccess(false);
      return;
    }

    try {
      const parsed = JSON.parse(raw) as { userId?: string; updatedAt?: number };
      const updatedAt = Number(parsed?.updatedAt ?? 0);
      const hasValidTimestamp = Number.isFinite(updatedAt) && Date.now() - updatedAt <= OFFLINE_ACCESS_TTL_MS;
      const hasUserId = typeof parsed?.userId === 'string' && parsed.userId.length > 0;
      const valid = hasValidTimestamp && hasUserId;
      setHasOfflineAccess(valid);
      if (!valid) {
        window.localStorage.removeItem(OFFLINE_ACCESS_KEY);
      }
    } catch {
      window.localStorage.removeItem(OFFLINE_ACCESS_KEY);
      setHasOfflineAccess(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (isPublic) return;
    if (isAuthLoading) return;
    if (!hasActiveSubscription && !isPaymentBypass && !hasCheckedCheckout) return;
    if (!isOnline) return;

    if (typeof window !== 'undefined') {
      const isSigningOut = window.localStorage.getItem('auth:signingOut') === '1';
      if (isSigningOut) {
        window.localStorage.removeItem('auth:signingOut');
        router.replace('/');
        return;
      }
    }

    if (!user) {
      router.replace('/auth');
      return;
    }

    if (isSubscriptionLoading) return;

    if (!hasAccess && !isCheckoutRoute) {
      router.replace('/checkout');
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
    isOnline,
    user,
    hasAccess,
    isCheckoutRoute,
    router,
  ]);

  if (isPublic) {
    return <>{children}</>;
  }

  const needsCheckoutDecision =
    !hasActiveSubscription && !isPaymentBypass && !hasCheckedCheckout;
  const shouldBlockOnCheckoutDecision = isOnline && needsCheckoutDecision;
  const shouldBlockOnSubscriptionLoad = isOnline && isSubscriptionLoading;
  const isRedirecting =
    isOnline
    && user
    && !shouldBlockOnCheckoutDecision
    && ((hasAccess && isCheckoutRoute) || (!hasAccess && !isCheckoutRoute));

  if (isAuthLoading || shouldBlockOnSubscriptionLoad || shouldBlockOnCheckoutDecision || isRedirecting) {
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

  if (!isOnline) {
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
