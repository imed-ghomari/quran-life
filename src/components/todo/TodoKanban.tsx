'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import KanbanColumn from './KanbanColumn';
import SlideOver from '../SlideOver';
import { KanbanItem, KanbanColumnData } from './types';
import { DesktopAnchorBuilder, MobileAnchorBuilder, AnchorBuilderState } from './AnchorBuilders';
import MindmapViewer from '../MindmapViewer';
import { ChevronDown, Check, PenTool, Download, Info, Trash2, Brain, AlertTriangle } from 'lucide-react';
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
    onPartComplete: (part: QuranPart) => void;
    onSurahComplete: (surahId: number, mindmap?: any) => void;
    onImportPremade: (type: 'surah' | 'part', id: number) => void;
    onEditMindmap: (id: number, snapshot?: any, isPart?: boolean) => void;
    onViewMindmap: (data: any) => void; // For preview modal

    // Achor Builder Props
    getBuilderState: (surahId: number) => AnchorBuilderState;
    onAddBreak: (surahId: number, val: number) => void;
    onRemoveBreak: (surahId: number, val: number) => void;
    onSaveAnchors: (surahId: number, verseCount: number) => void;
    hasReviewedChunks: (surahId: number) => boolean;
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
    hasReviewedChunks
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
        // Construct all items
        const newItems: KanbanItem[] = [];

        // 1. Suspended Anchors
        suspendedAnchors.forEach(item => {
            newItems.push({
                id: `suspended-${item.surahId}-${item.anchorId}`,
                type: 'suspended',
                data: item,
                status: 'backlog'
            });
        });

        // 2. Similarity Groups
        similarityGroups.forEach(group => {
            newItems.push({
                id: `similarity-${group.surah.id}`,
                type: 'similarity',
                data: group,
                status: 'backlog'
            });
        });

        // 3. Part Maps
        partTasks.forEach(item => {
            const isComplete = item.mindmap?.isComplete && (!!item.mindmap?.imageUrl || !!item.mindmap?.tldrawSnapshot);
            newItems.push({
                id: `part-${item.part}`,
                type: 'part',
                data: item,
                status: isComplete ? 'complete' : 'backlog'
            });
        });

        // 4. Surah Maps
        surahTasks.forEach(item => {
            const isComplete = item.mindmap?.isComplete && (!!item.mindmap?.imageUrl || !!item.mindmap?.tldrawSnapshot);
            newItems.push({
                id: `surah-${item.surah.id}`,
                type: 'surah',
                data: item,
                status: isComplete ? 'complete' : 'backlog'
            });
        });

        // Merge with existing state to preserve 'in-progress' or manual ordering?
        // For simplicity and correctness with "triggered logic", we rebuild columns derived from status
        // BUT we need to respect if user moved something to 'in-progress'.
        // We'll map IDs to their current column in `columns` state.

        setColumns(prev => {
            const idToCol = new Map<string, string>();
            Object.values(prev).forEach(col => {
                col.items.forEach(i => idToCol.set(i.id, col.id));
            });

            const backlogItems: KanbanItem[] = [];
            const wipItems: KanbanItem[] = [];
            const completeItems: KanbanItem[] = [];

            newItems.forEach(item => {
                // Determine column
                let targetCol = idToCol.get(item.id);

                // If item is naturally complete (mindmaps), force complete
                if (item.status === 'complete') targetCol = 'complete';

                // If no record, use default (backlog or complete)
                if (!targetCol) targetCol = item.status;

                if (targetCol === 'complete') completeItems.push(item);
                else if (targetCol === 'in-progress') wipItems.push(item);
                else backlogItems.push(item); // Default to backlog
            });

            // Maintain Sort Order in Backlog if it's a fresh init? 
            // The user wants specific order: suspended, similar, part, surah.
            // newItems is already pushed in that order. 
            // So iterating newItems preserves that order.

            return {
                'backlog': { ...prev['backlog'], items: backlogItems },
                'in-progress': { ...prev['in-progress'], items: wipItems },
                'complete': { ...prev['complete'], items: completeItems },
            };
        });

    }, [suspendedAnchors, similarityGroups, partTasks, surahTasks]);

    const onDragEnd = useCallback((result: DropResult) => {
        const { source, destination, draggableId } = result;

        if (!destination) return;
        if (source.droppableId === destination.droppableId && source.index === destination.index) return;

        setColumns(prev => {
            const sourceCol = prev[source.droppableId];
            const destCol = prev[destination.droppableId];
            const sourceItems = [...sourceCol.items];
            const destItems = source.droppableId === destination.droppableId ? sourceItems : [...destCol.items];

            const [movedItem] = sourceItems.splice(source.index, 1);
            destItems.splice(destination.index, 0, movedItem);

            const newCols = {
                ...prev,
                [source.droppableId]: { ...sourceCol, items: sourceItems },
                [destination.droppableId]: { ...destCol, items: destItems }
            };

            // Trigger Completion Logic
            if (destination.droppableId === 'complete' && source.droppableId !== 'complete') {
                handleCompletionTrigger(movedItem);
            }

            return newCols;
        });
    }, []);

    const handleCompletionTrigger = (item: KanbanItem) => {
        if (item.type === 'suspended') {
            onFixConfirm(item.data.surahId, item.data.anchorId);
        } else if (item.type === 'similarity') {
            // Confirm all pending comparisons in this group
            const group = item.data;
            group.items.forEach((simItem: any) => {
                simItem.muts.forEach((entry: any) => {
                    // Only if pending?
                    onSimilarityDecision(simItem.err.absoluteAyah, 'solved_note', entry.phraseId, true);
                });
            });
        } else if (item.type === 'part') {
            onPartComplete(item.data.part);
        } else if (item.type === 'surah') {
            onSurahComplete(item.data.surah.id, item.data.mindmap);
        }
    };

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
        <div className="h-full flex flex-col">
            {/* Filter Bar */}
            <div className="flex gap-2 mb-4 px-1 overflow-x-auto">
                <button
                    onClick={() => setFilter('all')}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${filter === 'all' ? 'bg-[var(--foreground)] text-[var(--background)]' : 'bg-[var(--background-secondary)] text-[var(--foreground-secondary)] hover:bg-[var(--border)]'}`}
                >
                    All Items
                </button>
                <button
                    onClick={() => setFilter('maintenance')}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${filter === 'maintenance' ? 'bg-red-500 text-white' : 'bg-[var(--background-secondary)] text-[var(--foreground-secondary)] hover:bg-[var(--border)]'}`}
                >
                    Review Fixes
                </button>
                <button
                    onClick={() => setFilter('construction')}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${filter === 'construction' ? 'bg-blue-500 text-white' : 'bg-[var(--background-secondary)] text-[var(--foreground-secondary)] hover:bg-[var(--border)]'}`}
                >
                    Study Progress
                </button>
            </div>

            <DragDropContext onDragEnd={onDragEnd}>
                <div className={`flex h-full gap-4 ${isMobile ? 'flex-col overflow-y-auto pb-20' : 'overflow-x-auto flex-row'}`}>
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
