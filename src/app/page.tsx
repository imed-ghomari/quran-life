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
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                router.push('/dashboard');
            } else {
                setLoading(false);
            }
        };
        checkUser();
    }, [supabase, router]);

    const handleGetStarted = () => {
        // Check if it's the owner by looking for a special URL parameter
        const urlParams = new URLSearchParams(window.location.search);
        const ownerKey = urlParams.get('owner');

        // If owner parameter is present and matches, skip to auth
        if (ownerKey === 'true' && OWNER_EMAIL) {
            router.push('/auth?owner=true');
            return;
        }

        // Regular users: Redirect to Polar checkout
        const checkoutUrl = `/api/polar/checkout?product_id=${POLAR_PRODUCT_ID}`;
        window.location.href = checkoutUrl;
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
                <div className="status-badge learned" style={{ padding: '1rem 2rem', fontSize: '1.2rem' }}>
                    Loading Quran Life...
                </div>
            </div>
        );
    }

    return <LandingPage onBuy={handleGetStarted} />;
}
