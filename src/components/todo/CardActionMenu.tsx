'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, PenTool, Trash2, SplitSquareHorizontal, FileText, Search, Upload, RotateCcw, Settings } from 'lucide-react';
import Link from 'next/link';
import { withDocsSidebarReveal } from '@/lib/docsSidebarReveal';

interface CardActionMenuProps {
    isMobile: boolean;
    // Context Flags
    hasMindmap: boolean;
    cardType: 'surah' | 'part' | 'suspended' | 'similarity';
    isProcessing?: boolean;
    showExport?: boolean;
    showDelete?: boolean;
    showReset?: boolean;

    // State
    isOpen: boolean;
    onClose: () => void;
    anchorRef: React.RefObject<HTMLButtonElement | null>;

    // Actions
    onEditMindmap: () => Promise<void> | void;
    onDeleteMindmap: () => Promise<void> | void;
    onExportMindmap?: () => Promise<void> | void;
    onResetMindmap?: () => Promise<void> | void;
    onChangeSplits: () => Promise<void> | void;
    onViewVerseContext?: () => Promise<void> | void; // For Suspended
    onViewSimilarityContext?: () => Promise<void> | void; // For Similarity

    settingsHref?: string;
    docLink?: string;
}

export default function CardActionMenu({
    isMobile,
    hasMindmap,
    cardType,
    isProcessing,
    isOpen,
    onClose,
    anchorRef,
    onEditMindmap,
    onDeleteMindmap,
    onExportMindmap,
    onResetMindmap,
    onChangeSplits,
    onViewVerseContext,
    onViewSimilarityContext,
    settingsHref,
    docLink,
    showExport,
    showDelete,
    showReset,
}: CardActionMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
    const [isActionPending, setIsActionPending] = useState(false);
    const DESKTOP_VIEWPORT_MARGIN = 8;
    const DESKTOP_MENU_GAP = 12;
    const DESKTOP_MENU_MIN_WIDTH = 270;

    const runMenuAction = useCallback(async (action?: () => Promise<void> | void) => {
        if (!action || isActionPending) return;
        setIsActionPending(true);
        try {
            await action();
            onClose();
        } catch (err) {
            console.error('Card action failed', err);
        } finally {
            setIsActionPending(false);
        }
    }, [isActionPending, onClose]);

    // Define Menu Items based on Context
    const menuItems = useMemo(() => {
        const items = [];

        // 1. Mindmap Actions (Surah/Part)
        if (cardType === 'surah' || cardType === 'part') {
            items.push({
                label: hasMindmap ? 'Edit Mindmap' : 'Create Mindmap',
                icon: <PenTool size={20} />,
                onClick: onEditMindmap,
                disabled: isProcessing,
                isFirst: true
            });

            if (showExport) {
                items.push({
                    label: 'Export Mindmap',
                    icon: <Upload size={20} />,
                    onClick: onExportMindmap,
                    disabled: isProcessing || !hasMindmap
                });
            }

            if (hasMindmap && cardType === 'surah') {
                items.push({
                    label: 'Change Splits',
                    icon: <SplitSquareHorizontal size={20} />,
                    onClick: onChangeSplits,
                    disabled: isProcessing
                });
            }

            if (docLink) {
                items.push({
                    label: 'View Documentation',
                    icon: <FileText size={20} />,
                    isLink: true,
                    href: withDocsSidebarReveal(docLink),
                    disabled: false
                });
            }

            if (hasMindmap && (showDelete || showReset)) {
                items.push({ type: 'divider' });
                if (showReset) {
                    items.push({
                        label: 'Reset to Original',
                        icon: <RotateCcw size={20} />,
                        onClick: onResetMindmap,
                        disabled: isProcessing,
                        danger: true,
                        isLast: true
                    });
                } else if (showDelete) {
                    items.push({
                        label: 'Delete Mindmap',
                        icon: <Trash2 size={20} />,
                        onClick: onDeleteMindmap,
                        disabled: isProcessing,
                        danger: true,
                        isLast: true
                    });
                }
            }
        }

        // 2. Suspended Actions
        if (cardType === 'suspended') {
            items.push({
                label: 'Edit Mindmap',
                icon: <PenTool size={20} />,
                onClick: onEditMindmap,
                disabled: isProcessing
            });
            items.push({
                label: 'Edit Splits',
                icon: <SplitSquareHorizontal size={20} />,
                onClick: onChangeSplits,
                disabled: isProcessing
            });
            items.push({
                label: 'View Verse Context',
                icon: <FileText size={20} />,
                onClick: onViewVerseContext,
                disabled: isProcessing
            });
        }

        // 3. Similarity Actions
        if (cardType === 'similarity') {
            items.push({
                label: 'Open Similarity Context',
                icon: <Search size={20} />,
                onClick: onViewSimilarityContext,
                disabled: isProcessing
            });
            items.push({
                label: 'View in Similarity Settings',
                icon: <Settings size={20} />,
                isLink: true,
                href: settingsHref || '/settings?tab=tracking',
                disabled: isProcessing
            });
        }

        return items;
    }, [
        cardType,
        hasMindmap,
        isProcessing,
        showExport,
        showDelete,
        showReset,
        docLink,
        onEditMindmap,
        onDeleteMindmap,
        onExportMindmap,
        onResetMindmap,
        onChangeSplits,
        onViewVerseContext,
        onViewSimilarityContext,
        settingsHref
    ]);

    const estimatedMenuHeight = useMemo(() => {
        const actionRows = menuItems.filter((item) => item.type !== 'divider').length;
        const dividerRows = menuItems.length - actionRows;
        // p-4 container plus per-row height estimate keeps first render stable.
        return 32 + actionRows * 50 + dividerRows * 10;
    }, [menuItems]);

    // Calculate position for desktop dropdown - useLayoutEffect to prevent flash
    React.useLayoutEffect(() => {
        if (!isOpen || !anchorRef.current || isMobile) return;

        const updatePosition = () => {
            if (!anchorRef.current) return;
            const rect = anchorRef.current.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const measuredWidth = menuRef.current?.offsetWidth ?? DESKTOP_MENU_MIN_WIDTH;
            const measuredHeight = menuRef.current?.offsetHeight ?? estimatedMenuHeight;
            const leftBound = DESKTOP_VIEWPORT_MARGIN;
            const rightBound = viewportWidth - measuredWidth - DESKTOP_VIEWPORT_MARGIN;
            const belowTop = rect.bottom + DESKTOP_MENU_GAP;
            const aboveTop = rect.top - measuredHeight - DESKTOP_MENU_GAP;
            const shouldOpenAbove = belowTop + measuredHeight > viewportHeight - DESKTOP_VIEWPORT_MARGIN
                && aboveTop >= DESKTOP_VIEWPORT_MARGIN;
            const unclampedTop = shouldOpenAbove ? aboveTop : belowTop;
            const maxTop = viewportHeight - DESKTOP_VIEWPORT_MARGIN - measuredHeight;
            const top = Math.max(DESKTOP_VIEWPORT_MARGIN, Math.min(unclampedTop, Math.max(DESKTOP_VIEWPORT_MARGIN, maxTop)));
            const left = Math.max(leftBound, Math.min(rect.right - measuredWidth, Math.max(leftBound, rightBound)));
            const directionalSpace = shouldOpenAbove
                ? rect.top - DESKTOP_MENU_GAP - DESKTOP_VIEWPORT_MARGIN
                : viewportHeight - belowTop - DESKTOP_VIEWPORT_MARGIN;
            const fallbackMaxHeight = viewportHeight - DESKTOP_VIEWPORT_MARGIN * 2;
            const maxHeight = directionalSpace > 160 ? directionalSpace : fallbackMaxHeight;

            setPosition({ top, left, maxHeight });
        };

        updatePosition();
        const rafId = window.requestAnimationFrame(updatePosition);
        window.addEventListener('resize', updatePosition);
        return () => {
            window.cancelAnimationFrame(rafId);
            window.removeEventListener('resize', updatePosition);
        };
    }, [isOpen, anchorRef, isMobile, menuItems.length, estimatedMenuHeight]);

    // Close on outside click (desktop only)
    useEffect(() => {
        if (!isOpen || isMobile) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
                anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        const handleScroll = () => onClose();

        document.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('scroll', handleScroll, true);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('scroll', handleScroll, true);
        };
    }, [isOpen, isMobile, onClose, anchorRef]);

    // Prevent body scroll on mobile when open
    useEffect(() => {
        if (isMobile && isOpen) {
            document.body.style.overflow = 'hidden';
            return () => { document.body.style.overflow = 'unset'; };
        }
    }, [isMobile, isOpen]);

    if (!isOpen) return null;

    // Render Logic
    const renderContent = () => {
        if (!isMobile) {
            if (!position) return null;
            // Desktop Dropdown
            return (
                <div
                    ref={menuRef}
                    className="fixed z-[9990] min-w-[270px] bg-[var(--background)] border border-[var(--border)] rounded-[14px] shadow-xl ring-1 ring-black/5 overflow-x-hidden overflow-y-auto"
                    style={{ top: position.top, left: position.left, maxHeight: position.maxHeight }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="p-4 flex flex-col gap-1">
                        {menuItems.map((item, idx) => {
                            if (item.type === 'divider') {
                                return <div key={idx} className="h-px bg-[var(--border)] my-1 mx-3" />;
                            }

                            const isFirstItem = item.isFirst;
                            const isLastItem = item.isLast;

                            const className = `
                                card-action-menu-item adv-seg-btn w-full !flex !items-center !justify-start gap-2 pl-8 pr-4 py-3 text-left
                                ${item.danger ? 'is-danger' : 'is-neutral'}
                                ${isFirstItem ? 'mt-1' : ''}
                                ${isLastItem ? 'mb-1' : ''}
                                ${item.disabled
                                    ? 'text-[var(--foreground-secondary)] opacity-50 cursor-not-allowed'
                                    : item.danger
                                        ? 'text-[var(--danger)]'
                                        : ''}
                            `;

                            if (item.isLink) {
                                return (
                                    <Link key={idx} href={item.href!} className={className} onClick={onClose}>
                                        <span className={`w-8 flex items-center justify-center ml-2 opacity-70 ${item.danger ? '' : 'opacity-70'}`}>{item.icon}</span>
                                        <span>{item.label}</span>
                                    </Link>
                                );
                            }

                            return (
                                <button key={idx} onClick={() => { void runMenuAction(item.onClick); }} disabled={item.disabled || isActionPending} className={className}>
                                    <span className={`w-8 flex items-center justify-center ml-2 opacity-70 ${item.danger ? '' : 'opacity-70'}`}>{item.icon}</span>
                                    <span>{item.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            );
        }

        // Mobile Bottom Sheet
        return (
            <div className="fixed inset-0 z-[9999] flex items-end" onClick={onClose}>
                <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />

                <div
                    ref={menuRef}
                    className="relative w-full bg-[var(--background)] rounded-t-[14px] border-2 border-[var(--border)] p-6 pt-8 pb-16 shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                    style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
                >
                    {/* Handle */}
                    <div className="flex justify-center mb-6 pt-2">
                        <div className="w-12 h-1.5 bg-[var(--foreground-secondary)]/20 rounded-full" />
                    </div>

                    <div className="flex flex-col gap-1 pb-6">
                        {menuItems.map((item, idx) => {
                            if (item.type === 'divider') {
                                return <div key={idx} className="h-px bg-[var(--border)] my-2" />;
                            }

                            const isFirstItem = item.isFirst;
                            const isLastItem = item.isLast;

                            const className = `
                                card-action-menu-item adv-seg-btn w-full !rounded-[14px] !flex !items-center !justify-start gap-4 pl-10 pr-6 py-4 text-left
                                ${item.danger ? 'is-danger' : 'is-neutral'}
                                ${isFirstItem ? 'mt-1' : ''}
                                ${isLastItem ? 'mb-1' : ''}
                                ${item.disabled
                                    ? 'text-[var(--foreground-secondary)] opacity-50'
                                    : item.danger
                                        ? 'text-[var(--danger)]'
                                        : 'text-[var(--foreground)] active:bg-[var(--foreground)]/5'}
                            `;

                            if (item.isLink) {
                                return (
                                    <Link key={idx} href={item.href!} className={className} onClick={onClose}>
                                        <span className="w-8 flex items-center justify-center ml-2">{item.icon}</span>
                                        <span>{item.label}</span>
                                    </Link>
                                );
                            }

                            return (
                                <button key={idx} onClick={() => { void runMenuAction(item.onClick); }} disabled={item.disabled || isActionPending} className={className}>
                                    <span className="w-8 flex items-center justify-center ml-2">{item.icon}</span>
                                    <span>{item.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    };

    if (typeof document === 'undefined') return null;
    return createPortal(renderContent(), document.body);
}

export function CardMenuTrigger({ onClick, buttonRef }: { onClick: (e: React.MouseEvent) => void; buttonRef: React.RefObject<HTMLButtonElement | null> }) {
    return (
        <button
            ref={buttonRef}
            onClick={onClick}
            className="p-2 rounded-lg text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-[var(--background-secondary)] transition-colors"
            aria-label="Card Actions"
        >
            <MoreVertical size={16} />
        </button>
    );
}
