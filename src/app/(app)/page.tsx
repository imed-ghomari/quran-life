'use client';

import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import LandingPage from '@/components/LandingPage/LandingPage';
import { useEffect, useState } from 'react';

// Owner bypass - set this in your .env.local: NEXT_PUBLIC_OWNER_EMAIL=your@email.com
// This allows you to bypass payment and go directly to auth
const OWNER_EMAIL = process.env.NEXT_PUBLIC_OWNER_EMAIL;

// Your Polar Product ID - get this from your Polar dashboard
const POLAR_PRODUCT_ID = process.env.NEXT_PUBLIC_POLAR_PRODUCT_ID || 'your_product_id';

export default function Home() {
    const supabase = createClient();
    const router = useRouter();
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const checkUser = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            const user = session?.user;

            if (user) {
                // Check owner bypass
                const isOwner = OWNER_EMAIL && user.email?.toLowerCase() === OWNER_EMAIL.toLowerCase();
                if (isOwner) {
                    router.push('/dashboard');
                    return;
                }

                // Check purchase status
                const { data: purchase } = await supabase
                    .from('purchases')
                    .select('id')
                    .eq('email', user.email)
                    .eq('status', 'completed')
                    .single();

                if (purchase) {
                    router.push('/dashboard');
                } else {
                    // Logged in but not paid - stay on landing page
                    setLoading(false);
                }
            } else {
                setLoading(false);
            }
        };
        checkUser();
    }, [supabase, router]);

    const handleGetStarted = (cycle: 'monthly' | 'yearly') => {
        // Navigate to auth page with billing cycle
        router.push(`/auth?cycle=${cycle}`);
    };

    if (loading) {
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
