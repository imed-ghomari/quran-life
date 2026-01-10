'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import KanbanColumn from './KanbanColumn';
import SlideOver from '../SlideOver';
import { KanbanItem, KanbanColumnData } from './types';
import { DesktopAnchorBuilder, MobileAnchorBuilder, AnchorBuilderState } from './AnchorBuilders';
import MindmapViewer from '../MindmapViewer';
import { ChevronDown, Check, PenTool, Download, Info, Trash2, Brain, AlertTriangle, Layout, Calendar, BarChart2, Users, LayoutGrid, List } from 'lucide-react';
import Link from 'next/link';
import { getSurah } from '@/lib/quranData';
import { absoluteToSurahAyah } from '@/lib/mutashabihat';
import { QuranPart } from '@/lib/types';
import { MutashabihatDecision } from '@/lib/storage';

// Helper to highlight logic - copied from TodoPage usually, but simplified here
function HighlightedVerse({ text, range }: { text: string; range?: [number, number] }) {
    if (!range) return <>{text}</>;
    const words = text.trim().split(/\s+/);
    return (
        <>
            {words.map((word: string, idx: number) => {
                const wordNum = idx + 1;
                const isHighlighted = wordNum >= range[0] && wordNum <= range[1];
                return (
                    <span key={idx} className={isHighlighted ? 'mut-word-highlight' : ''}>
                        {word}{' '}
                    </span>
                );
            })}
        </>
    );
}

interface TodoKanbanProps {
    suspendedAnchors: any[];
    similarityGroups: any[];
    partTasks: any[];
    surahTasks: any[];

    // Data & State
    verses: any[];
    decisions: any;
    mindmaps: any;
    partMindmaps: any;
    isDark: boolean;

    // Callbacks
    onFixConfirm: (surahId: number, anchorId: string) => void;
    onSimilarityDecision: (absoluteAyah: number, status: MutashabihatDecision['status'], phraseId?: string, confirm?: boolean) => void;
    onPartComplete: (part: QuranPart, forceState?: boolean) => void;
    onSurahComplete: (surahId: number, mindmap?: any, forceState?: boolean) => void;
    onImportPremade: (type: 'surah' | 'part', id: number) => void;
    onEditMindmap: (id: number, snapshot?: any, isPart?: boolean) => void;
    onViewMindmap: (data: any) => void; // For preview modal

    // Achor Builder Props
    getBuilderState: (surahId: number) => AnchorBuilderState;
    onAddBreak: (surahId: number, val: number) => void;
    onRemoveBreak: (surahId: number, val: number) => void;
    onSaveAnchors: (surahId: number, verseCount: number) => void;
    hasReviewedChunks: (surahId: number) => boolean;
    // New Props for Persistence
    kanbanState?: Record<string, string[]>;
    onKanbanStateChange?: (state: Record<string, string[]>) => void;
}

