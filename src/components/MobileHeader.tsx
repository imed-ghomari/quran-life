'use client';

import React from 'react';
import SyncButton from './SyncButton';
import { usePathname } from 'next/navigation';

export default function MobileHeader() {
    const pathname = usePathname();

    // Determine title based on path
    const getTitle = () => {
        if (pathname === '/') return 'Today';
        if (pathname === '/todo') return 'Todo';
        if (pathname === '/statistics') return 'Statistics';
        if (pathname === '/settings') return 'Settings';
        return 'Quran Life';
    };

    return (
        <header className="mobile-header show-mobile" style={{
            display: 'none', // Default hidden, overridden by CSS media query
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem',
            background: 'var(--background)',
            borderBottom: '1px solid var(--border)',
            position: 'sticky',
            top: 0,
            zIndex: 50
        }}>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>{getTitle()}</h1>
            <SyncButton showLabel={false} />
        </header>
    );
}
