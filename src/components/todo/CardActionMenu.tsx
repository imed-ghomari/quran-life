'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, PenTool, Download, Trash2, SplitSquareHorizontal, FileText, Search, Upload, RotateCcw } from 'lucide-react';
import Link from 'next/link';

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
    onEditMindmap: () => void;
    onImportMindmap: () => void;
    onDeleteMindmap: () => void;
    onExportMindmap?: () => void;
    onResetMindmap?: () => void;
    onChangeSplits: () => void;
    onViewVerseContext?: () => void; // For Suspended
    onViewSimilarityContext?: () => void; // For Similarity

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
    onImportMindmap,
    onDeleteMindmap,
    onExportMindmap,
    onResetMindmap,
    onChangeSplits,
    onViewVerseContext,
    onViewSimilarityContext,
    docLink,
    showExport,
    showDelete,
    showReset,
}: CardActionMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

    // Calculate position for desktop dropdown - useLayoutEffect to prevent flash
    React.useLayoutEffect(() => {
        if (isOpen && anchorRef.current && !isMobile) {
            const rect = anchorRef.current.getBoundingClientRect();
            const scrollY = window.scrollY;
            setPosition({
                top: rect.bottom + scrollY + 12, // More vertical gap
                left: rect.right - 250 + window.scrollX // Adjusted for wider menu (320px width approx)
            });
        }
    }, [isOpen, anchorRef, isMobile]);

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

    // Define Menu Items based on Context
    const getMenuItems = () => {
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

            if (!hasMindmap) {
                items.push({
                    label: 'Import Template',
                    icon: <Download size={20} />,
                    onClick: onImportMindmap,
                    disabled: isProcessing
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
                    href: docLink,
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
                label: 'View Similarity Conflict',
                icon: <Search size={20} />,
                onClick: onViewSimilarityContext,
                disabled: isProcessing
            });
        }

        return items;
    };

    const menuItems = getMenuItems();

    // Render Logic
    const renderContent = () => {
        if (!isMobile) {
            if (!position) return null;
            // Desktop Dropdown
            return (
                <div
                    ref={menuRef}
                    className="fixed z-[9990] min-w-[270px] bg-[var(--background)] border border-[var(--border)] rounded-2xl shadow-xl ring-1 ring-black/5 overflow-hidden"
                    style={{ top: position.top, left: position.left }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="p-4 flex flex-col gap-2">
                        {menuItems.map((item, idx) => {
                            if (item.type === 'divider') {
                                return <div key={idx} className="h-px bg-[var(--border)] my-1 mx-3" />;
                            }

                            const isFirstItem = item.isFirst;
                            const isLastItem = item.isLast;

                            const className = `
                                w-full flex items-center gap-2 pl-4 pr-4 py-3.5 text-[13px] font-medium text-left rounded-xl transition-colors
                                ${isFirstItem ? 'mt-1' : ''}
                                ${isLastItem ? 'mb-1' : ''}
                                ${item.disabled
                                    ? 'text-[var(--foreground-secondary)] opacity-50 cursor-not-allowed'
                                    : item.danger
                                        ? 'text-red-500 hover:bg-red-500/10 active:bg-red-500/15'
                                        : 'text-[var(--foreground)] hover:bg-[var(--foreground)]/5 active:bg-[var(--foreground)]/10'}
                            `;

                            if (item.isLink) {
                                return (
                                    <Link key={idx} href={item.href!} className={className} onClick={onClose}>
                                        <span className={`w-8 flex items-center justify-center opacity-70 ${item.danger ? '' : 'opacity-70'}`}>{item.icon}</span>
                                        <span>{item.label}</span>
                                    </Link>
                                );
                            }

                            return (
                                <button key={idx} onClick={() => { item.onClick?.(); onClose(); }} disabled={item.disabled} className={className}>
                                    <span className={`w-8 flex items-center justify-center opacity-70 ${item.danger ? '' : 'opacity-70'}`}>{item.icon}</span>
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
                    className="relative w-full bg-[var(--background)] rounded-t-[28px] border-2 border-[var(--border)] p-6 pt-8 pb-16 shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                    style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
                >
                    {/* Handle */}
                    <div className="flex justify-center mb-6 pt-2">
                        <div className="w-12 h-1.5 bg-[var(--foreground-secondary)]/20 rounded-full" />
                    </div>

                    <div className="flex flex-col gap-2 pb-6">
                        {menuItems.map((item, idx) => {
                            if (item.type === 'divider') {
                                return <div key={idx} className="h-px bg-[var(--border)] my-2" />;
                            }

                            const isFirstItem = item.isFirst;
                            const isLastItem = item.isLast;

                            const className = `
                                w-full flex items-center gap-4 px-6 py-5 text-[17px] font-medium text-left rounded-2xl transition-colors
                                ${isFirstItem ? 'mt-1' : ''}
                                ${isLastItem ? 'mb-1' : ''}
                                ${item.disabled
                                    ? 'text-[var(--foreground-secondary)] opacity-50'
                                    : item.danger
                                        ? 'text-red-500 active:bg-red-500/10'
                                        : 'text-[var(--foreground)] active:bg-[var(--foreground)]/5'}
                            `;

                            if (item.isLink) {
                                return (
                                    <Link key={idx} href={item.href!} className={className} onClick={onClose}>
                                        <span className="w-8 flex items-center justify-center">{item.icon}</span>
                                        <span>{item.label}</span>
                                    </Link>
                                );
                            }

                            return (
                                <button key={idx} onClick={() => { item.onClick?.(); onClose(); }} disabled={item.disabled} className={className}>
                                    <span className="w-8 flex items-center justify-center">{item.icon}</span>
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