export default function TodoKanban({
    suspendedAnchors,
    similarityGroups,
    partTasks,
    surahTasks,
    verses,
    decisions,
    mindmaps,
    partMindmaps,
    isDark,
    onFixConfirm,
    onSimilarityDecision,
    onPartComplete,
    onSurahComplete,
    onImportPremade,
    onEditMindmap,
    onViewMindmap,
    getBuilderState,
    onAddBreak,
    onRemoveBreak,
    onSaveAnchors,
    hasReviewedChunks,
    kanbanState,
    onKanbanStateChange
}: TodoKanbanProps) {
    const [columns, setColumns] = useState<Record<string, KanbanColumnData>>({
        'backlog': { id: 'backlog', title: 'Backlog', items: [] },
        'in-progress': { id: 'in-progress', title: 'In Progress', items: [] },
        'complete': { id: 'complete', title: 'Complete', items: [] },
    });

    const [activeItem, setActiveItem] = useState<KanbanItem | null>(null);
    const [isMobile, setIsMobile] = useState(false);
    const [filter, setFilter] = useState<'all' | 'maintenance' | 'construction'>('all');

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const filteredItem = (item: KanbanItem) => {
        if (filter === 'all') return true;
        if (filter === 'maintenance') return item.type === 'suspended' || item.type === 'similarity';
        if (filter === 'construction') return item.type === 'part' || item.type === 'surah';
        return true;
    };

    // Sync Props to Kanban State
    useEffect(() => {
        // 1. Construct map of all available items from data source
        const itemMap = new Map<string, KanbanItem>();

        // Suspended Anchors
        suspendedAnchors.forEach(item => {
            const id = `suspended-${item.surahId}-${item.anchorId}`;
            itemMap.set(id, { id, type: 'suspended', data: item, status: 'backlog' });
        });

        // Similarity Groups
        similarityGroups.forEach(group => {
            const id = `similarity-${group.surah.id}`;
            itemMap.set(id, { id, type: 'similarity', data: group, status: 'backlog' });
        });

        // Part Maps
        partTasks.forEach(item => {
            const isComplete = item.mindmap?.isComplete && (!!item.mindmap?.imageUrl || !!item.mindmap?.tldrawSnapshot);
            const id = `part-${item.part}`;
            itemMap.set(id, { id, type: 'part', data: item, status: isComplete ? 'complete' : 'backlog' });
        });

        // Surah Maps
        surahTasks.forEach(item => {
            const isComplete = item.mindmap?.isComplete && (!!item.mindmap?.imageUrl || !!item.mindmap?.tldrawSnapshot);
            const id = `surah-${item.surah.id}`;
            itemMap.set(id, { id, type: 'surah', data: item, status: isComplete ? 'complete' : 'backlog' });
        });

        // 2. Distribute items into columns based on Persistent State (kanbanState) OR default logic
        const newCols: Record<string, KanbanItem[]> = {
            'backlog': [],
            'in-progress': [],
            'complete': []
        };

        const processedIds = new Set<string>();

        // If we have saved state, try to respect it
        if (kanbanState) {
            Object.entries(kanbanState).forEach(([colId, itemIds]) => {
                if (!newCols[colId]) return; // Skip invalid columns
                itemIds.forEach(itemId => {
                    const item = itemMap.get(itemId);
                    if (item) {
                        // Special Case: If item is externally 'complete' BUT saved in a different column?
                        // We prioritize the persistent state (User knows best). 
                        // If it's in backlog but status is complete, maybe user re-opened it.
                        newCols[colId].push(item);
                        processedIds.add(itemId);
                    }
                });
            });
        }

        // 3. Handle leftover items (New items)
        Array.from(itemMap.values()).forEach(item => {
            if (processedIds.has(item.id)) return;

            // Default placement
            if (item.status === 'complete') {
                newCols['complete'].push(item);
            } else {
                newCols['backlog'].push(item);
            }
        });

        setColumns({
            'backlog': { id: 'backlog', title: 'Backlog', items: newCols['backlog'] },
            'in-progress': { id: 'in-progress', title: 'In Progress', items: newCols['in-progress'] },
            'complete': { id: 'complete', title: 'Complete', items: newCols['complete'] },
        });

    }, [suspendedAnchors, similarityGroups, partTasks, surahTasks, kanbanState]);

    const handleCompletionTrigger = useCallback((item: KanbanItem, forceState?: boolean) => {
        if (item.type === 'suspended') {
            onFixConfirm(item.data.surahId, item.data.anchorId);
        } else if (item.type === 'similarity') {
            const group = item.data;
            group.items.forEach((simItem: any) => {
                simItem.muts.forEach((entry: any) => {
                    onSimilarityDecision(simItem.err.absoluteAyah, 'solved_note', entry.phraseId, true);
                });
            });
        } else if (item.type === 'part') {
            onPartComplete(item.data.part, forceState);
        } else if (item.type === 'surah') {
            onSurahComplete(item.data.surah.id, item.data.mindmap, forceState);
        }
    }, [onFixConfirm, onSimilarityDecision, onPartComplete, onSurahComplete]);

    const onDragEnd = useCallback((result: DropResult) => {
        const { source, destination } = result;

        if (!destination) return;
        if (source.droppableId === destination.droppableId && source.index === destination.index) return;

        setColumns(prev => {
            const sourceCol = prev[source.droppableId];
            const destCol = prev[destination.droppableId];
            const sourceItems = [...sourceCol.items];
            const destItems = source.droppableId === destination.droppableId ? sourceItems : [...destCol.items];

            const [movedItem] = sourceItems.splice(source.index, 1);
            destItems.splice(destination.index, 0, movedItem);

            const newColsMap = {
                ...prev,
                [source.droppableId]: { ...sourceCol, items: sourceItems },
                [destination.droppableId]: { ...destCol, items: destItems }
            };

            // Calculate new state for persistence
            if (onKanbanStateChange) {
                const state: Record<string, string[]> = {};
                Object.values(newColsMap).forEach(col => {
                    state[col.id] = col.items.map(i => i.id);
                });
                onKanbanStateChange(state);
            }

            // Trigger Completion Logic
            if (destination.droppableId === 'complete') {
                // Moving TO Complete -> Force TRUE
                if (movedItem.type === 'surah' || movedItem.type === 'part') {
                    if (movedItem.status !== 'complete') {
                        handleCompletionTrigger(movedItem, true);
                    }
                } else if (source.droppableId !== 'complete') {
                    handleCompletionTrigger(movedItem);
                }
            }
            // Moving FROM Complete -> Force FALSE
            else if (source.droppableId === 'complete') {
                if (movedItem.type === 'surah' || movedItem.type === 'part') {
                    handleCompletionTrigger(movedItem, false);
                }
            }

            return newColsMap;
        });
    }, [onKanbanStateChange, handleCompletionTrigger]);

    const renderSlideOverContent = () => {
        if (!activeItem) return null;

        const { type, data } = activeItem;

        if (type === 'suspended') {
            const issue = data;
            const surah = getSurah(issue.surahId);
            const mindmap = mindmaps[issue.surahId];
            const chunkVerses = verses
                .filter((v: any) => v.surahId === issue.surahId && v.ayahId >= (issue.startVerse || 0) && v.ayahId <= (issue.endVerse || 0))
                .map((v: any) => v.text)
                .join(' ');

            return (
                <div className="flex flex-col gap-6">
                    <div className="bg-[var(--background-secondary)] p-4 rounded-lg">
                        <h3 className="font-bold text-lg mb-2">{surah?.name} - {issue.label}</h3>
                        <p className="text-right font-arabic text-xl leading-loose">{chunkVerses}</p>
                    </div>

                    <div className="flex gap-2">
                        <button className="btn btn-secondary flex-1" onClick={() => onEditMindmap(issue.surahId, mindmap?.tldrawSnapshot)}>
                            <PenTool size={16} className="mr-2" /> Edit Map
                        </button>
                        <button className="btn btn-primary flex-1" onClick={() => onFixConfirm(issue.surahId, issue.anchorId)}>
                            <Check size={16} className="mr-2" /> Complete
                        </button>
                    </div>

                    {/* Embed Editor if needed? No, user uses modal editor. SlideOver just shows info/actions */}
                    {/* User said "displays the same content as the folded section". Folded section has DesktopAnchorBuilder if expanded? */}
                    {/* Suspended Anchors folded section (lines 1416+) shows row with issue details. It DOES NOT show AnchorBuilder. */}
                    {/* It shows "Edit Map", "Show Map", "Complete". */}
                    {/* So my render above is correct. */}
                </div>
            );
        }

        if (type === 'similarity') {
            const group = data;
            return (
                <div className="flex flex-col gap-6">
                    <h3 className="font-bold text-lg">{group.surah.name} Similarity Checks</h3>

                    {group.items.map((item: any) => {
                        const abs = item.err.absoluteAyah!;
                        return item.muts.map((entry: any, idx: number) => {
                            const decisionKey = `${abs}-${entry.phraseId}`;
                            const existing = decisions[decisionKey] || { status: 'pending' };

                            const baseVerse = verses.find((v: any) => {
                                const r = absoluteToSurahAyah(abs);
                                return v.surahId === r.surahId && v.ayahId === r.ayahId;
                            });

                            return (
                                <div key={idx} className="border border-[var(--border)] p-4 rounded-lg">
                                    <div className="mb-4 text-right">
                                        {baseVerse && <HighlightedVerse text={baseVerse.text} range={entry.meta.sourceRange} />}
                                    </div>

                                    <div className="flex flex-col gap-2 mb-4">
                                        <p className="text-xs text-[var(--foreground-secondary)] uppercase font-bold">Confused With:</p>
                                        {entry.matches.filter((m: any) => m !== abs).map((m: any, i: number) => {
                                            const mref = absoluteToSurahAyah(m);
                                            const msurah = getSurah(mref.surahId);
                                            return (
                                                <div key={i} className="bg-[var(--background-secondary)] p-2 rounded text-sm">
                                                    {msurah?.name} {mref.ayahId}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div className="flex gap-2">
                                        <button className="btn btn-primary flex-1 text-xs" onClick={() => onSimilarityDecision(abs, 'solved_note', entry.phraseId, true)}>
                                            Confirm Distinction
                                        </button>
                                    </div>
                                </div>
                            );
                        });
                    })}
                </div>
            );
        }

        if (type === 'part' || type === 'surah') {
            // Part/Surah logic is very similar
            const isSurah = type === 'surah';
            const id = isSurah ? data.surah.id : data.part;
            const mindmap = data.mindmap;
            const hasContent = !!mindmap?.imageUrl || !!mindmap?.tldrawSnapshot;

            // Content from "folded section expanded content" (lines 2135+)
            // It holds MindmapViewer and DesktopAnchorBuilder (for Surah)
            return (
                <div className="flex flex-col gap-6">
                    <div className="flex justify-between items-center">
                        <h3 className="font-bold text-lg">{isSurah ? `Surah ${data.surah.name}` : `Part ${id}`}</h3>
                        <span className={`status-badge ${mindmap?.isComplete ? 'learned' : 'partial'}`}>
                            {mindmap?.isComplete ? 'Complete' : 'Incomplete'}
                        </span>
                    </div>

                    <div className="flex grid grid-cols-2 gap-2">
                        <button className="btn btn-secondary text-xs" onClick={() => onEditMindmap(id, mindmap?.tldrawSnapshot, !isSurah)}>
                            <PenTool size={14} className="mr-1" /> {mindmap?.tldrawSnapshot ? 'Edit Map' : 'Start Map'}
                        </button>
                        <button className="btn btn-secondary text-xs" onClick={() => onImportPremade(type, id)}>
                            <Download size={14} className="mr-1" /> Import Premade
                        </button>
                    </div>

                    {hasContent && (
                        <div className="border border-[var(--border)] rounded overflow-hidden h-[200px] relative">
                            <MindmapViewer
                                snapshot={mindmap?.tldrawSnapshot}
                                imageUrl={mindmap?.imageUrl}
                                imageUrlDark={mindmap?.imageUrlDark}
                                isDark={isDark}
                                title="Preview"
                                height="100%"
                            />
                        </div>
                    )}

                    {/* Anchor Builder for Surahs */}
                    {isSurah && (mindmap?.imageUrl || mindmap?.tldrawSnapshot) && (
                        <div className="mt-4 h-full">
                            {!isMobile ? (
                                <DesktopAnchorBuilder
                                    surahId={id}
                                    verseCount={data.surah.verseCount}
                                    builderState={getBuilderState(id)}
                                    onAddBreak={(val) => onAddBreak(id, val)}
                                    onRemoveBreak={(val) => onRemoveBreak(id, val)}
                                    onSave={() => onSaveAnchors(id, data.surah.verseCount)}
                                    hasReviewedHistory={hasReviewedChunks(id)}
                                />
                            ) : (
                                <div className="h-[500px]">
                                    <MobileAnchorBuilder
                                        surahId={id}
                                        verseCount={data.surah.verseCount}
                                        builderState={getBuilderState(id)}
                                        mindmapImageUrl={mindmap?.imageUrl || null} // Basic preview support
                                        onAddBreak={(val) => onAddBreak(id, val)}
                                        onRemoveBreak={(val) => onRemoveBreak(id, val)}
                                        onSave={() => onSaveAnchors(id, data.surah.verseCount)}
                                        hasReviewedHistory={hasReviewedChunks(id)}
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            );
        }
    };

    return (
        <div className="flex h-screen w-full flex-col bg-[var(--background)] text-[var(--foreground)] overflow-hidden">
            {/* Header Area */}
            <div className="flex items-center justify-between px-8 pt-8 shrink-0">
                {/* Title (Left) */}
                <h1 className="text-2xl font-bold tracking-tight">Todo</h1>

                {/* Filters (Right - Navigation Grade Style) */}
                <div className="flex items-center gap-1 bg-white/[0.03] rounded-xl p-1 border border-white/5 shadow-inner">
                    {[
                        { id: 'all', label: 'All Items' },
                        { id: 'maintenance', label: 'Review Fixes' },
                        { id: 'construction', label: 'Study Progress' }
                    ].map((f) => (
                        <button
                            key={f.id}
                            onClick={() => setFilter(f.id as any)}
                            className={`
                                px-5 py-2 rounded-lg text-xs font-semibold transition-all duration-200
                                ${filter === f.id
                                    ? 'bg-white/10 text-white shadow-sm'
                                    : 'bg-transparent text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-white/[0.05]'}
                            `}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* CRITICAL GAP 1: mt-12 (48px) Margin between Filter Bar and Kanban Board */}
            <div className="mt-12" />

            <DragDropContext onDragEnd={onDragEnd}>
                <div className={`flex gap-8 px-8 pb-8 h-full overflow-x-auto ${isMobile ? 'flex-col overflow-y-auto' : 'flex-row'}`}>
                    {Object.values(columns).map(col => (
                        <KanbanColumn
                            key={col.id}
                            id={col.id}
                            title={col.title}
                            items={col.items.filter(filteredItem)}
                            isMobile={isMobile}
                            onCardClick={(item) => setActiveItem(item)}
                        />
                    ))}
                </div>
            </DragDropContext>


            <SlideOver
                isOpen={!!activeItem}
                onClose={() => setActiveItem(null)}
                title={activeItem ? (activeItem.type === 'surah' ? activeItem.data.surah.name : activeItem.type === 'part' ? `Part ${activeItem.data.part}` : 'Detail') : ''}
            >
                {renderSlideOverContent()}
            </SlideOver>
        </div>
    );
}
