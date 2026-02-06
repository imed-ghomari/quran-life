'use client';

import { db } from '@/lib/instant';
import { useRouter } from 'next/navigation';
import LandingPage from '@/components/LandingPage/LandingPage';
import Spinner from '@/components/ui/Spinner';
import { useEffect, useState } from 'react';

export default function Home() {
    const { user, isLoading: isAuthLoading } = db.useAuth();
    const router = useRouter();
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        console.log('Home auth state:', { user: !!user, isAuthLoading, loading });
        if (isAuthLoading) return;

        if (user) {
            console.log('Redirecting to dashboard');
            router.push('/dashboard');
        } else {
            setLoading(false);
        }
    }, [user, isAuthLoading, router, loading]);

    const handleGetStarted = (cycle: 'monthly' | 'yearly') => {
        console.log('Get Started clicked, cycle:', cycle);
        router.push('/auth');
    };

    if (loading || isAuthLoading) {
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
