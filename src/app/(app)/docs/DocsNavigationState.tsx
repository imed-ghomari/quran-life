'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

interface DocsNavigationState {
    pendingPath: string | null;
    setPendingPath: (path: string | null) => void;
    isNavigating: boolean;
    activePath: string;
}

const DocsNavigationContext = createContext<DocsNavigationState | null>(null);

const normalizePath = (value: string) => value.replace(/\/$/, '') || '/';

export function DocsNavigationProvider({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [pendingPath, setPendingPath] = useState<string | null>(null);
    const prevPathnameRef = useRef<string | null>(null);

    const activePath = normalizePath(pendingPath || pathname || '');
    const isNavigating = !!pendingPath && normalizePath(pendingPath) !== normalizePath(pathname || '');

    useEffect(() => {
        const normalizedPathname = normalizePath(pathname || '');
        const normalizedPending = pendingPath ? normalizePath(pendingPath) : null;

        if (!pendingPath) {
            prevPathnameRef.current = normalizedPathname;
            return;
        }

        if (normalizedPending === normalizedPathname) {
            setPendingPath(null);
            prevPathnameRef.current = normalizedPathname;
            return;
        }

        if (prevPathnameRef.current && prevPathnameRef.current !== normalizedPathname) {
            setPendingPath(null);
        }

        prevPathnameRef.current = normalizedPathname;
    }, [pathname, pendingPath]);

    const value = useMemo(
        () => ({
            pendingPath,
            setPendingPath,
            isNavigating,
            activePath
        }),
        [pendingPath, isNavigating, activePath]
    );

    return (
        <DocsNavigationContext.Provider value={value}>
            {children}
        </DocsNavigationContext.Provider>
    );
}

export function useDocsNavigation() {
    const context = useContext(DocsNavigationContext);
    if (!context) {
        throw new Error('useDocsNavigation must be used within DocsNavigationProvider');
    }
    return context;
}
