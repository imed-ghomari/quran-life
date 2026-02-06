'use client';

import { useContext, useEffect, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { db } from '@/lib/instant';
import Spinner from '@/components/ui/Spinner';
import { OnlineStatusContext } from '@/components/Providers';

const PUBLIC_PATHS = new Set(['/', '/auth']);

type AuthGateProps = {
  children: React.ReactNode;
};

export default function AuthGate({ children }: AuthGateProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isOnline = useContext(OnlineStatusContext);
  const { user, isLoading: isAuthLoading } = db.useAuth();

  const isPublic = useMemo(() => PUBLIC_PATHS.has(pathname), [pathname]);

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
  }, [isPublic, isAuthLoading, isOnline, user, router]);

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

  if (!isOnline) {
    return <>{children}</>;
  }

  return <>{children}</>;
}
