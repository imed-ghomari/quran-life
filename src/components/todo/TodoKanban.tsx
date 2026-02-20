'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { DragDropContext, DropResult, useMouseSensor, useKeyboardSensor } from '@hello-pangea/dnd';
import { useCustomTouchSensor } from '@/lib/dnd/useCustomTouchSensor';
import KanbanColumn from './KanbanColumn';
import SlideOver from '../SlideOver';
import '../LandingPage/RoadmapSection.css'; // Import shared styles
import { KanbanItem, KanbanColumnData } from './types';
import { DesktopAnchorBuilder, MobileAnchorBuilder, AnchorBuilderState } from './AnchorBuilders';
import MindmapViewer from '../MindmapViewer';
import SplitsModal from './SplitsModal';
import { PenTool, Download, Search, X, Brain, Check } from 'lucide-react';
import { getSurah, SURAHS } from '@/lib/quranData';
import { absoluteToSurahAyah } from '@/lib/mutashabihat';
import { QuranPart, MutashabihatDecision } from '@/lib/types';

const MUT_STATES: { value: MutashabihatDecision['status']; label: string }[] = [
    { value: 'pending', label: 'Pending Review' },
    { value: 'ignored', label: 'Ignored (Not similar)' },
    { value: 'solved_mindmap', label: 'Solved by Mindmap' },
    { value: 'solved_note', label: 'Solved by Note' },
];

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
    mindmaps: any;
    isDark: boolean;

    // Callbacks
    onFixConfirm: (surahId: number, anchorId: string, confirm?: boolean) => Promise<void> | void;
    onSimilarityDecision: (absoluteAyah: number, status: MutashabihatDecision['status'], phraseId?: string, confirm?: boolean) => Promise<void> | void;
    onPartComplete: (part: QuranPart, forceState?: boolean) => Promise<void> | void;
    onSurahComplete: (surahId: number, mindmap?: any, forceState?: boolean) => Promise<void> | void;
    onImportPremade: (type: 'surah' | 'part', id: number) => Promise<void> | void;
    onExportPremade?: (type: 'surah' | 'part', id: number) => Promise<void> | void;
    onResetMindmap?: (type: 'surah' | 'part', id: number, options?: { resetMemoryNodes?: boolean }) => Promise<void> | void;
    onEditMindmap: (id: number, snapshot?: any, isPart?: boolean) => Promise<void> | void;
    onDeleteMindmap?: (type: 'surah' | 'part', id: number) => Promise<void> | void;
    appMode: 'owner' | 'user';
    getHasPremade?: (type: 'surah' | 'part', id: number) => boolean;
    mutashabihatDecisions?: any[];
    onMutashabihatDecisionUpdate?: (representativeAbs: number, update: any, decisionKey: string) => void;

    // Anchor Builder Props
    getBuilderState: (surahId: number) => AnchorBuilderState;
    onAddBreak: (surahId: number, val: number) => void;
    onRemoveBreak: (surahId: number, val: number) => void;
    onSaveAnchors: (surahId: number, verseCount: number) => void;
    hasReviewedChunks: (surahId: number) => boolean;

    // Persistence
    kanbanState?: Record<string, string[]>;
    onKanbanStateChange?: (state: Record<string, string[]>) => Promise<void> | void;
    defaultFilter?: 'all' | 'maintenance' | 'construction';
    completeExitBehavior?: 'mindmap_only' | 'mindmap_and_verses';
    kanbanSortOrder?: 'type_then_number' | 'number_only' | 'manual';
}

const getViewportFlags = () => {
    if (typeof window === 'undefined') {
        return { isMobile: false, isTablet: false };
    }
    const width = window.innerWidth;
    return {
        isMobile: width < 768,
        isTablet: width >= 768 && width < 1100,
    };
};

