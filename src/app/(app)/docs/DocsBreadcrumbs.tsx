'use client';

import { ChevronRight } from 'lucide-react';
import { usePathname } from 'next/navigation';

export default function DocsBreadcrumbs() {
    const pathname = usePathname();

    // Function to get breadcrumb parts from pathname
    const getBreadcrumbs = () => {
        const parts = pathname.split('/').filter(Boolean);
        // Remove 'docs' as requested
        const filteredParts = parts.filter(part => part !== 'docs');
        
        if (filteredParts.length === 0) return [{ title: 'Introduction', isLast: true }];

        return filteredParts.map((part, index) => {
            const title = part
                .split('-')
                .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
            return {
                title,
                isLast: index === filteredParts.length - 1
            };
        });
    };

    const breadcrumbs = getBreadcrumbs();

    return (
        <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem', 
            fontSize: '0.875rem',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            minWidth: 0
        }}>
            {breadcrumbs.map((crumb, index) => (
                <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                    <span style={{ 
                        color: crumb.isLast ? 'var(--foreground)' : 'var(--foreground-secondary)', 
                        fontWeight: crumb.isLast ? 500 : 400,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                    }}>
                        {crumb.title}
                    </span>
                    {!crumb.isLast && (
                        <ChevronRight size={14} style={{ color: 'var(--border)', flexShrink: 0 }} />
                    )}
                </div>
            ))}
        </div>
    );
}
