'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import Navigation from './Navigation';
import { usePathname } from 'next/navigation';
import GlobalTooltip from './ui/GlobalTooltip';
import Spinner from './ui/Spinner';

interface AppShellProps {
    children: React.ReactNode;
}

type AppShellTransitionContextValue = {
    isTransitionPendingForCurrentRoute: boolean;
    markCurrentRouteReady: () => void;
};

const AppShellTransitionContext = createContext<AppShellTransitionContextValue>({
    isTransitionPendingForCurrentRoute: false,
    markCurrentRouteReady: () => {},
});

const routeMatches = (pathname: string | null, href: string | null) => {
    if (!pathname || !href) return false;
    if (href === '/docs') return pathname.startsWith('/docs');
    return pathname === href;
};

export default function AppShell({ children }: AppShellProps) {
    const pathname = usePathname();
    const [pendingHref, setPendingHref] = useState<string | null>(null);
    const [revealTick, setRevealTick] = useState(0);

    const isAppRoute =
        pathname === '/dashboard'
        || pathname === '/todo'
        || pathname === '/statistics'
        || pathname === '/settings'
        || pathname?.startsWith('/docs');

    const hasReachedPendingRoute = useMemo(() => routeMatches(pathname, pendingHref), [pathname, pendingHref]);
    const isTransitionPendingForCurrentRoute = useMemo(() => hasReachedPendingRoute && !!pendingHref, [hasReachedPendingRoute, pendingHref]);

    useEffect(() => {
        if (!isAppRoute && pendingHref) {
            setPendingHref(null);
        }
    }, [isAppRoute, pendingHref]);

    useEffect(() => {
        if (!hasReachedPendingRoute || !pendingHref) return;

        const timeoutId = window.setTimeout(() => {
            setPendingHref((current) => {
                if (!current) return current;
                setRevealTick((prev) => prev + 1);
                return null;
            });
        }, 4000);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [hasReachedPendingRoute, pendingHref]);

    const handleNavigateStart = useCallback((href: string) => {
        setPendingHref(href);
    }, []);

    const markCurrentRouteReady = useCallback(() => {
        if (!pathname || !routeMatches(pathname, pendingHref)) return;
        setPendingHref(null);
        setRevealTick((prev) => prev + 1);
    }, [pathname, pendingHref]);

    if (!isAppRoute) {
        return <>{children}</>;
    }

    const isFixedLayout = pathname === '/dashboard'
        || pathname === '/todo'
        || pathname === '/statistics'
        || pathname === '/settings'
        || pathname?.startsWith('/docs');

    return (
        <AppShellTransitionContext.Provider value={{ isTransitionPendingForCurrentRoute, markCurrentRouteReady }}>
            <div className="app-shell">
                <Navigation pendingHref={pendingHref} onNavigateStart={handleNavigateStart} />
                <div
                    className={`page-container ${isFixedLayout ? 'fixed-layout' : ''}`}
                    style={{ position: 'relative' }}
                >
                    <div
                        key={`content-${pathname}-${revealTick}`}
                        className={`page-content-layer ${revealTick > 0 ? 'page-content-reveal' : ''}`}
                        aria-busy={pendingHref ? 'true' : 'false'}
                    >
                        {children}
                    </div>
                    {pendingHref ? (
                        <div
                            style={{
                                position: 'absolute',
                                inset: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '1rem',
                                background: 'color-mix(in srgb, var(--background) 72%, transparent)',
                                backdropFilter: 'blur(6px)',
                                zIndex: 1,
                                pointerEvents: 'auto',
                                cursor: 'progress',
                            }}
                        >
                            <div
                                style={{
                                    padding: '0.9rem 1rem',
                                    borderRadius: '16px',
                                    border: '1px solid var(--border)',
                                    background: 'color-mix(in srgb, var(--background-secondary) 92%, transparent)',
                                    boxShadow: '0 18px 40px rgba(0, 0, 0, 0.16)',
                                }}
                            >
                                <Spinner size={22} text="Loading..." />
                            </div>
                        </div>
                    ) : null}
                </div>
                <GlobalTooltip />
            </div>
        </AppShellTransitionContext.Provider>
    );
}

export function useAppShellTransition() {
    return useContext(AppShellTransitionContext);
}
