'use client';

/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Image from 'next/image';
import Spinner from '@/components/ui/Spinner';
import { parseQuranJson, getSurah, getSurahsByPart } from '@/lib/quranData';
import { Verse, QuranPart, MemoryNode, AppSettings, getNodeDueDate } from '@/lib/types';
import {
    CheckCircle,
    BookOpen,
    EyeOff,
    ChevronDown,
    X,
    Check,
    Brain,
    ZoomIn,
    ZoomOut,
    Move,
    PenTool,
    RotateCcw,
    AlertCircle,
    Undo2,
    Redo2
} from 'lucide-react';
import dynamic from 'next/dynamic';
import MindmapViewer from '@/components/MindmapViewer';
import AudioPlayer from '@/components/AudioPlayer';
import {
    useInstantSettings,
    useInstantNodes,
    useInstantReviewLogs,
    useInstantReviewErrors,
    useInstantMindMaps,
    useInstantOptimization,
    useInstantListeningStats,
    useInstantListeningProgress,
} from '@/hooks/useInstantData';
import { reviewCard, getSchedulingPreview, createNewFSRSState } from '@/lib/fsrs';
import { optimizeWeights } from '../../actions';
import { surahAyahToAbsolute, hasMutashabihForAbsolute } from '@/lib/mutashabihat';
import { useTheme } from '@/components/ThemeProvider';

// Dynamic import of MindmapEditor to keep bundle size small and avoid SSR issues
const MindmapEditor = dynamic(() => import('@/components/MindmapEditor'), { ssr: false });


function splitIntoChunks(text: string, wordsPerChunk: number = 3): string[] {
    const words = text.split(/\s+/);
    if (words.length <= wordsPerChunk + 2) return [text];
    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += wordsPerChunk) {
        chunks.push(words.slice(i, i + wordsPerChunk).join(' '));
    }
    return chunks;
}

