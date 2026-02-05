'use client';

import { useEffect, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { db } from '@/lib/instant';
import Spinner from '@/components/ui/Spinner';

const PUBLIC_PATHS = new Set(['/', '/auth']);

const OWNER_EMAILS = [
  process.env.NEXT_PUBLIC_OWNER_EMAIL,
  process.env.NEXT_PUBLIC_OWNER_EMAIL2,
]
  .filter(Boolean)
  .map((email) => email?.toLowerCase());

type AuthGateProps = {
  children: React.ReactNode;
};

export default function AuthGate({ children }: AuthGateProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = db.useAuth();

  const isPublic = useMemo(() => PUBLIC_PATHS.has(pathname), [pathname]);

  const { data: purchaseData, isLoading: isPurchaseLoading } = db.useQuery({
    purchases: {
      $: {
        where: { email: user?.email || '', status: 'completed' },
      },
    },
  });

  const isOwner = useMemo(() => {
    if (!user?.email) return false;
    return OWNER_EMAILS.includes(user.email.toLowerCase());
  }, [user?.email]);

  const hasPurchase = useMemo(() => {
    return Boolean(purchaseData?.purchases && purchaseData.purchases.length > 0);
  }, [purchaseData?.purchases]);

  useEffect(() => {
    if (isPublic) return;
    if (isAuthLoading) return;

    if (!user) {
      router.replace('/auth');
      return;
    }

    if (!isOwner && !hasPurchase && !isPurchaseLoading) {
      router.replace('/auth');
    }
  }, [isPublic, isAuthLoading, user, isOwner, hasPurchase, isPurchaseLoading, router]);

  if (isPublic) {
    return <>{children}</>;
  }

  if (isAuthLoading) {
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

  if (isPurchaseLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--background)',
      }}>
        <Spinner text="Checking subscription..." />
      </div>
    );
  }

  if (!isOwner && !hasPurchase) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--background)',
      }}>
        <Spinner text="Redirecting to checkout..." />
      </div>
    );
  }

  return <>{children}</>;
}
