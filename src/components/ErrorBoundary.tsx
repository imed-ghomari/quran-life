'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCcw, Home } from 'lucide-react';
import Link from 'next/link';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

/**
 * Global Error Boundary
 * Catches runtime errors in the component tree and displays a user-friendly fallback UI.
 */
class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        // Update state so the next render will show the fallback UI.
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    height: '100vh',
                    width: '100vw',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--background)',
                    color: 'var(--foreground)',
                    padding: '2rem',
                    textAlign: 'center'
                }}>
                    <div style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        padding: '1.5rem',
                        borderRadius: '50%',
                        marginBottom: '1.5rem'
                    }}>
                        <AlertCircle size={48} color="var(--danger)" />
                    </div>

                    <h1 style={{
                        fontSize: '1.5rem',
                        fontWeight: 'bold',
                        marginBottom: '1rem',
                        color: 'var(--foreground)'
                    }}>
                        Something went wrong
                    </h1>

                    <p style={{
                        maxWidth: '500px',
                        marginBottom: '2rem',
                        color: 'var(--foreground-secondary)',
                        lineHeight: '1.5'
                    }}>
                        We encountered an unexpected error. The application has been logged safely.
                        Please try refreshing the page.
                    </p>

                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button
                            onClick={() => window.location.reload()}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.75rem 1.5rem',
                                background: 'var(--primary)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontSize: '1rem',
                                fontWeight: 500
                            }}
                        >
                            <RefreshCcw size={18} />
                            Reload Application
                        </button>

                        <Link
                            href="/dashboard"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.75rem 1.5rem',
                                background: 'var(--background-secondary)',
                                color: 'var(--foreground)',
                                border: '1px solid var(--border)',
                                borderRadius: '8px',
                                textDecoration: 'none',
                                fontSize: '1rem',
                                fontWeight: 500
                            }}
                        >
                            <Home size={18} />
                            Go to Dashboard
                        </Link>
                    </div>

                    {process.env.NODE_ENV !== 'production' && this.state.error && (
                        <div style={{
                            marginTop: '3rem',
                            padding: '1rem',
                            background: '#1a1a1a',
                            color: '#ff6b6b',
                            borderRadius: '8px',
                            textAlign: 'left',
                            width: '100%',
                            maxWidth: '800px',
                            overflow: 'auto',
                            fontFamily: 'monospace',
                            fontSize: '0.85rem'
                        }}>
                            <p style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Error Details (Dev Only):</p>
                            <p>{this.state.error.toString()}</p>
                        </div>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
