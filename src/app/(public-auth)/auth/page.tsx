'use client';

// Import necessary React hooks and Next.js utilities
import { db } from '@/lib/instant';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useContext, useEffect, useMemo, useState } from 'react';
import type { User as InstantUser } from '@instantdb/core';

// Import UI icons from lucide-react
import { Mail, ArrowRight, Lock, Hash, Ticket } from 'lucide-react';

// Import Suspense for handling asynchronous components
import { Suspense } from 'react';

// Import custom Spinner component and Google OAuth components
import PageSkeleton from '@/components/ui/PageSkeleton';
import Spinner from '@/components/ui/Spinner';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import { usePaddle } from '@/lib/paddle/checkout';
import { buildCheckoutItems } from '@/lib/paddle/prices';
import { AccessStateContext, OnlineStatusContext } from '@/components/Providers';
import { formatCurrency, getStudentPlanPrice, normalizeClassCode } from '@/lib/teacherPlan';

const OFFLINE_ACCESS_KEY = 'auth:offlineAccess';
const OFFLINE_ACCESS_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const FORCE_OFFLINE_OPEN_KEY = 'auth:forceOfflineOpen';
const SIGNING_OUT_KEY = 'auth:signingOut';
const POST_SIGN_OUT_UNTIL_KEY = 'auth:postSignOutUntil';

