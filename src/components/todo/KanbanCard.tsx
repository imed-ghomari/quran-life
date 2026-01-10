'use client';

import React, { useState, useRef } from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { KanbanItem } from './types';
import { Brain } from 'lucide-react';
import { getSurah } from '@/lib/quranData';
import CardActionMenu, { CardMenuTrigger } from './CardActionMenu';

interface KanbanCardProps {
    item: KanbanItem;
    index: number;
    isMobile: boolean;
    hasMindmap: boolean;
    docLink?: string;
    onEditMindmap: () => void;
    onImportMindmap: () => void;
    onDeleteMindmap: () => void;
    onChangeSplits: () => void;
    onCardAction?: (action: 'fix' | 'resolve', item: KanbanItem) => void; // Generic action handler fallback
}

const KanbanCard = ({
    item,
    index,
    isMobile,
    hasMindmap,
    docLink,
    onEditMindmap,
    onImportMindmap,
    onDeleteMindmap,
    onChangeSplits,
    onCardAction
}: KanbanCardProps) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuButtonRef = useRef<HTMLButtonElement>(null);

    const handleMenuClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setMenuOpen(prev => !prev);
    };

    // Responsive Spacing Config - Tighter for Mobile
    const padding = isMobile ? '!p-3.5' : '!p-6';
    const borderRadius = isMobile ? '!rounded-[14px]' : '!rounded-2xl';
    const verticalGap = isMobile ? 'space-y-1.5' : 'space-y-3';
    const minWidth = isMobile ? 'min-w-[260px]' : '';
    const footerPad = isMobile ? 'pt-2.5' : 'pt-5';

    // Determine card type for menu
    const cardType = item.type; // 'surah' | 'part' | 'suspended' | 'similarity'

    return (
        <Draggable draggableId={item.id} index={index}>
            {(provided, snapshot) => (
                <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    className={`
                        card group relative cursor-pointer transition-all duration-200 ease-out ${padding}
                        ${borderRadius} !mb-0 border border-[var(--border)] bg-[var(--background-secondary)]
                        dark:shadow-lg dark:shadow-black/20
                        hover:border-[var(--accent)] hover:shadow-xl hover:shadow-black/5
                        ${minWidth} ${isMobile ? 'flex-shrink-0' : ''}
                        ${snapshot.isDragging ? 'z-50 shadow-2xl scale-[1.02] bg-[var(--background-secondary)] !border-[var(--accent)]' : ''}
                        ${item.status === 'in-progress' ? 'border-l-2 !border-l-[var(--accent)]' : ''}
                        ${item.status === 'complete' ? 'opacity-80' : ''}
                    `}
                    style={{
                        ...provided.draggableProps.style,
                    }}
                >
                    <div className={`flex flex-col ${verticalGap}`}>
                        {renderCardZones({
                            item,
                            hasMindmap,
                            cardType,
                            menuOpen,
                            setMenuOpen,
                            menuButtonRef,
                            handleMenuClick,
                            isMobile,
                            onEditMindmap,
                            onImportMindmap,
                            onDeleteMindmap,
                            onChangeSplits,
                            onCardAction,
                            footerPad,
                            docLink
                        })}
                    </div>
                </div>
            )}
        </Draggable>
    );
};

interface RenderZoneProps {
    item: KanbanItem;
    hasMindmap: boolean;
    cardType: string;
    menuOpen: boolean;
    setMenuOpen: (open: boolean) => void;
    menuButtonRef: React.RefObject<HTMLButtonElement | null>;
    handleMenuClick: (e: React.MouseEvent) => void;
    isMobile: boolean;
    onEditMindmap: () => void;
    onImportMindmap: () => void;
    onDeleteMindmap: () => void;
    onChangeSplits: () => void;
    onCardAction?: (action: 'fix' | 'resolve', item: KanbanItem) => void;
    footerPad: string;
    docLink?: string;
}

function renderCardZones({
    item,
    hasMindmap,
    cardType,
    menuOpen,
    setMenuOpen,
    menuButtonRef,
    handleMenuClick,
    isMobile,
    onEditMindmap,
    onImportMindmap,
    onDeleteMindmap,
    onChangeSplits,
    onCardAction,
    footerPad,
    docLink
}: RenderZoneProps) {
    let zone1 = { label: "TASK", color: "bg-blue-400" };
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
                english: surah?.name || `Surah ${issue.surahId}`,
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
                english: sim.surah?.name || "Similarity",
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
                english: surahTask.surah.name,
                arabic: surahTask.surah.arabicName || 'سورة'
            };
            zone4Meta = `${surahTask.surah.verseCount} Verses`;
            break;
        }
    }

    // Adjust font sizes for mobile density
    const titleSize = isMobile ? 'text-[15px]' : 'text-lg'; // Smaller title on mobile
    const descSize = isMobile ? 'text-[11px]' : 'text-sm';
    const arabicSize = isMobile ? 'text-[13px]' : 'text-[17px]';
    const metaSize = isMobile ? 'text-[10px]' : 'text-[11px]';

    // Handlers for specific card types
    const handleFixIssue = () => onCardAction?.('fix', item);
    const handleResolve = () => onCardAction?.('resolve', item);

    return (
        <>
            {/* EYEBROW */}
            <div className="flex">
                <span
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-[0.1em] opacity-60"
                    style={{
                        backgroundColor: `color-mix(in srgb, ${zone1.color}, transparent 92%)`,
                        color: zone1.color
                    }}
                >
                    {zone1.label}
                </span>
            </div>

            {/* TITLE AREA */}
            <div className={`flex items-center justify-between gap-3 ${isMobile ? '-mt-0.5' : ''}`}>
                <div className="flex items-center gap-2">
                    <h4 className={`${titleSize} font-bold text-[var(--foreground)] tracking-tight`}>
                        {zone2.english}
                    </h4>
                    {/* Brain icon logic: show only if mindmap exists AND is relevant type */}
                    {(cardType === 'surah' || cardType === 'part') && hasMindmap && (
                        <Brain size={isMobile ? 12 : 16} className="text-[var(--accent)] opacity-70" />
                    )}
                </div>
                <span className={`${arabicSize} font-arabic text-[var(--foreground)] opacity-80`}>
                    {zone2.arabic}
                </span>
            </div>

            {/* DESCRIPTION */}
            <div className={isMobile ? 'py-0.5' : 'py-2'}>
                <p className={`${descSize} text-[var(--foreground-secondary)] leading-relaxed line-clamp-2`}>
                    {zone3}
                </p>
            </div>

            {/* FOOTER */}
            <div className={`border-t border-[var(--border)] ${footerPad} flex items-center justify-between`}>
                <div className={`${metaSize} font-medium text-[var(--foreground-secondary)] opacity-80`}>
                    {zone4Meta}
                </div>

                {/* Menu Trigger Available for ALL Cards Now */}
                <div className="relative" onClick={(e) => e.stopPropagation()}>
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
                        onChangeSplits={onChangeSplits}
                        onFixIssue={handleFixIssue}
                        onResolveSimilarity={handleResolve}
                        docLink={docLink}
                        anchorRef={menuButtonRef}
                    />
                </div>
            </div>
        </>
    );
}

export default KanbanCard;
