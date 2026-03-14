'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Navigation from './Navigation';
import { usePathname } from 'next/navigation';
import GlobalTooltip from './ui/GlobalTooltip';
import FullScreenLoader from './ui/FullScreenLoader';

interface AppShellProps {
    children: React.ReactNode;
}

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

    const hasReachedPendingRoute = useMemo(() => {
        if (!pendingHref) return false;
        if (pendingHref === '/docs') return pathname?.startsWith('/docs');
        return pathname === pendingHref;
    }, [pathname, pendingHref]);

    useEffect(() => {
        if (hasReachedPendingRoute) {
            setPendingHref(null);
            setRevealTick((prev) => prev + 1);
        }
    }, [hasReachedPendingRoute]);

    useEffect(() => {
        if (!isAppRoute && pendingHref) {
            setPendingHref(null);
        }
    }, [isAppRoute, pendingHref]);

    const handleNavigateStart = useCallback((href: string) => {
        setPendingHref(href);
    }, []);

    if (!isAppRoute) {
        return <>{children}</>;
    }

    const isFixedLayout = pathname === '/dashboard'
        || pathname === '/todo'
        || pathname === '/statistics'
        || pathname === '/settings'
        || pathname?.startsWith('/docs');

    return (
        <div className="app-shell">
            <Navigation pendingHref={pendingHref} onNavigateStart={handleNavigateStart} />
            <div className={`page-container ${isFixedLayout ? 'fixed-layout' : ''}`}>
                {pendingHref ? (
                    <FullScreenLoader text="Loading..." />
                ) : (
                    <div
                        key={`content-${pathname}-${revealTick}`}
                        className={`page-content-layer ${revealTick > 0 ? 'page-content-reveal' : ''}`}
                    >
                        {children}
                    </div>
                )}
            </div>
            <GlobalTooltip />
        </div>
    );
}
