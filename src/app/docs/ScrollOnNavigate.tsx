'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export function ScrollOnNavigate() {
    const pathname = usePathname();
    const searchParams = useSearchParams();

    useEffect(() => {
        // If we have a highlight search param or a hash, we are likely navigating 
        // to a specific search result or section. Don't scroll to top.
        if (searchParams.get('highlight') || window.location.hash) {
            return;
        }

        const contentContainer = document.querySelector('.docs-main');
        if (contentContainer) {
            contentContainer.scrollTop = 0;
        } else {
            window.scrollTo(0, 0);
        }
    }, [pathname, searchParams]);

    return null;
}
