'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { DOCS_SIDEBAR_REVEAL_PARAM } from '@/lib/docsSidebarReveal';
import { useDocsNavigation } from './DocsNavigationState';

import { ChevronRight, ChevronDown } from 'lucide-react';

const SIDEBAR_SCROLL_MEMORY_KEY = '__docsSidebarScrollTop';

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
    const searchParams = useSearchParams();
    const { activePath, setPendingPath } = useDocsNavigation();

    // Normalize paths for comparison
    const normalize = (p: string) => p.replace(/\/$/, '') || '/';
    const targetPath = normalize(href);
    const isActive = activePath === targetPath || (hasChildren && activePath.startsWith(targetPath + '/'));
    const isCurrent = activePath === targetPath;
    const isPathnameCurrent = normalize(pathname || '') === targetPath;
    const shouldRevealCurrentFile = searchParams?.get(DOCS_SIDEBAR_REVEAL_PARAM) === '1';
    const linkRef = useRef<HTMLDivElement>(null);

    const getScrollableAncestor = (node: HTMLElement): HTMLElement | null => {
        let current: HTMLElement | null = node.parentElement;
        while (current) {
            const style = window.getComputedStyle(current);
            const overflowY = style.overflowY;
            const canScroll = /(auto|scroll|overlay)/.test(overflowY) && current.scrollHeight > current.clientHeight;
            if (canScroll) return current;
            current = current.parentElement;
        }
        return null;
    };

    const rememberSidebarScrollTop = () => {
        if (!linkRef.current || typeof window === 'undefined') return;
        const scrollContainer = getScrollableAncestor(linkRef.current);
        if (!scrollContainer) return;
        window.sessionStorage.setItem(SIDEBAR_SCROLL_MEMORY_KEY, String(scrollContainer.scrollTop));
    };

    useEffect(() => {
        if (!isPathnameCurrent || !shouldRevealCurrentFile || !linkRef.current) return;

        const element = linkRef.current;
        const scrollContainer = getScrollableAncestor(element);
        const isMobile = window.matchMedia('(max-width: 767px)').matches;
        const mobileBottomToolbarOffset = isMobile ? 88 : 0;
        const margin = 12;
        const consumeRevealIntent = () => {
            const url = new URL(window.location.href);
            if (!url.searchParams.has(DOCS_SIDEBAR_REVEAL_PARAM)) return;
            url.searchParams.delete(DOCS_SIDEBAR_REVEAL_PARAM);
            const nextUrl = `${url.pathname}${url.search}${url.hash}`;
            window.history.replaceState(window.history.state, '', nextUrl);
        };

        if (!scrollContainer) {
            const rect = element.getBoundingClientRect();
            const viewportTop = margin;
            const viewportBottom = window.innerHeight - mobileBottomToolbarOffset - margin;
            const isInView = rect.bottom > viewportTop && rect.top < viewportBottom;

            if (!isInView) {
                element.scrollIntoView({
                    block: 'nearest',
                    inline: 'nearest',
                    behavior: 'auto',
                });
            }
            consumeRevealIntent();
            return;
        }

        const containerRect = scrollContainer.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        const visibleTop = containerRect.top + margin;
        const visibleBottom = containerRect.bottom - mobileBottomToolbarOffset - margin;
        const isInView = elementRect.bottom > visibleTop && elementRect.top < visibleBottom;

        if (isInView) {
            consumeRevealIntent();
            return;
        }

        if (elementRect.bottom > visibleBottom) {
            scrollContainer.scrollBy({
                top: elementRect.bottom - visibleBottom,
                behavior: 'auto',
            });
            consumeRevealIntent();
            return;
        }

        if (elementRect.top < visibleTop) {
            scrollContainer.scrollBy({
                top: elementRect.top - visibleTop,
                behavior: 'auto',
            });
            consumeRevealIntent();
            return;
        }

        consumeRevealIntent();
    }, [isPathnameCurrent, shouldRevealCurrentFile]);

    useEffect(() => {
        if (!isPathnameCurrent || shouldRevealCurrentFile || !linkRef.current) return;
        const raw = window.sessionStorage.getItem(SIDEBAR_SCROLL_MEMORY_KEY);
        if (!raw) return;

        const savedScrollTop = Number(raw);
        if (!Number.isFinite(savedScrollTop)) {
            window.sessionStorage.removeItem(SIDEBAR_SCROLL_MEMORY_KEY);
            return;
        }

        const scrollContainer = getScrollableAncestor(linkRef.current);
        if (scrollContainer) {
            scrollContainer.scrollTop = savedScrollTop;
        }
        window.sessionStorage.removeItem(SIDEBAR_SCROLL_MEMORY_KEY);
    }, [isPathnameCurrent, shouldRevealCurrentFile, pathname]);

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
                    onClick={() => {
                        rememberSidebarScrollTop();
                        if (normalize(href) !== activePath) {
                            setPendingPath(href);
                        }
                        onClick?.();
                    }}
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
