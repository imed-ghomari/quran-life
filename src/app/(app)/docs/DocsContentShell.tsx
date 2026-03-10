'use client';

import Spinner from '@/components/ui/Spinner';
import { useDocsNavigation } from './DocsNavigationState';

export default function DocsContentShell({ children }: { children: React.ReactNode }) {
    const { isNavigating } = useDocsNavigation();

    if (!isNavigating) {
        return <>{children}</>;
    }

    return (
        <div className="flex items-center justify-center min-h-[40vh] py-12">
            <Spinner text="Loading documentation..." />
        </div>
    );
}
