'use client';

import { db } from '@/lib/instant';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Mail, ArrowRight, Loader2, CheckCircle, Lock, Hash } from 'lucide-react';
import { Suspense } from 'react';
import Spinner from '@/components/ui/Spinner';

function AuthContent() {
    const { user, isLoading: isAuthLoading, error: authStateError } = db.useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    
    // Log state for debugging
    console.log('AuthContent state:', { 
        user: !!user, 
        isAuthLoading, 
        hasSearchParams: !!searchParams,
        authStateError 
    });
    
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [authStep, setAuthStep] = useState<'email' | 'code'>('email');
    const [authLoading, setAuthLoading] = useState(false);
    const [authError, setAuthError] = useState<string | null>(null);
    
    const checkoutId = searchParams?.get('checkout_id');
    const cycle = searchParams?.get('cycle') || 'monthly';

    // Owner email from env - owner bypasses Polar checkout
    const OWNER_EMAIL = process.env.NEXT_PUBLIC_OWNER_EMAIL;

    // Use db.useQuery to check for purchases in InstantDB
    const { data: purchaseData, isLoading: isPurchaseLoading, error: purchaseError } = db.useQuery({
        purchases: {
            $: {
                where: { email: user?.email || '', status: 'completed' }
            }
        }
    });

    console.log('Purchase data state:', { 
        hasUser: !!user, 
        isPurchaseLoading, 
        hasPurchase: !!purchaseData?.purchases?.length,
        purchaseError 
    });

    useEffect(() => {
        if (user && !isPurchaseLoading) {
            const isOwner = OWNER_EMAIL && user.email?.toLowerCase() === OWNER_EMAIL.toLowerCase();
            const hasPurchase = purchaseData?.purchases && purchaseData.purchases.length > 0;

            if (isOwner || hasPurchase) {
                router.push('/dashboard');
            }
        }
    }, [user, purchaseData, isPurchaseLoading, router, OWNER_EMAIL]);

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

        try {
            if (authStep === 'email') {
                await db.auth.sendMagicCode({ email });
                setAuthStep('code');
            } else {
                await db.auth.signInWithMagicCode({ email, code });
                // Redirect logic will be handled by useEffect when user state changes
            }
        } catch (err: any) {
            console.error('Auth error:', err);
            setAuthError(err.body?.message || err.message || 'An error occurred during authentication');
        } finally {
            setAuthLoading(false);
        }
    };

    const handleProceedToCheckout = () => {
        const checkoutUrl = `/api/polar/checkout?product_id=${selectedProductId}`;
        window.location.href = checkoutUrl;
    };

    if (isAuthLoading) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--background)'
            }}>
                <Spinner text="Verifying authentication..." />
            </div>
        );
    }

    if (authStateError) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '2rem',
                background: 'var(--background)',
                textAlign: 'center'
            }}>
                <div>
                    <Lock size={48} color="var(--danger)" style={{ marginBottom: '1rem' }} />
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>Connection Error</h2>
                    <p style={{ color: 'var(--foreground-secondary)', marginBottom: '1.5rem' }}>{authStateError.message}</p>
                    <button onClick={() => window.location.reload()} className="btn btn-primary">Try Again</button>
                </div>
            </div>
        );
    }

    // If logged in but still checking for purchase, show loading
    if (user && isPurchaseLoading) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--background)'
            }}>
                <Spinner text="Checking subscription status..." />
            </div>
        );
    }

    // If logged in but no purchase found and not owner, show checkout option
    if (user) {
        const isOwner = OWNER_EMAIL && user.email?.toLowerCase() === OWNER_EMAIL.toLowerCase();
        const hasPurchase = purchaseData?.purchases && purchaseData.purchases.length > 0;
        
        if (!isOwner && !hasPurchase) {
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
                        textAlign: 'center'
                    }}>
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
                            <CheckCircle size={32} />
                        </div>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                            Account Created
                        </h2>
                        <p style={{ color: 'var(--foreground-secondary)', marginBottom: '2rem' }}>
                            Signed in as {user.email}. One final step to access Quran Life!
                        </p>
                        <button
                            onClick={handleProceedToCheckout}
                            className="btn btn-primary"
                            style={{ width: '100%', padding: '1rem', fontSize: '1rem', fontWeight: 600 }}
                        >
                            Proceed to Checkout
                        </button>
                    </div>
                </div>
            );
        }
    }

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
                                Sign in to your account to access Quran Life
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
                        {authStep === 'email' ? <Mail size={32} /> : <Hash size={32} />}
                    </div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                        {authStep === 'email' ? 'Sign in to Quran Life' : 'Check your email'}
                    </h2>
                    <p style={{ color: 'var(--foreground-secondary)', fontSize: '0.95rem' }}>
                        {authStep === 'email' 
                            ? "We'll send you a magic link to sign in instantly."
                            : `We sent a code to ${email}. Enter it below to continue.`}
                    </p>
                </div>

                <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {authStep === 'email' ? (
                        <div style={{ position: 'relative' }}>
                            <Mail size={18} style={{
                                position: 'absolute',
                                left: '1rem',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                color: 'var(--foreground-secondary)'
                            }} />
                            <input
                                type="email"
                                placeholder="name@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                style={{
                                    width: '100%',
                                    padding: '0.85rem 1rem 0.85rem 2.75rem',
                                    borderRadius: '12px',
                                    border: '1px solid var(--border)',
                                    background: 'var(--background-secondary)',
                                    fontSize: '1rem',
                                    color: 'var(--foreground)',
                                    outline: 'none',
                                    transition: 'border-color 0.2s'
                                }}
                            />
                        </div>
                    ) : (
                        <div style={{ position: 'relative' }}>
                            <Hash size={18} style={{
                                position: 'absolute',
                                left: '1rem',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                color: 'var(--foreground-secondary)'
                            }} />
                            <input
                                type="text"
                                placeholder="Enter 6-digit code"
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                required
                                autoFocus
                                style={{
                                    width: '100%',
                                    padding: '0.85rem 1rem 0.85rem 2.75rem',
                                    borderRadius: '12px',
                                    border: '1px solid var(--border)',
                                    background: 'var(--background-secondary)',
                                    fontSize: '1rem',
                                    color: 'var(--foreground)',
                                    outline: 'none',
                                    transition: 'border-color 0.2s'
                                }}
                            />
                        </div>
                    )}

                    {authError && (
                        <p style={{
                            color: '#ef4444',
                            fontSize: '0.85rem',
                            textAlign: 'center',
                            background: 'rgba(239, 68, 68, 0.1)',
                            padding: '0.5rem',
                            borderRadius: '8px',
                            border: '1px solid rgba(239, 68, 68, 0.2)'
                        }}>
                            {authError}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={authLoading}
                        className="btn btn-primary"
                        style={{
                            width: '100%',
                            padding: '0.85rem',
                            borderRadius: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            fontSize: '1rem',
                            fontWeight: 600,
                            cursor: authLoading ? 'not-allowed' : 'pointer',
                            opacity: authLoading ? 0.7 : 1
                        }}
                    >
                        {authLoading ? (
                            <Loader2 size={20} className="animate-spin" />
                        ) : (
                            <>
                                {authStep === 'email' ? 'Send Magic Link' : 'Verify Code'}
                                <ArrowRight size={18} />
                            </>
                        )}
                    </button>
                    
                    {authStep === 'code' && (
                        <button
                            type="button"
                            onClick={() => setAuthStep('email')}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--foreground-secondary)',
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                                textDecoration: 'underline'
                            }}
                        >
                            Use a different email
                        </button>
                    )}
                </form>

                <div style={{
                    marginTop: '2rem',
                    paddingTop: '1.5rem',
                    borderTop: '1px solid var(--border)',
                    textAlign: 'center'
                }}>
                    <p style={{ fontSize: '0.85rem', color: 'var(--foreground-secondary)' }}>
                        By continuing, you agree to our Terms of Service and Privacy Policy.
                    </p>
                </div>
            </div>
        </div>
    );
}

export default function AuthPage() {
    return (
        <Suspense fallback={
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--background)'
            }}>
                <Spinner text="Loading..." />
            </div>
        }>
            <AuthContent />
        </Suspense>
    );
}
