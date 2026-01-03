'use client';

import { createClient } from '@/utils/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Mail, ArrowRight, Loader2, CheckCircle } from 'lucide-react';

export default function AuthPage() {
    const supabase = createClient();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [email, setEmail] = useState('');
    const [authLoading, setAuthLoading] = useState(false);
    const [authStatus, setAuthStatus] = useState<'idle' | 'sent' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');
    const checkoutId = searchParams.get('checkout_id');

    useEffect(() => {
        const checkUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                router.push('/dashboard');
            }
        };
        checkUser();
    }, [supabase, router]);

    const handleSendMagicLink = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) return;

        setAuthLoading(true);
        setAuthStatus('idle');
        setErrorMessage('');

        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: {
                emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
            },
        });

        setAuthLoading(false);

        if (error) {
            console.error('Auth error:', error.message);
            setAuthStatus('error');
            setErrorMessage(error.message);
        } else {
            setAuthStatus('sent');
        }
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
                                Sign in to access your Quran Life account
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
                        <Mail size={32} />
                    </div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                        Sign in to Quran Life
                    </h2>
                    <p style={{ color: 'var(--foreground-secondary)', fontSize: '0.9rem' }}>
                        We&apos;ll send a magic link to your email to get you started.
                    </p>
                </div>

                {authStatus === 'sent' ? (
                    <div style={{
                        textAlign: 'center',
                        padding: '1.5rem',
                        background: 'rgba(126, 153, 122, 0.1)',
                        borderRadius: '12px',
                        border: '1px solid var(--success)',
                        color: 'var(--success)'
                    }}>
                        <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Magic link sent!</p>
                        <p style={{ fontSize: '0.85rem' }}>Check your email and click the link to sign in.</p>
                    </div>
                ) : (
                    <form onSubmit={handleSendMagicLink}>
                        <div style={{ marginBottom: '1.5rem' }}>
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

                        {authStatus === 'error' && (
                            <p style={{ color: 'var(--danger)', fontSize: '0.8rem', marginBottom: '1rem' }}>
                                {errorMessage}
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
                                    Continue with Email
                                    <ArrowRight size={18} />
                                </>
                            )}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
