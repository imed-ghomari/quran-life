'use client';

import { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
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

    // Track which items are expanded
    const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});

    // Auto-expand the active path's ancestors
    useEffect(() => {
        const newExpanded: Record<string, boolean> = { ...expandedPaths };
        let changed = false;

        const checkExpand = (items: SidebarItem[]) => {
            for (const item of items) {
                if (item.children) {
                    // If any child is active or expanded, expand this parent
                    const isChildActive = item.children.some(child => 
                        normalize(child.href) === activePath || 
                        (child.children && child.children.some(c => normalize(c.href) === activePath))
                    );

                    if (isChildActive && !newExpanded[item.href]) {
                        newExpanded[item.href] = true;
                        changed = true;
                    }
                    checkExpand(item.children);
                }
            }
        };

        checkExpand(items);
        if (changed) {
            setExpandedPaths(newExpanded);
        }
    }, [activePath, items, expandedPaths]);

    const toggleExpand = (e: React.MouseEvent, href: string) => {
        e.preventDefault();
        e.stopPropagation();
        setExpandedPaths(prev => ({
            ...prev,
            [href]: !prev[href]
        }));
    };

    return (
        <ul className={`sidebar-nav-list ${level > 0 ? 'nested' : ''}`}>
            {items.map((item) => {
                const isExpanded = expandedPaths[item.href];
                const hasChildren = item.children && item.children.length > 0;
                const isTargetActive = normalize(item.href) === activePath;

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
