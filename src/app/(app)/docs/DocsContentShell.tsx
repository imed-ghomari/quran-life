'use client';

import { useEffect } from 'react';
import { useAppShellTransition } from '@/components/AppShell';
import Spinner from '@/components/ui/Spinner';
import { useDocsNavigation } from './DocsNavigationState';

export default function DocsContentShell({ children }: { children: React.ReactNode }) {
    const { isNavigating } = useDocsNavigation();
    const { isTransitionPendingForCurrentRoute, markCurrentRouteReady } = useAppShellTransition();

    useEffect(() => {
        if (isNavigating) return;
        markCurrentRouteReady();
    }, [isNavigating, markCurrentRouteReady]);

    if (!isNavigating) {
        return <>{children}</>;
    }

    if (isTransitionPendingForCurrentRoute) {
        return null;
    }

    return (
        <div className="flex items-center justify-center min-h-[40vh] py-12">
            <Spinner text="Loading documentation..." />
        </div>
    );
}
