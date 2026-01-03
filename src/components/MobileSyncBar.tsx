'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useRouter as usePagesRouter } from 'next/router';
import SyncStatus from './SyncStatus';

/**
 * Mobile sync bar - only renders on mobile devices (< 768px)
 * This is a separate client component to be used in the server layout
 */
export default function MobileSyncBar() {
    const [isMobile, setIsMobile] = useState(false);
    let pathname = usePathname();

    // Fallback for Pages Router
    try {
        const pagesRouter = usePagesRouter();
        if (!pathname && pagesRouter) {
            pathname = pagesRouter.pathname;
        }
    } catch (e) { }

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    if (!isMobile || pathname === '/' || pathname === '/auth') return null;

    return <SyncStatus variant="mobile" />;
}
