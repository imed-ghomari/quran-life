'use client';

import { useEffect, useState } from 'react';
import SyncStatus from './SyncStatus';

/**
 * Mobile sync bar - only renders on mobile devices (< 768px)
 * This is a separate client component to be used in the server layout
 */
export default function MobileSyncBar() {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    if (!isMobile) return null;

    return <SyncStatus variant="mobile" />;
}
