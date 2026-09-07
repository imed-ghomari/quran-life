'use client';

import { useEffect } from 'react';
import { useAppShellTransition } from '@/components/AppShell';
import { useDocsNavigation } from './DocsNavigationState';

export default function DocsContentShell({ children }: { children: React.ReactNode }) {
    const { isNavigating } = useDocsNavigation();
    const { markCurrentRouteReady } = useAppShellTransition();

    useEffect(() => {
        if (isNavigating) return;
        markCurrentRouteReady();
    }, [isNavigating, markCurrentRouteReady]);

    return <>{children}</>;
}
