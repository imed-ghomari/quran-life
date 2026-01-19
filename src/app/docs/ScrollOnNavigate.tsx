'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export function ScrollOnNavigate() {
    const pathname = usePathname();

    useEffect(() => {
        // Find the scrollable container
        // Based on layout.tsx, the scrollable element is the <aside> for sidebar and .flex-1 for content?
        // Actually, layout.tsx has:
        // <div style={{ display: 'flex', flex: 1, overflow: 'hidden', ... }}>
        //    <aside ...>
        //    <div className="flex-1 overflow-y-auto ...">  <-- This is likely the content container
        
        // Let's try to scroll the main content container. 
        // In src/app/docs/layout.tsx, the content is likely in the div after aside.
        // It doesn't have a specific ID, but we can target it.
        // Or we can just scroll the window if it's window scroll, but layout suggests overflow-y-auto on a div.
        
        const contentContainer = document.querySelector('.docs-main');
        if (contentContainer) {
            contentContainer.scrollTop = 0;
        } else {
            window.scrollTo(0, 0);
        }
    }, [pathname]);

    return null;
}
