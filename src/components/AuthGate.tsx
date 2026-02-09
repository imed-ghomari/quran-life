'use client';

import { useContext, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { db } from '@/lib/instant';
import Spinner from '@/components/ui/Spinner';
import { OnlineStatusContext } from '@/components/Providers';
import { isPrivilegedEmail } from '@/lib/privilegedEmails';

const PUBLIC_PATHS = new Set(['/', '/auth']);
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'past_due']);
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
  const { data: subscriptionData, isLoading: isSubscriptionLoading } = db.useQuery({
    subscriptions: {
      $: {
        where: { userId: user?.id || '' },
      },
    },
  });

  const isPublic = useMemo(() => PUBLIC_PATHS.has(pathname), [pathname]);
  const isCheckoutRoute = useMemo(() => pathname === '/checkout', [pathname]);
  const latestSubscription = useMemo(() => {
    const subscriptions = subscriptionData?.subscriptions ?? [];
    if (subscriptions.length === 0) return null;
    return [...subscriptions].sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTime - aTime;
    })[0];
  }, [subscriptionData?.subscriptions]);
  const hasActiveSubscription = useMemo(() => {
    const status = latestSubscription?.status;
    if (!status) return false;
    return ACTIVE_SUBSCRIPTION_STATUSES.has(status);
  }, [latestSubscription?.status]);
  const isOwnerEmail = useMemo(() => isPrivilegedEmail(user?.email), [user?.email]);
  const hasAccess = hasActiveSubscription || isOwnerEmail || hasRecentCheckout;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (hasActiveSubscription) {
      window.localStorage.removeItem('checkout:completed');
      setHasRecentCheckout(false);
      return;
    }
    const raw = window.localStorage.getItem('checkout:completed');
    if (!raw) {
      setHasRecentCheckout(false);
      return;
    }
    const timestamp = Number(raw);
    if (!Number.isFinite(timestamp)) {
      window.localStorage.removeItem('checkout:completed');
      setHasRecentCheckout(false);
      return;
    }
    const isFresh = Date.now() - timestamp <= CHECKOUT_GRACE_PERIOD_MS;
    setHasRecentCheckout(isFresh);
  }, [hasActiveSubscription]);

  useEffect(() => {
    if (isPublic) return;
    if (isAuthLoading) return;
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

  if (isAuthLoading || isSubscriptionLoading) {
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

  if (!isOnline) {
    return <>{children}</>;
  }

  return <>{children}</>;
}
