'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/instant';
import LandingPage from './LandingPage';

export default function HomePageClient() {
  const { user, isLoading: isAuthLoading } = db.useAuth();
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isSigningOut = window.localStorage.getItem('auth:signingOut') === '1';
      const postSignOutUntil = Number(window.localStorage.getItem('auth:postSignOutUntil') ?? 0);
      const hasPostSignOutWindow = Number.isFinite(postSignOutUntil) && postSignOutUntil > Date.now();
      if (isSigningOut || hasPostSignOutWindow) {
        if (!isAuthLoading && !user) {
          window.localStorage.removeItem('auth:signingOut');
          window.localStorage.removeItem('auth:postSignOutUntil');
        }
        return;
      }

      if (Number.isFinite(postSignOutUntil) && postSignOutUntil <= Date.now()) {
        window.localStorage.removeItem('auth:signingOut');
        window.localStorage.removeItem('auth:postSignOutUntil');
      }
    }

    if (isAuthLoading) return;
    if (user) {
      router.replace('/dashboard');
    }
  }, [isAuthLoading, user, router]);

  const handleGetStarted = (cycle: 'monthly' | 'yearly') => {
    window.location.href = `/auth?plan=${cycle}`;
  };

  if (user) {
    return null;
  }

  return <LandingPage onBuy={handleGetStarted} />;
}