export default function TodayPage() {
    const { settings, saveSettings, isLoading: settingsLoading } = useInstantSettings();
    const { nodes, dueNodes, saveNode: updateInstantNode, isLoading: nodesLoading } = useInstantNodes();
    const { logs: reviewLogs, saveLog: saveInstantReviewLog } = useInstantReviewLogs();
    const { saveError: saveInstantReviewError, deleteError: removeInstantReviewError } = useInstantReviewErrors();
    const { mindmaps, partMindMaps, saveMindMap, savePartMindMap } = useInstantMindMaps();
    const { stats: listeningStats, saveStats: saveListeningStats, deleteStats: deleteListeningStats } = useInstantListeningStats();
    const { progress: listeningProgress, saveProgress: saveListeningProgress, deleteProgress: deleteListeningProgress } = useInstantListeningProgress();

    // Debug: Log nodes and due nodes
    useEffect(() => {
        console.log('Dashboard Debug:', {
            allNodes: dueNodes.length > 0 ? dueNodes.map(n => ({ id: n.id, type: n.type, surahId: n.surahId, partId: n.partId, scheduler: n.scheduler })) : 'no due nodes',
            dueNodesCount: dueNodes.length,
            totalNodes: dueNodes.length,
            dueNodesTypes: dueNodes.map(n => n.type)
        });
    }, [dueNodes]);

    const [allVerses, setAllVerses] = useState<Verse[]>([]);
    const [currentReviewIndex, setCurrentReviewIndex] = useState(0);
    const [revealedChunks, setRevealedChunks] = useState(0);
    const [currentVerseInReview, setCurrentVerseInReview] = useState(0);
    const [showGrading, setShowGrading] = useState(false);
    const [todaysPortion, setTodaysPortion] = useState<Verse[]>([]);
    const [currentVerseIndex, setCurrentVerseIndex] = useState(0);
    const [highlightedWordIndex, setHighlightedWordIndex] = useState<number>(-1);
    const [isVersesLoaded, setIsVersesLoaded] = useState(false);
    const [listeningComplete, setListeningComplete] = useState(false);
    const [readOnlyMode, setReadOnlyMode] = useState(true);
    const [viewState, setViewState] = useState({ reviewExpanded: true, dailyExpanded: true });
    const lastPortionKeyRef = useRef<string>('');

    // Local helper to find anchor for range using InstantDB mindmaps
    const findAnchorForRange = useCallback((surahId: number, start: number, end: number) => {
        const mindmap = mindmaps.find(m => m.surahId === surahId);
        if (!mindmap || !mindmap.anchors) return undefined;
        return (mindmap.anchors as any[]).find(a => a.startVerse === start && a.endVerse === end);
    }, [mindmaps]);

    // Order due nodes to keep mindmap + full-surah verses adjacent by surah
    const orderedDueNodes = useMemo(() => {
        if (!dueNodes.length) return [];

        const hasKanbanState = !!settings?.kanbanColumns && Object.keys(settings.kanbanColumns).length > 0;
        const completeIds = new Set<string>(hasKanbanState ? (settings?.kanbanColumns?.complete || []) : []);

        const filteredDueNodes = hasKanbanState
            ? dueNodes.filter(node => {
                if (node.type === 'mindmap') {
                    return completeIds.has(`surah-${node.surahId}`);
                }
                if (node.type === 'part_mindmap') {
                    return completeIds.has(`part-${node.partId}`);
                }
                if (node.type === 'verse_segment' && node.surahId) {
                    const mm = mindmaps.find(m => m.surahId === node.surahId);
                    const anchors = mm?.anchors || [];
                    if (anchors.length === 0) return false;
                    return anchors.some(a => a.startVerse === node.startVerse && a.endVerse === node.endVerse);
                }
                return true;
            })
            : dueNodes.filter(node => {
                if (node.type === 'verse_segment' && node.surahId) {
                    const mm = mindmaps.find(m => m.surahId === node.surahId);
                    const anchors = mm?.anchors || [];
                    if (anchors.length === 0) return false;
                    return anchors.some(a => a.startVerse === node.startVerse && a.endVerse === node.endVerse);
                }
                return true;
            });

        if (!filteredDueNodes.length) return [];

        const reviewSortOrder = settings?.reviewSortOrder ?? 'surah_grouped';
        if (reviewSortOrder === 'due_date') {
            const originalIndex = new Map<string, number>();
            filteredDueNodes.forEach((n, idx) => originalIndex.set(n.id, idx));
            return [...filteredDueNodes].sort((a, b) => {
                const aDue = getNodeDueDate(a);
                const bDue = getNodeDueDate(b);
                const aTime = aDue ? new Date(aDue).getTime() : 0;
                const bTime = bDue ? new Date(bDue).getTime() : 0;
                if (aTime !== bTime) return aTime - bTime;
                return (originalIndex.get(a.id) ?? 0) - (originalIndex.get(b.id) ?? 0);
            });
        }

        const originalIndex = new Map<string, number>();
        filteredDueNodes.forEach((n, idx) => originalIndex.set(n.id, idx));

        const surahGroups = new Map<number, { mindmap?: MemoryNode; fullSurah?: MemoryNode; others: MemoryNode[] }>();
        const otherNodes: MemoryNode[] = [];

        const isFullSurah = (node: MemoryNode) => {
            if (node.type !== 'verse_segment' || !node.surahId) return false;
            const surah = getSurah(node.surahId);
            if (!surah) return false;
            return node.startVerse === 1 && node.endVerse === surah.verseCount;
        };

        filteredDueNodes.forEach(node => {
            if (node.surahId) {
                if (!surahGroups.has(node.surahId)) {
                    surahGroups.set(node.surahId, { others: [] });
                }
                const group = surahGroups.get(node.surahId)!;
                if (node.type === 'mindmap') {
                    group.mindmap = node;
                } else if (isFullSurah(node)) {
                    group.fullSurah = node;
                } else {
                    group.others.push(node);
                }
            } else {
                otherNodes.push(node);
            }
        });

        const ordered: MemoryNode[] = [];
        const surahIds = Array.from(surahGroups.keys()).sort((a, b) => a - b);
        surahIds.forEach(surahId => {
            const group = surahGroups.get(surahId)!;
            if (group.mindmap) ordered.push(group.mindmap);
            if (group.fullSurah) ordered.push(group.fullSurah);
            if (group.others.length) {
                group.others.sort((a, b) => (originalIndex.get(a.id) ?? 0) - (originalIndex.get(b.id) ?? 0));
                ordered.push(...group.others);
            }
        });

        if (otherNodes.length) {
            otherNodes.sort((a, b) => (originalIndex.get(a.id) ?? 0) - (originalIndex.get(b.id) ?? 0));
            ordered.push(...otherNodes);
        }

        return ordered;
    }, [dueNodes, settings?.kanbanColumns, mindmaps, settings?.reviewSortOrder]);

    // Ensure completed Kanban items are represented in FSRS (full-surah review + mindmaps)
    useEffect(() => {
        const completedIds = settings?.kanbanColumns?.complete || [];
        if (completedIds.length === 0) return;

        const completedSurahIds = completedIds
            .filter(id => id.startsWith('surah-'))
            .map(id => parseInt(id.replace('surah-', ''), 10))
            .filter(id => Number.isFinite(id));

        const completedPartIds = completedIds
            .filter(id => id.startsWith('part-'))
            .map(id => parseInt(id.replace('part-', ''), 10) as QuranPart)
            .filter(id => Number.isFinite(id));

        const nodesToCreate: MemoryNode[] = [];

        completedSurahIds.forEach(surahId => {
            const surah = getSurah(surahId);
            if (!surah) return;

            const mindmapForAnchors = mindmaps.find(m => Number(m.surahId) === surahId);
            const anchors = mindmapForAnchors?.anchors || [];
            if (anchors.length > 0) {
                anchors.forEach(anchor => {
                    const anchorNodeExists = nodes.some(n =>
                        n.type === 'verse_segment' &&
                        n.surahId === surahId &&
                        n.startVerse === anchor.startVerse &&
                        n.endVerse === anchor.endVerse
                    );
                    if (!anchorNodeExists) {
                        nodesToCreate.push({
                            id: crypto.randomUUID(),
                            type: 'verse_segment',
                            surahId,
                            startVerse: anchor.startVerse,
                            endVerse: anchor.endVerse,
                            targetId: anchor.id,
                            scheduler: createNewFSRSState(),
                            createdAt: new Date().toISOString()
                        });
                    }
                });
            }

            const mindmapTargetId = `mindmap-${surahId}`;
            const mindmap = mindmaps.find(m => Number(m.surahId) === surahId);
            const mindmapNodeExists = nodes.some(n =>
                n.targetId === mindmapTargetId ||
                (n.type === 'mindmap' && n.surahId === surahId)
            );
            if (mindmap && !mindmapNodeExists) {
                nodesToCreate.push({
                    id: crypto.randomUUID(),
                    type: 'mindmap',
                    surahId,
                    targetId: mindmapTargetId,
                    scheduler: createNewFSRSState(),
                    createdAt: new Date().toISOString()
                });
            }
        });

        completedPartIds.forEach(partId => {
            const partTargetId = `part-mindmap-${partId}`;
            const partMindmap = partMindMaps.find(pm => Number(pm.partId) === partId);
            const partMindmapNodeExists = nodes.some(n =>
                n.targetId === partTargetId ||
                (n.type === 'part_mindmap' && n.partId === partId)
            );
            if (partMindmap && !partMindmapNodeExists) {
                nodesToCreate.push({
                    id: crypto.randomUUID(),
                    type: 'part_mindmap',
                    partId,
                    targetId: partTargetId,
                    scheduler: createNewFSRSState(),
                    createdAt: new Date().toISOString()
                });
            }
        });

        if (nodesToCreate.length > 0) {
            nodesToCreate.forEach(node => updateInstantNode(node));
        }
    }, [settings, nodes, mindmaps, partMindMaps, updateInstantNode]);

    const isLoaded = isVersesLoaded && !settingsLoading && !nodesLoading;

    // Theme detection
    const { theme } = useTheme();
    const [isDark, setIsDark] = useState(false);

    const verseContainerRef = useRef<HTMLDivElement>(null);
    const reviewScrollAnimRef = useRef<number | null>(null);

    const smoothScrollContainer = useCallback((container: HTMLElement, targetTop: number, duration: number = 550) => {
        if (reviewScrollAnimRef.current !== null) {
            cancelAnimationFrame(reviewScrollAnimRef.current);
            reviewScrollAnimRef.current = null;
        }

        const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
        const clampedTarget = Math.max(0, Math.min(targetTop, maxTop));
        const startTop = container.scrollTop;
        const startTime = performance.now();

        const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

        const step = (now: number) => {
            const elapsed = Math.min(1, (now - startTime) / duration);
            const eased = easeInOut(elapsed);
            container.scrollTop = startTop + (clampedTarget - startTop) * eased;
            if (elapsed < 1) {
                reviewScrollAnimRef.current = requestAnimationFrame(step);
            } else {
                reviewScrollAnimRef.current = null;
            }
        };

        reviewScrollAnimRef.current = requestAnimationFrame(step);
    }, []);

    useEffect(() => {
        if (highlightedWordIndex !== -1 && verseContainerRef.current) {
            const wordEl = document.getElementById(`word-${highlightedWordIndex}`);
            if (wordEl) {
                const container = verseContainerRef.current;
                const containerRect = container.getBoundingClientRect();
                const wordRect = wordEl.getBoundingClientRect();
                const padding = 12;
                const isOutOfView = wordRect.top < containerRect.top + padding || wordRect.bottom > containerRect.bottom - padding;
                if (isOutOfView) {
                    const offset = wordRect.top - containerRect.top;
                    const targetTop = container.scrollTop + offset - (container.clientHeight / 2) + (wordRect.height / 2);
                    smoothScrollContainer(container, targetTop);
                }
            }
        }
    }, [highlightedWordIndex, smoothScrollContainer]);

    useEffect(() => {
        const mode = settings?.dailyPortionMode ?? 'audio';
        setReadOnlyMode(mode === 'reading');
    }, [settings?.dailyPortionMode]);

    // Keep review index in sync with changing due queue to avoid blanks
    useEffect(() => {
        if (orderedDueNodes.length === 0) {
            setCurrentReviewIndex(0);
            setRevealedChunks(0);
            setCurrentVerseInReview(0);
            setShowGrading(false);
            return;
        }
        if (currentReviewIndex >= orderedDueNodes.length) {
            setCurrentReviewIndex(orderedDueNodes.length - 1);
            setRevealedChunks(0);
            setCurrentVerseInReview(0);
            setShowGrading(false);
        }
    }, [orderedDueNodes.length, currentReviewIndex]);

    useEffect(() => {
        if (theme === 'dark') {
            setIsDark(true);
        } else if (theme === 'light') {
            setIsDark(false);
        } else {
            // System
            if (typeof window !== 'undefined') {
                const mq = window.matchMedia('(prefers-color-scheme: dark)');
                setIsDark(mq.matches);
                const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
                mq.addEventListener('change', handler);
                return () => mq.removeEventListener('change', handler);
            }
        }
    }, [theme]);

    // Mindmap Editor States
    const [activeMindmapEditor, setActiveMindmapEditor] = useState<{ surahId: number; snapshot?: any } | null>(null);
    const [activePartEditor, setActivePartEditor] = useState<{ partId: QuranPart; snapshot?: any } | null>(null);

    const toggleSection = (section: 'review' | 'daily') => {
        setViewState(prev => {
            const isMobile = window.innerWidth < 768;

            // Disable folding on desktop
            if (!isMobile) return prev;

            if (section === 'review') {
                const newState = !prev.reviewExpanded;
                if (isMobile && newState) {
                    return { reviewExpanded: true, dailyExpanded: false };
                }
                return { ...prev, reviewExpanded: newState };
            } else {
                const newState = !prev.dailyExpanded;
                if (isMobile && newState) {
                    return { dailyExpanded: true, reviewExpanded: false };
                }
                return { ...prev, dailyExpanded: newState };
            }
        });
    };

    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth >= 768) {
                setViewState({ reviewExpanded: true, dailyExpanded: true });
            }
        };

        if (typeof window !== 'undefined') {
            if (window.innerWidth < 768) {
                // Initial state for mobile
                setViewState({ reviewExpanded: false, dailyExpanded: false });
            } else {
                // Initial state for desktop
                setViewState({ reviewExpanded: true, dailyExpanded: true });
            }
        }

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const [zoomImage, setZoomImage] = useState<string | null>(null);

    // Toast & Undo
    interface ToastItem {
        id: string;
        type: 'success' | 'error' | 'postpone';
        message: string;
        info?: string;
    }
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const lastToastRef = useRef<{ key: string; at: number } | null>(null);
    type ReviewUndoEntry = {
        kind: 'review';
        id: string;
        beforeNode: MemoryNode;
        afterNode: MemoryNode;
        beforeIndex: number;
        afterIndex: number;
        errorId?: string;
        errorPayload?: any;
        toastType: 'success' | 'error' | 'postpone';
        toastMessage: string;
        toastInfo?: string;
        createdAt: string;
    };

    type DailyUndoEntry = {
        kind: 'daily_complete';
        id: string;
        partId: number;
        beforeProgress: { lastVerseIndex: number; cycles: number } | null;
        afterProgress: { lastVerseIndex: number; cycles: number };
        beforeUpdatedAt?: string;
        afterUpdatedAt: string;
        beforeStats: Record<number, any | null>;
        afterStats: Record<number, any>;
        beforeListeningComplete: boolean;
        afterListeningComplete: boolean;
        toastType: 'success';
        toastMessage: string;
        toastInfo?: string;
        createdAt: string;
    };

    type UndoEntry = ReviewUndoEntry | DailyUndoEntry;
    const UNDO_STACK_STORAGE_KEY = 'review_undo_stack_v1';
    const REDO_STACK_STORAGE_KEY = 'review_redo_stack_v1';
    const UNDO_STACK_LIMIT = 10;

    const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
    const undoStackRef = useRef<UndoEntry[]>([]);
    const [redoStack, setRedoStack] = useState<UndoEntry[]>([]);
    const redoStackRef = useRef<UndoEntry[]>([]);

    useEffect(() => {
        const stored = localStorage.getItem(UNDO_STACK_STORAGE_KEY);
        if (!stored) return;
        try {
            const parsed = JSON.parse(stored) as UndoEntry[];
            if (Array.isArray(parsed)) {
                const normalized = parsed.filter((entry: any) => {
                    if (!entry?.kind) return false;
                    if (entry.kind === 'review') {
                        return entry.beforeNode && entry.afterNode && typeof entry.beforeIndex === 'number' && typeof entry.afterIndex === 'number';
                    }
                    if (entry.kind === 'daily_complete') {
                        return typeof entry.partId === 'number' && entry.afterProgress && entry.beforeStats && entry.afterStats;
                    }
                    return false;
                }) as UndoEntry[];
                const trimmed = normalized.slice(-UNDO_STACK_LIMIT);
                setUndoStack(trimmed);
                undoStackRef.current = trimmed;
            }
        } catch (e) {
            console.warn('Failed to load undo history', e);
        }
    }, []);

    useEffect(() => {
        const stored = localStorage.getItem(REDO_STACK_STORAGE_KEY);
        if (!stored) return;
        try {
            const parsed = JSON.parse(stored) as UndoEntry[];
            if (Array.isArray(parsed)) {
                const normalized = parsed.filter((entry: any) => {
                    if (!entry?.kind) return false;
                    if (entry.kind === 'review') {
                        return entry.beforeNode && entry.afterNode && typeof entry.beforeIndex === 'number' && typeof entry.afterIndex === 'number';
                    }
                    if (entry.kind === 'daily_complete') {
                        return typeof entry.partId === 'number' && entry.afterProgress && entry.beforeStats && entry.afterStats;
                    }
                    return false;
                }) as UndoEntry[];
                const trimmed = normalized.slice(-UNDO_STACK_LIMIT);
                setRedoStack(trimmed);
                redoStackRef.current = trimmed;
            }
        } catch (e) {
            console.warn('Failed to load redo history', e);
        }
    }, []);

    const persistUndoStack = useCallback((nextStack: UndoEntry[]) => {
        undoStackRef.current = nextStack;
        setUndoStack(nextStack);
        try {
            localStorage.setItem(UNDO_STACK_STORAGE_KEY, JSON.stringify(nextStack));
        } catch (e) {
            console.warn('Failed to persist undo history', e);
        }
    }, []);

    const persistRedoStack = useCallback((nextStack: UndoEntry[]) => {
        redoStackRef.current = nextStack;
        setRedoStack(nextStack);
        try {
            localStorage.setItem(REDO_STACK_STORAGE_KEY, JSON.stringify(nextStack));
        } catch (e) {
            console.warn('Failed to persist redo history', e);
        }
    }, []);

    const clearRedoStack = useCallback(() => {
        persistRedoStack([]);
    }, [persistRedoStack]);

    const pushUndoEntry = useCallback((entry: UndoEntry) => {
        const nextStack = [...undoStackRef.current, entry].slice(-UNDO_STACK_LIMIT);
        persistUndoStack(nextStack);
        clearRedoStack();
    }, [persistUndoStack, clearRedoStack]);

    const addToast = useCallback((type: 'success' | 'error' | 'postpone', message: string, info?: string) => {
        const key = `${type}|${message}|${info || ''}`;
        const now = Date.now();
        if (lastToastRef.current && lastToastRef.current.key === key && now - lastToastRef.current.at < 500) {
            return;
        }
        lastToastRef.current = { key, at: now };
        const id = Math.random().toString(36).substring(2, 9);
        setToasts(prev => [...prev, { id, type, message, info }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 6000);
    }, []);

    // FSRS Optimization Check
    const { meta: optimizationMeta, weights: customWeights, saveMeta: saveOptimizationMeta, saveWeights: saveCustomWeights } = useInstantOptimization();

    useEffect(() => {
        const checkOptimization = async () => {
            const count = reviewLogs.length;

            // Optimization triggers when over 400 new review logs (since last optimization)
            // Minimum 400 logs total required for first optimization
            if (count >= (optimizationMeta.logCountAtLastOptimization || 0) + 400) {
                addToast('success', 'Optimizing FSRS...', 'Analyzing your review history...');

                try {
                    // Map logs to match ReviewLogInput interface
                    const formattedLogs = reviewLogs.map(log => ({
                        nodeId: log.nodeId,
                        rating: (log.rating === 'Good' || log.rating === 3) ? 3 : 1, // Map string/number rating to FSRS number
                        elapsed_days: log.elapsed_days,
                        review: log.timestamp || new Date().toISOString() // Use timestamp as review date
                    }));

                    const result = await optimizeWeights(formattedLogs);

                    if (result.success && result.weights) {
                        saveCustomWeights(result.weights);
                        saveOptimizationMeta({
                            ...optimizationMeta,
                            logCountAtLastOptimization: count,
                            lastOptimizedAt: new Date().toISOString()
                        });
                        addToast('success', 'Optimization Complete', 'FSRS parameters updated based on your performance.');
                    } else {
                        console.error('Optimization failed:', result.error);
                    }
                } catch (err) {
                    console.error('Optimization error:', err);
                }
            }
        };

        const timer = setTimeout(checkOptimization, 5000); // 5s delay to not block initial render/data load
        return () => clearTimeout(timer);
    }, [addToast, reviewLogs, optimizationMeta, saveCustomWeights, saveOptimizationMeta]);

    const targetBoxRef = useRef<HTMLDivElement>(null);

    // Load data
    useEffect(() => {
        async function load() {
            // Check session storage first
            const cached = sessionStorage.getItem('quran_verses_cache_v2');
            if (cached) {
                setAllVerses(JSON.parse(cached));
                setIsVersesLoaded(true);
                return;
            }

            try {
                const response = await fetch('/qpc-hafs-word-by-word.json');
                const data = await response.json() as Record<string, any>;
                const verses = parseQuranJson(data);
                setAllVerses(verses);
                setIsVersesLoaded(true);

                try {
                    sessionStorage.setItem('quran_verses_cache_v2', JSON.stringify(verses));
                } catch (e) {
                    console.warn('Failed to cache verses in sessionStorage', e);
                }
            } catch (_e) {
                try {
                    if ('caches' in window) {
                        const cachedRes = await caches.match('/qpc-hafs-word-by-word.json');
                        if (cachedRes) {
                            const data = await cachedRes.json() as Record<string, any>;
                            const verses = parseQuranJson(data);
                            setAllVerses(verses);
                            setIsVersesLoaded(true);
                            return;
                        }
                    }
                } catch (e) {
                    console.warn('Failed to load verses from cache', e);
                }
                setAllVerses([]);
                setIsVersesLoaded(true);
            }
        }
        load();
    }, []);



    // Calculate today's portion (preserve per-part listening progress)
    const portionData = useMemo(() => {
        if (allVerses.length === 0 || !settings) return { portion: [], startVerseIndex: 0, versesPerDay: 0, totalVerses: 0 };

        const isSurahSkipped = (surahId: number, settings: AppSettings) => {
            return settings.skippedSurahs?.includes(surahId) || false;
        };

        const surahsInPart = getSurahsByPart(settings.activePart).filter(s => !isSurahSkipped(s.id, settings));
        if (surahsInPart.length === 0) return { portion: [], startVerseIndex: 0, versesPerDay: 0, totalVerses: 0 };

        // Flatten verses - optimized filter
        const activeSurahIds = new Set(surahsInPart.map(s => s.id));
        const allVersesInPart = allVerses.filter(v => activeSurahIds.has(v.surahId));

        const totalVerses = allVersesInPart.length;
        if (totalVerses === 0) return { portion: [], startVerseIndex: 0, versesPerDay: 0, totalVerses: 0 };

        const versesPerDay = Math.ceil(totalVerses / settings.completionDays);

        // Use InstantDB listening progress
        const partProgress = listeningProgress.find(p => p.partId === settings.activePart);
        const startIdx = partProgress?.lastVerseIndex || 0;
        let endIdx = startIdx + versesPerDay;

        // Intelligent Division: Merge short trailing surah segments
        if (endIdx < totalVerses) {
            const lastVerseInProposed = allVersesInPart[endIdx - 1];
            const nextVerse = allVersesInPart[endIdx];
            if (nextVerse && nextVerse.surahId === lastVerseInProposed.surahId) {
                // Check how many are left in this surah
                let i = endIdx;
                let remainingCount = 0;
                let remainingLength = 0;
                while (i < totalVerses && allVersesInPart[i].surahId === lastVerseInProposed.surahId) {
                    remainingCount++;
                    remainingLength += allVersesInPart[i].text.length;
                    i++;
                }
                // If <= 5 verses or total text is short (< 400 chars)
                if (remainingCount <= 5 || remainingLength < 400) {
                    // Ignore surahs with very long verses (e.g. Baqarah 282)
                    const surahVerses = allVersesInPart.filter(v => v.surahId === lastVerseInProposed.surahId);
                    const hasVeryLongVerses = surahVerses.some(v => v.text.length > 600);

                    if (!hasVeryLongVerses) {
                        endIdx = i;
                    }
                }
            }
        }

        let portion: Verse[];
        if (endIdx <= totalVerses) {
            portion = allVersesInPart.slice(startIdx, endIdx);
        } else {
            // Handle wrap-around
            portion = [...allVersesInPart.slice(startIdx), ...allVersesInPart.slice(0, endIdx - totalVerses)];
        }

        return {
            portion,
            startVerseIndex: 0,
            versesPerDay,
            totalVerses,
            lastUpdateAt: partProgress?.updatedAt
        };
    }, [allVerses, settings, listeningProgress]);

    useEffect(() => {
        if (!portionData.lastUpdateAt) return;
        const lastUpdate = new Date(portionData.lastUpdateAt);
        const now = new Date();
        if (lastUpdate.toDateString() === now.toDateString()) {
            setListeningComplete(true);
        }
    }, [portionData.lastUpdateAt]);

    useEffect(() => {
        if (!portionData.portion.length) {
            lastPortionKeyRef.current = '';
            setTodaysPortion([]);
            setCurrentVerseIndex(0);
            return;
        }

        const first = portionData.portion[0];
        const last = portionData.portion[portionData.portion.length - 1];
        const portionKey = `${first.surahId}:${first.ayahId}-${last.surahId}:${last.ayahId}-${portionData.portion.length}`;

        if (portionKey !== lastPortionKeyRef.current) {
            lastPortionKeyRef.current = portionKey;
            setTodaysPortion(portionData.portion);
            setCurrentVerseIndex(portionData.startVerseIndex);
        }
    }, [portionData]);



    // Grade review
    const handleGrade = useCallback((remembered: boolean) => {
        const node = orderedDueNodes[currentReviewIndex];
        if (!node || !node.scheduler) return;

        const errorId = !remembered ? crypto.randomUUID() : undefined;
        let errorPayload: any | undefined;
        const info = node.type === 'part_mindmap' ? `Part ${node.partId}` :
            node.type === 'mindmap' ? getSurah(node.surahId!)?.arabicName :
                `${getSurah(node.surahId!)?.arabicName} (${node.startVerse}-${node.endVerse})`;

        const toastType = remembered ? 'success' : 'error';
        const toastMessage = remembered ? 'Remembered' : 'Forgot';

        // Use FSRS algorithm
        const customWeightsFromInstant = customWeights;
        const result = reviewCard(node.scheduler as any, remembered, node.id, customWeightsFromInstant);
        const afterNode = { ...node, scheduler: result.newState };

        // Save updated node with new FSRS state
        updateInstantNode(afterNode);

        // Sanitize log to remove undefined and convert types
        const stateToNumber = (state: string): number => {
            switch (state) {
                case 'New': return 0;
                case 'Learning': return 1;
                case 'Review': return 2;
                case 'Relearning': return 3;
                default: return 0;
            }
        };

        const logToSave = JSON.parse(JSON.stringify({
            ...result.log,
            rating: result.log.rating === 'Good' ? 3 : 1,
            state: stateToNumber(result.log.state),
            // Map timestamp to review_time to match schema
            review_time: result.log.timestamp
        }));
        // Remove recursion/circular or just simple undefined removal
        Object.keys(logToSave).forEach(key => logToSave[key] === undefined && delete logToSave[key]);
        // Remove timestamp field since it's not in the schema
        delete logToSave.timestamp;
        saveInstantReviewLog(logToSave);

        if (!remembered) {
            const errorToSave: any = {
                id: errorId!,
                timestamp: new Date().toISOString(),
                nodeId: node.id,
                nodeType: node.type,
                grade: 1,
            };

            // Add optional fields only if they exist
            if (node.surahId !== undefined) errorToSave.surahId = node.surahId;
            if (node.partId !== undefined) errorToSave.partId = node.partId;
            if (node.startVerse !== undefined) errorToSave.startVerse = node.startVerse;
            if (node.endVerse !== undefined) errorToSave.endVerse = node.endVerse;

            const anchor = (node.startVerse !== undefined && node.endVerse !== undefined)
                ? findAnchorForRange(node.surahId!, node.startVerse, node.endVerse)
                : undefined;

            if (anchor?.label) errorToSave.anchorLabel = anchor.label;
            if (anchor?.id) errorToSave.anchorId = anchor.id;

            const abs = node.startVerse && node.surahId ? surahAyahToAbsolute(node.surahId, node.startVerse) : undefined;
            if (abs !== undefined) errorToSave.absoluteAyah = abs;

            errorPayload = errorToSave;
            saveInstantReviewError(errorToSave);
        }

        const afterIndex = currentReviewIndex < orderedDueNodes.length - 1 ? currentReviewIndex + 1 : currentReviewIndex;

        // Save state for undo BEFORE updating
        pushUndoEntry({
            kind: 'review',
            id: crypto.randomUUID(),
            beforeNode: JSON.parse(JSON.stringify(node)), // Deep copy original
            afterNode: JSON.parse(JSON.stringify(afterNode)),
            beforeIndex: currentReviewIndex,
            afterIndex,
            errorId,
            errorPayload,
            toastType,
            toastMessage,
            toastInfo: info,
            createdAt: new Date().toISOString()
        });

        addToast(toastType, toastMessage, info);

        if (currentReviewIndex < orderedDueNodes.length - 1) {
            setCurrentReviewIndex(prev => prev + 1);
            // Move to next item - stay hidden until clicked
            setRevealedChunks(0);
            setCurrentVerseInReview(0);
            setShowGrading(false);
        } else {
            // All done for now
        }
    }, [orderedDueNodes, currentReviewIndex, addToast, customWeights, updateInstantNode, saveInstantReviewLog, saveInstantReviewError]);

    const handlePostpone = useCallback(() => {
        const node = orderedDueNodes[currentReviewIndex];
        if (!node || !node.scheduler) return;

        const info = node.type === 'part_mindmap' ? `Part ${node.partId}` :
            node.type === 'mindmap' ? getSurah(node.surahId!)?.arabicName :
                `${getSurah(node.surahId!)?.arabicName} (${node.startVerse}-${node.endVerse})`;

        // Postpone by 1 day
        const scheduler = node.scheduler as any;
        const due = new Date(scheduler.due || scheduler.dueDate || new Date());
        due.setDate(due.getDate() + 1);

        const afterNode = {
            ...node,
            scheduler: {
                ...scheduler,
                due: due.toISOString()
            }
        };

        updateInstantNode(afterNode);

        const afterIndex = currentReviewIndex < orderedDueNodes.length - 1 ? currentReviewIndex + 1 : currentReviewIndex;

        pushUndoEntry({
            kind: 'review',
            id: crypto.randomUUID(),
            beforeNode: JSON.parse(JSON.stringify(node)),
            afterNode: JSON.parse(JSON.stringify(afterNode)),
            beforeIndex: currentReviewIndex,
            afterIndex,
            toastType: 'postpone',
            toastMessage: 'Postponed to tomorrow',
            toastInfo: info,
            createdAt: new Date().toISOString()
        });

        addToast('postpone', 'Postponed to tomorrow', info);

        if (currentReviewIndex < orderedDueNodes.length - 1) {
            setCurrentReviewIndex(prev => prev + 1);
            setRevealedChunks(0);
            setCurrentVerseInReview(0);
            setShowGrading(false);
        } else {
            // All done for now
        }
    }, [orderedDueNodes, currentReviewIndex, addToast, updateInstantNode]);

    const handleUndo = useCallback((source: 'toast' | 'keyboard', toastId?: string) => {
        const stack = undoStackRef.current;
        if (!stack.length) return;
        const last = stack[stack.length - 1];
        const nextStack = stack.slice(0, -1);
        persistUndoStack(nextStack);
        const nextRedo = [...redoStackRef.current, last].slice(-UNDO_STACK_LIMIT);
        persistRedoStack(nextRedo);

        if (last.kind === 'review') {
            updateInstantNode(last.beforeNode);
            if (last.errorId) {
                removeInstantReviewError(last.errorId);
            }
            setCurrentReviewIndex(last.beforeIndex);
            setRevealedChunks(0);
            setCurrentVerseInReview(0);
            setShowGrading(true); // Return to grading view of the undone card
        } else {
            if (last.beforeProgress) {
                saveListeningProgress(last.partId, last.beforeProgress.lastVerseIndex, last.beforeProgress.cycles, last.beforeUpdatedAt);
            } else {
                deleteListeningProgress(last.partId);
            }
            Object.entries(last.beforeStats).forEach(([surahIdStr, stats]) => {
                const surahId = Number(surahIdStr);
                if (!Number.isFinite(surahId)) return;
                if (stats) {
                    saveListeningStats(surahId, stats);
                } else {
                    deleteListeningStats(surahId);
                }
            });
            setListeningComplete(last.beforeListeningComplete);
        }
        if (source === 'toast' && toastId) {
            setToasts(prev => prev.filter(t => t.id !== toastId));
        }
        addToast(last.toastType, `Undid ${last.toastMessage}`, last.toastInfo);
    }, [persistUndoStack, persistRedoStack, updateInstantNode, removeInstantReviewError, addToast, saveListeningProgress, deleteListeningProgress, saveListeningStats, deleteListeningStats]);

    const handleRedo = useCallback((source: 'toast' | 'keyboard', toastId?: string) => {
        const stack = redoStackRef.current;
        if (!stack.length) return;
        const last = stack[stack.length - 1];
        const nextStack = stack.slice(0, -1);
        persistRedoStack(nextStack);
        const nextUndo = [...undoStackRef.current, last].slice(-UNDO_STACK_LIMIT);
        persistUndoStack(nextUndo);

        if (last.kind === 'review') {
            updateInstantNode(last.afterNode);
            if (last.errorPayload) {
                saveInstantReviewError(last.errorPayload);
            }
            setCurrentReviewIndex(last.afterIndex);
            setRevealedChunks(0);
            setCurrentVerseInReview(0);
            setShowGrading(false);
        } else {
            saveListeningProgress(last.partId, last.afterProgress.lastVerseIndex, last.afterProgress.cycles, last.afterUpdatedAt);
            Object.entries(last.afterStats).forEach(([surahIdStr, stats]) => {
                const surahId = Number(surahIdStr);
                if (!Number.isFinite(surahId)) return;
                saveListeningStats(surahId, stats);
            });
            setListeningComplete(last.afterListeningComplete);
        }
        if (source === 'toast' && toastId) {
            setToasts(prev => prev.filter(t => t.id !== toastId));
        }
        addToast(last.toastType, `Redid ${last.toastMessage}`, last.toastInfo);
    }, [persistRedoStack, persistUndoStack, updateInstantNode, saveInstantReviewError, addToast, saveListeningProgress, saveListeningStats]);


    const handleCompleteListening = () => {
        if (!settings) return;

        // Use InstantDB listening progress
        const partProgress = listeningProgress.find(p => p.partId === settings.activePart);
        const current = partProgress?.lastVerseIndex || 0;
        const totalInPart = portionData.totalVerses;

        let next = current + portionData.versesPerDay;
        let cycles = partProgress?.cycles || 0;

        // If we reach or exceed the end of the part, increment cycles and wrap around
        if (next >= totalInPart) {
            next = next % totalInPart;
            cycles += 1;
        }

        const beforeProgress = partProgress
            ? { lastVerseIndex: partProgress.lastVerseIndex, cycles: partProgress.cycles || 0 }
            : null;
        const beforeUpdatedAt = partProgress?.updatedAt;
        const afterProgress = { lastVerseIndex: next, cycles };
        const afterUpdatedAt = new Date().toISOString();

        saveListeningProgress(settings.activePart, next, cycles, afterUpdatedAt);

        // Update stats for each surah in the portion
        const surahsInPortion = new Set(todaysPortion.map(v => v.surahId));
        const beforeStats: Record<number, any | null> = {};
        const afterStats: Record<number, any> = {};
        const nowIso = afterUpdatedAt;

        surahsInPortion.forEach(surahId => {
            const existing = listeningStats.find(s => s.surahId === surahId);
            if (existing) {
                const { id, userId, ...rest } = existing as any;
                beforeStats[surahId] = rest;
            } else {
                beforeStats[surahId] = null;
            }

            const nextStats = {
                ...(existing || {}),
                totalMinutes: (existing?.totalMinutes || 0) + 5, // Assume 5 mins per portion per surah for now
                lastListened: nowIso
            };

            const { id, userId, ...restNext } = nextStats as any;
            afterStats[surahId] = restNext;

            saveListeningStats(surahId, {
                ...restNext,
                surahId
            });
        });

        pushUndoEntry({
            kind: 'daily_complete',
            id: crypto.randomUUID(),
            partId: settings.activePart,
            beforeProgress,
            afterProgress,
            beforeUpdatedAt,
            afterUpdatedAt,
            beforeStats,
            afterStats,
            beforeListeningComplete: listeningComplete,
            afterListeningComplete: true,
            toastType: 'success',
            toastMessage: 'Completed daily portion',
            createdAt: nowIso
        });

        setListeningComplete(true);
    };

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            const isUndo = (e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z';
            const isRedo = (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'z';
            if (!isUndo && !isRedo) return;
            const target = e.target as HTMLElement | null;
            if (target) {
                const tag = target.tagName.toLowerCase();
                if (tag === 'input' || tag === 'textarea' || (target as HTMLElement).isContentEditable) {
                    return;
                }
            }
            e.preventDefault();
            if (isRedo) {
                handleRedo('keyboard');
            } else {
                handleUndo('keyboard');
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [handleUndo, handleRedo]);

    // Get content
    const getCurrentReviewContent = () => {
        if (orderedDueNodes.length === 0 || currentReviewIndex >= orderedDueNodes.length) return null;
        const node = orderedDueNodes[currentReviewIndex];

        if (node.type === 'part_mindmap') {
            const pm = partMindMaps.find(m => m.partId === node.partId);
            return { type: 'part_mindmap', partId: node.partId, mindmap: pm };
        } else if (node.type === 'mindmap') {
            const s = getSurah(node.surahId!);
            const m = mindmaps.find(mm => mm.surahId === node.surahId);

            // For mindmap reviews, include verses from anchors for gradual revelation
            const verses: Verse[] = [];
            if (m?.anchors?.length) {
                // Get all verses from all anchors
                m.anchors.forEach(anchor => {
                    for (let ayahId = anchor.startVerse; ayahId <= anchor.endVerse; ayahId++) {
                        const verse = allVerses.find(v => v.surahId === anchor.surahId && v.ayahId === ayahId);
                        if (verse) verses.push(verse);
                    }
                });
            }

            return { type: 'mindmap', surah: s, mindmap: m, verses };
        } else {
            const s = getSurah(node.surahId!);
            const vs = allVerses.filter(v => v.surahId === node.surahId && v.ayahId >= (node.startVerse || 1) && v.ayahId <= (node.endVerse || 999));

            // Context with mutashabihat-aware expansion
            const contextVerses: Verse[] = [];
            const start = node.startVerse || 1;
            let lookback = 1;
            while (contextVerses.length < 2 || (contextVerses.length < 5 && hasMutashabihForAbsolute(surahAyahToAbsolute(node.surahId!, start - lookback + 1)))) {
                const candidate = allVerses.find(v => v.surahId === node.surahId && v.ayahId === start - lookback);
                if (!candidate) break;
                contextVerses.unshift(candidate);
                const abs = surahAyahToAbsolute(candidate.surahId, candidate.ayahId);
                if (!hasMutashabihForAbsolute(abs) && contextVerses.length >= 2) break;
                lookback++;
            }

            return { type: 'verse', surah: s, verses: vs, contextVerses };
        }
    };

    const reviewContent = getCurrentReviewContent();
    const activeContent = reviewContent;

    // Reveal Logic
    const getCurrentVerseChunks = () => {
        if (!activeContent || !activeContent.verses || !activeContent.verses.length) return [];
        const v = activeContent.verses[currentVerseInReview];
        return splitIntoChunks(v.text);
    };

    const verseChunks = getCurrentVerseChunks();
    const totalChunks = verseChunks.length;
    const totalVerses = activeContent?.verses?.length || 0;

    const verseChunkMap = activeContent?.verses?.map(v => splitIntoChunks(v.text)) || [];

    const handleRevealNext = useCallback(() => {
        if (activeContent && (activeContent.type === 'mindmap' || activeContent.type === 'part_mindmap')) {
            setShowGrading(true);
            return;
        }
        if (revealedChunks < totalChunks) {
            setRevealedChunks(prev => prev + 1);
        } else if (currentVerseInReview < totalVerses - 1) {
            setCurrentVerseInReview(prev => prev + 1);
            setRevealedChunks(1); // One click moves and reveals first chunk
        } else {
            // For mindmap reviews, after all verses are revealed, show the mindmap
            if (activeContent?.type === 'mindmap' && activeContent.verses && activeContent.verses.length > 0 && !showGrading) {
                setShowGrading(true); // Show the mindmap after verses
            } else {
                setShowGrading(true);
            }
        }
    }, [revealedChunks, totalChunks, currentVerseInReview, totalVerses, activeContent, showGrading]);

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Check if we have any items to review
            const hasItems = orderedDueNodes.length > 0;
            if (!hasItems) return;

            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            if (showGrading) {
                if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    handlePostpone();
                } else if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    handleGrade(true);
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    handleGrade(false);
                }
            } else {
                if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    handleRevealNext();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [orderedDueNodes, showGrading, handlePostpone, handleGrade, handleRevealNext]);

    useEffect(() => {
        if (!targetBoxRef.current) return;

        requestAnimationFrame(() => {
            if (!targetBoxRef.current) return;
            const container = targetBoxRef.current;
            const containerHeight = container.offsetHeight;
            const activeVerse = container.querySelector('.active-verse') as HTMLElement | null;

            if (activeVerse) {
                const textEl = activeVerse.querySelector('.grouped-verse-text') as HTMLElement | null;
                const visibleChunks = textEl
                    ? Array.from(textEl.children).filter(el => !el.classList.contains('blurred-chunk')) as HTMLElement[]
                    : [];
                const lastRevealed = visibleChunks[visibleChunks.length - 1] || activeVerse;

                const targetEl = lastRevealed || activeVerse;
                const nextChunkEl = textEl?.querySelector('.next-blur') as HTMLElement | null;
                const nextVerseEl = activeVerse.nextElementSibling as HTMLElement | null;
                const nextVerseBlock = nextVerseEl && nextVerseEl.classList.contains('grouped-verse-block') ? nextVerseEl : null;
                const containerRect = container.getBoundingClientRect();
                const targetRect = targetEl.getBoundingClientRect();
                const nextRect = nextChunkEl?.getBoundingClientRect();
                const nextVerseRect = nextVerseBlock?.getBoundingClientRect();
                const styles = window.getComputedStyle(container);
                const paddingBottom = Number.parseFloat(styles.paddingBottom || '0') || 0;
                const paddingTop = Number.parseFloat(styles.paddingTop || '0') || 0;
                const marginTop = Math.max(8, paddingTop);
                const marginBottom = Math.max(24, paddingBottom);

                const targetTop = targetRect.top - containerRect.top;
                const targetBottom = targetRect.bottom - containerRect.top;
                const nextTop = nextRect ? nextRect.top - containerRect.top : targetTop;
                const nextBottom = nextRect ? nextRect.bottom - containerRect.top : targetBottom;
                const nextVerseTop = nextVerseRect ? nextVerseRect.top - containerRect.top : targetTop;
                const nextVerseBottom = nextVerseRect ? nextVerseRect.bottom - containerRect.top : targetBottom;
                const combinedTop = Math.min(targetTop, nextTop, nextVerseTop);
                const combinedBottom = Math.max(targetBottom, nextBottom, nextVerseBottom);

                if (combinedTop < marginTop || combinedBottom > containerHeight - marginBottom) {
                    let desiredTop = container.scrollTop;
                    if (combinedTop < marginTop) {
                        desiredTop = container.scrollTop + combinedTop - marginTop;
                    } else if (combinedBottom > containerHeight - marginBottom) {
                        desiredTop = container.scrollTop + (combinedBottom - containerHeight + marginBottom);
                    }
                    smoothScrollContainer(container, desiredTop, 420);
                }
                return;
            }

            if (showGrading) {
                smoothScrollContainer(container, container.scrollHeight, 420);
            }
        });
    }, [revealedChunks, currentVerseInReview, showGrading, smoothScrollContainer]);

    // Move isLoaded check to AFTER all hooks
    const moveMindmapToInProgress = async (itemId: string) => {
        if (!settings) return;
        const prevCols = settings.kanbanColumns || {};
        const nextCols: Record<string, string[]> = {};

        Object.entries(prevCols).forEach(([colId, items]) => {
            nextCols[colId] = (items || []).filter(id => id !== itemId);
        });

        const inProgress = nextCols['in-progress'] || [];
        if (!inProgress.includes(itemId)) {
            inProgress.push(itemId);
        }
        nextCols['in-progress'] = inProgress;

        await saveSettings({ kanbanColumns: nextCols });
    };

    const handleMindmapIncomplete = async (surahId: number) => {
        if (!window.confirm("Are you sure you want to mark this mindmap as INCOMPLETE? It will be removed from the review section until you mark it as complete again.")) return;

        const mm = mindmaps.find(m => m.surahId === surahId);
        if (mm) {
            const updated = { ...mm, isComplete: false };
            try {
                await saveMindMap(surahId, updated);
                await moveMindmapToInProgress(`surah-${surahId}`);
            } catch (err) {
                console.error('Failed to mark mindmap incomplete', err);
            }
        }
    };

    const handlePartMindmapIncomplete = async (partId: QuranPart) => {
        if (!window.confirm("Are you sure you want to mark this part mindmap as INCOMPLETE? It will be removed from the review section until you mark it as complete again.")) return;

        const mm = partMindMaps.find(m => m.partId === partId);
        if (mm) {
            const updated = { ...mm, isComplete: false };
            try {
                await savePartMindMap(partId, updated);
                await moveMindmapToInProgress(`part-${partId}`);
            } catch (err) {
                console.error('Failed to mark part mindmap incomplete', err);
            }
        }
    };

    const handleMindmapEditorSave = useCallback(async (snapshot: any, _images?: { light?: Blob, dark?: Blob }, shouldClose: boolean = true) => {
        if (!activeMindmapEditor) return;
        const { surahId } = activeMindmapEditor;

        const existing = mindmaps.find(m => m.surahId === surahId);
        const newMindMap = {
            ...existing,
            surahId,
            imageUrl: undefined,
            imageUrlDark: undefined,
            tldrawSnapshot: snapshot,
            isComplete: true // If we are editing and saving, we assume it's part of completion flow or just an update
        };
        saveMindMap(surahId, newMindMap);
        if (shouldClose) {
            setActiveMindmapEditor(null);
        }
    }, [activeMindmapEditor, mindmaps, saveMindMap]);

    const handlePartMindmapEditorSave = useCallback(async (snapshot: any, _images?: { light?: Blob, dark?: Blob }, shouldClose: boolean = true) => {
        if (!activePartEditor) return;
        const { partId } = activePartEditor;

        const existing = partMindMaps.find(m => m.partId === partId);
        const newMindMap = {
            ...existing,
            partId,
            imageUrl: undefined,
            imageUrlDark: undefined,
            tldrawSnapshot: snapshot,
            isComplete: true
        };
        savePartMindMap(partId, newMindMap);
        if (shouldClose) {
            setActivePartEditor(null);
        }
    }, [activePartEditor, partMindMaps, savePartMindMap]);

    if (!isLoaded) return <div className="content-wrapper flex items-center justify-center h-full"><Spinner text="Loading..." /></div>;

    return (
        <div className="content-wrapper tab-content">
            {activeMindmapEditor && (
                <MindmapEditor
                    title={`Edit ${getSurah(activeMindmapEditor.surahId)?.name} Mindmap`}
                    initialSnapshot={activeMindmapEditor.snapshot}
                    onSave={handleMindmapEditorSave}
                    onClose={() => setActiveMindmapEditor(null)}
                />
            )}
            {activePartEditor && (
                <MindmapEditor
                    title={`Edit Part ${activePartEditor.partId} Mindmap`}
                    initialSnapshot={activePartEditor.snapshot}
                    onSave={handlePartMindmapEditorSave}
                    onClose={() => setActivePartEditor(null)}
                />
            )}
            <div className="today-header hidden md:flex">
                <h1 className="text-2xl font-bold">Today</h1>
                <div className="today-header-actions">
                    <button
                        className="today-header-btn"
                        onClick={() => handleUndo('keyboard')}
                        disabled={undoStack.length === 0}
                        title="Undo (⌘/Ctrl+Z)"
                        aria-label="Undo"
                    >
                        <Undo2 size={16} />
                    </button>
                    <button
                        className="today-header-btn"
                        onClick={() => handleRedo('keyboard')}
                        disabled={redoStack.length === 0}
                        title="Redo (⌘/Ctrl+Shift+Z)"
                        aria-label="Redo"
                    >
                        <Redo2 size={16} />
                    </button>
                </div>
            </div>

            <div className="today-grid">
                {/* Reviews Col */}
                <div className="card">
                    <div className="collapsible-header" onClick={() => toggleSection('review')}>
                        <div className="flex items-center gap-2 text-base font-semibold mb-3 text-foreground"><CheckCircle size={20} /><span>Reviews</span></div>
                        <div className="flex items-center gap-2">
                            <span className={`collapse-icon ${viewState.reviewExpanded ? 'open' : ''}`}><ChevronDown size={20} /></span>
                        </div>
                    </div>

                    {viewState.reviewExpanded && (
                        <div className="review-section-content">
                            <div className="today-card-content">
                                {/* Empty state */}
                                {orderedDueNodes.length === 0 ? (
                                    <div className="empty-state">
                                        <CheckCircle size={40} className="empty-icon" />
                                        <p>No reviews due!</p>
                                    </div>
                                ) : activeContent && (
                                    <div style={{ paddingTop: '0.5rem' }}>
                                        {/* Header */}
                                        <p style={{ fontSize: '0.75rem', color: 'var(--foreground-secondary)', marginBottom: '0.5rem' }}>
                                            {`${currentReviewIndex + 1}`} • {
                                                activeContent.type === 'part_mindmap' ? `Part ${activeContent.partId} Mindmap` :
                                                    activeContent.type === 'mindmap' ? `${activeContent.surah?.arabicName} Mindmap` :
                                                        `${activeContent.surah?.arabicName} (${activeContent.verses?.length || 0} verses)`
                                            }
                                        </p>

                                        {/* Verse type content */}
                                        {activeContent.type === 'verse' && (
                                            <div className="review-verse-container" style={{ display: 'flex', flexDirection: 'column', height: '60vh', minHeight: 0 }}>
                                                {/* Context */}
                                                {activeContent.contextVerses && activeContent.contextVerses.length > 0 && (
                                                    <div className="context-box" style={{ opacity: 0.6, fontSize: '0.75rem', marginBottom: '0.75rem', padding: '0.5rem', borderLeft: '3px solid var(--border)' }}>
                                                        {activeContent.contextVerses.map(c => <p key={c.ayahId} className="arabic-text" style={{ fontSize: '1rem' }}>{c.text}</p>)}
                                                    </div>
                                                )}

                                                {/* Scrollable verse content */}
                                                <div ref={targetBoxRef} className="target-box custom-scrollbar review-target-box" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                                                    <div className="grouped-verse" style={{ direction: 'rtl', fontSize: '1.2rem' }}>
                                                        {activeContent.verses?.map((v, idx) => {
                                                            const chunks = verseChunkMap[idx] || [];
                                                            const isPast = idx < currentVerseInReview;
                                                            const isCurrent = idx === currentVerseInReview;
                                                            const showAll = showGrading || isPast;
                                                            const visibleChunks = showAll ? chunks : isCurrent ? chunks.slice(0, revealedChunks) : [];
                                                            const nextChunk = (!showAll && isCurrent) ? chunks[revealedChunks] : undefined;
                                                            const remainingHidden = showAll ? '' : (isCurrent ? chunks.slice(revealedChunks + 1).join(' ') : v.text);

                                                            return (
                                                                <span key={v.ayahId} className={`grouped-verse-block ${isCurrent ? 'active-verse' : ''}`}>
                                                                    <span className="verse-badge" style={{ fontSize: '0.6rem', padding: '1px 4px' }}>{v.ayahId}</span>
                                                                    <span className="grouped-verse-text arabic-text">
                                                                        {visibleChunks.map((c, i) => <span key={`${v.ayahId}-c-${i}`}>{c} </span>)}
                                                                        {nextChunk && <span className="blurred-chunk next-blur">{nextChunk}</span>}
                                                                        {remainingHidden && <span className="blurred-chunk strong-blur">{remainingHidden}</span>}
                                                                    </span>
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Mindmap type content */}
                                        {(activeContent.type === 'part_mindmap' || activeContent.type === 'mindmap') && (
                                            <div>
                                                {!showGrading ? (
                                                    <div className="verse-hidden" onClick={() => setShowGrading(true)}>
                                                        <EyeOff size={24} style={{ marginBottom: 8 }} />
                                                        <p>Visualize mindmap structure...</p>
                                                        <p style={{ fontSize: '0.8rem', marginTop: 8 }}>Tap to Check</p>
                                                    </div>
                                                ) : (
                                                    <div>
                                                        {(() => {
                                                            const hasContent = !!activeContent.mindmap?.imageUrl || !!activeContent.mindmap?.imageUrlDark || !!activeContent.mindmap?.tldrawSnapshot;

                                                            if (!hasContent) {
                                                                return (
                                                                    <div
                                                                        className="verse-hidden"
                                                                        style={{ background: 'var(--accent-light)', border: '1px dashed var(--accent)', color: 'var(--accent)', cursor: 'pointer' }}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            if (activeContent.type === 'mindmap') {
                                                                                setActiveMindmapEditor({ surahId: activeContent.surah!.id, snapshot: activeContent.mindmap?.tldrawSnapshot });
                                                                            } else {
                                                                                setActivePartEditor({ partId: activeContent.partId as QuranPart, snapshot: activeContent.mindmap?.tldrawSnapshot });
                                                                            }
                                                                        }}
                                                                    >
                                                                        <PenTool size={24} style={{ marginBottom: 8 }} />
                                                                        <p>Preview missing (Lean Sync)</p>
                                                                        <p style={{ fontSize: '0.8rem', marginTop: 8 }}>Click to view & generate local preview</p>
                                                                    </div>
                                                                );
                                                            }

                                                            return (
                                                                <div style={{ marginBottom: '1rem' }}>
                                                                    <MindmapViewer
                                                                        snapshot={activeContent.mindmap?.tldrawSnapshot}
                                                                        imageUrl={activeContent.mindmap?.imageUrl}
                                                                        imageUrlDark={activeContent.mindmap?.imageUrlDark}
                                                                        isDark={isDark}
                                                                        title={activeContent.type === 'mindmap' ? `${activeContent.surah?.arabicName} Mindmap` : `Part ${activeContent.partId} Mindmap`}
                                                                        height={320}
                                                                    />
                                                                </div>
                                                            );
                                                        })()}

                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            {orderedDueNodes.length > 0 && activeContent && (
                                <div className="today-card-footer">
                                    {activeContent.type === 'verse' && (
                                        !showGrading ? (
                                            <button className="btn btn-primary btn-full review-reveal-btn" onClick={handleRevealNext}>
                                                {revealedChunks >= totalChunks && currentVerseInReview >= totalVerses - 1 ? 'Finish Reciting' : 'Reveal Chunk'}
                                            </button>
                                        ) : (
                                            <div className="review-buttons" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                                                <button className="review-btn postpone" style={{ background: 'var(--background-secondary)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', color: 'var(--foreground)' }} onClick={handlePostpone}>
                                                    <span style={{ fontSize: '0.85rem' }}>Not sure</span>
                                                    <span style={{ fontSize: '0.65rem', opacity: 0.7 }}>Next: Tomorrow</span>
                                                </button>
                                                <button className="review-btn not-remembered" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }} onClick={() => handleGrade(false)}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><X size={14} /> <span style={{ fontSize: '0.85rem' }}>Forgot</span></div>
                                                    <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>
                                                        Next: {(() => {
                                                            const preview = getSchedulingPreview(orderedDueNodes[currentReviewIndex].scheduler as any, customWeights);
                                                            return preview.again;
                                                        })()}
                                                    </span>
                                                </button>
                                                <button className="review-btn remembered" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }} onClick={() => handleGrade(true)}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Check size={14} /> <span style={{ fontSize: '0.85rem' }}>Remembered</span></div>
                                                    <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>
                                                        Next: {(() => {
                                                            const preview = getSchedulingPreview(orderedDueNodes[currentReviewIndex].scheduler as any, customWeights);
                                                            return preview.good;
                                                        })()}
                                                    </span>
                                                </button>
                                            </div>
                                        )
                                    )}
                                    {(activeContent.type === 'part_mindmap' || activeContent.type === 'mindmap') && (
                                        !showGrading ? (
                                            <button className="btn btn-primary btn-full" onClick={() => setShowGrading(true)}>
                                                Reveal Mindmap
                                            </button>
                                        ) : (
                                            <>
                                                <div className="mindmap-quick-actions">
                                                    <button
                                                        className="btn btn-secondary"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (activeContent.type === 'mindmap') {
                                                                setActiveMindmapEditor({ surahId: activeContent.surah!.id, snapshot: activeContent.mindmap?.tldrawSnapshot });
                                                            } else {
                                                                setActivePartEditor({ partId: activeContent.partId as QuranPart, snapshot: activeContent.mindmap?.tldrawSnapshot });
                                                            }
                                                        }}
                                                    >
                                                        <PenTool size={14} /> Edit Mindmap
                                                    </button>
                                                    <button
                                                        className="btn btn-secondary"
                                                        style={{ color: 'var(--danger)' }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (activeContent.type === 'mindmap') {
                                                                handleMindmapIncomplete(activeContent.surah!.id);
                                                            } else {
                                                                handlePartMindmapIncomplete(activeContent.partId as QuranPart);
                                                            }
                                                        }}
                                                    >
                                                        <RotateCcw size={14} /> Mark as Incomplete
                                                    </button>
                                                </div>
                                                <div className="review-buttons" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                                                    <button className="review-btn postpone" style={{ background: 'var(--background-secondary)', border: '1px solid var(--border)', color: 'var(--foreground)' }} onClick={handlePostpone}>Not sure</button>
                                                    <button className="review-btn not-remembered" onClick={() => handleGrade(false)}><X size={20} /> Forgot</button>
                                                    <button className="review-btn remembered" onClick={() => handleGrade(true)}><Check size={20} /> Remembered</button>
                                                </div>
                                            </>
                                        )
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Daily Portion Col */}
                <div className="card">
                    <div className="collapsible-header" onClick={() => toggleSection('daily')}>
                        <div className="flex items-center gap-2 text-base font-semibold mb-3 text-foreground"><BookOpen size={20} /><span>Daily Portion</span></div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            {!listeningComplete && (
                                <div className="toggle-wrapper" onClick={(e) => { e.stopPropagation(); setReadOnlyMode(!readOnlyMode); }} style={{ cursor: 'pointer' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: !readOnlyMode ? 'var(--accent)' : 'var(--foreground-secondary)' }}>Audio</span>
                                    <div className={`toggle-switch ${!readOnlyMode ? 'active' : ''}`} />
                                </div>
                            )}
                            <span className={`collapse-icon ${viewState.dailyExpanded ? 'open' : ''}`}><ChevronDown size={20} /></span>
                        </div>
                    </div>

                    {viewState.dailyExpanded && (
                        <div className="daily-section-content">
                            {listeningComplete ? (
                                <div className="empty-state"><CheckCircle size={40} className="empty-icon" /><p>Daily portion complete!</p></div>
                            ) : (
                                <>
                                    <div className={`today-card-content ${readOnlyMode ? 'today-card-content--read' : 'today-card-content--audio'}`}>
                                        {!readOnlyMode ? (
                                            <div className="audio-mode-section" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                                                <div className="mb-2" style={{ flexShrink: 0 }}>
                                                    <AudioPlayer
                                                        verses={todaysPortion}
                                                        currentVerseIndex={currentVerseIndex}
                                                        currentVerseWordCount={todaysPortion[currentVerseIndex]?.text.split(' ').length || 0}
                                                        onVerseChange={setCurrentVerseIndex}
                                                        onWordIndexChange={setHighlightedWordIndex}
                                                    />
                                                </div>

                                                <div
                                                    ref={verseContainerRef}
                                                    className="verse-item daily-verse-preview p-4 border rounded-xl"
                                                    style={{
                                                        marginTop: '0.5rem',
                                                        overflowY: 'auto',
                                                        position: 'relative',
                                                        flex: 1,
                                                        minHeight: 0
                                                    }}
                                                >
                                                    {todaysPortion[currentVerseIndex] && (
                                                        <>
                                                            <div className="verse-ref">
                                                                {getSurah(todaysPortion[currentVerseIndex].surahId)?.arabicName} : {todaysPortion[currentVerseIndex].ayahId}
                                                            </div>
                                                            {todaysPortion[currentVerseIndex].ayahId === 1 ? (
                                                                todaysPortion[currentVerseIndex].surahId !== 1 &&
                                                                todaysPortion[currentVerseIndex].surahId !== 9 && (
                                                                    <div className="arabic-text" style={{ fontSize: '1.1rem', opacity: 0.8, marginBottom: '0.5rem', textAlign: 'center' }}>
                                                                        بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ
                                                                    </div>
                                                                )
                                                            ) : (
                                                                currentVerseIndex === 0 && (
                                                                    <div className="arabic-text" style={{ fontSize: '1.1rem', opacity: 0.8, marginBottom: '0.5rem', textAlign: 'center' }}>
                                                                        أَعُوذُ بِٱللَّهِ مِنَ ٱلشَّيْطَانِ ٱلرَّجِيمِ
                                                                    </div>
                                                                )
                                                            )}
                                                            <div className="arabic-text">
                                                                {todaysPortion[currentVerseIndex].text.split(' ').map((word, i) => (
                                                                    <span
                                                                        key={i}
                                                                        id={`word-${i}`}
                                                                        className={`audio-word ${i === highlightedWordIndex ? 'audio-word--active' : ''}`}
                                                                    >
                                                                        {word} {' '}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="read-view">
                                                {todaysPortion.map((v, idx) => {
                                                    const prevVerse = idx > 0 ? todaysPortion[idx - 1] : null;
                                                    const isNewSurah = !prevVerse || prevVerse.surahId !== v.surahId;
                                                    const surah = getSurah(v.surahId);

                                                    return (
                                                        <div key={idx}>
                                                            {isNewSurah && surah && (
                                                                <div className="surah-header-transition" style={{ textAlign: 'center', padding: '1rem 0', margin: '1rem 0', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                                                                    <h3 style={{ fontSize: '1.2rem', marginBottom: 4 }}>{surah.arabicName}</h3>
                                                                    {v.ayahId === 1 ? (
                                                                        surah.id !== 9 && surah.id !== 1 && <p className="arabic-text" style={{ fontSize: '1.1rem' }}>بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ</p>
                                                                    ) : (
                                                                        <p className="arabic-text" style={{ fontSize: '1.1rem', opacity: 0.8 }}>أَعُوذُ بِٱللَّهِ مِنَ ٱلشَّيْطَانِ ٱلرَّجِيمِ</p>
                                                                    )}
                                                                </div>
                                                            )}
                                                            <div className="verse-item" style={{ display: 'block', marginBottom: '0.5rem', textAlign: 'right' }}>
                                                                <span className="verse-ref" style={{ float: 'left', fontSize: '0.7rem' }}>{v.ayahId}</span>
                                                                <span className="arabic-text" style={{ fontSize: '1.2rem' }}>{v.text}</span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    <div className="today-card-footer">
                                        <button className="btn btn-success btn-full" onClick={handleCompleteListening}><Check size={20} /> Complete</button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

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
                    <div key={t.id} className={`review-toast ${t.type}`} style={{
                        padding: '0.65rem 1rem',
                        borderRadius: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
                        animation: 'slideInRight 0.3s ease-out',
                        background: t.type === 'success'
                            ? 'color-mix(in srgb, var(--success) 18%, var(--background-secondary))'
                            : t.type === 'postpone'
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
                            {t.type === 'success' ? <Check size={18} /> :
                                t.type === 'postpone' ? <Brain size={18} /> : <X size={18} />}
                            <span style={{ fontWeight: 600 }}>{t.message}</span>
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
                                    marginLeft: 'auto'
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

            {/* Zoom Modal */}
            {zoomImage && (
                <ImageZoomModal
                    src={zoomImage}
                    onClose={() => setZoomImage(null)}
                />
            )}
        </div>
    );
}

function ImageZoomModal({ src, onClose }: { src: string; onClose: () => void }) {
    const [zoom, setZoom] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const containerRef = useRef<HTMLDivElement>(null);

    const handleZoomIn = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        setZoom(prev => Math.min(prev + 0.5, 4));
    };

    const handleZoomOut = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        setZoom(prev => {
            const next = Math.max(prev - 0.5, 1);
            if (next === 1) setPosition({ x: 0, y: 0 });
            return next;
        });
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (zoom === 1) return;
        setIsDragging(true);
        setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;
        setPosition({
            x: e.clientX - dragStart.x,
            y: e.clientY - dragStart.y
        });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        if (zoom === 1) return;
        setIsDragging(true);
        const touch = e.touches[0];
        setDragStart({ x: touch.clientX - position.x, y: touch.clientY - position.y });
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!isDragging) return;
        const touch = e.touches[0];
        setPosition({
            x: touch.clientX - dragStart.x,
            y: touch.clientY - dragStart.y
        });
    };
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    return (
        <div
            className="zoom-modal-overlay"
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.9)',
                zIndex: 2000,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                touchAction: 'none'
            }}
            onClick={onClose}
        >
            <div
                style={{
                    position: 'absolute',
                    top: isMobile ? 15 : 20,
                    right: isMobile ? 15 : 20,
                    display: 'flex',
                    gap: isMobile ? 8 : 12,
                    zIndex: 2001
                }}
            >
                <button
                    onClick={handleZoomIn}
                    style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: typeof window !== 'undefined' && window.innerWidth < 768 ? 8 : 10, borderRadius: '50%', cursor: 'pointer' }}
                >
                    <ZoomIn size={typeof window !== 'undefined' && window.innerWidth < 768 ? 20 : 24} />
                </button>
                <button
                    onClick={handleZoomOut}
                    style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: typeof window !== 'undefined' && window.innerWidth < 768 ? 8 : 10, borderRadius: '50%', cursor: 'pointer' }}
                >
                    <ZoomOut size={typeof window !== 'undefined' && window.innerWidth < 768 ? 20 : 24} />
                </button>
                <button
                    onClick={onClose}
                    style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: typeof window !== 'undefined' && window.innerWidth < 768 ? 8 : 10, borderRadius: '50%', cursor: 'pointer' }}
                >
                    <X size={typeof window !== 'undefined' && window.innerWidth < 768 ? 20 : 24} />
                </button>
            </div>

            <div
                ref={containerRef}
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
                    position: 'relative'
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleMouseUp}
                onClick={(e) => e.stopPropagation()}
            >
                <Image
                    src={src}
                    alt="Zoomed mindmap"
                    fill
                    style={{
                        objectFit: 'contain',
                        transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
                        transition: isDragging ? 'none' : 'transform 0.2s ease-out',
                        userSelect: 'none',
                    } as any}
                    draggable={false}
                />
            </div>

            {zoom > 1 && (
                <div
                    className="zoom-helper"
                    style={{
                        position: 'absolute',
                        bottom: isMobile ? 100 : 40,
                        color: 'white',
                        fontSize: '0.8rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        background: 'rgba(0,0,0,0.6)',
                        padding: '6px 14px',
                        borderRadius: 20,
                        zIndex: 2002
                    }}
                >
                    <Move size={14} /> Drag to move around
                </div>
            )}
        </div>
    );
}
