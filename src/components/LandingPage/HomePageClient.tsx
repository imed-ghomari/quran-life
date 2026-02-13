'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/instant';

const LandingPage = dynamic(() => import('./LandingPage'), {
  ssr: false,
});

export default function HomePageClient() {
  const { user, isLoading: isAuthLoading } = db.useAuth();
  const router = useRouter();

  useEffect(() => {
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
