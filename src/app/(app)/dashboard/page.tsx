'use client';

/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Image from 'next/image';
import Spinner from '@/components/ui/Spinner';
import { parseQuranJson, getSurah, getSurahsByPart } from '@/lib/quranData';
import { Verse, QuranPart, MemoryNode, AppSettings } from '@/lib/types';
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
    AlertCircle
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
import { reviewCard, getSchedulingPreview } from '@/lib/fsrs';
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
    const { settings, isLoading: settingsLoading } = useInstantSettings();
    const { dueNodes, saveNode: updateInstantNode, isLoading: nodesLoading } = useInstantNodes();
    const { logs: reviewLogs, saveLog: saveInstantReviewLog } = useInstantReviewLogs();
    const { saveError: saveInstantReviewError, deleteError: removeInstantReviewError } = useInstantReviewErrors();
    const { mindmaps, partMindMaps, saveMindMap, savePartMindMap } = useInstantMindMaps();
    const { stats: listeningStats, saveStats: saveListeningStats } = useInstantListeningStats();
    const { progress: listeningProgress, saveProgress: saveListeningProgress } = useInstantListeningProgress();

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

    // State for completed items review queue
    const [completedReviewQueue, setCompletedReviewQueue] = useState<Array<{
        type: 'surah_mindmap' | 'surah_verse' | 'part_mindmap';
        surahId?: number;
        partId?: QuranPart;
        mindmap?: any;
        verses?: Verse[];
        surah?: any;
    }>>([]);
    const [completedReviewIndex, setCompletedReviewIndex] = useState(0);
    const [showCompletedReview, setShowCompletedReview] = useState(false);

    // Local helper to find anchor for range using InstantDB mindmaps
    const findAnchorForRange = useCallback((surahId: number, start: number, end: number) => {
        const mindmap = mindmaps.find(m => m.surahId === surahId);
        if (!mindmap || !mindmap.anchors) return undefined;
        return (mindmap.anchors as any[]).find(a => a.startVerse === start && a.endVerse === end);
    }, [mindmaps]);

    // Build completed items review queue from kanban state
    const buildCompletedReviewQueue = useCallback(() => {
        if (!settings?.kanbanColumns || !allVerses.length) return [];

        const completedIds = settings.kanbanColumns.complete || [];

        type ReviewItem = {
            type: 'surah_mindmap' | 'surah_verse' | 'part_mindmap';
            surahId?: number;
            partId?: QuranPart;
            mindmap?: any;
            verses?: Verse[];
            surah?: any;
        };

        const reviewItems: ReviewItem[] = [];

        // Process completed items - for each surah, add mindmap then verses as separate steps
        completedIds.forEach(id => {
            if (id.startsWith('surah-')) {
                const surahIdNum = parseInt(id.replace('surah-', ''));
                const surah = getSurah(surahIdNum);
                const mindmap = mindmaps.find(m => Number(m.surahId) === surahIdNum);

                if (surah && mindmap) {
                    // 1. Add mindmap review item (without verses so it shows mindmap prompt directly)
                    reviewItems.push({
                        type: 'surah_mindmap',
                        surahId: surahIdNum,
                        surah,
                        mindmap
                    });

                    // 2. Add verses from anchors immediately after mindmap for the same surah
                    const anchorVerses: Verse[] = [];
                    if (mindmap.anchors?.length) {
                        mindmap.anchors.forEach((anchor: any) => {
                            const start = Number(anchor.startVerse);
                            const end = Number(anchor.endVerse);
                            for (let ayahId = start; ayahId <= end; ayahId++) {
                                const verse = allVerses.find(v => Number(v.surahId) === surahIdNum && Number(v.ayahId) === ayahId);
                                if (verse) anchorVerses.push(verse);
                            }
                        });
                    }

                 /*   if (anchorVerses.length > 0) {
                        reviewItems.push({
                            type: 'surah_verse',
                            surahId: surahIdNum,
                            surah,
                            verses: anchorVerses
                        });
                    }*/
                }
            } else if (id.startsWith('part-')) {
                const partId = parseInt(id.replace('part-', '')) as QuranPart;
                const partMindmap = partMindMaps.find(pm => Number(pm.partId) === partId);

                if (partMindmap) {
                    // Only add mindmap for parts
                    reviewItems.push({
                        type: 'part_mindmap',
                        partId,
                        mindmap: partMindmap
                    });
                }
            }
        });

        return reviewItems;
    }, [settings?.kanbanColumns, allVerses, mindmaps, partMindMaps]);

    const isLoaded = isVersesLoaded && !settingsLoading && !nodesLoading;

    // Theme detection
    const { theme } = useTheme();
    const [isDark, setIsDark] = useState(false);

    const verseContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (highlightedWordIndex !== -1 && verseContainerRef.current) {
            const wordEl = document.getElementById(`word-${highlightedWordIndex}`);
            if (wordEl) {
                const container = verseContainerRef.current;
                const offsetTop = wordEl.offsetTop;
                const containerHeight = container.clientHeight;
                const scrollTop = offsetTop - (containerHeight / 2) + (wordEl.clientHeight / 2);
                container.scrollTo({ top: scrollTop, behavior: 'smooth' });
            }
        }
    }, [highlightedWordIndex]);

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

    // Populate completed review queue when settings or data changes
    useEffect(() => {
        const queue = buildCompletedReviewQueue();
        setCompletedReviewQueue(queue);
        setCompletedReviewIndex(0);
    }, [buildCompletedReviewQueue]);

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
    const [lastGrading, setLastGrading] = useState<{ node: MemoryNode; index: number; errorId?: string } | null>(null);

    const addToast = useCallback((type: 'success' | 'error' | 'postpone', message: string, info?: string) => {
        const id = Math.random().toString(36).substring(2, 9);
        setToasts(prev => [...prev, { id, type, message, info }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 4000);
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
        setTodaysPortion(portionData.portion);
        setCurrentVerseIndex(portionData.startVerseIndex);
    }, [portionData]);



    // Grade review
    const handleGrade = useCallback((remembered: boolean) => {
        const node = dueNodes[currentReviewIndex];
        if (!node || !node.scheduler) return;

        const errorId = !remembered ? crypto.randomUUID() : undefined;
        // Save state for undo BEFORE updating
        setLastGrading({
            node: JSON.parse(JSON.stringify(node)), // Deep copy original
            index: currentReviewIndex,
            errorId
        });

        // Use FSRS algorithm
        const customWeightsFromInstant = customWeights;
        const result = reviewCard(node.scheduler as any, remembered, node.id, customWeightsFromInstant);

        // Save updated node with new FSRS state
        updateInstantNode({ ...node, scheduler: result.newState });

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

            saveInstantReviewError(errorToSave);
        }

        const info = node.type === 'part_mindmap' ? `Part ${node.partId}` :
            node.type === 'mindmap' ? getSurah(node.surahId!)?.arabicName :
                `${getSurah(node.surahId!)?.arabicName} (${node.startVerse}-${node.endVerse})`;

        addToast(remembered ? 'success' : 'error', remembered ? 'Remembered' : 'Forgot', info);

        if (currentReviewIndex < dueNodes.length - 1) {
            setCurrentReviewIndex(prev => prev + 1);
            // Move to next item - stay hidden until clicked
            setRevealedChunks(0);
            setCurrentVerseInReview(0);
            setShowGrading(false);
        } else {
            // All done for now
        }
    }, [dueNodes, currentReviewIndex, addToast, customWeights, updateInstantNode, saveInstantReviewLog, saveInstantReviewError]);

    const handlePostpone = useCallback(() => {
        const node = dueNodes[currentReviewIndex];
        if (!node || !node.scheduler) return;

        setLastGrading({
            node: JSON.parse(JSON.stringify(node)),
            index: currentReviewIndex,
        });

        // Postpone by 1 day
        const scheduler = node.scheduler as any;
        const due = new Date(scheduler.due || scheduler.dueDate || new Date());
        due.setDate(due.getDate() + 1);

        updateInstantNode({
            ...node,
            scheduler: {
                ...scheduler,
                due: due.toISOString()
            }
        });

        const info = node.type === 'part_mindmap' ? `Part ${node.partId}` :
            node.type === 'mindmap' ? getSurah(node.surahId!)?.arabicName :
                `${getSurah(node.surahId!)?.arabicName} (${node.startVerse}-${node.endVerse})`;

        addToast('postpone', 'Postponed to tomorrow', info);

        if (currentReviewIndex < dueNodes.length - 1) {
            setCurrentReviewIndex(prev => prev + 1);
            setRevealedChunks(0);
            setCurrentVerseInReview(0);
            setShowGrading(false);
        } else {
            // All done for now
        }
    }, [dueNodes, currentReviewIndex, addToast, updateInstantNode]);

    const handleUndo = () => {
        if (!lastGrading) return;
        updateInstantNode(lastGrading.node);
        if (lastGrading.errorId) {
            removeInstantReviewError(lastGrading.errorId);
        }
        setCurrentReviewIndex(lastGrading.index);
        setRevealedChunks(0);
        setCurrentVerseInReview(0);
        setShowGrading(true); // Return to grading view of the undone card
        setLastGrading(null);
        setToasts([]);
    };


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

        saveListeningProgress(settings.activePart, next, cycles);

        // Update stats for each surah in the portion
        const surahsInPortion = new Set(todaysPortion.map(v => v.surahId));
        surahsInPortion.forEach(surahId => {
            const existing = listeningStats.find(s => s.surahId === surahId);
            saveListeningStats(surahId, {
                ...existing,
                surahId,
                totalMinutes: (existing?.totalMinutes || 0) + 5, // Assume 5 mins per portion per surah for now
                lastListened: new Date().toISOString()
            });
        });

        setListeningComplete(true);
    };

    // Get content
    const getCurrentReviewContent = () => {
        if (dueNodes.length === 0 || currentReviewIndex >= dueNodes.length) return null;
        const node = dueNodes[currentReviewIndex];

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

    // Get current completed review content
    const getCurrentCompletedReviewContent = () => {
        if (completedReviewQueue.length === 0 || completedReviewIndex >= completedReviewQueue.length) return null;
        const item = completedReviewQueue[completedReviewIndex];

        if (item.type === 'surah_mindmap') {
            return { type: 'mindmap', surah: item.surah, mindmap: item.mindmap, verses: item.verses };
        } else if (item.type === 'surah_verse') {
            return { type: 'verse', surah: item.surah, verses: item.verses, contextVerses: [] };
        } else if (item.type === 'part_mindmap') {
            return { type: 'part_mindmap', partId: item.partId, mindmap: item.mindmap };
        }
        return null;
    };

    const reviewContent = getCurrentReviewContent();
    const completedReviewContent = getCurrentCompletedReviewContent();

    // Use the appropriate content based on which mode we're in
    const activeContent = showCompletedReview ? completedReviewContent : reviewContent;

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

    // Handler to move to next completed review item
    const handleNextCompletedItem = useCallback(() => {
        if (completedReviewIndex < completedReviewQueue.length - 1) {
            setCompletedReviewIndex(prev => prev + 1);
            setRevealedChunks(0);
            setCurrentVerseInReview(0);
            setShowGrading(false);
        }
    }, [completedReviewIndex, completedReviewQueue.length]);



    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Check if we have any items to review in either mode
            const hasItems = showCompletedReview ? completedReviewQueue.length > 0 : dueNodes.length > 0;
            if (!hasItems) return;

            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            if (showGrading) {
                if (showCompletedReview) {
                    // In completed review mode, almost any key moves to next
                    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        handleNextCompletedItem();
                    }
                } else {
                    // Regular review mode
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
                }
            } else {
                if (e.key === 'ArrowRight' || e.key === ' ') {
                    e.preventDefault();
                    handleRevealNext();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [dueNodes, showGrading, showCompletedReview, completedReviewQueue.length, handlePostpone, handleGrade, handleRevealNext, handleNextCompletedItem]);

    useEffect(() => {
        if (targetBoxRef.current) {
            const nextBlur = targetBoxRef.current.querySelector('.next-blur') as HTMLElement;
            if (nextBlur) {
                // Use manual scrollTo on the container to prevent the whole window from scrolling
                const container = targetBoxRef.current;
                const elementTop = nextBlur.offsetTop;
                const elementHeight = nextBlur.offsetHeight;
                const containerHeight = container.offsetHeight;

                container.scrollTo({
                    top: elementTop - (containerHeight / 2) + (elementHeight / 2),
                    behavior: 'smooth'
                });
            } else if (showGrading) {
                // If we finished the verse, scroll to the bottom of the box
                targetBoxRef.current.scrollTo({ top: targetBoxRef.current.scrollHeight, behavior: 'smooth' });
            }
        }
    }, [revealedChunks, currentVerseInReview, showGrading]);

    // Move isLoaded check to AFTER all hooks
    const handleMindmapIncomplete = (surahId: number) => {
        if (!window.confirm("Are you sure you want to mark this mindmap as INCOMPLETE? It will be removed from the review section until you mark it as complete again.")) return;

        const mm = mindmaps.find(m => m.surahId === surahId);
        if (mm) {
            const updated = { ...mm, isComplete: false };
            saveMindMap(surahId, updated);
            addToast('success', 'Mindmap marked as incomplete', getSurah(surahId)?.name);
        }
    };

    const handlePartMindmapIncomplete = (partId: QuranPart) => {
        if (!window.confirm("Are you sure you want to mark this part mindmap as INCOMPLETE? It will be removed from the review section until you mark it as complete again.")) return;

        const mm = partMindMaps.find(m => m.partId === partId);
        if (mm) {
            const updated = { ...mm, isComplete: false };
            savePartMindMap(partId, updated);
            addToast('success', 'Part mindmap marked as incomplete', `Part ${partId}`);
        }
    };

    const handleMindmapEditorSave = useCallback(async (snapshot: any, images?: { light?: Blob, dark?: Blob }, shouldClose: boolean = true) => {
        if (!activeMindmapEditor) return;
        const { surahId } = activeMindmapEditor;

        const save = (lightUrl: string | null, darkUrl: string | null) => {
            const existing = mindmaps.find(m => m.surahId === surahId);
            const newMindMap = {
                ...existing,
                surahId,
                imageUrl: lightUrl || undefined, // Set to undefined to remove from InstantDB if no new image
                imageUrlDark: darkUrl || undefined,
                tldrawSnapshot: snapshot,
                isComplete: true // If we are editing and saving, we assume it's part of completion flow or just an update
            };
            saveMindMap(surahId, newMindMap);
            if (shouldClose) {
                setActiveMindmapEditor(null);
            }
        };

        if (images && (images.light || images.dark)) {
            const blobs = images;
            const processBlob = (blob: Blob | undefined): Promise<string | null> => {
                if (!blob) return Promise.resolve(null);
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob);
                });
            };

            const [light, dark] = await Promise.all([
                processBlob(blobs.light),
                processBlob(blobs.dark)
            ]);
            save(light, dark);
        } else {
            save(null, null);
        }
    }, [activeMindmapEditor, mindmaps, saveMindMap]);

    const handlePartMindmapEditorSave = useCallback(async (snapshot: any, images?: { light?: Blob, dark?: Blob }, shouldClose: boolean = true) => {
        if (!activePartEditor) return;
        const { partId } = activePartEditor;

        const save = (lightUrl: string | null, darkUrl: string | null) => {
            const existing = partMindMaps.find(m => m.partId === partId);
            const newMindMap = {
                ...existing,
                partId,
                imageUrl: lightUrl || undefined,
                imageUrlDark: darkUrl || undefined,
                tldrawSnapshot: snapshot,
                isComplete: true
            };
            savePartMindMap(partId, newMindMap);
            if (shouldClose) {
                setActivePartEditor(null);
            }
        };

        if (images && (images.light || images.dark)) {
            const blobs = images;
            const processBlob = (blob: Blob | undefined): Promise<string | null> => {
                if (!blob) return Promise.resolve(null);
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob);
                });
            };

            const [light, dark] = await Promise.all([
                processBlob(blobs.light),
                processBlob(blobs.dark)
            ]);
            save(light, dark);
        } else {
            save(null, null);
        }
    }, [activePartEditor, partMindMaps, savePartMindMap]);

    if (!isLoaded) return <div className="content-wrapper flex items-center justify-center h-full"><Spinner text="Loading..." /></div>;

    return (
        <div className="content-wrapper">
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
            <h1 className="hidden md:block text-2xl font-bold mb-6">Today</h1>

            <div className="today-grid">
                {/* Reviews Col */}
                <div className="card">
                    <div className="collapsible-header" onClick={() => toggleSection('review')}>
                        <div className="flex items-center gap-2 text-base font-semibold mb-3 text-foreground"><CheckCircle size={20} /><span>Reviews</span>{(dueNodes.length - currentReviewIndex) > 0 && <span className="px-2 py-1 rounded-md text-xs font-bold bg-green-200 text-green-900 dark:bg-green-900/30 dark:text-green-400">{dueNodes.length - currentReviewIndex}</span>}</div>
                        <div className="flex items-center gap-2">
                            {completedReviewQueue.length > 0 && (
                                <button
                                    className={`px-2 py-1 text-xs rounded-md transition-colors ${showCompletedReview
                                        ? 'bg-blue-200 text-blue-900 dark:bg-blue-900/30 dark:text-blue-400'
                                        : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                                        }`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowCompletedReview(!showCompletedReview);
                                        setCurrentReviewIndex(0);
                                        setCompletedReviewIndex(0);
                                        setRevealedChunks(0);
                                        setCurrentVerseInReview(0);
                                        setShowGrading(false);
                                    }}
                                >
                                    {showCompletedReview ? 'Regular' : 'Completed'}
                                </button>
                            )}
                            <span className={`collapse-icon ${viewState.reviewExpanded ? 'open' : ''}`}><ChevronDown size={20} /></span>
                        </div>
                    </div>

                    {viewState.reviewExpanded && (
                        <div className="review-section-content">
                            {/* Empty state */}
                            {(showCompletedReview ? completedReviewQueue.length === 0 : dueNodes.length === 0) ? (
                                <div className="empty-state">
                                    <CheckCircle size={40} className="empty-icon" />
                                    <p>{showCompletedReview ? 'No completed items to review!' : 'No reviews due!'}</p>
                                </div>
                            ) : activeContent && (
                                <div style={{ paddingTop: '0.5rem' }}>
                                    {/* Header */}
                                    <p style={{ fontSize: '0.75rem', color: 'var(--foreground-secondary)', marginBottom: '0.5rem' }}>
                                        {showCompletedReview
                                            ? `${completedReviewIndex + 1}/${completedReviewQueue.length}`
                                            : `${currentReviewIndex + 1}`
                                        } • {
                                            activeContent.type === 'part_mindmap' ? `Part ${activeContent.partId} Mindmap` :
                                                activeContent.type === 'mindmap' ? `${activeContent.surah?.arabicName} Mindmap` :
                                                    `${activeContent.surah?.arabicName} (${activeContent.verses?.length || 0} verses)`
                                        }
                                    </p>

                                    {/* Verse type content */}
                                    {activeContent.type === 'verse' && (
                                        <div className="review-verse-container">
                                            {/* Context - only for regular reviews */}
                                            {!showCompletedReview && activeContent.contextVerses && activeContent.contextVerses.length > 0 && (
                                                <div className="context-box" style={{ opacity: 0.6, fontSize: '0.75rem', marginBottom: '0.75rem', padding: '0.5rem', borderLeft: '3px solid var(--border)' }}>
                                                    {activeContent.contextVerses.map(c => <p key={c.ayahId} className="arabic-text" style={{ fontSize: '1rem' }}>{c.text}</p>)}
                                                </div>
                                            )}

                                            {/* Scrollable verse content */}
                                            <div ref={targetBoxRef} className="target-box custom-scrollbar review-target-box" style={{ flex: 1, overflowY: 'auto' }}>
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

                                            {/* Controls */}
                                            <div style={{ marginTop: '0.75rem', flexShrink: 0 }}>
                                                {!showGrading ? (
                                                    <button className="btn btn-primary btn-full" style={{ padding: '0.65rem' }} onClick={handleRevealNext}>
                                                        {revealedChunks >= totalChunks && currentVerseInReview >= totalVerses - 1 ? 'Finish Reciting' : 'Reveal Chunk'}
                                                    </button>
                                                ) : showCompletedReview ? (
                                                    <button className="btn btn-primary btn-full" style={{ padding: '0.65rem' }} onClick={handleNextCompletedItem}>
                                                        {completedReviewIndex >= completedReviewQueue.length - 1 ? 'Done' : 'Next'}
                                                    </button>
                                                ) : (
                                                    <div className="review-buttons" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                                                        <button className="review-btn postpone" style={{ padding: '0.4rem', background: 'var(--background-secondary)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', color: 'var(--foreground)' }} onClick={handlePostpone}>
                                                            <span style={{ fontSize: '0.85rem' }}>Not sure</span>
                                                            <span style={{ fontSize: '0.65rem', opacity: 0.7 }}>Next: Today</span>
                                                        </button>
                                                        <button className="review-btn not-remembered" style={{ padding: '0.4rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }} onClick={() => handleGrade(false)}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><X size={14} /> <span style={{ fontSize: '0.85rem' }}>Forgot</span></div>
                                                            <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>
                                                                Next: {(() => {
                                                                    const preview = getSchedulingPreview(dueNodes[currentReviewIndex].scheduler as any, customWeights);
                                                                    return preview.again;
                                                                })()}
                                                            </span>
                                                        </button>
                                                        <button className="review-btn remembered" style={{ padding: '0.4rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }} onClick={() => handleGrade(true)}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Check size={14} /> <span style={{ fontSize: '0.85rem' }}>Remembered</span></div>
                                                            <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>
                                                                Next: {(() => {
                                                                    const preview = getSchedulingPreview(dueNodes[currentReviewIndex].scheduler as any, customWeights);
                                                                    return preview.good;
                                                                })()}
                                                            </span>
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Mindmap type content */}
                                    {(activeContent.type === 'part_mindmap' || activeContent.type === 'mindmap') && (
                                        <div>
                                            {!showGrading ? (
                                                activeContent.verses && activeContent.verses.length > 0 ? (
                                                    <div className="review-verse-container">
                                                        <div ref={targetBoxRef} className="target-box custom-scrollbar review-target-box" style={{ flex: 1, overflowY: 'auto' }}>
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
                                                        <div style={{ marginTop: '0.75rem', flexShrink: 0 }}>
                                                            <button className="btn btn-primary btn-full" style={{ padding: '0.65rem' }} onClick={handleRevealNext}>
                                                                {revealedChunks >= totalChunks && currentVerseInReview >= totalVerses - 1 ? 'Show Mindmap' : 'Reveal Chunk'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="verse-hidden" onClick={() => setShowGrading(true)}>
                                                        <EyeOff size={24} style={{ marginBottom: 8 }} />
                                                        <p>Visualize mindmap structure...</p>
                                                        <p style={{ fontSize: '0.8rem', marginTop: 8 }}>Tap to Check</p>
                                                    </div>
                                                )
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

                                                    {/* Quick Actions - only for regular reviews */}
                                                    {!showCompletedReview && (
                                                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                                            <button
                                                                className="btn btn-secondary"
                                                                style={{ flex: 1, padding: '0.5rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (activeContent.type === 'mindmap') {
                                                                        setActiveMindmapEditor({ surahId: activeContent.surah!.id, snapshot: activeContent.mindmap?.tldrawSnapshot });
                                                                    } else {
                                                                        setActivePartEditor({ partId: activeContent.partId as QuranPart, snapshot: activeContent.mindmap?.tldrawSnapshot });
                                                                    }
                                                                }}
                                                            >
                                                                <PenTool size={14} /> Edit Map
                                                            </button>
                                                            <button
                                                                className="btn btn-secondary"
                                                                style={{ flex: 1, padding: '0.5rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: 'var(--danger)' }}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (activeContent.type === 'mindmap') {
                                                                        handleMindmapIncomplete(activeContent.surah!.id);
                                                                    } else {
                                                                        handlePartMindmapIncomplete(activeContent.partId as QuranPart);
                                                                    }
                                                                }}
                                                            >
                                                                <RotateCcw size={14} /> Mark Incomplete
                                                            </button>
                                                        </div>
                                                    )}

                                                    {/* Controls */}
                                                    {showCompletedReview ? (
                                                        <button className="btn btn-primary btn-full" style={{ padding: '0.65rem' }} onClick={handleNextCompletedItem}>
                                                            {completedReviewIndex >= completedReviewQueue.length - 1 ? 'Done' : 'Next'}
                                                        </button>
                                                    ) : (
                                                        <div className="review-buttons" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                                                            <button className="review-btn postpone" style={{ padding: '0.4rem', background: 'var(--background-secondary)', border: '1px solid var(--border)', color: 'var(--foreground)' }} onClick={handlePostpone}>Not sure</button>
                                                            <button className="review-btn not-remembered" style={{ padding: '0.4rem' }} onClick={() => handleGrade(false)}><X size={20} /> Forgot</button>
                                                            <button className="review-btn remembered" style={{ padding: '0.4rem' }} onClick={() => handleGrade(true)}><Check size={20} /> Remembered</button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Daily Portion Col */}
                <div className="card">
                    <div className="collapsible-header" onClick={() => toggleSection('daily')}>
                        <div className="flex items-center gap-2 text-base font-semibold mb-3 text-foreground"><BookOpen size={20} /><span>Daily Portion</span>{listeningComplete ? <span className="px-2 py-1 rounded-md text-xs font-bold bg-green-200 text-green-900 dark:bg-green-900/30 dark:text-green-400">✓</span> : <span className="status-badge partial show-mobile" style={{ background: 'transparent', padding: 0, color: 'var(--warning)', display: 'flex', alignItems: 'center' }}><AlertCircle size={18} /></span>}</div>
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
                                    {!readOnlyMode ? (
                                        <div className="audio-mode-section" style={{ display: 'flex', flexDirection: 'column' }}>
                                            <div className="mb-2" style={{ flexShrink: 0 }}>
                                                <AudioPlayer
                                                    verses={todaysPortion}
                                                    currentVerseIndex={currentVerseIndex}
                                                    onVerseChange={setCurrentVerseIndex}
                                                    onWordIndexChange={setHighlightedWordIndex}
                                                />
                                            </div>

                                            <div
                                                ref={verseContainerRef}
                                                className="verse-item p-4 border rounded-xl bg-[var(--background-secondary)]"
                                                style={{
                                                    marginTop: '0.5rem',
                                                    overflowY: 'auto',
                                                    height: '22vh',
                                                    position: 'relative'
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
                                                                <span key={i} id={`word-${i}`} style={{
                                                                    backgroundColor: i === highlightedWordIndex ? 'color-mix(in srgb, var(--accent), transparent 85%)' : 'transparent',
                                                                    borderRadius: '4px',
                                                                    transition: 'background-color 0.2s'
                                                                }}>
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

                                    <button className="btn btn-success btn-full" style={{ marginTop: '1rem' }} onClick={handleCompleteListening}><Check size={20} /> Complete</button>
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
                        background: t.type === 'success' ? 'var(--success)' :
                            t.type === 'postpone' ? 'var(--background-secondary)' : 'var(--danger)',
                        border: '1px solid var(--border)',
                        color: t.type === 'postpone' ? 'var(--foreground)' : 'white',
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
                                onClick={handleUndo}
                                style={{
                                    background: 'rgba(255,255,255,0.2)',
                                    border: 'none',
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
                        </div>
                        {t.info && (
                            <div style={{
                                fontSize: '0.8rem',
                                opacity: 0.9,
                                paddingLeft: '28px'
                            }}>
                                {t.info}
                            </div>
                        )}
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
