'use client';

import { db } from '@/lib/instant';
import { useRouter } from 'next/navigation';
import LandingPage from '@/components/LandingPage/LandingPage';
import Spinner from '@/components/ui/Spinner';
import { useEffect, useState } from 'react';

// Owner bypass - set this in your .env.local: NEXT_PUBLIC_OWNER_EMAIL=your@email.com
// This allows you to bypass payment and go directly to auth
const OWNER_EMAIL = process.env.NEXT_PUBLIC_OWNER_EMAIL;

export default function Home() {
    const { user, isLoading: isAuthLoading } = db.useAuth();
    const router = useRouter();
    const [loading, setLoading] = useState(true);

    // Use db.useQuery to check for purchases in InstantDB
    const { data: purchaseData, isLoading: isPurchaseLoading } = db.useQuery(user?.email ? {
        purchases: {
            $: {
                where: { email: user.email, status: 'completed' }
            }
        }
    } : null);

    useEffect(() => {
        console.log('Home auth state:', { user: !!user, isAuthLoading, isPurchaseLoading, loading });
        if (isAuthLoading) return;

        if (user) {
            if (isPurchaseLoading) return;

            // Check owner bypass
            const isOwner = OWNER_EMAIL && user.email?.toLowerCase() === OWNER_EMAIL.toLowerCase();
            const hasPurchase = purchaseData?.purchases && purchaseData.purchases.length > 0;
            console.log('Home check:', { isOwner, hasPurchase });

            if (isOwner || hasPurchase) {
                console.log('Redirecting to dashboard');
                router.push('/dashboard');
            } else {
                // Logged in but not paid - stay on landing page
                setLoading(false);
            }
        } else {
            setLoading(false);
        }
    }, [user, isAuthLoading, isPurchaseLoading, purchaseData, router, loading]);

    const handleGetStarted = (cycle: 'monthly' | 'yearly') => {
        console.log('Get Started clicked, cycle:', cycle);
        // Navigate to auth page with billing cycle
        router.push(`/auth?cycle=${cycle}`);
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