// Main authentication content component
function AuthContent() {
    // Fetch user authentication status and data using InstantDB's hook
    const authState = db.useAuth() as {
        user?: InstantUser | null;
        isLoading: boolean;
        error?: { message: string } | undefined;
    };
    const { user, isLoading: isAuthLoading, error: authStateError } = authState;
    const isOnline = useContext(OnlineStatusContext);
    const { accessSource, hasPremiumAccess, isSubscriptionLoading } = useContext(AccessStateContext);
    const userEmail = user?.email ?? 'your account';
    const searchParams = useSearchParams();
    const paddle = usePaddle();
    // State for managing email and magic code inputs
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    // State to control the authentication flow step (email input or code input)
    const [authStep, setAuthStep] = useState<'email' | 'code'>('email');
    // State for managing loading indicators during authentication actions
    const [authLoading, setAuthLoading] = useState(false);
    // State for displaying authentication-related errors
    const [authError, setAuthError] = useState<string | null>(null);
    // State for Google OAuth nonce to prevent replay attacks
    const [googleNonce] = useState(() => crypto.randomUUID());
    // Force checkout blur when user opts to switch email
    const [forceCheckoutBlur, setForceCheckoutBlur] = useState(false);
    // Checkout state (shown after auth succeeds)
    const planFromQuery = useMemo(() => {
        const rawPlan = searchParams?.get('plan');
        return rawPlan === 'monthly' || rawPlan === 'yearly' ? rawPlan : null;
    }, [searchParams]);
    const classCodeFromQuery = useMemo(() => normalizeClassCode(searchParams?.get('classCode')), [searchParams]);
    const shouldReplaceGraceSponsorship = useMemo(() => searchParams?.get('replaceSponsorship') === '1', [searchParams]);
    const [plan, setPlan] = useState<'monthly' | 'yearly'>(() => planFromQuery ?? 'monthly');
    const [classCodeInput, setClassCodeInput] = useState(() => classCodeFromQuery);
    const [classCodeError, setClassCodeError] = useState<string | null>(null);
    const [isRedeemingClassCode, setIsRedeemingClassCode] = useState(false);
    const [isOpening, setIsOpening] = useState(false);
    const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
    const [canOpenOfflineApp, setCanOpenOfflineApp] = useState(false);

    // Environment variables for Google OAuth configuration
    const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
    const GOOGLE_CLIENT_NAME = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_NAME || 'google';
    const shouldAllowGraceCheckout = accessSource === 'teacher_grace' && shouldReplaceGraceSponsorship;

    useEffect(() => {
        if (!planFromQuery) return;
        setPlan(planFromQuery);
    }, [planFromQuery]);

    useEffect(() => {
        if (!classCodeFromQuery) return;
        setClassCodeInput(classCodeFromQuery);
    }, [classCodeFromQuery]);

    useEffect(() => {
        if (!forceCheckoutBlur) return;
        if (!user?.email) return;
        setForceCheckoutBlur(false);
    }, [forceCheckoutBlur, user?.email]);

    const shouldBlockOnSubscriptionLoad = isOnline && isSubscriptionLoading;
    const isCheckoutLocked = !user || shouldBlockOnSubscriptionLoad || forceCheckoutBlur || (hasPremiumAccess && !shouldAllowGraceCheckout);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (isAuthLoading) return;
        if (user) return;

        const isSigningOut = window.localStorage.getItem(SIGNING_OUT_KEY) === '1';
        const postSignOutUntil = Number(window.localStorage.getItem(POST_SIGN_OUT_UNTIL_KEY) ?? 0);
        const hasPostSignOutWindow = Number.isFinite(postSignOutUntil) && postSignOutUntil > Date.now();

        if (isSigningOut || hasPostSignOutWindow) {
            window.localStorage.removeItem(SIGNING_OUT_KEY);
            window.localStorage.removeItem(POST_SIGN_OUT_UNTIL_KEY);
            window.location.replace('/');
            return;
        }

        if (Number.isFinite(postSignOutUntil) && postSignOutUntil <= Date.now()) {
            window.localStorage.removeItem(SIGNING_OUT_KEY);
            window.localStorage.removeItem(POST_SIGN_OUT_UNTIL_KEY);
        }
    }, [isAuthLoading, user]);

    useEffect(() => {
        if (!user) return;
        if (isSubscriptionLoading) return;
        if (!hasPremiumAccess || shouldAllowGraceCheckout) return;
        window.location.replace('/dashboard');
    }, [user, isSubscriptionLoading, hasPremiumAccess, shouldAllowGraceCheckout]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (user) {
            setCanOpenOfflineApp(true);
            return;
        }

        const raw = window.localStorage.getItem(OFFLINE_ACCESS_KEY);
        if (!raw) {
            setCanOpenOfflineApp(false);
            return;
        }

        try {
            const parsed = JSON.parse(raw) as { userId?: string; updatedAt?: number };
            const updatedAt = Number(parsed?.updatedAt ?? 0);
            const hasValidTimestamp = Number.isFinite(updatedAt) && Date.now() - updatedAt <= OFFLINE_ACCESS_TTL_MS;
            const hasUserId = typeof parsed?.userId === 'string' && parsed.userId.length > 0;
            const valid = hasValidTimestamp && hasUserId;
            setCanOpenOfflineApp(valid);
            if (!valid) {
                window.localStorage.removeItem(OFFLINE_ACCESS_KEY);
            }
        } catch {
            window.localStorage.removeItem(OFFLINE_ACCESS_KEY);
            setCanOpenOfflineApp(false);
        }
    }, [user]);

    const handleCheckout = () => {
        if (!user) {
            setAuthError('Please sign in or create an account before proceeding to checkout.');
            return;
        }
        if (!paddle) return;
        setIsOpening(true);

        const checkoutItems = buildCheckoutItems('student', plan);
        const checkoutCustomData = {
            userId: user.id,
            subscriptionKind: 'student',
            billingInterval: plan,
        };

        paddle.Checkout.open({
            items: checkoutItems,
            customer: user.email ? { email: user.email } : undefined,
            customData: checkoutCustomData,
        });

        setIsOpening(false);
        setIsCheckoutOpen(true);
    };

    const handlePlanChange = (nextPlan: 'monthly' | 'yearly') => {
        setPlan(nextPlan);
        if (!paddle || !isCheckoutOpen) return;
        paddle.Checkout.updateCheckout({
            items: buildCheckoutItems('student', nextPlan),
            customData: {
                userId: user?.id ?? '',
                subscriptionKind: 'student',
                billingInterval: nextPlan,
            },
        });
    };

    const handleRedeemClassCode = async () => {
        if (!user) {
            setClassCodeError('Please sign in before redeeming a class code.');
            return;
        }

        const normalizedClassCode = normalizeClassCode(classCodeInput);
        if (!normalizedClassCode) {
            setClassCodeError('Enter a valid class code.');
            return;
        }

        setIsRedeemingClassCode(true);
        setClassCodeError(null);

        try {
            const response = await fetch('/api/teacher/redeem-class-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ classCode: normalizedClassCode }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(payload?.error || 'Could not redeem that class code.');
            }

            window.location.replace('/dashboard');
        } catch (error) {
            setClassCodeError(error instanceof Error ? error.message : 'Could not redeem that class code.');
        } finally {
            setIsRedeemingClassCode(false);
        }
    };

    // Handle the magic link authentication process
    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault(); // Prevent default form submission
        setAuthError(null); // Clear any previous errors
        setAuthLoading(true); // Show loading indicator

        try {
            if (authStep === 'email') {
                // If in the email step, send a magic code to the provided email
                await db.auth.sendMagicCode({ email });
                setAuthStep('code'); // Move to the code input step
            } else {
                // If in the code step, sign in with the email and magic code
                await db.auth.signInWithMagicCode({ email, code });
                // Redirect logic will be handled by the useEffect when the user state changes
            }
        } catch (err: any) {
            // Catch and display any authentication errors
            const rawMessage = err?.body?.message || err?.message || 'An error occurred during authentication';
            const isInvalidCode = typeof rawMessage === 'string' && rawMessage.includes('app-user-magic-code');
            if (isInvalidCode) {
                setAuthError('That code is invalid or expired. Please request a new code.');
                setAuthStep('email');
                setCode('');
            } else {
                console.error('Auth error:', err);
                setAuthError(rawMessage);
            }
        } finally {
            setAuthLoading(false); // Hide loading indicator
        }
    };

    // Render a loading spinner while initial authentication status is being verified
    if (isAuthLoading) {
        return <PageSkeleton />;
    }

    // Render an error message if there's an issue with the authentication state
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

    if (user && shouldBlockOnSubscriptionLoad) {
        return <PageSkeleton />;
    }

    if (user && hasPremiumAccess && !shouldAllowGraceCheckout) {
        return <PageSkeleton />;
    }

    if (!isOnline) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--background)',
                textAlign: 'center',
                padding: '2rem',
            }}>
                <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                        You are offline
                    </h2>
                    <p style={{ color: 'var(--foreground-secondary)', marginBottom: '1rem' }}>
                        Sign-in and checkout are unavailable offline.
                    </p>
                    {canOpenOfflineApp ? (
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => {
                                window.localStorage.setItem(FORCE_OFFLINE_OPEN_KEY, Date.now().toString());
                                window.location.assign('/offline-app');
                            }}
                        >
                            Open app offline
                        </button>
                    ) : (
                        <p style={{ color: 'var(--foreground-secondary)' }}>
                            Connect once to sign in, then offline mode will be available.
                        </p>
                    )}
                </div>
            </div>
        );
    }

    // Render the main authentication form
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
                maxWidth: '920px',
                background: 'var(--background)',
                borderRadius: '28px',
                boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
                border: '1px solid var(--border)',
                overflow: 'hidden',
                position: 'relative'
            }}>
                    <div className="auth-layout" style={{
                        display: 'flex',
                        flexDirection: 'row',
                        position: 'relative',
                        zIndex: 1
                    }}>
                    {/* Left panel: Auth (pre-login) or Checkout (post-login) */}
                    <div className="auth-panel auth-panel-left" style={{
                        flex: '0 0 50%',
                        padding: '2.5rem',
                        borderRight: '1px solid var(--border)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center'
                    }}>
                {!user ? (
                    <>
                    {/* Header section for the authentication form */}
                    <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                            {authStep === 'email' ? 'Sign in to Quran Life' : 'Check your email'}
                        </h2>
                        <p style={{ color: 'var(--foreground-secondary)', fontSize: '0.95rem' }}>
                            {authStep === 'email'
                                ? "We'll send you a magic link to sign in instantly."
                                : `We sent a code to ${email}. Enter it below to continue.`}
                        </p>
                    </div>

                    {/* Magic Link Authentication Form */}
                    <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        {authStep === 'email' ? (
                            // Email input field
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
                            // Magic code input field
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

                        {/* Display authentication errors */}
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

                        {/* Submit button for magic link flow */}
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
                                <Spinner size={18} color="currentColor" />
                            ) : (
                                <>
                                    {authStep === 'email' ? 'Send Magic Link' : 'Verify Code'}
                                    <ArrowRight size={18} />
                                </>
                            )}
                        </button>

                        {/* Option to use a different email if in code step */}
                        {authStep === 'code' && (
                            <button
                                type="button"
                                onClick={() => {
                                    setForceCheckoutBlur(true);
                                    setAuthError(null);
                                    setEmail('');
                                    setCode('');
                                    setAuthStep('email');
                                }}
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

                    {/* Google OAuth Login Section */}
                    {authStep === 'email' && (
                        <>
                            {/* Separator */}
                            <div style={{ display: 'flex', alignItems: 'center', margin: '1.5rem 0', gap: '1rem' }}>
                                <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}></div>
                                <span style={{ fontSize: '0.85rem', color: 'var(--foreground-secondary)' }}>or</span>
                                <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}></div>
                            </div>

                            {/* Google Login Button */}
                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                                <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
                                    <GoogleLogin
                                        nonce={googleNonce}
                                        theme="filled_blue"
                                        shape="pill"
                                        size="large"
                                        width="100%"
                                        text="continue_with"
                                        onError={() => {
                                            console.error('Google login failed');
                                            setAuthError('Google login failed');
                                        }}
                                        onSuccess={({ credential }) => {
                                            if (!credential) return;
                                            setAuthLoading(true);
                                            db.auth
                                                .signInWithIdToken({
                                                    clientName: GOOGLE_CLIENT_NAME,
                                                    idToken: credential,
                                                    nonce: googleNonce,
                                                })
                                                .catch((err) => {
                                                    console.error('InstantDB Google auth error:', err);
                                                    setAuthError('Uh oh: ' + (err.body?.message || err.message));
                                                })
                                                .finally(() => {
                                                    setAuthLoading(false);
                                                });
                                        }}
                                    />
                                </GoogleOAuthProvider>
                            </div>
                        </>
                    )}

                    {!user && (
                        <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
                            <Link
                                href="/"
                                style={{
                                    display: 'inline-block',
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--foreground-secondary)',
                                    textDecoration: 'none',
                                    fontSize: '0.85rem',
                                    textDecorationLine: 'underline',
                                }}
                            >
                                Back to landing page
                            </Link>
                        </div>
                    )}

                    {/* Login success message (bottom of auth panel) */}
                    {user && (
                        <div style={{
                            marginTop: '2rem',
                            paddingTop: '1.5rem',
                            borderTop: '1px solid var(--border)',
                            textAlign: 'center'
                        }}>
                            <p style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.35rem 0.75rem',
                                borderRadius: '999px',
                                background: 'rgba(16, 185, 129, 0.12)',
                                color: '#059669',
                                fontSize: '0.85rem',
                                fontWeight: 600
                            }}>
                                <span style={{
                                    width: '8px',
                                    height: '8px',
                                    borderRadius: '999px',
                                    background: '#10b981',
                                    display: 'inline-block'
                                }} />
                                Logged in as {userEmail}
                            </p>
                        </div>
                    )}
                    </>
                ) : (
                    <div>
                        <h1 className="checkout-title" style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                            Unlock premium access
                        </h1>

                        <p style={{ color: 'var(--foreground-secondary)', marginBottom: '1rem', lineHeight: 1.5 }}>
                            {shouldAllowGraceCheckout
                                ? 'Your teacher-sponsored access is ending soon. Start your own plan to keep access without interruption.'
                                : 'Have a teacher class code? Redeem it below to skip checkout. Otherwise, continue with your own plan.'}
                        </p>

                        <div style={{
                            marginBottom: '1.25rem',
                            padding: '1rem',
                            borderRadius: '18px',
                            border: '1px solid var(--border)',
                            background: 'var(--background-secondary)',
                            display: 'grid',
                            gap: '0.85rem',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                <Ticket size={18} style={{ color: 'var(--accent)' }} />
                                <span style={{ fontWeight: 700 }}>Redeem teacher class code</span>
                            </div>
                            <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: '1fr auto' }}>
                                <input
                                    type="text"
                                    placeholder="QL-ABCD-EFGH"
                                    value={classCodeInput}
                                    onChange={(event) => {
                                        setClassCodeInput(event.target.value.toUpperCase());
                                        if (classCodeError) setClassCodeError(null);
                                    }}
                                    style={{
                                        width: '100%',
                                        padding: '0.85rem 1rem',
                                        borderRadius: '12px',
                                        border: '1px solid var(--border)',
                                        background: 'var(--background)',
                                        fontSize: '1rem',
                                        color: 'var(--foreground)',
                                    }}
                                />
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    disabled={isRedeemingClassCode}
                                    onClick={() => {
                                        void handleRedeemClassCode();
                                    }}
                                    style={{ justifyContent: 'center', minWidth: '150px' }}
                                >
                                    {isRedeemingClassCode ? 'Redeeming...' : 'Redeem code'}
                                </button>
                            </div>
                            {classCodeError && (
                                <p style={{ color: '#ef4444', fontSize: '0.85rem', margin: 0 }}>{classCodeError}</p>
                            )}
                            <p style={{ color: 'var(--foreground-secondary)', fontSize: '0.82rem', margin: 0 }}>
                                Once redeemed, your teacher covers the checkout and you go straight to the app.
                            </p>
                        </div>

                        <div className="checkout-plan-label" style={{ color: 'var(--foreground-secondary)', fontSize: '0.95rem', marginBottom: '0.75rem' }}>
                            Choose your billing plan:
                        </div>
                        <div className="checkout-plan-grid" style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr', marginBottom: '1.25rem' }}>
                            <button
                                type="button"
                                onClick={() => handlePlanChange('monthly')}
                                disabled={isCheckoutLocked}
                                className="card"
                                style={{
                                    border: plan === 'monthly' ? '2px solid var(--accent)' : '1px solid var(--border)',
                                    background: 'var(--background)',
                                    color: 'var(--foreground)',
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '1rem',
                                    padding: '1.5rem',
                                    borderRadius: '20px',
                                    boxShadow: plan === 'monthly'
                                        ? '0 12px 30px rgba(91, 143, 185, 0.2)'
                                        : '0 10px 24px rgba(0, 0, 0, 0.06)',
                                    textAlign: 'left',
                                    position: 'relative',
                                    cursor: isCheckoutLocked ? 'not-allowed' : 'pointer'
                                }}
                            >
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                    <span style={{ fontWeight: 700, color: plan === 'monthly' ? 'var(--accent)' : 'var(--foreground)' }}>Monthly plan</span>
                                    <span style={{ color: 'var(--foreground-secondary)', fontSize: '0.9rem' }}>Pay as you go</span>
                                    <span style={{ color: 'var(--foreground-secondary)', fontSize: '0.8rem' }}>Renews automatically until canceled</span>
                                </div>
                                <span style={{ fontWeight: 800, fontSize: '1.6rem' }}>
                                    {formatCurrency(getStudentPlanPrice('monthly'))}
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => handlePlanChange('yearly')}
                                disabled={isCheckoutLocked}
                                className="card"
                                style={{
                                    border: plan === 'yearly' ? '2px solid var(--accent)' : '1px solid var(--border)',
                                    background: 'var(--background)',
                                    color: 'var(--foreground)',
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '1rem',
                                    padding: '1.5rem',
                                    borderRadius: '20px',
                                    boxShadow: plan === 'yearly'
                                        ? '0 12px 30px rgba(91, 143, 185, 0.2)'
                                        : '0 10px 24px rgba(0, 0, 0, 0.06)',
                                    textAlign: 'left',
                                    position: 'relative',
                                    cursor: isCheckoutLocked ? 'not-allowed' : 'pointer'
                                }}
                            >
                                <span style={{
                                    position: 'absolute',
                                    top: '-10px',
                                    right: '16px',
                                    padding: '0.25rem 0.6rem',
                                    borderRadius: '999px',
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    color: 'white',
                                    background: 'var(--accent)',
                                    boxShadow: '0 6px 16px rgba(91, 143, 185, 0.35)'
                                }}>
                                    Save 20%
                                </span>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        <span style={{ fontWeight: 700, color: plan === 'yearly' ? 'var(--accent)' : 'var(--foreground)' }}>Yearly plan</span>
                                    </div>
                                    <span style={{ color: 'var(--foreground-secondary)', fontSize: '0.9rem' }}>Best value</span>
                                    <span style={{ color: 'var(--foreground-secondary)', fontSize: '0.8rem' }}>Renews automatically until canceled</span>
                                </div>
                                <span style={{ fontWeight: 800, fontSize: '1.6rem' }}>
                                    {formatCurrency(getStudentPlanPrice('yearly'))}
                                </span>
                            </button>
                        </div>

                        <button
                            className="btn btn-primary"
                            onClick={handleCheckout}
                            disabled={!paddle || isOpening || isCheckoutLocked}
                            style={{ width: '100%' }}
                        >
                            {isOpening
                                ? 'Opening checkout...'
                                : shouldAllowGraceCheckout
                                    ? 'Start your own plan'
                                    : 'Proceed'}
                        </button>
                        <button
                            type="button"
                            onClick={async () => {
                                setForceCheckoutBlur(true);
                                setAuthError(null);
                                setEmail('');
                                setCode('');
                                setAuthStep('email');
                                await db.auth.signOut();
                            }}
                            style={{
                                marginTop: '0.75rem',
                                width: '100%',
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

                        {!paddle && (
                            <p style={{ marginTop: '0.75rem', color: 'var(--foreground-secondary)' }}>
                                Preparing secure checkout...
                            </p>
                        )}
                        <div style={{
                            marginTop: '2rem',
                            paddingTop: '1.5rem',
                            borderTop: '1px solid var(--border)',
                            textAlign: 'center'
                        }}>
                            <p style={{ fontSize: '0.85rem', color: 'var(--foreground-secondary)' }}>
                                By continuing, you agree to our{' '}
                                <Link href="/terms" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
                                    Terms of Service
                                </Link>{' '}
                                and{' '}
                                <Link href="/privacy" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
                                    Privacy Policy
                                </Link>
                                . Refunds are available only within our 14-day refund window (see Terms).
                            </p>
                        </div>
                    </div>
                )}
                    </div>

                    {/* Right panel: Image (always) */}
                    <div className="auth-panel auth-panel-right" style={{
                        flex: '0 0 50%',
                        padding: '0',
                        background: 'var(--background)',
                        display: 'flex'
                    }}>
                        <div className="auth-image-wrap" style={{
                            width: '100%',
                            height: '100%',
                            minHeight: '520px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'var(--background)'
                        }}>
                            <picture
                                className="light-mode-only"
                                style={{ width: '100%', height: '100%' }}
                            >
                                <source srcSet="/auth_light.webp" type="image/webp" />
                                <img
                                    src="/auth_light.png"
                                    alt="Quran Life authentication"
                                    width={720}
                                    height={960}
                                    loading="lazy"
                                    decoding="async"
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                            </picture>
                            <picture
                                className="dark-mode-only"
                                style={{ width: '100%', height: '100%' }}
                            >
                                <source srcSet="/auth_dark.png" type="image/webp" />
                                <img
                                    src="/auth_dark.png"
                                    alt="Quran Life authentication"
                                    width={720}
                                    height={960}
                                    loading="lazy"
                                    decoding="async"
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                            </picture>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Wrapper AuthPage component to provide Suspense boundary
export default function AuthPage() {
    return (
        <Suspense fallback={
            // Fallback UI while AuthContent is loading (e.g., during initial Google OAuth script load)
            <PageSkeleton />
        }>
            <AuthContent />
        </Suspense>
    );
}
