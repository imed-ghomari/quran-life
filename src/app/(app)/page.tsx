'use client';

import { db } from '@/lib/instant';
import Spinner from '@/components/ui/Spinner';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

const LandingPage = dynamic(() => import('@/components/LandingPage/LandingPage'), {
    ssr: false,
});

export default function Home() {
    const { user, isLoading: isAuthLoading } = db.useAuth();
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        console.log('Home auth state:', { user: !!user, isAuthLoading, loading });
        if (isAuthLoading) return;
        setLoading(false);
        if (user) {
            router.replace('/dashboard');
        }
    }, [user, isAuthLoading, loading, router]);

    const handleGetStarted = (cycle: 'monthly' | 'yearly') => {
        console.log('Get Started clicked, cycle:', cycle);
        window.location.href = `/auth?plan=${cycle}`;
    };

    if (loading || isAuthLoading || user) {
        return (
            <div style={{
                height: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--background)'
            }}>
                <Spinner text="Loading Quran Life..." />
            </div>
        );
    }

    return <LandingPage onBuy={handleGetStarted} />;
}
