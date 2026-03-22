'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/instant';

const LandingPage = dynamic(() => import('./LandingPage'), { ssr: false });
const OFFLINE_ACCESS_KEY = 'auth:offlineAccess';
const OFFLINE_ACCESS_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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

      if (!navigator.onLine && hasValidOfflineAccessMarker()) {
        window.location.replace('/offline-app');
        return;
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

  if (isAuthLoading || user) {
    return null;
  }

  return <LandingPage onBuy={handleGetStarted} />;
}
