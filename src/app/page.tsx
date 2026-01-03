'use client';

import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import LandingPage from '@/components/LandingPage/LandingPage';
import { useEffect, useState } from 'react';

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

    const handleBuy = async () => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
            },
        });
        if (error) {
            console.error('Auth error:', error.message);
            alert('Authentication failed. Please try again.');
        }
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

    return <LandingPage onBuy={handleBuy} />;
}
