'use client';

import React, { useState, useRef } from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { KanbanItem } from './types';
import { Brain, BadgeCheck, PenSquare, Layers, Scissors } from 'lucide-react';
import { getSurah } from '@/lib/quranData';
import CardActionMenu, { CardMenuTrigger } from './CardActionMenu';
import { useConfirmDialog } from '@/components/ConfirmDialogProvider';

interface KanbanCardProps {
    item: KanbanItem;
    index: number;
    isMobile: boolean;
    hasMindmap: boolean;
    hasPremade?: boolean;
    hasSplits: boolean;
    appMode: 'owner' | 'user';
    docLink?: string;
    onEditMindmap: () => Promise<void> | void;
    onDeleteMindmap: () => Promise<void> | void;
    onExportMindmap?: () => Promise<void> | void;
    onResetMindmap?: (resetMemoryNodes: boolean) => Promise<void> | void;
    onChangeSplits: () => Promise<void> | void;
    onViewVerseContext?: () => Promise<void> | void;
    onViewSimilarityContext?: () => Promise<void> | void;
}

const KanbanCard = ({
    item,
    index,
    isMobile,
    hasMindmap,
    hasPremade,
    hasSplits,
    appMode,
    docLink,
    onEditMindmap,
    onDeleteMindmap,
    onExportMindmap,
    onResetMindmap,
    onChangeSplits,
    onViewVerseContext,
    onViewSimilarityContext
}: KanbanCardProps) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const menuButtonRef = useRef<HTMLButtonElement>(null);
    const { confirm } = useConfirmDialog();

    const handleMenuClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setMenuOpen(prev => !prev);
    };

    const handleDeleteClick = async () => {
        setMenuOpen(false);

        const ok = await confirm({
            title: 'Delete Mindmap',
            message: 'Are you sure you want to delete this mindmap? This action cannot be undone and you will lose all progress on this map.',
            confirmLabel: 'Delete',
            isDestructive: true,
        });
        if (!ok) return;

        setIsDeleting(true);
        try {
            await onDeleteMindmap();
        } catch (e) {
            console.error("Delete failed", e);
        } finally {
            // Only reset if component is still mounted (React handles this mostly, but good practice)
            setIsDeleting(false);
        }
    };

    const handleResetClick = async () => {
        setMenuOpen(false);

        const ok = await confirm({
            title: 'Reset Mindmap',
            message: 'Reset this mindmap to the original shared version? Your edits will be replaced.',
            confirmLabel: 'Reset',
            isDestructive: true,
        });
        if (!ok) return;

        const resetMemoryNodes = await confirm({
            title: 'Reset Memory Nodes?',
            message: 'Also reset the memory nodes related to this mindmap? This will reset review progress for those nodes.',
            confirmLabel: 'Reset Mindmap + Memory',
            cancelLabel: 'Reset Mindmap Only',
            isDestructive: true,
        });

        setIsDeleting(true);
        try {
            await onResetMindmap?.(resetMemoryNodes);
        } catch (e) {
            console.error("Reset failed", e);
        } finally {
            setIsDeleting(false);
        }
    };

    // Responsive Spacing Config - Tighter for Mobile
    // const padding = isMobile ? '!px-3 !pt-2.5 !pb-1.5' : '!p-5';
    // const borderRadius = isMobile ? '!rounded-[12px]' : '!rounded-2xl';
    // const verticalGap = isMobile ? 'space-y-0.5' : 'space-y-3';
    // const minWidth = isMobile ? 'min-w-[240px]' : '';
    // const footerPad = isMobile ? 'pt-1.5' : 'pt-5';

    // Determine card type for menu
    const cardType = item.type; // 'surah' | 'part' | 'suspended' | 'similarity'
    const showExport = appMode === 'owner' && hasMindmap;
    const showDelete = appMode === 'owner' && hasMindmap;
    const showReset = appMode === 'user' && hasMindmap && !!hasPremade;

    return (
        <>
            <Draggable draggableId={item.id} index={index}>
                {(provided, snapshot) => (
                    <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                        className={`
                            roadmap-card kanban-card todo-kanban-card group relative cursor-pointer !rounded-[14px]
                            ${snapshot.isDragging ? 'z-50 shadow-lg ring-2 ring-[var(--accent)] rotate-2' : ''}
                            ${item.status === 'complete' ? 'opacity-80' : ''}
                            ${isMobile ? 'min-w-[42vw] snap-center' : ''}
                        `}
                        style={{
                            ...provided.draggableProps.style,
                        }}
                    >
                        {renderCardZones({
                            item,
                            hasMindmap,
                            hasPremade,
                            showExport,
                            showDelete,
                            showReset,
                            cardType,
                            menuOpen,
                            setMenuOpen,
                            menuButtonRef,
                            handleMenuClick,
                            isMobile,
                            onEditMindmap,
                            onDeleteMindmap: handleDeleteClick,
                            onExportMindmap,
                            onResetMindmap: handleResetClick,
                            onChangeSplits,
                            hasSplits,
                            footerPad: 'pt-3',
                            docLink,
                            onViewVerseContext,
                            onViewSimilarityContext
                        })}
                    </div>
                )}
            </Draggable>
        </>
    );
};

