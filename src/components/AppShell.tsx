'use client';

import React from 'react';
import Navigation from './Navigation';
import MobileSyncBar from './MobileSyncBar';
import { usePathname } from 'next/navigation';

interface AppShellProps {
    children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
    const pathname = usePathname();

    const isAuthOrHome = pathname === '/' || pathname === '/auth';
    const isFixedLayout = pathname === '/dashboard' || pathname === '/todo' || pathname === '/statistics' || pathname === '/settings' || pathname?.startsWith('/docs');

    return (
        <div className="app-shell">
            <Navigation />
            <MobileSyncBar />
            <div className={`page-container ${!isAuthOrHome ? 'has-sync-bar' : ''} ${isFixedLayout ? 'fixed-layout' : ''}`}>
                {children}
            </div>
        </div>
    );
}
