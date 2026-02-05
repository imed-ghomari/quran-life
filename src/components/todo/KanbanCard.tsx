'use client';

import React, { useState, useRef } from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { KanbanItem } from './types';
import { Brain, BadgeCheck, PenSquare, Layers } from 'lucide-react';
import { getSurah } from '@/lib/quranData';
import CardActionMenu, { CardMenuTrigger } from './CardActionMenu';

interface KanbanCardProps {
    item: KanbanItem;
    index: number;
    isMobile: boolean;
    hasMindmap: boolean;
    hasPremade?: boolean;
    appMode: 'owner' | 'user';
    docLink?: string;
    onEditMindmap: () => void;
    onImportMindmap: () => void;
    onDeleteMindmap: () => void;
    onExportMindmap?: () => void;
    onResetMindmap?: () => void;
    onChangeSplits: () => void;
    onCardAction?: (action: 'fix' | 'resolve', item: KanbanItem) => void; // Generic action handler fallback
}

const KanbanCard = ({
    item,
    index,
    isMobile,
    hasMindmap,
    hasPremade,
    appMode,
    docLink,
    onEditMindmap,
    onImportMindmap,
    onDeleteMindmap,
    onExportMindmap,
    onResetMindmap,
    onChangeSplits,
    onCardAction
}: KanbanCardProps) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const menuButtonRef = useRef<HTMLButtonElement>(null);

    const handleMenuClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setMenuOpen(prev => !prev);
    };

    const handleDeleteClick = async () => {
        setMenuOpen(false);

        if (window.confirm("Are you sure you want to delete this mindmap? This action cannot be undone and you will lose all progress on this map.")) {
            setIsDeleting(true);
            try {
                // Simulate network delay for better UX if needed, or just await the prop
                await new Promise(resolve => setTimeout(resolve, 500));
                await onDeleteMindmap();
            } catch (e) {
                console.error("Delete failed", e);
            } finally {
                // Only reset if component is still mounted (React handles this mostly, but good practice)
                setIsDeleting(false);
            }
        }
    };

    const handleResetClick = async () => {
        setMenuOpen(false);

        if (window.confirm("Reset this mindmap to the original shared version? Your edits will be replaced.")) {
            setIsDeleting(true);
            try {
                await new Promise(resolve => setTimeout(resolve, 500));
                await onResetMindmap?.();
            } catch (e) {
                console.error("Reset failed", e);
            } finally {
                setIsDeleting(false);
            }
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
                            roadmap-card group relative cursor-pointer !rounded-[14px]
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
                            onImportMindmap,
                            onDeleteMindmap: handleDeleteClick,
                            onExportMindmap,
                            onResetMindmap: handleResetClick,
                            onChangeSplits,
                            onCardAction,
                            footerPad: 'pt-3',
                            docLink
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
    showExport: boolean;
    showDelete: boolean;
    showReset: boolean;
    cardType: string;
    menuOpen: boolean;
    setMenuOpen: (open: boolean) => void;
    menuButtonRef: React.RefObject<HTMLButtonElement | null>;
    handleMenuClick: (e: React.MouseEvent) => void;
    isMobile: boolean;
    onEditMindmap: () => void;
    onImportMindmap: () => void;
    onDeleteMindmap: () => void;
    onExportMindmap?: () => void;
    onResetMindmap?: () => void;
    onChangeSplits: () => void;
    onCardAction?: (action: 'fix' | 'resolve', item: KanbanItem) => void;
    footerPad: string;
    docLink?: string;
}

function renderCardZones({
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
    onImportMindmap,
    onDeleteMindmap,
    onExportMindmap,
    onResetMindmap,
    onChangeSplits,
    onCardAction,
    footerPad,
    docLink
}: RenderZoneProps) {
    let zone1 = { label: "TASK", color: "var(--accent)" };
    let zone2 = { english: "", arabic: "" };
    let zone3 = "";
    let zone4Meta = "";

    // Type-specific logic
    switch (item.type) {
        case 'suspended': {
            const issue = item.data;
            const surah = getSurah(issue.surahId);
            zone1 = { label: "FIX REQUIRED", color: "var(--danger)" };
            zone2 = {
                english: surah ? `${surah.id}. ${surah.name}` : `Surah ${issue.surahId}`,
                arabic: surah?.arabicName || 'الإصلاح'
            };
            zone3 = issue.label || "Review anchors to fix suspended status.";
            zone4Meta = `${issue.surahId}:${issue.startVerse}`;
            break;
        }
        case 'similarity': {
            const sim = item.data;
            zone1 = { label: "SIMILARITY", color: "var(--warning)" };
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
            zone1 = { label: "PART MAP", color: "var(--accent)" };
            zone2 = {
                english: `Part ${partTask.part}`,
                arabic: `الجزء ${partTask.part}`
            };
            zone4Meta = "Full Part Map";
            break;
        }
        case 'surah': {
            const surahTask = item.data;
            zone1 = { label: "SURAH MAP", color: "var(--success)" };
            zone2 = {
                english: `${surahTask.surah.id}. ${surahTask.surah.name}`,
                arabic: surahTask.surah.arabicName || 'سورة'
            };
            zone4Meta = `${surahTask.surah.verseCount} Verses`;
            break;
        }
    }

    // Handlers for specific card types
    const handleFixIssue = () => onCardAction?.('fix', item);
    const handleResolve = () => onCardAction?.('resolve', item);

    return (
        <>
            {/* Header: Pill + Menu */}
            <div className="flex justify-between items-start mb-2.5">
                <span
                    className="status-pill"
                    style={{
                        backgroundColor: `color-mix(in srgb, ${zone1.color}, transparent 90%)`,
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
                        onImportMindmap={onImportMindmap}
                        onDeleteMindmap={onDeleteMindmap}
                        onExportMindmap={onExportMindmap}
                        onResetMindmap={onResetMindmap}
                        onChangeSplits={onChangeSplits}
                        onFixIssue={handleFixIssue}
                        onResolveSimilarity={handleResolve}
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
                    {(cardType === 'surah' || cardType === 'part') && hasMindmap && (
                        (() => {
                            const mindmap = (item as any).data?.mindmap;
                            const isPremade = mindmap?.source === 'premade';
                            const isEdited = isPremade && mindmap?.premadeEdited;
                            const hasResetAvailable = !isPremade && !!hasPremade;
                            const iconClass = 'text-[var(--accent)] opacity-80';

                            if (hasResetAvailable) {
                                return (
                                    <span title="Custom map (official reset available)" aria-label="Custom map (official reset available)">
                                        <Layers size={14} className={iconClass} />
                                    </span>
                                );
                            }
                            if (isEdited) {
                                return (
                                    <span title="Official map (edited)" aria-label="Official map (edited)">
                                        <PenSquare size={14} className={iconClass} />
                                    </span>
                                );
                            }
                            if (isPremade) {
                                return (
                                    <span title="Official map" aria-label="Official map">
                                        <BadgeCheck size={14} className={iconClass} />
                                    </span>
                                );
                            }
                            return (
                                <span title="Custom map" aria-label="Custom map">
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
            {zone3 && (
                <p className="text-xs text-[var(--foreground-secondary)] line-clamp-2 mb-3 leading-relaxed">
                    {zone3}
                </p>
            )}
        </>
    );
}

export default KanbanCard;