interface RenderZoneProps {
    item: KanbanItem;
    hasMindmap: boolean;
    hasPremade?: boolean;
    hasSplits: boolean;
    showExport: boolean;
    showDelete: boolean;
    showReset: boolean;
    cardType: string;
    menuOpen: boolean;
    setMenuOpen: (open: boolean) => void;
    menuButtonRef: React.RefObject<HTMLButtonElement | null>;
    handleMenuClick: (e: React.MouseEvent) => void;
    isMobile: boolean;
    onEditMindmap: () => Promise<void> | void;
    onDeleteMindmap: () => Promise<void> | void;
    onExportMindmap?: () => Promise<void> | void;
    onResetMindmap?: () => Promise<void> | void;
    onChangeSplits: () => Promise<void> | void;
    onViewVerseContext?: () => Promise<void> | void;
    onViewSimilarityContext?: () => Promise<void> | void;
    footerPad: string;
    docLink?: string;
}

function renderCardZones({
    item,
    hasMindmap,
    hasPremade,
    hasSplits,
    showExport,
    showDelete,
    showReset,
    cardType,
    menuOpen,
    setMenuOpen,
    menuButtonRef,
    handleMenuClick,
    isMobile,
    onEditMindmap,
    onDeleteMindmap,
    onExportMindmap,
    onResetMindmap,
    onChangeSplits,
    footerPad,
    docLink,
    onViewVerseContext,
    onViewSimilarityContext
}: RenderZoneProps) {
    let zone1 = { label: "TASK", color: "var(--todo-pill-task)" };
    let zone2 = { english: "", arabic: "" };
    let zone3 = "";
    let zone4Meta = "";
    const showSplitsAlert = cardType === 'surah' && hasMindmap && !hasSplits;

    // Type-specific logic
    switch (item.type) {
        case 'suspended': {
            const issue = item.data;
            const surah = getSurah(issue.surahId);
            const labelLower = (issue?.label || '').toString().toLowerCase();
            const label = labelLower.includes('error') ? 'REVIEW ERROR' : 'SUSPENDED';
            zone1 = { label, color: "var(--todo-pill-suspended)" };
            zone2 = {
                english: surah ? `${surah.id}. ${surah.name}` : `Surah ${issue.surahId}`,
                arabic: surah?.arabicName || 'الإصلاح'
            };
            zone3 = issue.label || "Review splits to fix suspended status.";
            zone4Meta = `${issue.surahId}:${issue.startVerse}`;
            break;
        }
        case 'similarity': {
            const sim = item.data;
            zone1 = { label: "SIMILARITY", color: "var(--todo-pill-similarity)" };
            zone2 = {
                english: sim.surah ? `${sim.surah.id}. ${sim.surah.name}` : "Similarity",
                arabic: sim.surah?.arabicName || 'التشابه'
            };
            zone3 = `${sim.count} similarity issues detected.`;
            zone4Meta = "Needs distinction";
            break;
        }
        case 'part': {
            const partTask = item.data;
            zone1 = { label: "PART MAP", color: "var(--todo-pill-part)" };
            if (Number(partTask.part) === 0) {
                zone2 = {
                    english: 'Part 0 Meta Mindmap',
                    arabic: 'الخريطة الشاملة'
                };
                zone3 = 'Global relationship map across Parts 1-7.';
                zone4Meta = "Always visible";
            } else {
                zone2 = {
                    english: `Part ${partTask.part}`,
                    arabic: `الجزء ${partTask.part}`
                };
                zone4Meta = "Full Part Map";
            }
            break;
        }
        case 'surah': {
            const surahTask = item.data;
            zone1 = { label: "SURAH MAP", color: "var(--todo-pill-surah)" };
            zone2 = {
                english: `${surahTask.surah.id}. ${surahTask.surah.name}`,
                arabic: surahTask.surah.arabicName || 'سورة'
            };
            zone4Meta = `${surahTask.surah.verseCount} Verses`;
            break;
        }
    }

    return (
        <>
            {/* Header: Pill + Menu */}
            <div className="flex justify-between items-start mb-2.5">
                <span
                    className="status-pill"
                    style={{
                        backgroundColor: `color-mix(in srgb, ${zone1.color}, transparent 84%)`,
                        color: zone1.color,
                        fontSize: '0.65rem',
                        padding: '0.2rem 0.6rem'
                    }}
                >
                    {zone1.label}
                </span>

                {/* Menu Trigger */}
                <div
                    className="relative z-10"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                >
                    <CardMenuTrigger
                        buttonRef={menuButtonRef}
                        onClick={handleMenuClick}
                    />
                    <CardActionMenu
                        isMobile={isMobile}
                        hasMindmap={hasMindmap}
                        cardType={cardType as any}
                        isOpen={menuOpen}
                        onClose={() => setMenuOpen(false)}
                        onEditMindmap={onEditMindmap}
                        onDeleteMindmap={onDeleteMindmap}
                        onExportMindmap={onExportMindmap}
                        onResetMindmap={onResetMindmap}
                        onChangeSplits={onChangeSplits}
                        onViewVerseContext={onViewVerseContext}
                        onViewSimilarityContext={onViewSimilarityContext}
                        docLink={docLink}
                        anchorRef={menuButtonRef}
                        showExport={showExport}
                        showDelete={showDelete}
                        showReset={showReset}
                    />
                </div>
            </div>

            {/* Title Area */}
            <div className="mb-2">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <h4 className="text-[0.95rem] font-bold text-[var(--foreground)] leading-tight mb-0.5">
                            {zone2.english}
                        </h4>
                        {showSplitsAlert && (
                            <span
                                className="inline-flex items-center shrink-0 text-amber-500 kanban-title-icon"
                                title="Splits missing"
                                aria-label="Splits missing"
                            >
                                <Scissors size={14} />
                            </span>
                        )}
                        {(cardType === 'surah' || cardType === 'part') && hasMindmap && (
                            (() => {
                                const mindmap = (item as any).data?.mindmap;
                                const isPremade = mindmap?.source === 'premade';
                                const isEdited = isPremade && mindmap?.premadeEdited;
                                const hasResetAvailable = !isPremade && !!hasPremade;
                                const iconClass = 'text-[var(--accent)] opacity-80';

                                if (hasResetAvailable) {
                                    return (
                                        <span className="inline-flex items-center shrink-0 kanban-title-icon" title="Custom map (official reset available)" aria-label="Custom map (official reset available)">
                                            <Layers size={14} className={iconClass} />
                                        </span>
                                    );
                                }
                                if (isEdited) {
                                    return (
                                        <span className="inline-flex items-center shrink-0 kanban-title-icon" title="Official map (edited)" aria-label="Official map (edited)">
                                            <PenSquare size={14} className={iconClass} />
                                        </span>
                                    );
                                }
                                if (isPremade) {
                                    return (
                                        <span className="inline-flex items-center shrink-0 kanban-title-icon" title="Official map" aria-label="Official map">
                                            <BadgeCheck size={14} className={iconClass} />
                                        </span>
                                    );
                                }
                                return (
                                    <span className="inline-flex items-center shrink-0 kanban-title-icon" title="Custom map" aria-label="Custom map">
                                        <Brain size={14} className={iconClass} />
                                    </span>
                                );
                            })()
                        )}
                    </div>
                    {zone2.arabic && (
                        <div className="text-xs font-arabic text-[var(--foreground-secondary)] opacity-80 whitespace-nowrap">
                            {zone2.arabic}
                        </div>
                    )}
                </div>
            </div>

            {/* Description */}
            {!isMobile && zone3 && (
                <p className="text-xs text-[var(--foreground-secondary)] line-clamp-2 mb-3 leading-relaxed">
                    {zone3}
                </p>
            )}
        </>
    );
}

export default KanbanCard;
