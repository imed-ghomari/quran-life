'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DragDropContext, DropResult, useMouseSensor, useKeyboardSensor } from '@hello-pangea/dnd';
import { useCustomTouchSensor } from '@/lib/dnd/useCustomTouchSensor';
import KanbanColumn from './KanbanColumn';
import SlideOver from '../SlideOver';
import '../LandingPage/RoadmapSection.css'; // Import shared styles
import { KanbanItem, KanbanColumnData } from './types';
import { DesktopAnchorBuilder, MobileAnchorBuilder, AnchorBuilderState } from './AnchorBuilders';
import MindmapViewer from '../MindmapViewer';
import SplitsModal from './SplitsModal';
import { Check, PenTool, Download, Search } from 'lucide-react';
import { getSurah, SURAHS } from '@/lib/quranData';
import { absoluteToSurahAyah } from '@/lib/mutashabihat';
import { QuranPart } from '@/lib/types';
import { MutashabihatDecision } from '@/lib/storage';

// Helper to highlight logic
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
    onViewMindmap: (data: any) => void;
    onDeleteMindmap?: (type: 'surah' | 'part', id: number) => void;

    // Anchor Builder Props
    getBuilderState: (surahId: number) => AnchorBuilderState;
    onAddBreak: (surahId: number, val: number) => void;
    onRemoveBreak: (surahId: number, val: number) => void;
    onSaveAnchors: (surahId: number, verseCount: number) => void;
    hasReviewedChunks: (surahId: number) => boolean;

    // Persistence
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
    onDeleteMindmap,
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
    const [isTablet, setIsTablet] = useState(false);
    // const [isDragging, setIsDragging] = useState(false); // Removed to avoid re-renders
    const [filter, setFilter] = useState<'all' | 'maintenance' | 'construction'>('all');
    const [searchQuery, setSearchQuery] = useState('');

    // Refs for stable access in callbacks
    const isMobileRef = useRef(false);
    const isTabletRef = useRef(false);

    // Splits Modal State
    const [splitsModalItem, setSplitsModalItem] = useState<KanbanItem | null>(null);

    // Auto-scroll refs
    const containerRef = useRef<HTMLDivElement>(null);
    // Removed custom scroll refs as per request

    useEffect(() => {
        const checkResponsive = () => {
            const width = window.innerWidth;
            const mobile = width < 768;
            const tablet = width >= 768 && width < 1100;
            setIsMobile(mobile);
            setIsTablet(tablet);
            isMobileRef.current = mobile;
            isTabletRef.current = tablet;
        };
        checkResponsive();
        window.addEventListener('resize', checkResponsive);
        return () => window.removeEventListener('resize', checkResponsive);
    }, []);

    const getItemSearchText = (item: KanbanItem) => {
        if (item.type === 'surah') return `${item.data.surah.id} ${item.data.surah.name} ${item.data.surah.arabicName || ''}`;
        if (item.type === 'part') return `Part ${item.data.part} الجزء ${item.data.part}`;
        if (item.type === 'suspended') {
            const surah = getSurah(item.data.surahId);
            return `${surah?.name || ''} ${surah?.arabicName || ''} ${item.data.label}`;
        }
        if (item.type === 'similarity') {
            return `${item.data.surah.name} ${item.data.surah.arabicName || ''} Similarity`;
        }
        return '';
    };

    const filteredItem = (item: KanbanItem) => {
        let matchesFilter = true;
        if (filter === 'maintenance') matchesFilter = item.type === 'suspended' || item.type === 'similarity';
        if (filter === 'construction') matchesFilter = item.type === 'part' || item.type === 'surah';
        
        if (!matchesFilter) return false;

        if (searchQuery.trim()) {
            const searchText = getItemSearchText(item).toLowerCase();
            return searchText.includes(searchQuery.toLowerCase());
        }

        return true;
    };

    // Sync Props to Kanban State
    useEffect(() => {
        const itemMap = new Map<string, KanbanItem>();

        suspendedAnchors.forEach(item => {
            const id = `suspended-${item.surahId}-${item.anchorId}`;
            itemMap.set(id, { id, type: 'suspended', data: item, status: 'backlog' });
        });

        similarityGroups.forEach(group => {
            const id = `similarity-${group.surah.id}`;
            itemMap.set(id, { id, type: 'similarity', data: group, status: 'backlog' });
        });

        partTasks.forEach(item => {
            const isComplete = item.mindmap?.isComplete && (!!item.mindmap?.imageUrl || !!item.mindmap?.tldrawSnapshot);
            const id = `part-${item.part}`;
            itemMap.set(id, { id, type: 'part', data: item, status: isComplete ? 'complete' : 'backlog' });
        });

        surahTasks.forEach(item => {
            const isComplete = item.mindmap?.isComplete && (!!item.mindmap?.imageUrl || !!item.mindmap?.tldrawSnapshot);
            const id = `surah-${item.surah.id}`;
            itemMap.set(id, { id, type: 'surah', data: item, status: isComplete ? 'complete' : 'backlog' });
        });

        const newCols: Record<string, KanbanItem[]> = {
            'backlog': [],
            'in-progress': [],
            'complete': []
        };

        const processedIds = new Set<string>();

        if (kanbanState) {
            Object.entries(kanbanState).forEach(([colId, itemIds]) => {
                if (!newCols[colId]) return;
                itemIds.forEach(itemId => {
                    const item = itemMap.get(itemId);
                    if (item) {
                        newCols[colId].push(item);
                        processedIds.add(itemId);
                    }
                });
            });
        }

        Array.from(itemMap.values()).forEach(item => {
            if (processedIds.has(item.id)) return;
            if (item.status === 'complete') {
                newCols['complete'].push(item);
            } else {
                newCols['backlog'].push(item);
            }
        });

        // Auto-sort logic
        const sortItems = (items: KanbanItem[]) => {
            return items.sort((a, b) => {
                // 1. Sort by Type Priority (Suspended > Similarity > Part > Surah)
                const typePriority: Record<string, number> = {
                    'suspended': 0,
                    'similarity': 1,
                    'part': 2,
                    'surah': 3
                };
                const pA = typePriority[a.type] ?? 99;
                const pB = typePriority[b.type] ?? 99;
                if (pA !== pB) return pA - pB;

                // 2. Sort by ID Number (Surah ID or Part Number)
                const getNumber = (item: KanbanItem) => {
                    if (item.type === 'surah') return item.data.surah.id;
                    if (item.type === 'part') return item.data.part;
                    if (item.type === 'suspended') return item.data.surahId;
                    if (item.type === 'similarity') return item.data.surah.id;
                    return 999;
                };
                return getNumber(a) - getNumber(b);
            });
        };

        setColumns({
            'backlog': { id: 'backlog', title: 'Backlog', items: sortItems(newCols['backlog']) },
            'in-progress': { id: 'in-progress', title: 'In Progress', items: sortItems(newCols['in-progress']) },
            'complete': { id: 'complete', title: 'Complete', items: sortItems(newCols['complete']) },
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

    const onDragStart = useCallback(() => {
        // Manually toggle classes to avoid re-render
        if (containerRef.current) {
            containerRef.current.classList.remove('snap-x', 'snap-mandatory');
        }
    }, []);

    const onDragEnd = useCallback((result: DropResult) => {
        // Manually toggle classes back
        if (containerRef.current) {
            containerRef.current.classList.add('snap-x', 'snap-mandatory');
            
            // Snap to the nearest column after drop
            const { destination } = result;
            if (destination && (isMobileRef.current || isTabletRef.current)) {
                 const destCol = document.getElementById(destination.droppableId);
                 if (destCol) {
                     destCol.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                 }
            }
        }

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

            if (onKanbanStateChange) {
                const state: Record<string, string[]> = {};
                Object.values(newColsMap).forEach(col => {
                    state[col.id] = col.items.map(i => i.id);
                });
                // Wrap in timeout to prevent "Cannot update a component while rendering a different component"
                setTimeout(() => {
                    onKanbanStateChange(state);
                }, 0);
            }

            if (destination.droppableId === 'complete') {
                if (movedItem.type === 'surah' || movedItem.type === 'part') {
                    if (movedItem.status !== 'complete') {
                        handleCompletionTrigger(movedItem, true);
                    }
                } else if (source.droppableId !== 'complete') {
                    handleCompletionTrigger(movedItem);
                }
            } else if (source.droppableId === 'complete') {
                if (movedItem.type === 'surah' || movedItem.type === 'part') {
                    handleCompletionTrigger(movedItem, false);
                }
            }

            return newColsMap;
        });
    }, [onKanbanStateChange, handleCompletionTrigger]);

    // Card Action Handlers
    const handleCardEditMindmap = useCallback((item: KanbanItem) => {
        if (item.type === 'surah') {
            onEditMindmap(item.data.surah.id, item.data.mindmap?.tldrawSnapshot, false);
        } else if (item.type === 'part') {
            onEditMindmap(item.data.part, item.data.mindmap?.tldrawSnapshot, true);
        }
    }, [onEditMindmap]);

    const handleCardImportMindmap = useCallback((item: KanbanItem) => {
        if (item.type === 'surah') {
            onImportPremade('surah', item.data.surah.id);
        } else if (item.type === 'part') {
            onImportPremade('part', item.data.part);
        }
    }, [onImportPremade]);

    const handleCardDeleteMindmap = useCallback((item: KanbanItem) => {
        if (onDeleteMindmap) {
            if (item.type === 'surah') {
                onDeleteMindmap('surah', item.data.surah.id);
            } else if (item.type === 'part') {
                onDeleteMindmap('part', item.data.part);
            }
        }
    }, [onDeleteMindmap]);

    const handleCardChangeSplits = useCallback((item: KanbanItem) => {
        if (item.type === 'surah') {
            setSplitsModalItem(item);
        }
    }, []);

    const getHasMindmap = useCallback((item: KanbanItem): boolean => {
        if (item.type === 'surah' || item.type === 'part') {
            const mindmap = item.data.mindmap;
            return !!(mindmap?.tldrawSnapshot || mindmap?.imageUrl);
        }
        return false;
    }, []);

    const getDocLink = useCallback((item: KanbanItem): string | undefined => {
        if (item.type === 'surah') {
            return `/docs/mindmaps/surah-${item.data.surah.id}`;
        } else if (item.type === 'part') {
            return `/docs/mindmaps/part-${item.data.part}`;
        }
        return undefined;
    }, []);

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
                        <h3 className="font-bold text-lg mb-2">{surah ? `${surah.id}. ${surah.name}` : `Surah ${issue.surahId}`} - {issue.label}</h3>
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
                </div>
            );
        }

        if (type === 'similarity') {
            const group = data;
            return (
                <div className="flex flex-col gap-6">
                    <h3 className="font-bold text-lg">{group.surah.id}. {group.surah.name} Similarity Checks</h3>

                    {group.items.map((item: any) => {
                        const abs = item.err.absoluteAyah!;
                        return item.muts.map((entry: any, idx: number) => {
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
                                                    {msurah?.id}. {msurah?.name} {mref.ayahId}
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
            const isSurah = type === 'surah';
            const id = isSurah ? data.surah.id : data.part;
            const mindmap = data.mindmap;
            const hasContent = !!mindmap?.imageUrl || !!mindmap?.tldrawSnapshot;

            return (
                <div className="flex flex-col gap-6">
                    <div className="flex justify-between items-center">
                        <h3 className="font-bold text-lg">{isSurah ? `Surah ${data.surah.id}. ${data.surah.name}` : `Part ${id}`}</h3>
                        <span className={`status-badge ${mindmap?.isComplete ? 'learned' : 'partial'}`}>
                            {mindmap?.isComplete ? 'Complete' : 'Incomplete'}
                        </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
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
                                        mindmapImageUrl={mindmap?.imageUrl || null}
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

    // Search shortcut
    const searchInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                searchInputRef.current?.focus();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Get surah data for splits modal
    const getSplitsModalData = () => {
        if (!splitsModalItem || splitsModalItem.type !== 'surah') return null;
        const surahId = splitsModalItem.data.surah.id;
        const surahMeta = SURAHS.find(s => s.id === surahId);
        const mindmap = splitsModalItem.data.mindmap;
        return {
            surahId,
            verseCount: surahMeta?.verseCount || 1,
            mindmapImageUrl: mindmap?.imageUrl || null,
            mindmapImageUrlDark: mindmap?.imageUrlDark || null,
            snapshot: mindmap?.tldrawSnapshot || null
        };
    };

    const splitsData = getSplitsModalData();

    return (
        <div className="flex h-full w-full flex-col bg-[var(--background)] text-[var(--foreground)] overflow-hidden">
            {/* Header Area - Compact on mobile */}
            <div className={`
                flex items-center justify-between shrink-0 bg-[var(--background)] gap-3
                ${isMobile ? 'flex-col items-stretch px-4 pt-4 pb-2' : 'px-8 pt-8 pb-4'}
            `}>
                {/* Title (Left) - Hidden on mobile */}
                {!isMobile && (
                    <h1 className="text-2xl font-bold tracking-tight">Todo</h1>
                )}

                {/* Right Side: Search + Filters */}
                <div className={`${isMobile ? 'flex flex-col gap-2 w-full' : 'flex items-center gap-3'}`}>
                    {/* Search Bar */}
                    <div 
                        className={`relative flex items-center ${isMobile ? 'w-full h-9' : 'min-w-[200px] h-auto'} rounded-md border border-[var(--border)] bg-[var(--background-secondary)] md:bg-[rgba(0,0,0,0.05)] md:dark:bg-[rgba(255,255,255,0.05)] px-2 focus-within:border-[var(--accent)] transition-colors`}
                    >
                        <Search className="text-[var(--foreground-secondary)] opacity-50 shrink-0 mr-2" size={isMobile ? 14 : 12} />
                        <input 
                            ref={searchInputRef}
                            type="text"
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-transparent border-0 outline-none ring-0 focus:ring-0 focus:outline-none placeholder:text-[var(--foreground-secondary)]/70 text-[var(--foreground)]"
                            style={{ fontSize: isMobile ? '12px' : '0.75rem', padding: '4px 0' }}
                        />
                        {!isMobile && (
                            <div className="flex items-center gap-0.5 ml-2 text-[10px] text-[var(--foreground-secondary)] opacity-50 border border-[var(--border)] rounded px-1 bg-[var(--background)]">
                                <span className="text-xs">⌘</span>
                                <span>K</span>
                            </div>
                        )}
                    </div>

                    {/* Filters - Full width on mobile */}
                    <div
                        className={isMobile ? 'w-full' : ''}
                        style={{
                            display: 'flex',
                            background: 'var(--background)',
                            borderRadius: '8px',
                            padding: isMobile ? '1px' : '3px',
                            border: '1px solid var(--border)',
                            flex: isMobile ? 1 : 'unset'
                        }}
                    >
                        {[
                            { id: 'all', label: 'ALL ITEMS' },
                            { id: 'maintenance', label: 'REVIEW FIXES' },
                            { id: 'construction', label: 'STUDY PROGRESS' }
                        ].map((f) => (
                            <button
                                key={f.id}
                                onClick={() => setFilter(f.id as any)}
                                style={{
                                    padding: isMobile ? '2px 6px' : '4px 10px',
                                    fontSize: isMobile ? '9px' : '0.65rem',
                                    fontWeight: 700,
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: filter === f.id ? 'var(--accent)' : 'transparent',
                                    color: filter === f.id ? 'white' : 'var(--foreground-secondary)',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    boxShadow: filter === f.id ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                                    flex: isMobile ? 1 : 'unset'
                                }}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
            
            <DragDropContext 
                onDragEnd={onDragEnd} 
                onDragStart={onDragStart}
                sensors={[useMouseSensor, useKeyboardSensor, useCustomTouchSensor]}
                enableDefaultSensors={false}
            >
                <div 
                    ref={containerRef}
                    style={{ position: 'relative' }}
                    className={`
                        flex-1 min-h-0 px-4 pb-2 md:px-8
                        ${(isMobile || isTablet)
                    ? `flex flex-col gap-4 !mt-2 overflow-hidden` 
                    : 'roadmap-grid !mt-4 !grid-rows-[minmax(0,1fr)]'
                }
                    `}
                >
                    {Object.values(columns).map(col => (
                        <KanbanColumn
                            key={col.id}
                            id={col.id}
                            title={col.title}
                            items={col.items.filter(filteredItem)}
                            isMobile={isMobile}
                            isTablet={isTablet}
                            onCardClick={(item) => setActiveItem(item)}
                            onEditMindmap={handleCardEditMindmap}
                            onImportMindmap={handleCardImportMindmap}
                            onDeleteMindmap={handleCardDeleteMindmap}
                            onChangeSplits={handleCardChangeSplits}
                            getHasMindmap={getHasMindmap}
                            getDocLink={getDocLink}
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

            {/* Splits Modal for Change Splits action */}
            {splitsData && (
                <SplitsModal
                    isOpen={!!splitsModalItem}
                    onClose={() => setSplitsModalItem(null)}
                    isMobile={isMobile}
                    surahId={splitsData.surahId}
                    verseCount={splitsData.verseCount}
                    builderState={getBuilderState(splitsData.surahId)}
                    mindmapImageUrl={splitsData.mindmapImageUrl}
                    mindmapImageUrlDark={splitsData.mindmapImageUrlDark}
                    snapshot={splitsData.snapshot}
                    isDark={isDark}
                    onAddBreak={(val) => onAddBreak(splitsData.surahId, val)}
                    onRemoveBreak={(val) => onRemoveBreak(splitsData.surahId, val)}
                    onSave={() => onSaveAnchors(splitsData.surahId, splitsData.verseCount)}
                    hasReviewedHistory={hasReviewedChunks(splitsData.surahId)}
                />
            )}
        </div>
    );
}
