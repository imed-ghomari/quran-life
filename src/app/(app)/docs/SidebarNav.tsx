'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import SidebarLink from './SidebarLink';

export interface SidebarItem {
    title: string;
    href: string;
    children?: SidebarItem[];
}

interface SidebarNavProps {
    items: SidebarItem[];
    level?: number;
    onLinkClick?: () => void;
}

export default function SidebarNav({ items, level = 0, onLinkClick }: SidebarNavProps) {
    const pathname = usePathname();
    const normalize = (p: string) => p.replace(/\/$/, '') || '/';
    const activePath = normalize(pathname || '');

    const [expandedPath, setExpandedPath] = useState<string | null>(null);

    const subtreeHasActivePath = (item: SidebarItem): boolean => {
        const itemPath = normalize(item.href);
        if (itemPath === activePath) {
            return true;
        }
        if (!item.children || item.children.length === 0) {
            return false;
        }
        return item.children.some((child) => subtreeHasActivePath(child));
    };

    // Keep the folder containing the active route open at this level.
    useEffect(() => {
        const activeContainer = items.find(
            (item) => item.children && item.children.length > 0 && subtreeHasActivePath(item),
        );
        if (activeContainer) {
            setExpandedPath(activeContainer.href);
        }
    }, [activePath, items]);

    const toggleExpand = (e: React.MouseEvent, href: string) => {
        e.preventDefault();
        e.stopPropagation();
        setExpandedPath((prev) => (prev === href ? null : href));
    };

    return (
        <ul className={`sidebar-nav-list ${level > 0 ? 'nested' : ''}`}>
            {items.map((item) => {
                const isExpanded = expandedPath === item.href;
                const hasChildren = item.children && item.children.length > 0;

                return (
                    <li key={item.href} style={{ marginBottom: '0.25rem' }}>
                        <SidebarLink
                            href={item.href}
                            title={item.title}
                            onClick={onLinkClick}
                            hasChildren={hasChildren}
                            isExpanded={isExpanded}
                            onToggle={(e) => toggleExpand(e, item.href)}
                        />
                        {hasChildren && isExpanded && (
                            <SidebarNav
                                items={item.children!}
                                level={level + 1}
                                onLinkClick={onLinkClick}
                            />
                        )}
                    </li>
                );
            })}
        </ul>
    );
}
