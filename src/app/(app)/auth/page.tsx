'use client';

// Import necessary React hooks and Next.js utilities
import { db } from '@/lib/instant';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';

// Import UI icons from lucide-react
import { Mail, ArrowRight, Loader2, CheckCircle, Lock, Hash } from 'lucide-react';

// Import Suspense for handling asynchronous components
import { Suspense } from 'react';

// Import custom Spinner component and Google OAuth components
import Spinner from '@/components/ui/Spinner';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';

// Main authentication content component
function AuthContent() {
    // Fetch user authentication status and data using InstantDB's hook
    const { user, isLoading: isAuthLoading, error: authStateError } = db.useAuth();
    // Initialize Next.js router for navigation
    const router = useRouter();
    // Get URL search parameters (e.g., for redirecting after login or payment success)
    const searchParams = useSearchParams();

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

    // Environment variables for Google OAuth configuration
    const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
    const GOOGLE_CLIENT_NAME = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_NAME || 'google';

    // Extract checkout ID and cycle (monthly/yearly) from URL search parameters
    const checkoutId = searchParams?.get('checkout_id');
    const cycle = searchParams?.get('cycle') || 'monthly';

    // Define owner emails for special access (e.g., bypassing payment).
    // These should ideally be loaded from environment variables or a secure configuration.
    const OWNER_EMAILS = [
        process.env.NEXT_PUBLIC_OWNER_EMAIL,
        process.env.NEXT_PUBLIC_OWNER_EMAIL2
    ].filter(Boolean).map(e => e?.toLowerCase());

    // Use db.useQuery to check for completed purchases in InstantDB for the current user
    const { data: purchaseData, isLoading: isPurchaseLoading, error: purchaseError } = db.useQuery({
        purchases: {
            $: {
                where: { email: user?.email || '', status: 'completed' }
            }
        }
    });

    // Effect hook to handle post-authentication logic and redirects
    useEffect(() => {
        // Only proceed if user data is available and purchase data has finished loading
        if (user && !isPurchaseLoading) {
            // Determine if the current user is an owner
            const isOwner = user.email && OWNER_EMAILS.includes(user.email.toLowerCase());
            // Determine if the user has any completed purchases
            const hasPurchase = purchaseData?.purchases && purchaseData.purchases.length > 0;

            // If the user is an owner or has a purchase, redirect them to the dashboard
            if (isOwner || hasPurchase) {
                router.push('/dashboard');
            }
        }
    }, [user, purchaseData, isPurchaseLoading, router, OWNER_EMAILS]); // Dependencies for the effect

    // Determine if the Polar integration is in sandbox mode
    const isSandbox = process.env.NEXT_PUBLIC_POLAR_SANDBOX === 'true';

    // Define product IDs for monthly and yearly subscriptions, considering sandbox mode
    const PRODUCT_ID_MONTHLY = isSandbox
        ? process.env.NEXT_PUBLIC_POLAR_SANDBOX_PRODUCT_ID_MONTHLY
        : (process.env.NEXT_PUBLIC_POLAR_PRODUCT_ID_MONTHLY || process.env.NEXT_PUBLIC_POLAR_PRODUCT_ID);

    const PRODUCT_ID_YEARLY = isSandbox
        ? process.env.NEXT_PUBLIC_POLAR_SANDBOX_PRODUCT_ID_YEARLY
        : (process.env.NEXT_PUBLIC_POLAR_PRODUCT_ID_YEARLY || PRODUCT_ID_MONTHLY);

    // Select the appropriate product ID based on the 'cycle' search parameter
    const selectedProductId = cycle === 'yearly' ? PRODUCT_ID_YEARLY : PRODUCT_ID_MONTHLY;

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
            console.error('Auth error:', err);
            // Catch and display any authentication errors
            setAuthError(err.body?.message || err.message || 'An error occurred during authentication');
        } finally {
            setAuthLoading(false); // Hide loading indicator
        }
    };

    // Handle redirection to the Polar checkout page
    const handleProceedToCheckout = () => {
        // Construct the checkout URL with the selected product ID
        const checkoutUrl = `/api/polar/checkout?product_id=${selectedProductId}`;
        window.location.href = checkoutUrl; // Redirect the user
    };

    // Allow user to switch accounts after logging in
    const handleSwitchAccount = async () => {
        setAuthError(null);
        try {
            await db.auth.signOut();
            setEmail('');
            setCode('');
            setAuthStep('email');
        } catch (err: any) {
            console.error('Sign out error:', err);
            setAuthError(err.body?.message || err.message || 'Unable to sign out. Please try again.');
        }
    };

    // Render a loading spinner while initial authentication status is being verified
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

    // If user is logged in but still checking for purchase, show loading spinner
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

    // If user is logged in but has no purchase and is not an owner, prompt for checkout
    if (user) {
        const isOwner = user.email && OWNER_EMAILS.includes(user.email.toLowerCase());
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
                        <button
                            type="button"
                            onClick={handleSwitchAccount}
                            style={{
                                marginTop: '1rem',
                                background: 'none',
                                border: 'none',
                                color: 'var(--foreground-secondary)',
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                                textDecoration: 'underline'
                            }}
                        >
                            Use a different account
                        </button>
                        {authError && (
                            <p style={{
                                color: '#ef4444',
                                fontSize: '0.85rem',
                                textAlign: 'center',
                                background: 'rgba(239, 68, 68, 0.1)',
                                padding: '0.5rem',
                                borderRadius: '8px',
                                border: '1px solid rgba(239, 68, 68, 0.2)',
                                marginTop: '1rem'
                            }}>
                                {authError}
                            </p>
                        )}
                    </div>
                </div>
            );
        }
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
                maxWidth: '400px',
                background: 'var(--background)',
                borderRadius: '24px',
                padding: '2.5rem',
                boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
                border: '1px solid var(--border)',
            }}>
                {/* Display payment success message if checkoutId is present in URL */}
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

                {/* Header section for the authentication form */}
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
                        {/* Icon changes based on auth step */}
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
                            <Loader2 size={20} className="animate-spin" />
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

                {/* Terms and Privacy Policy footer */}
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
                        </Link>.
                    </p>
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
