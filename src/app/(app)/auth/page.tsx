'use client';

import { createClient } from '@/utils/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Mail, ArrowRight, Loader2, CheckCircle, Lock } from 'lucide-react';
import { Suspense } from 'react';

function AuthContent() {
    const supabase = createClient();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSignUp, setIsSignUp] = useState(false);
    const [authLoading, setAuthLoading] = useState(false);
    const [authError, setAuthError] = useState<string | null>(null);
    const checkoutId = searchParams?.get('checkout_id');

    // Owner email from env - owner bypasses Polar checkout
    const OWNER_EMAIL = process.env.NEXT_PUBLIC_OWNER_EMAIL;

    useEffect(() => {
        const checkUser = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            const user = session?.user;
            
            if (user) {
                // Check if user is the owner
                const isOwner = OWNER_EMAIL && user.email?.toLowerCase() === OWNER_EMAIL.toLowerCase();

                if (isOwner) {
                    router.push('/dashboard');
                    return;
                }

                // Check if user has already paid
                const { data: purchase } = await supabase
                    .from('purchases')
                    .select('id')
                    .eq('email', user.email)
                    .eq('status', 'completed')
                    .single();

                if (purchase) {
                    router.push('/dashboard');
                } else {
                    // User is logged in but hasn't paid. 
                    // We stay on this page to allow them to proceed to checkout (via handleAuth or new UI)
                    // or maybe we should auto-redirect to checkout?
                    // For now, let's just NOT redirect to dashboard to avoid the loop.
                    console.log('User logged in but not paid. staying on auth page.');
                }
            }
        };
        checkUser();
    }, [supabase, router, OWNER_EMAIL]);

    
    const cycle = searchParams?.get('cycle') || 'monthly';
    const isSandbox = process.env.NEXT_PUBLIC_POLAR_SANDBOX === 'true';

    const PRODUCT_ID_MONTHLY = isSandbox 
        ? process.env.NEXT_PUBLIC_POLAR_SANDBOX_PRODUCT_ID_MONTHLY
        : (process.env.NEXT_PUBLIC_POLAR_PRODUCT_ID_MONTHLY || process.env.NEXT_PUBLIC_POLAR_PRODUCT_ID);
        
    const PRODUCT_ID_YEARLY = isSandbox
        ? process.env.NEXT_PUBLIC_POLAR_SANDBOX_PRODUCT_ID_YEARLY
        : (process.env.NEXT_PUBLIC_POLAR_PRODUCT_ID_YEARLY || PRODUCT_ID_MONTHLY);

    const selectedProductId = cycle === 'yearly' ? PRODUCT_ID_YEARLY : PRODUCT_ID_MONTHLY;

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setAuthError(null);
        setAuthLoading(true);

        const { error } = isSignUp
            ? await supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: `${window.location.origin}/auth/callback`,
                }
            })
            : await supabase.auth.signInWithPassword({ email, password });

        setAuthLoading(false);

        if (error) {
            console.error('Auth error:', error.message);
            setAuthError(error.message);
            return;
        }

        // Get user after auth
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;

        if (!user) {
            if (isSignUp) {
                setAuthError('Check your email for the confirmation link!');
            }
            return;
        }

        // Check if user is the owner (by email) - bypass Polar checkout
        const isOwner = OWNER_EMAIL && user.email?.toLowerCase() === OWNER_EMAIL.toLowerCase();

        if (isOwner) {
            // Owner goes directly to dashboard
            router.push('/dashboard');
            return;
        }

        // Check if user has already paid
        const { data: purchase } = await supabase
            .from('purchases')
            .select('id')
            .eq('email', user.email)
            .eq('status', 'completed')
            .single();

        if (purchase) {
            // User has already paid, go to dashboard
            router.push('/dashboard');
            return;
        }

        // If not owner and not paid, they must go to checkout
        // (Even if it's a sign-in, they might have skipped checkout before)
        const checkoutUrl = `/api/polar/checkout?product_id=${selectedProductId}`;
        window.location.href = checkoutUrl;
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            background: 'var(--background)'
        }}>
            <div style={{
                width: '100%',
                maxWidth: '400px',
                background: 'var(--background)',
                borderRadius: '24px',
                padding: '2.5rem',
                boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
                border: '1px solid var(--border)',
            }}>
                {checkoutId && (
                    <div style={{
                        marginBottom: '1.5rem',
                        padding: '1rem',
                        background: 'rgba(126, 153, 122, 0.1)',
                        borderRadius: '12px',
                        border: '1px solid var(--success)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem'
                    }}>
                        <CheckCircle size={24} style={{ color: 'var(--success)', flexShrink: 0 }} />
                        <div>
                            <p style={{ fontWeight: 600, color: 'var(--success)', marginBottom: '0.25rem' }}>
                                Payment Successful!
                            </p>
                            <p style={{ fontSize: '0.85rem', color: 'var(--foreground-secondary)' }}>
                                Set up your account to access Quran Life
                            </p>
                        </div>
                    </div>
                )}

                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <div style={{
                        width: '60px',
                        height: '60px',
                        background: 'var(--accent-light)',
                        color: 'var(--accent)',
                        borderRadius: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 1.5rem'
                    }}>
                        <Lock size={32} />
                    </div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                        {isSignUp ? 'Create Account' : 'Sign in to Quran Life'}
                    </h2>
                    <p style={{ color: 'var(--foreground-secondary)', fontSize: '0.9rem' }}>
                        {isSignUp
                            ? 'Start your memorization journey today.'
                            : 'Welcome back to your daily review.'}
                    </p>
                </div>

                <form onSubmit={handleAuth}>
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{
                            display: 'block',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            marginBottom: '0.5rem',
                            color: 'var(--foreground)'
                        }}>
                            Email Address
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            required
                            style={{
                                width: '100%',
                                padding: '0.875rem 1rem',
                                borderRadius: '12px',
                                border: '1px solid var(--border)',
                                background: 'var(--background-secondary)',
                                color: 'var(--foreground)',
                                fontSize: '1rem',
                                outline: 'none'
                            }}
                        />
                    </div>

                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{
                            display: 'block',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            marginBottom: '0.5rem',
                            color: 'var(--foreground)'
                        }}>
                            Password
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                            style={{
                                width: '100%',
                                padding: '0.875rem 1rem',
                                borderRadius: '12px',
                                border: '1px solid var(--border)',
                                background: 'var(--background-secondary)',
                                color: 'var(--foreground)',
                                fontSize: '1rem',
                                outline: 'none'
                            }}
                        />
                    </div>

                    {authError && (
                        <p style={{ color: 'var(--danger)', fontSize: '0.8rem', marginBottom: '1rem' }}>
                            {authError}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={authLoading}
                        className="btn btn-primary"
                        style={{
                            width: '100%',
                            justifyContent: 'center',
                            padding: '1rem',
                            opacity: authLoading ? 0.7 : 1
                        }}
                    >
                        {authLoading ? (
                            <Loader2 className="animate-spin" size={20} />
                        ) : (
                            <>
                                {isSignUp ? 'Sign Up' : 'Continue'}
                                <ArrowRight size={18} />
                            </>
                        )}
                    </button>

                    <button
                        type="button"
                        onClick={() => setIsSignUp(!isSignUp)}
                        style={{
                            width: '100%',
                            background: 'none',
                            border: 'none',
                            color: 'var(--accent)',
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            marginTop: '1rem'
                        }}
                    >
                        {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
                    </button>
                </form>
            </div>
        </div>
    );
}

export default function AuthPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <AuthContent />
        </Suspense>
    );
}
