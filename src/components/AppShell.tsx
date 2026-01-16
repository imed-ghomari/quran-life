'use client';

import React from 'react';
import Navigation from './Navigation';
import MobileSyncBar from './MobileSyncBar';
import { usePathname } from 'next/navigation';
import { useRouter as usePagesRouter } from 'next/router';

interface AppShellProps {
    children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
    let pathname = usePathname();

    // Fallback for Pages Router
    try {
        const pagesRouter = usePagesRouter();
        if (!pathname && pagesRouter) {
            pathname = pagesRouter.pathname;
        }
    } catch (e) { }

    const isAuthOrHome = pathname === '/' || pathname === '/auth';
    const isDashboard = pathname === '/dashboard';

    return (
        <div className="app-shell">
            <Navigation />
            <div className={`page-container ${!isAuthOrHome ? 'has-sync-bar' : ''} ${isDashboard ? 'fixed-layout' : ''}`}>
                <MobileSyncBar />
                {children}
            </div>
        </div>
    );
}
