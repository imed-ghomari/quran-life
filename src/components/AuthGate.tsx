'use client';

import { useContext, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { db } from '@/lib/instant';
import Spinner from '@/components/ui/Spinner';
import { OnlineStatusContext } from '@/components/Providers';
import { isPaymentBypassEmail } from '@/lib/privilegedEmails';

const PUBLIC_PATHS = new Set(['/', '/auth']);
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'past_due', 'trialing']);
const CHECKOUT_GRACE_PERIOD_MS = 10 * 60 * 1000;
type AuthGateProps = {
  children: React.ReactNode;
};

export default function AuthGate({ children }: AuthGateProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isOnline = useContext(OnlineStatusContext);
  const { user, isLoading: isAuthLoading } = db.useAuth();
  const [hasRecentCheckout, setHasRecentCheckout] = useState(false);
  const [hasCheckedCheckout, setHasCheckedCheckout] = useState(false);
  const { data: subscriptionData, isLoading: isSubscriptionLoading } = db.useQuery({
    subscriptions: {
      $: {
        where: { userId: user?.id || '' },
      },
    },
  });

  const isPublic = useMemo(() => PUBLIC_PATHS.has(pathname), [pathname]);
  const isCheckoutRoute = useMemo(() => pathname === '/checkout', [pathname]);
  const hasActiveSubscription = useMemo(() => {
    const subscriptions = subscriptionData?.subscriptions ?? [];
    return subscriptions.some((subscription) => {
      const status = subscription?.status;
      return Boolean(status && ACTIVE_SUBSCRIPTION_STATUSES.has(status));
    });
  }, [subscriptionData?.subscriptions]);
  const isPaymentBypass = useMemo(
    () => isPaymentBypassEmail(user?.email),
    [user?.email]
  );
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
  const isRedirecting =
    isOnline
    && user
    && !needsCheckoutDecision
    && ((hasAccess && isCheckoutRoute) || (!hasAccess && !isCheckoutRoute));

  if (isAuthLoading || isSubscriptionLoading || needsCheckoutDecision || isRedirecting) {
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
