'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, PenTool, Download, Trash2, SplitSquareHorizontal, FileText, Check, AlertTriangle, Search } from 'lucide-react';
import Link from 'next/link';

interface CardActionMenuProps {
    isMobile: boolean;
    // Context Flags
    hasMindmap: boolean;
    cardType: 'surah' | 'part' | 'suspended' | 'similarity';
    isProcessing?: boolean;

    // State
    isOpen: boolean;
    onClose: () => void;
    anchorRef: React.RefObject<HTMLButtonElement | null>;

    // Actions
    onEditMindmap: () => void;
    onImportMindmap: () => void;
    onDeleteMindmap: () => void;
    onChangeSplits: () => void;
    onFixIssue?: () => void;      // For Suspended
    onResolveSimilarity?: () => void; // For Similarity

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
    onChangeSplits,
    onFixIssue,
    onResolveSimilarity,
    docLink,
}: CardActionMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ top: 0, left: 0 });

    // Calculate position for desktop dropdown
    useEffect(() => {
        if (isOpen && anchorRef.current && !isMobile) {
            const rect = anchorRef.current.getBoundingClientRect();
            const scrollY = window.scrollY;
            setPosition({
                top: rect.bottom + scrollY + 8, // Increased gap slightly
                left: rect.right - 220 + window.scrollX // Widen alignment
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
                icon: <PenTool size={18} />,
                onClick: onEditMindmap,
                disabled: isProcessing
            });

            if (!hasMindmap) {
                items.push({
                    label: 'Import Template',
                    icon: <Download size={18} />,
                    onClick: onImportMindmap,
                    disabled: isProcessing
                });
            }

            if (hasMindmap) {
                items.push({
                    label: 'Change Splits',
                    icon: <SplitSquareHorizontal size={18} />,
                    onClick: onChangeSplits,
                    disabled: isProcessing
                });
            }

            if (docLink) {
                items.push({
                    label: 'View Documentation',
                    icon: <FileText size={18} />,
                    isLink: true,
                    href: docLink,
                    disabled: false
                });
            }

            if (hasMindmap) {
                items.push({ type: 'divider' });
                items.push({
                    label: 'Delete Mindmap',
                    icon: <Trash2 size={18} />,
                    onClick: onDeleteMindmap,
                    disabled: isProcessing,
                    danger: true
                });
            }
        }

        // 2. Suspended Actions
        if (cardType === 'suspended') {
            items.push({
                label: 'Jump to Issue',
                icon: <AlertTriangle size={18} />,
                onClick: onEditMindmap, // Reuse edit mindmap to jump (context aware in KanbanCard)
                disabled: isProcessing
            });
            items.push({
                label: 'Complete & Fix',
                icon: <Check size={18} />,
                onClick: onFixIssue,
                disabled: isProcessing
            });
        }

        // 3. Similarity Actions
        if (cardType === 'similarity') {
            items.push({
                label: 'Resolve Conflict',
                icon: <Search size={18} />,
                onClick: onResolveSimilarity,
                disabled: isProcessing
            });
            items.push({
                label: 'View Context',
                icon: <FileText size={18} />,
                onClick: onResolveSimilarity, // Can map to same for now, or new View handler
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
                    className="fixed z-[9999] min-w-[220px] bg-[var(--background)] border border-[var(--border)] rounded-xl shadow-lg ring-1 ring-black/5 overflow-hidden"
                    style={{ top: position.top, left: position.left }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="py-1">
                        {menuItems.map((item, idx) => {
                            if (item.type === 'divider') {
                                return <div key={idx} className="h-px bg-[var(--border)] my-1.5 mx-3" />;
                            }

                            const className = `
                                w-full flex items-center gap-3 px-4 py-2.5 text-[13px] font-medium text-left transition-colors
                                ${item.disabled
                                    ? 'text-[var(--foreground-secondary)] opacity-50 cursor-not-allowed'
                                    : item.danger
                                        ? 'text-red-500 hover:bg-red-500/5 active:bg-red-500/10'
                                        : 'text-[var(--foreground)] hover:bg-[var(--background-secondary)] active:bg-[var(--background-secondary)]/80'}
                            `;

                            if (item.isLink) {
                                return (
                                    <Link key={idx} href={item.href!} className={className} onClick={onClose}>
                                        <span className="opacity-70">{item.icon}</span>
                                        <span>{item.label}</span>
                                    </Link>
                                );
                            }

                            return (
                                <button key={idx} onClick={() => { item.onClick?.(); onClose(); }} disabled={item.disabled} className={className}>
                                    <span className={item.danger ? '' : 'opacity-70'}>{item.icon}</span>
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
                <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-200" />

                <div
                    ref={menuRef}
                    className="relative w-full bg-[var(--background)] rounded-t-[20px] p-5 pb-8 animate-in slide-in-from-bottom duration-300"
                    onClick={(e) => e.stopPropagation()}
                    style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
                >
                    <div className="flex justify-center mb-6">
                        <div className="w-12 h-1.5 bg-[var(--foreground-secondary)]/20 rounded-full" />
                    </div>

                    <div className="flex flex-col gap-2">
                        {menuItems.map((item, idx) => {
                            if (item.type === 'divider') {
                                return <div key={idx} className="h-px bg-[var(--border)] my-2" />;
                            }

                            const className = `
                                w-full flex items-center gap-4 px-4 py-4 text-[15px] font-medium text-left rounded-xl transition-all active:scale-[0.98]
                                ${item.disabled
                                    ? 'text-[var(--foreground-secondary)] opacity-50 bg-[var(--background-secondary)]/30'
                                    : item.danger
                                        ? 'text-red-500 bg-red-500/10 active:bg-red-500/20'
                                        : 'text-[var(--foreground)] bg-[var(--background-secondary)] active:bg-[var(--background-secondary)]/80'}
                            `;

                            if (item.isLink) {
                                return (
                                    <Link key={idx} href={item.href!} className={className} onClick={onClose}>
                                        {item.icon}
                                        <span>{item.label}</span>
                                    </Link>
                                );
                            }

                            return (
                                <button key={idx} onClick={() => { item.onClick?.(); onClose(); }} disabled={item.disabled} className={className}>
                                    {item.icon}
                                    <span>{item.label}</span>
                                </button>
                            );
                        })}
                    </div>

                    <button
                        onClick={onClose}
                        className="w-full mt-4 py-4 text-[15px] font-semibold text-[var(--foreground)] bg-transparent border border-[var(--border)] rounded-xl active:bg-[var(--background-secondary)]"
                    >
                        Cancel
                    </button>
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
            className="p-2 rounded-lg text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-[var(--background-secondary)] transition-colors active:scale-95"
            aria-label="Card Actions"
        >
            <MoreVertical size={16} />
        </button>
    );
}
