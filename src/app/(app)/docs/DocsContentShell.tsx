'use client';

import { useEffect } from 'react';
import { useAppShellTransition } from '@/components/AppShell';
import PageSkeleton from '@/components/ui/PageSkeleton';
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
        <div className="w-full h-full min-h-[40vh]">
            <PageSkeleton type="generic" />
        </div>
    );
}