export default function TodoKanban({
    suspendedAnchors,
    similarityGroups,
    partTasks,
    surahTasks,
    verses,
    mindmaps,
    isDark,
    onFixConfirm,
    onSimilarityDecision,
    onPartComplete,
    onSurahComplete,
    onImportPremade,
    onExportPremade,
    onResetMindmap,
    onEditMindmap,
    onDeleteMindmap,
    appMode,
    getHasPremade,
    mutashabihatDecisions,
    onMutashabihatDecisionUpdate,
    getBuilderState,
    onAddBreak,
    onRemoveBreak,
    onSaveAnchors,
    hasReviewedChunks,
    kanbanState,
    onKanbanStateChange,
    defaultFilter,
    completeExitBehavior,
    kanbanSortOrder
}: TodoKanbanProps) {
    const [columns, setColumns] = useState<Record<string, KanbanColumnData>>({
        'backlog': { id: 'backlog', title: 'Backlog', items: [] },
        'in-progress': { id: 'in-progress', title: 'In Progress', items: [] },
        'complete': { id: 'complete', title: 'Complete', items: [] },
    });

    const [activeItem, setActiveItem] = useState<KanbanItem | null>(null);
    const [isMobile, setIsMobile] = useState(() => getViewportFlags().isMobile);
    const [isTablet, setIsTablet] = useState(() => getViewportFlags().isTablet);
    // const [isDragging, setIsDragging] = useState(false); // Removed to avoid re-renders
    const [filter, setFilter] = useState<'all' | 'maintenance' | 'construction'>(defaultFilter ?? 'all');
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        setFilter(defaultFilter ?? 'all');
    }, [defaultFilter]);

    // Refs for stable access in callbacks
    const isMobileRef = useRef(isMobile);
    const isTabletRef = useRef(isTablet);

    // Splits Modal State
    const [splitsModalItem, setSplitsModalItem] = useState<KanbanItem | null>(null);

    // Toast state
    type TodoToastType = 'surah' | 'part' | 'suspended' | 'similarity';

    interface TodoToastItem {
        id: string;
        type: TodoToastType;
        message: string;
        info?: string;
        onUndo?: () => void;
        onExpire?: () => void;
    }
    const [toasts, setToasts] = useState<TodoToastItem[]>([]);
    const lastToastRef = useRef<{ key: string; at: number } | null>(null);
    const persistMoveSeqRef = useRef(0);

    const addToast = useCallback((type: TodoToastType, message: string, info?: string, onUndo?: () => void, onExpire?: () => void) => {
        const key = `${type}|${message}|${info || ''}`;
        const now = Date.now();
        if (lastToastRef.current && lastToastRef.current.key === key && now - lastToastRef.current.at < 500) {
            return '';
        }
        lastToastRef.current = { key, at: now };
        const id = Math.random().toString(36).substring(2, 9);
        setToasts(prev => [...prev, { id, type, message, info, onUndo, onExpire }]);
        setTimeout(() => {
            if (onExpire) onExpire();
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 6000);
        return id;
    }, []);

    const persistKanbanState = useCallback((
        nextState: Record<string, string[]>,
        options?: {
            rollbackColumns?: Record<string, KanbanColumnData>;
            seq?: number;
        }
    ) => {
        if (!onKanbanStateChange) return;
        void Promise.resolve(onKanbanStateChange(nextState)).catch((err) => {
            console.error('Failed to persist kanban board state', err);
            if (options?.rollbackColumns && options?.seq && persistMoveSeqRef.current === options.seq) {
                setColumns(options.rollbackColumns);
            }
            addToast('surah', 'Failed to save board change', options?.rollbackColumns ? 'Change was reverted.' : 'Please try again.');
        });
    }, [onKanbanStateChange, addToast]);

    const getMindmapCompletionInfo = useCallback((item: KanbanItem): string => {
        if (item.type === 'part') {
            const hasMap = !!(item.data.mindmap?.tldrawSnapshot || item.data.mindmap?.imageUrl || item.data.mindmap?.imageUrlDark);
            return [
              
                hasMap ? 'Part mindmap added to review' : 'You need to create a mindmap to complete this card.',
              
            ].join('\n');
        }

        

        const mindmap = item.data.mindmap;
        const hasMap = !!(mindmap?.tldrawSnapshot || mindmap?.imageUrl || mindmap?.imageUrlDark);
        const hasSplits = !!(mindmap?.anchors && mindmap.anchors.length > 0);

        if (hasMap && hasSplits) {
            const hasReviewed = hasReviewedChunks(item.data.surah.id);
            return [
                hasReviewed
                    ? 'Mindmap back in review, verses not touched.'
                    : 'Surah Mindmap and verses added to review.',
            ].join('\n');
        }
        if (hasMap && !hasSplits) {
            return [
                
                'Mindmap added to review.',
                'Verses not yet added. Create splits.'
                
            ].join('\n');
        }
       
        return [
           
            'Create a mindmap to complete this card.',
            
        ].join('\n');
    }, [hasReviewedChunks]);

    const getMindmapRemovalInfo = useCallback((item: KanbanItem): string => {
        if (item.type === 'part') {
            return 'Part mindmap removed from review; move back to Complete to restore it.';
        }
        const mindmap = item.data.mindmap;
        const hasSplits = !!(mindmap?.anchors && mindmap.anchors.length > 0);
        if (!hasSplits) {
            if (completeExitBehavior === 'mindmap_and_verses') {
                return 'Surah mindmap removed from review; no verse splits exist, so no verse reviews were suspended.';
            }
            return 'Surah mindmap removed from review; no verse splits exist, so verse reviews were unchanged.';
        }
        if (completeExitBehavior === 'mindmap_and_verses') {
            return 'Surah mindmap removed and verse reviews suspended; move back to Complete to restore both.';
        }
        return 'Surah mindmap removed while verse reviews stay active; move back to Complete to restore the mindmap.';
    }, [completeExitBehavior]);

    const getMaintenanceCardReviewInfo = useCallback((item: KanbanItem, enteringComplete: boolean): string => {
        if (item.type === 'suspended') {
            return enteringComplete
                ? `Suspended verse group is now unsuspended and shown in the review queue.`
                : `Suspended verse group is now suspended and removed from the review queue.`;
        }
        return enteringComplete
            ? `Similarity item is now marked resolved.`
            : `Similarity item is now marked unresolved.`;
    }, []);

    const hasMindmapForItem = useCallback((item: KanbanItem): boolean => {
        if (item.type === 'part') {
            return !!(item.data.mindmap?.tldrawSnapshot || item.data.mindmap?.imageUrl || item.data.mindmap?.imageUrlDark);
        }
        if (item.type === 'surah') {
            const mindmap = item.data.mindmap;
            return !!(mindmap?.tldrawSnapshot || mindmap?.imageUrl || mindmap?.imageUrlDark);
        }
        return false;
    }, []);

    // Verse Context Modal State (Suspended Cards)
    const [verseContextItem, setVerseContextItem] = useState<KanbanItem | null>(null);

    // Similarity Context Modal State
    const [activeSimilarityContext, setActiveSimilarityContext] = useState<{
        decisionKey: string;
        representativeAbs: number;
        group: {
            phraseId: string;
            absRefs: number[];
            entry: any;
            ayahIds: number[];
            surahId: number;
        };
        surah: { id: number; name: string; arabicName?: string };
    } | null>(null);
    const [expandedSimilarityMatches, setExpandedSimilarityMatches] = useState<Record<string, boolean>>({});

    // Auto-scroll refs
    const containerRef = useRef<HTMLDivElement>(null);
    // Removed custom scroll refs as per request

    useEffect(() => {
        const checkResponsive = () => {
            const { isMobile: mobile, isTablet: tablet } = getViewportFlags();
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
            const groupIdentity = item.groupKey || `${item.surahId}-${item.anchorId}`;
            const id = `suspended-${groupIdentity}`;
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

        const showReviewDummies = process.env.NEXT_PUBLIC_SHOW_REVIEW_DUMMIES === 'true';

        if (showReviewDummies && suspendedAnchors.length === 0) {
            const dummyId = 'suspended-dummy-1';
            itemMap.set(dummyId, {
                id: dummyId,
                type: 'suspended',
                status: 'backlog',
                data: {
                    surahId: 1,
                    anchorId: 'dummy-review-fix',
                    label: 'Dummy review fix (dev)',
                    startVerse: 1,
                    endVerse: 7,
                    isDummy: true
                }
            });
        }

        if (showReviewDummies && similarityGroups.length === 0) {
            const dummyId = 'similarity-dummy-1';
            const dummySurah = getSurah(1);
            itemMap.set(dummyId, {
                id: dummyId,
                type: 'similarity',
                status: 'backlog',
                data: {
                    surah: dummySurah || { id: 1, name: 'Al-Fatihah', arabicName: 'الفاتحة' },
                    count: 1,
                    isDummy: true,
                    items: [
                        {
                            err: { absoluteAyah: 1 },
                            muts: [
                                {
                                    phraseId: 'dummy-phrase-1',
                                    meta: {
                                        sourceAbs: 1,
                                        sourceRange: [1, 3],
                                        matches: [
                                            { absolute: 1, wordRange: [1, 3] },
                                            { absolute: 2, wordRange: [1, 2] }
                                        ]
                                    },
                                    matches: [1, 2]
                                }
                            ]
                        }
                    ]
                }
            });
        }

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
            if (kanbanSortOrder === 'manual') {
                return items;
            }
            const getNumber = (item: KanbanItem) => {
                if (item.type === 'surah') return item.data.surah.id;
                if (item.type === 'part') return item.data.part;
                if (item.type === 'suspended') return item.data.surahId;
                if (item.type === 'similarity') return item.data.surah.id;
                return 999;
            };
            return items.sort((a, b) => {
                if (kanbanSortOrder === 'number_only') {
                    return getNumber(a) - getNumber(b);
                }
                // type_then_number (default)
                const typePriority: Record<string, number> = {
                    'suspended': 0,
                    'similarity': 1,
                    'part': 2,
                    'surah': 3
                };
                const pA = typePriority[a.type] ?? 99;
                const pB = typePriority[b.type] ?? 99;
                if (pA !== pB) return pA - pB;
                return getNumber(a) - getNumber(b);
            });
        };

        setColumns({
            'backlog': { id: 'backlog', title: 'Backlog', items: sortItems(newCols['backlog']) },
            'in-progress': { id: 'in-progress', title: 'In Progress', items: sortItems(newCols['in-progress']) },
            'complete': { id: 'complete', title: 'Complete', items: sortItems(newCols['complete']) },
        });

    }, [suspendedAnchors, similarityGroups, partTasks, surahTasks, kanbanState, kanbanSortOrder]);

    const handleCompletionTrigger = useCallback(async (item: KanbanItem, forceState?: boolean) => {
        if (item.type === 'suspended') {
            if (item.data?.isDummy) return;
            const shouldUnsuspend = forceState !== false;
            await onFixConfirm(item.data.surahId, item.data.anchorId, shouldUnsuspend);
        } else if (item.type === 'similarity') {
            if (item.data?.isDummy) return;
            const shouldResolve = forceState !== false;
            const group = item.data;
            group.items.forEach((simItem: any) => {
                simItem.muts.forEach((entry: any) => {
                    onSimilarityDecision(
                        simItem.err.absoluteAyah,
                        shouldResolve ? 'solved_note' : 'pending',
                        entry.phraseId,
                        shouldResolve
                    );
                });
            });
        } else if (item.type === 'part') {
            await onPartComplete(item.data.part, forceState);
        } else if (item.type === 'surah') {
            await onSurahComplete(item.data.surah.id, item.data.mindmap, forceState);
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
            if (destination && isMobileRef.current) {
                 const destCol = document.getElementById(destination.droppableId);
                 if (destCol) {
                     destCol.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                 }
            }
        }

        const { source, destination, draggableId } = result;

        if (!destination) return;

        const persistSeq = ++persistMoveSeqRef.current;
        let nextStateToPersist: Record<string, string[]> | null = null;
        let rollbackColumns: Record<string, KanbanColumnData> | null = null;

        setColumns(prev => {
            const sourceCol = prev[source.droppableId];
            const destCol = prev[destination.droppableId];
            const sourceVisibleItems = sourceCol.items.filter(filteredItem);
            const sourceVisibleIndex = sourceVisibleItems.findIndex(item => item.id === draggableId);
            const safeSourceIndex = sourceVisibleIndex !== -1 ? sourceVisibleIndex : source.index;
            const visibleItem = sourceVisibleItems[safeSourceIndex];
            const movedItem = visibleItem?.id === draggableId
                ? visibleItem
                : sourceCol.items.find(item => item.id === draggableId);
            if (!movedItem) return prev;

            if (source.droppableId === destination.droppableId) {
                const destVisibleItems = destCol.items.filter(filteredItem);
                const currentVisibleIndex = destVisibleItems.findIndex(item => item.id === movedItem.id);
                if (currentVisibleIndex === destination.index) {
                    return prev;
                }
            }
            const actualSourceIndex = sourceCol.items.findIndex(item => item.id === movedItem.id);
            if (actualSourceIndex === -1) return prev;

            if (destination.droppableId === 'complete'
                && (movedItem.type === 'surah' || movedItem.type === 'part')
                && !hasMindmapForItem(movedItem)
            ) {
                addToast(
                    movedItem.type,
                    'Cannot move to Complete',
                    'Create a mindmap for this card before completing it.'
                );
                return prev;
            }

            const sourceItems = [...sourceCol.items];
            sourceItems.splice(actualSourceIndex, 1);

            const destItems = source.droppableId === destination.droppableId ? sourceItems : [...destCol.items];
            const filteredDestItems = destItems.filter(filteredItem);

            let insertIndex = destItems.length;
            if (filteredDestItems.length > 0) {
                if (destination.index >= filteredDestItems.length) {
                    const lastFiltered = filteredDestItems[filteredDestItems.length - 1];
                    const lastIndex = destItems.findIndex(item => item.id === lastFiltered.id);
                    insertIndex = lastIndex === -1 ? destItems.length : lastIndex + 1;
                } else {
                    const target = filteredDestItems[destination.index];
                    const targetIndex = destItems.findIndex(item => item.id === target.id);
                    insertIndex = targetIndex === -1 ? destItems.length : targetIndex;
                }
            }

            destItems.splice(insertIndex, 0, movedItem);

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
                nextStateToPersist = state;
                rollbackColumns = prev;
            }

            if (destination.droppableId === 'complete') {
                if (movedItem.type === 'surah' || movedItem.type === 'part') {
                    if (movedItem.status !== 'complete') {
                        void handleCompletionTrigger(movedItem, true).catch((err) => {
                            console.error('Failed to persist completion trigger', err);
                            addToast(movedItem.type, 'Failed to save completion', 'Please try again.');
                        });
                        addToast(movedItem.type, 'Moved to Complete', getMindmapCompletionInfo(movedItem));
                    }
                } else if (source.droppableId !== 'complete' && (movedItem.type === 'suspended' || movedItem.type === 'similarity')) {
                    void handleCompletionTrigger(movedItem, true).catch((err) => {
                        console.error('Failed to persist completion trigger', err);
                        addToast(movedItem.type, 'Failed to save completion', 'Please try again.');
                    });
                    addToast(movedItem.type, 'Marked complete', getMaintenanceCardReviewInfo(movedItem, true));
                }
            } else if (source.droppableId === 'complete') {
                if (movedItem.type === 'surah' || movedItem.type === 'part') {
                    void handleCompletionTrigger(movedItem, false).catch((err) => {
                        console.error('Failed to persist completion trigger', err);
                        addToast(movedItem.type, 'Failed to save completion', 'Please try again.');
                    });
                    if (hasMindmapForItem(movedItem)) {
                        addToast(movedItem.type, 'Moved out of Complete', getMindmapRemovalInfo(movedItem));
                    }
                } else if (movedItem.type === 'suspended' || movedItem.type === 'similarity') {
                    void handleCompletionTrigger(movedItem, false).catch((err) => {
                        console.error('Failed to persist completion trigger', err);
                        addToast(movedItem.type, 'Failed to save completion', 'Please try again.');
                    });
                    addToast(movedItem.type, 'Moved out of Complete', getMaintenanceCardReviewInfo(movedItem, false));
                }
            }

            return newColsMap;
        });

        if (nextStateToPersist) {
            persistKanbanState(nextStateToPersist, { rollbackColumns: rollbackColumns || undefined, seq: persistSeq });
        }
    }, [handleCompletionTrigger, addToast, getMindmapCompletionInfo, getMindmapRemovalInfo, getMaintenanceCardReviewInfo, hasMindmapForItem, filteredItem, persistKanbanState]);

    // Card Action Handlers
    const handleCardEditMindmap = useCallback(async (item: KanbanItem) => {
        if (item.type === 'surah') {
            await onEditMindmap(item.data.surah.id, item.data.mindmap?.tldrawSnapshot, false);
        } else if (item.type === 'part') {
            await onEditMindmap(item.data.part, item.data.mindmap?.tldrawSnapshot, true);
        } else if (item.type === 'suspended') {
            await onEditMindmap(item.data.surahId, mindmaps[item.data.surahId]?.tldrawSnapshot, false);
        } else if (item.type === 'similarity') {
            await onEditMindmap(item.data.surah.id, mindmaps[item.data.surah.id]?.tldrawSnapshot, false);
        }
    }, [onEditMindmap, mindmaps]);

    const handleCardDeleteMindmap = useCallback(async (item: KanbanItem) => {
        if (onDeleteMindmap) {
            if (item.type === 'surah') {
                await onDeleteMindmap('surah', item.data.surah.id);
            } else if (item.type === 'part') {
                await onDeleteMindmap('part', item.data.part);
            }
        }
    }, [onDeleteMindmap]);

    const handleCardExportMindmap = useCallback(async (item: KanbanItem) => {
        if (!onExportPremade) return;
        if (item.type === 'surah') {
            await onExportPremade('surah', item.data.surah.id);
        } else if (item.type === 'part') {
            await onExportPremade('part', item.data.part);
        }
    }, [onExportPremade]);

    const handleCardResetMindmap = useCallback(async (item: KanbanItem, resetMemoryNodes: boolean) => {
        if (!onResetMindmap) return;
        if (item.type === 'surah') {
            await onResetMindmap('surah', item.data.surah.id, { resetMemoryNodes });
        } else if (item.type === 'part') {
            await onResetMindmap('part', item.data.part, { resetMemoryNodes });
        }
    }, [onResetMindmap]);

    const handleCardChangeSplits = useCallback((item: KanbanItem) => {
        if (item.type === 'surah' || item.type === 'suspended' || item.type === 'similarity') {
            setSplitsModalItem(item);
        }
    }, []);

    const handleCardViewVerseContext = useCallback((item: KanbanItem) => {
        if (item.type !== 'suspended') return;
        setVerseContextItem(item);
    }, []);

    const handleCardViewSimilarityContext = useCallback((item: KanbanItem) => {
        if (item.type !== 'similarity') return;
        if (!mutashabihatDecisions || !onMutashabihatDecisionUpdate) return;

        const group = item.data;
        const phraseMap: Record<string, { phraseId: string; absRefs: number[]; entry: any; ayahIds: number[] }> = {};

        group.items.forEach((gItem: any) => {
            const abs = gItem.err.absoluteAyah!;
            gItem.muts.forEach((entry: any) => {
                if (!phraseMap[entry.phraseId]) {
                    phraseMap[entry.phraseId] = {
                        phraseId: entry.phraseId,
                        absRefs: [],
                        entry,
                        ayahIds: []
                    };
                }
                if (!phraseMap[entry.phraseId].absRefs.includes(abs)) {
                    phraseMap[entry.phraseId].absRefs.push(abs);
                    const ref = absoluteToSurahAyah(abs);
                    phraseMap[entry.phraseId].ayahIds.push(ref.ayahId);
                }
            });
        });

        const groups = Object.values(phraseMap).sort((a, b) => Math.min(...a.ayahIds) - Math.min(...b.ayahIds));
        if (groups.length === 0) return;

        const selected = groups[0];
        const representativeAbs = selected.absRefs.find(abs => {
            const key = `${abs}-${selected.phraseId}`;
            const existing = mutashabihatDecisions.find(d => d.phraseId === key);
            return existing && existing.status !== 'pending';
        }) || selected.absRefs[0];
        const decisionKey = `${representativeAbs}-${selected.phraseId}`;

        setActiveSimilarityContext({
            decisionKey,
            representativeAbs,
            group: {
                phraseId: selected.phraseId,
                absRefs: selected.absRefs,
                entry: selected.entry,
                ayahIds: selected.ayahIds,
                surahId: group.surah.id
            },
            surah: group.surah
        });
    }, [mutashabihatDecisions, onMutashabihatDecisionUpdate]);

    const getHasMindmap = useCallback((item: KanbanItem): boolean => {
        if (item.type === 'surah' || item.type === 'part') {
            const mindmap = item.data.mindmap;
            return !!(mindmap?.tldrawSnapshot || mindmap?.imageUrl);
        }
        return false;
    }, []);

    const getHasSplits = useCallback((item: KanbanItem): boolean => {
        if (item.type === 'surah') {
            const mindmap = item.data.mindmap;
            return !!(mindmap?.anchors && mindmap.anchors.length > 0);
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

    const getHasPremadeForItem = useCallback((item: KanbanItem): boolean => {
        if (!getHasPremade) return false;
        if (item.type === 'surah') return getHasPremade('surah', item.data.surah.id);
        if (item.type === 'part') return getHasPremade('part', item.data.part);
        return false;
    }, [getHasPremade]);

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
                                        mindmapImageUrlDark={mindmap?.imageUrlDark || null}
                                        isDark={isDark}
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
        if (!splitsModalItem) return null;
        const surahId = splitsModalItem.type === 'surah'
            ? splitsModalItem.data.surah.id
            : splitsModalItem.type === 'similarity'
                ? splitsModalItem.data.surah.id
                : splitsModalItem.data.surahId;
        const surahMeta = SURAHS.find(s => s.id === surahId);
        const mindmap = splitsModalItem.type === 'surah' ? splitsModalItem.data.mindmap : mindmaps[surahId];
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
            {/* Header Area */}
            <div className={`
                flex shrink-0 bg-[var(--background)] gap-4
                ${isMobile ? 'flex-col items-stretch px-3 pt-4 pb-2' : 'flex-row items-center justify-between px-0 pt-0 pb-6'}
            `}>
                {/* Title - Desktop only */}
                {!isMobile && (
                    <h1 className="text-2xl font-bold m-0">Todo</h1>
                )}

                {/* Right Side: Search + Filters */}
                <div className={`${isMobile ? 'flex flex-col gap-2 w-full' : 'flex items-center gap-3'}`}>
                    {/* Search Bar - Styled like DocsSearch */}
                    <div 
                        className={`docs-search-trigger ${isMobile ? '!w-full !h-9 !justify-start !px-2' : ''} todo-search-bar !border-transparent`}
                        onClick={() => searchInputRef.current?.focus()}
                        style={!isMobile ? { cursor: 'text' } : undefined}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                            <Search className="docs-search-icon" size={14} />
                            <input 
                                ref={searchInputRef}
                                type="text"
                                placeholder="Search..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full !bg-transparent !border-none !outline-none !ring-0 !focus:ring-0 !focus:outline-none placeholder:text-[var(--foreground-secondary)] text-[var(--foreground)] !p-0 !m-0 !shadow-none !rounded-none"
                                style={{ 
                                    padding: 0,
                                    fontSize: '0.75rem',
                                    height: 'auto',
                                    lineHeight: 'normal'
                                }}
                            />
                        </div>
                        <div className="docs-search-shortcut">
                            <span>⌘</span>
                            <span>K</span>
                        </div>
                    </div>

                    {/* Filters - Full width on mobile */}
                    <div
                        className={`segmented-compact ${isMobile ? 'w-full' : ''}`}
                        style={{ flex: isMobile ? 1 : 'unset' }}
                    >
                        {[
                            { id: 'all', label: 'ALL ITEMS' },
                            { id: 'maintenance', label: 'REVIEW FIXES' },
                            { id: 'construction', label: 'STUDY PROGRESS' }
                        ].map((f) => (
                            <button
                                key={f.id}
                                suppressHydrationWarning={true}
                                onClick={() => setFilter(f.id as any)}
                                className={`adv-seg-btn ${filter === f.id ? 'adv-seg-active' : ''}`}
                                style={{ flex: isMobile ? 1 : 'unset' }}
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
                        flex-1 min-h-0 px-3 pb-2 md:px-0
                        ${isMobile
                    ? `flex flex-col gap-4 !mt-2 overflow-hidden` 
                    : 'grid grid-cols-3 gap-6 !mt-4 !grid-rows-[minmax(0,1fr)]'
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
                            appMode={appMode}
                            onCardClick={(item) => setActiveItem(item)}
                            onEditMindmap={handleCardEditMindmap}
                            onDeleteMindmap={handleCardDeleteMindmap}
                            onExportMindmap={handleCardExportMindmap}
                            onResetMindmap={handleCardResetMindmap}
                            onChangeSplits={handleCardChangeSplits}
                            onViewVerseContext={handleCardViewVerseContext}
                            onViewSimilarityContext={handleCardViewSimilarityContext}
                            getHasMindmap={getHasMindmap}
                            getHasSplits={getHasSplits}
                            getHasPremade={getHasPremadeForItem}
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
                    isMobile={isMobile || isTablet}
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

            {/* Suspended Verse Context Modal */}
            {verseContextItem && (() => {
                const issue = verseContextItem.data;
                const surahId = issue.surahId;
                const surah = getSurah(surahId);
                const surahMeta = SURAHS.find(s => s.id === surahId);
                const total = surahMeta?.verseCount || 1;
                const mistakeEntries = (Array.isArray(issue.recentVerseWindow) ? issue.recentVerseWindow : [])
                    .map((entry: any) => {
                        const ayahId = Math.min(Math.max(1, Number(entry?.ayahId) || 1), total);
                        const count = Math.max(1, Number(entry?.count) || 1);
                        return { ayahId, count };
                    })
                    .slice(0, 3);
                const mistakeAyahIds = new Set<number>(mistakeEntries.map((entry: any) => entry.ayahId));
                const mistakeCountByAyah = new Map<number, number>(mistakeEntries.map((entry: any) => [entry.ayahId, entry.count]));
                const getVerseText = (ayahId: number) => verses.find((v: any) => v.surahId === surahId && v.ayahId === ayahId)?.text || '';
                const mergedContextRanges = (() => {
                    const rawRanges = mistakeEntries
                        .map((entry: any) => ({
                            start: Math.max(1, entry.ayahId - 1),
                            end: Math.min(total, entry.ayahId + 1),
                        }))
                        .sort((a: any, b: any) => a.start - b.start);

                    const merged: Array<{ start: number; end: number }> = [];
                    rawRanges.forEach((range: any) => {
                        const last = merged[merged.length - 1];
                        if (!last || range.start > last.end) {
                            merged.push({ ...range });
                            return;
                        }
                        last.end = Math.max(last.end, range.end);
                    });
                    return merged;
                })();

                const renderVerse = (ayahId: number) => {
                    const highlight = mistakeAyahIds.has(ayahId);
                    const count = mistakeCountByAyah.get(ayahId) || 1;
                    return (
                        <div key={`${ayahId}-${count}`} className="verse-context-verse bg-[var(--background-secondary)] p-5 rounded-lg">
                            <div className="verse-context-label text-xs text-[var(--foreground-secondary)] mb-2">
                                {surah ? `${surah.id}. ${surah.name}` : `Surah ${surahId}`} • Ayah {ayahId}
                            </div>
                            <p
                                className="verse-context-ayah text-right font-arabic text-xl leading-loose"
                                style={highlight ? { background: 'rgba(255, 99, 99, 0.18)' } : undefined}
                            >
                                {getVerseText(ayahId)}
                            </p>
                            {highlight && count > 1 && (
                                <div className="mt-3 inline-flex items-center rounded-full border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-1 text-xs font-semibold text-[var(--danger)]">
                                    {count} errors on this verse
                                </div>
                            )}
                        </div>
                    );
                };

                const contextStackClassName = (isMobile || isTablet)
                    ? 'verse-context-stack pr-1 space-y-4'
                    : 'verse-context-stack max-h-[52vh] overflow-y-auto pr-1 space-y-4';

                const content = mistakeEntries.length > 0 ? (
                    <div className={contextStackClassName}>
                        {mergedContextRanges.map((range: any, rangeIdx: number) => {
                            const versesInRange = Array.from(
                                { length: Math.max(0, range.end - range.start + 1) },
                                (_, idx) => range.start + idx
                            );
                            return (
                                <div key={`${range.start}-${range.end}`} className="space-y-4">
                                    {rangeIdx > 0 && (
                                        <div className="my-2 flex items-center gap-3">
                                            <div className="h-px flex-1 bg-[var(--border)]" />
                                            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--foreground-secondary)]">
                                                Other mistake context
                                            </span>
                                            <div className="h-px flex-1 bg-[var(--border)]" />
                                        </div>
                                    )}
                                    {versesInRange.map((ayahId) => renderVerse(ayahId))}
                                </div>
                            );
                        })}
                    </div>
                ) : (() => {
                    const targetAyah = issue.focusAyah || issue.startVerse || 1;
                    const target = Math.min(Math.max(1, targetAyah), total);
                    const prev = target > 1 ? target - 1 : null;
                    const next = target < total ? target + 1 : null;
                    return (
                        <div className={contextStackClassName}>
                            {prev && renderVerse(prev)}
                            {renderVerse(target)}
                            {next && renderVerse(next)}
                        </div>
                    );
                })();

                if (isMobile || isTablet) {
                    return (
                        <div className="slide-over-overlay" onClick={() => setVerseContextItem(null)}>
                            <div className="slide-over-content verse-context-modal" onClick={e => e.stopPropagation()}>
                                <div className="slide-over-header verse-context-header">
                                    <h3 className="verse-context-title" style={{ margin: 0, fontSize: '1rem' }}>Suspension Context (Last 3 Errors)</h3>
                                    <button className="close-btn verse-context-close" onClick={() => setVerseContextItem(null)}>
                                        <X size={20} />
                                    </button>
                                </div>
                                <div className="slide-over-body verse-context-content">
                                    {content}
                                </div>
                            </div>
                        </div>
                    );
                }

                return (
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center verse-context-modal" role="dialog" aria-modal="true">
                        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setVerseContextItem(null)} />
                        <div className="relative w-full max-w-2xl max-h-[85vh] bg-[var(--background)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden">
                            <div className="verse-context-header flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
                                <h3 className="verse-context-title text-lg font-bold">Suspension Context (Last 3 Errors)</h3>
                                <button
                                    onClick={() => setVerseContextItem(null)}
                                    className="verse-context-close p-2 rounded-full hover:bg-[var(--background-secondary)] transition-colors"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                            <div className="verse-context-content px-8 py-7 space-y-5 overflow-y-auto max-h-[calc(85vh-70px)]">
                                <div className="rounded-xl border border-[var(--border)] bg-[var(--background-secondary)]/60 px-4 py-3 text-sm text-[var(--foreground-secondary)]">
                                    {issue.label || 'Verse group'} • {Math.max(0, Number(issue.mistakeCount) || 0)} total errors in this group
                                </div>
                                {content}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Similarity Context Modal */}
            {activeSimilarityContext && mutashabihatDecisions && onMutashabihatDecisionUpdate && (() => {
                const { decisionKey, representativeAbs, group, surah } = activeSimilarityContext;
                const existing = mutashabihatDecisions.find(d => d.phraseId === decisionKey) || { status: 'pending', notes: '' };
                const existingNotes = (existing as any).notes ?? (existing as any).note ?? '';
                const isConfirmed = !!existing.confirmedAt;
                const entry = group.entry;

                const matches = entry.matches.filter((matchAbs: number) => {
                    const matchRef = absoluteToSurahAyah(matchAbs);
                    return matchRef.surahId !== group.surahId;
                });
                const isExpanded = expandedSimilarityMatches[`${decisionKey}-full`] || false;
                const displayedMatches = isExpanded ? matches : matches.slice(0, 4);
                const hasMore = matches.length > 4;

                const similarityContent = (
                    <>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
                            <div style={{ flex: 1, minWidth: '140px' }}>
                                <label style={{ fontSize: '0.75rem', color: 'var(--foreground-secondary)', display: 'block', marginBottom: '4px' }}>Status</label>
                                <select
                                    value={existing.status}
                                    onChange={e => onMutashabihatDecisionUpdate(representativeAbs, { ...existing, status: e.target.value as any }, decisionKey)}
                                    className="maturity-select"
                                    style={{ width: '100%', padding: '8px' }}
                                >
                                    {MUT_STATES.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                </select>
                            </div>
                        </div>

                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ fontSize: '0.75rem', color: 'var(--foreground-secondary)', display: 'block', marginBottom: '4px' }}>Notes</label>
                            <textarea
                                placeholder="Add your distinction notes here..."
                                value={existingNotes}
                                onChange={e => onMutashabihatDecisionUpdate(representativeAbs, { ...existing, notes: e.target.value }, decisionKey)}
                                style={{
                                    width: '100%',
                                    minHeight: '80px',
                                    padding: '12px',
                                    borderRadius: '12px',
                                    border: '1px solid var(--border)',
                                    background: 'var(--background-secondary)',
                                    fontSize: '0.9rem',
                                    resize: 'vertical'
                                }}
                            />
                        </div>

                        <div className={`mut-context-block ${isConfirmed ? 'confirmed' : ''}`} style={{ margin: 0, border: '1px solid var(--border)', background: 'transparent' }}>
                            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', background: 'var(--background-secondary)', fontWeight: 600 }}>
                                Similarity Context
                            </div>
                            <div style={{ padding: '0.5rem' }}>
                                {group.absRefs.map(absRef => {
                                    const ref = absoluteToSurahAyah(absRef);
                                    const baseVerse = verses.find(v => v.surahId === ref.surahId && v.ayahId === ref.ayahId);
                                    const matchRange = entry.meta?.matches?.find((m: any) => m.absolute === absRef)?.wordRange;
                                    const isSource = entry.meta?.sourceAbs === absRef;
                                    const sourceRange = entry.meta?.sourceRange;

                                    if (!baseVerse) return null;

                                    return (
                                        <div key={absRef} className="mut-text" style={{ padding: '1rem', borderBottom: '1px solid var(--border)' }}>
                                            <div className="mut-text-label" style={{ marginBottom: '0.75rem', fontWeight: 600, color: 'var(--accent)' }}>
                                                {getSurah(ref.surahId)?.name} - {ref.ayahId} {group.phraseId.startsWith('custom-') ? '' : `(Phrase #${group.phraseId})`}
                                            </div>
                                            <div className="mut-context">
                                                <p className="arabic-text mut-core" style={{ fontSize: '1.3rem', textAlign: 'right', direction: 'rtl', lineHeight: '2.2', marginBottom: '1.5rem' }}>
                                                    <span className="mut-ayah-tag">{ref.ayahId}</span>
                                                    <HighlightedVerse
                                                        text={baseVerse.text}
                                                        range={isSource ? sourceRange : matchRange}
                                                    />
                                                </p>

                                                {displayedMatches.map((matchAbs: number, idx: number) => {
                                                    const mref = absoluteToSurahAyah(matchAbs);
                                                    const msurah = getSurah(mref.surahId);
                                                    const mVerse = verses.find(v => v.surahId === mref.surahId && v.ayahId === mref.ayahId);
                                                    const matchRange = entry.meta?.matches?.find((m: any) => m.absolute === matchAbs)?.wordRange;

                                                    return (
                                                        <div key={idx} className="mut-match-item" style={{
                                                            marginBottom: '1rem',
                                                            padding: '0.75rem',
                                                            borderRadius: '8px',
                                                            background: 'var(--background)',
                                                            border: '1px solid var(--border)'
                                                        }}>
                                                            <div className="mut-match-label" style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: '0.5rem' }}>
                                                                Compare: Surah {msurah?.name} - {mref.ayahId}
                                                            </div>
                                                            <div className="mut-context">
                                                                {mVerse && (
                                                                    <p className="arabic-text mut-core" style={{ fontSize: '1.2rem', textAlign: 'right', direction: 'rtl', lineHeight: '2' }}>
                                                                        <span className="mut-ayah-tag">{mref.ayahId}</span>
                                                                        <HighlightedVerse text={mVerse.text} range={matchRange} />
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}

                                                {hasMore && (
                                                    <button
                                                        className="btn-show-more"
                                                        onClick={() => setExpandedSimilarityMatches(prev => ({ ...prev, [`${decisionKey}-full`]: !isExpanded }))}
                                                        style={{
                                                            width: '100%',
                                                            padding: '8px',
                                                            marginTop: '8px',
                                                            fontSize: '0.8rem',
                                                            color: 'var(--accent)',
                                                            background: 'none',
                                                            border: '1px dashed var(--accent)',
                                                            borderRadius: '8px',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        {isExpanded ? 'Show Less' : `Show ${matches.length - 4} More Similar Verses`}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </>
                );

                if (isMobile || isTablet) {
                    return (
                        <div className="slide-over-overlay" onClick={() => setActiveSimilarityContext(null)}>
                            <div className="slide-over-content similarity-context-modal" onClick={e => e.stopPropagation()}>
                                <div className="slide-over-header similarity-context-header">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <div style={{ background: 'var(--accent)', color: 'white', padding: '6px', borderRadius: '8px', display: 'flex' }}>
                                            <Brain size={18} />
                                        </div>
                                        <h3 className="similarity-context-title" style={{ margin: 0, fontSize: '1rem' }}>
                                            {surah?.name} - Ayah {group.ayahIds.sort((a, b) => a - b).join(', ')}
                                        </h3>
                                    </div>
                                    <button className="close-btn similarity-context-close" onClick={() => setActiveSimilarityContext(null)}>
                                        <X size={20} />
                                    </button>
                                </div>
                                <div className="slide-over-body similarity-context-content">
                                    {similarityContent}
                                </div>
                            </div>
                        </div>
                    );
                }

                return (
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center similarity-context-modal" role="dialog" aria-modal="true">
                        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setActiveSimilarityContext(null)} />
                        <div className="relative w-full max-w-3xl max-h-[85vh] bg-[var(--background)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden">
                            <div className="similarity-context-header flex items-center justify-between px-10 py-6 border-b border-[var(--border)]">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div style={{ background: 'var(--accent)', color: 'white', padding: '6px', borderRadius: '8px', display: 'flex' }}>
                                        <Brain size={18} />
                                    </div>
                                    <h3 className="similarity-context-title" style={{ margin: 0, fontSize: '1rem' }}>
                                        {surah?.name} - Ayah {group.ayahIds.sort((a, b) => a - b).join(', ')}
                                    </h3>
                                </div>
                                <button className="close-btn similarity-context-close" onClick={() => setActiveSimilarityContext(null)}>
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="similarity-context-content px-10 py-8 overflow-y-auto max-h-[calc(85vh-80px)]">
                                {similarityContent}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Toasts (Undo) */}
            {toasts.length > 0 && (
                <div className="toast-container" style={{
                    position: 'fixed',
                    top: '20px',
                    right: '20px',
                    zIndex: 1000,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    pointerEvents: 'none',
                    maxWidth: 'calc(100vw - 40px)'
                }}>
                    {toasts.map((t) => (
                        <div key={t.id} className="review-toast success" style={{
                            padding: '0.65rem 1rem',
                            borderRadius: '12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4,
                            boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
                            animation: 'slideInRight 0.3s ease-out',
                            background: t.type === 'surah'
                                ? 'color-mix(in srgb, #3b82f6 18%, var(--background-secondary))'
                                : t.type === 'part'
                                    ? 'color-mix(in srgb, var(--todo-part-purple) 18%, var(--background-secondary))'
                                    : t.type === 'similarity'
                                        ? 'color-mix(in srgb, var(--warning) 16%, var(--background-secondary))'
                                        : 'color-mix(in srgb, var(--danger) 16%, var(--background-secondary))',
                            border: '1px solid var(--border)',
                            color: 'var(--foreground)',
                            minWidth: '180px',
                            fontSize: '0.85rem',
                            pointerEvents: 'auto',
                            backdropFilter: 'blur(12px)',
                            opacity: 1
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                {t.type === 'similarity' ? <Brain size={18} /> : <Check size={18} />}
                                <span style={{ fontWeight: 600 }}>{t.message}</span>
                                {t.onUndo && (
                                    <button
                                        onClick={() => {
                                            t.onUndo?.();
                                            setToasts(prev => prev.filter(toast => toast.id !== t.id));
                                        }}
                                        style={{
                                            background: 'color-mix(in srgb, var(--foreground) 12%, transparent)',
                                            border: '1px solid color-mix(in srgb, var(--foreground) 12%, transparent)',
                                            color: 'inherit',
                                            padding: '0.2rem 0.5rem',
                                            borderRadius: '4px',
                                            fontSize: '0.7rem',
                                            cursor: 'pointer',
                                            marginLeft: 'auto'
                                        }}
                                    >
                                        Undo
                                    </button>
                                )}
                                <button
                                    onClick={() => {
                                        setToasts(prev => prev.filter(toast => toast.id !== t.id));
                                    }}
                                    style={{
                                        background: 'color-mix(in srgb, var(--foreground) 10%, transparent)',
                                        border: '1px solid color-mix(in srgb, var(--foreground) 10%, transparent)',
                                        color: 'inherit',
                                        padding: '0.2rem 0.5rem',
                                        borderRadius: '4px',
                                        fontSize: '0.7rem',
                                        cursor: 'pointer',
                                        marginLeft: t.onUndo ? 0 : 'auto'
                                    }}
                                >
                                    Skip
                                </button>
                            </div>
                            {t.info && (
                                <div style={{
                                    fontSize: '0.8rem',
                                    opacity: 0.9,
                                    paddingLeft: '28px',
                                    whiteSpace: 'pre-line'
                                }}>
                                    {t.info}
                                </div>
                            )}
                            <div
                                className="toast-countdown"
                                style={{
                                    background: 'color-mix(in srgb, var(--foreground) 20%, transparent)',
                                    ['--toast-duration' as any]: '6s'
                                }}
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
