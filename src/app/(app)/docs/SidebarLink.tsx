'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { ChevronRight, ChevronDown } from 'lucide-react';

export default function SidebarLink({
    href,
    title,
    onClick,
    hasChildren,
    isExpanded,
    onToggle
}: {
    href: string;
    title: string;
    onClick?: () => void;
    hasChildren?: boolean;
    isExpanded?: boolean;
    onToggle?: (e: React.MouseEvent) => void;
}) {
    const pathname = usePathname();

    // Normalize paths for comparison
    const normalize = (p: string) => p.replace(/\/$/, '') || '/';
    const activePath = normalize(pathname || '');
    const targetPath = normalize(href);
    const isActive = activePath === targetPath || (hasChildren && activePath.startsWith(targetPath + '/'));
    const isCurrent = activePath === targetPath;
    const linkRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isCurrent) return;
        linkRef.current?.scrollIntoView({
            block: 'nearest',
            inline: 'nearest',
            behavior: 'auto',
        });
    }, [isCurrent]);

    return (
        <div ref={linkRef} style={{ display: 'flex', alignItems: 'center' }}>
            {hasChildren ? (
                <div
                    onClick={onToggle}
                    style={{
                        display: 'flex',
                        flex: 1,
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.4rem 0.75rem',
                        borderRadius: '0.375rem',
                        fontSize: '0.875rem',
                        cursor: 'pointer',
                        color: isActive ? 'var(--accent)' : 'var(--foreground-secondary)',
                        backgroundColor: isActive ? 'rgba(91, 143, 185, 0.1)' : 'transparent',
                        fontWeight: isActive ? 600 : 400,
                        transition: 'all 0.2s ease',
                    }}
                    className="hover:bg-[var(--background-secondary)]"
                >
                    <span>{title}</span>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            color: 'var(--foreground-secondary)',
                            opacity: 0.5
                        }}
                    >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </div>
                </div>
            ) : (
                <Link
                    href={href}
                    onClick={onClick}
                    style={{
                        display: 'flex',
                        flex: 1,
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.4rem 0.75rem',
                        borderRadius: '0.375rem',
                        fontSize: '0.875rem',
                        textDecoration: 'none',
                        color: isActive ? 'var(--accent)' : 'var(--foreground-secondary)',
                        backgroundColor: isActive ? 'rgba(91, 143, 185, 0.1)' : 'transparent',
                        fontWeight: isActive ? 600 : 400,
                        transition: 'all 0.2s ease',
                    }}
                    className="hover:bg-[var(--background-secondary)]"
                >
                    <span>{title}</span>
                </Link>
            )}
        </div>
    );
}
