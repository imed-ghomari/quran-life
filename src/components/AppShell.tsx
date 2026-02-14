'use client';

import React from 'react';
import Navigation from './Navigation';
import { usePathname } from 'next/navigation';

interface AppShellProps {
    children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
    const pathname = usePathname();

    const isAppRoute =
        pathname === '/dashboard'
        || pathname === '/todo'
        || pathname === '/statistics'
        || pathname === '/settings'
        || pathname?.startsWith('/docs');

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
            <Navigation />
            <div className={`page-container ${isFixedLayout ? 'fixed-layout' : ''}`}>
                {children}
            </div>
        </div>
    );
}
