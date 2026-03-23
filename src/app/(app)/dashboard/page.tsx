'use client';

/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import { useState, useEffect, useRef, useMemo, useCallback, useContext, startTransition } from 'react';
import { id } from '@instantdb/react';
import Image from 'next/image';
import FullScreenLoader from '@/components/ui/FullScreenLoader';
import Spinner from '@/components/ui/Spinner';
import { getQuranVerses, getSurah, getSurahsByPart } from '@/lib/quranData';
import {
    ALL_QURAN_PART,
    LEGACY_ALL_QURAN_PART,
    Verse,
    QuranPart,
    MemoryNode,
    AppSettings,
    getNodeDueDate
} from '@/lib/types';
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
import { useConfirmDialog } from '@/components/ConfirmDialogProvider';
import {
    useSharedInstantListeningProgress,
    useSharedInstantMindMaps,
    useSharedInstantMutashabihat,
    useSharedInstantNodes,
    useSharedInstantReviewErrors,
    useSharedInstantSettings,
} from '@/components/InstantDataProvider';
import { useMindmapBackGestureGuard } from '@/hooks/useMindmapBackGestureGuard';
import {
    useInstantReviewLogs,
    useInstantOptimization,
    useInstantListeningStats,
} from '@/hooks/useInstantData';
import { reviewCard, getSchedulingPreview, createNewFSRSState } from '@/lib/fsrs';
import { optimizeWeights } from '../../actions';
import { surahAyahToAbsolute, hasMutashabihForAbsolute, getMutashabihatForAbsolute } from '@/lib/mutashabihat';
import { useTheme } from '@/components/ThemeProvider';
import { OnlineStatusContext } from '@/components/Providers';
import { deriveSuspendedVerseGroupKeys, filterReviewQueueNodes } from '@/lib/reviewQueue';
import { clientEnv } from '@/lib/env/client';
import { getEffectiveSurahAnchors } from '@/lib/surahSplits';
import { normalizeReviewSortOrder, ReviewSortOrder } from '@/lib/reviewSortOrder';

// Dynamic import of MindmapEditor to keep bundle size small and avoid SSR issues
const MindmapEditor = dynamic(() => import('@/components/MindmapEditor'), { ssr: false });
const MindmapViewer = dynamic(() => import('@/components/MindmapViewer'), {
    ssr: false,
    loading: () => (
        <div
            className="review-mindmap-viewer"
            style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
            <Spinner text="Loading mindmap viewer..." />
        </div>
    )
});
const AudioPlayer = dynamic(() => import('@/components/AudioPlayer'), { ssr: false });

const stableNodeId = (...parts: Array<string | number>) =>
    parts.map(part => String(part).trim().replace(/[^a-zA-Z0-9_-]/g, '_')).join('__');
const ACTIVE_REVIEW_NODE_STORAGE_KEY = 'dashboard_active_review_node_id_v1';
const FSRS_OPTIMIZATION_ENABLED = clientEnv.NEXT_PUBLIC_FSRS_OPTIMIZATION_ENABLED;
const FSRS_OPTIMIZATION_LOG_DELTA = Math.max(0, clientEnv.NEXT_PUBLIC_FSRS_OPTIMIZATION_LOG_DELTA);
const FSRS_OPTIMIZATION_DELAY_MS = Math.max(0, clientEnv.NEXT_PUBLIC_FSRS_OPTIMIZATION_DELAY_MS);
const AUTO_NODE_CREATE_BATCH_SIZE = 20;

const toPositiveInt = (value: unknown): number | null => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const toNonNegativeInt = (value: unknown): number | null => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const resolveNodeSurahId = (node: Partial<MemoryNode>): number | null => {
    const direct = toPositiveInt((node as any).surahId);
    if (direct) return direct;
    const target = String((node as any).targetId || '');
    const anchorMatch = target.match(/^anchor-(\d+)-\d+-\d+$/);
    if (anchorMatch) return toPositiveInt(anchorMatch[1]);
    const mindmapMatch = target.match(/^mindmap-(\d+)$/);
    if (mindmapMatch) return toPositiveInt(mindmapMatch[1]);
    return null;
};

const resolveNodePartId = (node: Partial<MemoryNode>): number | null => {
    const direct = toNonNegativeInt((node as any).partId);
    if (direct !== null) return direct;
    const target = String((node as any).targetId || '');
    const partMatch = target.match(/^part-mindmap-(\d+)$/);
    if (!partMatch) return null;
    return toNonNegativeInt(partMatch[1]);
};


const CONTEXTUAL_BREAK_SUFFIXES = ['ۘ', 'ۙ', 'ۚ', 'ۖ', 'ۗ', 'ۛ', 'ۜ', '۝'] as const;
const CONTEXTUAL_BREAK_TOKENS = new Set<string>([
    ...CONTEXTUAL_BREAK_SUFFIXES,
    'ج',
    'قلى',
    'صلى',
    'م',
    'لا',
]);
const MAX_REVEAL_WORDS = 10;

function splitLongSegment(tokens: string[], maxWords: number): string[][] {
    if (tokens.length <= maxWords) return [tokens];

    const midpoint = Math.ceil(tokens.length / 2);
    return [
        ...splitLongSegment(tokens.slice(0, midpoint), maxWords),
        ...splitLongSegment(tokens.slice(midpoint), maxWords),
    ];
}

function splitIntoChunks(text: string | undefined | null): string[] {
    const normalized = typeof text === 'string' ? text.trim() : '';
    if (!normalized) return [];

    const rawTokens = normalized.split(/\s+/).filter(Boolean);
    const tokens: string[] = [];

    for (const rawToken of rawTokens) {
        if (tokens.length > 0 && CONTEXTUAL_BREAK_TOKENS.has(rawToken)) {
            tokens[tokens.length - 1] = `${tokens[tokens.length - 1]}${rawToken}`;
            continue;
        }

        tokens.push(rawToken);
    }

    if (tokens.length === 0) return [];

    const primarySegments: string[][] = [];
    let currentSegment: string[] = [];

    for (const token of tokens) {
        currentSegment.push(token);

        if (CONTEXTUAL_BREAK_SUFFIXES.some(mark => token.endsWith(mark))) {
            primarySegments.push(currentSegment);
            currentSegment = [];
        }
    }

    if (currentSegment.length > 0) {
        primarySegments.push(currentSegment);
    }

    return primarySegments
        .flatMap(segment => splitLongSegment(segment, MAX_REVEAL_WORDS))
        .map(segment => segment.join(' '))
        .filter(Boolean);
}

type DailyPortionSurahGroup = {
    surahId: number;
    verses: Verse[];
};

type PendingReviewAdvance = {
    reviewedNodeId: string;
    nextNodeId: string | null;
    beforeIndex: number;
};

function groupVersesBySurah(verses: Verse[]): DailyPortionSurahGroup[] {
    const groups: DailyPortionSurahGroup[] = [];
    for (const verse of verses) {
        const prev = groups[groups.length - 1];
        if (prev && prev.surahId === verse.surahId) {
            prev.verses.push(verse);
        } else {
            groups.push({ surahId: verse.surahId, verses: [verse] });
        }
    }
    return groups;
}

function formatSurahContextLabel(surah?: { arabicName?: string; name?: string }): string {
    const arabic = surah?.arabicName?.trim() || '';
    const latin = surah?.name?.trim() || '';
    if (arabic && latin) return `${arabic} (${latin})`;
    return arabic || latin || 'Surah';
}

function getLocalDayKeyNow() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function TodayPageLoadingShell({ text }: { text: string }) {
    return (
        <div className="content-wrapper tab-content">
            <div className="today-header">
                <h1 className="text-2xl font-bold">Today</h1>
            </div>
            <div className="today-grid" aria-busy="true">
                <div className="card today-card today-card--review">
                    <div
                        className="today-card-content"
                        style={{ minHeight: '18rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                        <Spinner size={30} text={text} />
                    </div>
                </div>
                <div className="card today-card">
                    <div
                        className="today-card-content"
                        style={{ minHeight: '18rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                        <Spinner size={24} text="Warming daily portion..." />
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function TodayPage() {
    const { settings, saveSettings, isLoading: settingsLoading } = useSharedInstantSettings();
    const { nodes, dueNodes, saveNode: updateInstantNode, isLoading: nodesLoading } = useSharedInstantNodes();
    const { logs: reviewLogs, saveLog: saveInstantReviewLog } = useInstantReviewLogs();
    const { errors: reviewErrors, saveError: saveInstantReviewError, deleteError: removeInstantReviewError, isLoading: reviewErrorsLoading } = useSharedInstantReviewErrors();
    const { mindmaps, partMindMaps, saveMindMap, savePartMindMap, isLoading: mindmapsLoading } = useSharedInstantMindMaps();
    const { decisions: mutashabihatDecisions, custom: customMutashabihat } = useSharedInstantMutashabihat();
    const { stats: listeningStats, saveStats: saveListeningStats, deleteStats: deleteListeningStats } = useInstantListeningStats();
    const { progress: listeningProgress, saveProgress: saveListeningProgress, deleteProgress: deleteListeningProgress } = useSharedInstantListeningProgress();
    const isOnline = useContext(OnlineStatusContext);

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
    const [readOnlyMode, setReadOnlyMode] = useState(() => {
        if (!isOnline) return true;
        return (settings?.dailyPortionMode ?? 'audio') === 'reading';
    });
    const [isPersistingReviewAction, setIsPersistingReviewAction] = useState(false);
    const [isPersistingDailyComplete, setIsPersistingDailyComplete] = useState(false);
    const [isApplyingHistoryAction, setIsApplyingHistoryAction] = useState(false);
    const [viewState, setViewState] = useState({ reviewExpanded: true, dailyExpanded: true });
    const [isMobile, setIsMobile] = useState(false);
    const [mobileSection, setMobileSection] = useState<'review' | 'daily'>(
        settings?.todayDefaultMode === 'review' ? 'review' : 'daily'
    );
    const lastPortionKeyRef = useRef<string>('');
    const wordElementRefs = useRef<Array<HTMLSpanElement | null>>([]);
    const activeNodeBeforeSortChangeRef = useRef<string | null>(null);
    const previousReviewSortOrderRef = useRef<ReviewSortOrder>(normalizeReviewSortOrder(settings?.reviewSortOrder));
    const didRestoreActiveNodeRef = useRef(false);
    const reviewActionLockRef = useRef(false);
    const historyActionLockRef = useRef(false);
    const pendingAutoCreateNodeIdsRef = useRef<Set<string>>(new Set());
    const pendingReviewAdvanceRef = useRef<PendingReviewAdvance | null>(null);
    const [pendingAutoCreateJobs, setPendingAutoCreateJobs] = useState(0);
    const [hasResolvedInitialReviewSelection, setHasResolvedInitialReviewSelection] = useState(false);
    const [hasHydratedReviewQueue, setHasHydratedReviewQueue] = useState(false);
    const [isMindmapRevealPending, setIsMindmapRevealPending] = useState(false);

    // Local helper to find anchor for range using InstantDB mindmaps
    const findAnchorForRange = useCallback((surahId: number, start: number, end: number) => {
        const mindmap = mindmaps.find(m => Number(m.surahId) === surahId);
        const anchors = getEffectiveSurahAnchors(surahId, mindmap);
        return anchors.find(a => Number(a.startVerse) === start && Number(a.endVerse) === end);
    }, [mindmaps]);

    const mutashabihatDecisionsMap = useMemo(() => {
        const map = new Map<string, any>();
        mutashabihatDecisions.forEach((decision: any) => {
            map.set(decision.phraseId || decision.id, decision);
        });
        return map;
    }, [mutashabihatDecisions]);

    const isUnresolvedMutashabihatFailure = useCallback((absoluteAyah: number) => {
        const verseDecision = mutashabihatDecisionsMap.get(absoluteAyah.toString());
        if (verseDecision?.status === 'ignored' || !!verseDecision?.confirmedAt) return false;

        const entries = getMutashabihatForAbsolute(absoluteAyah, customMutashabihat);
        if (entries.length === 0) return false;

        return entries.some((entry: any) => {
            const decisionKey = `${absoluteAyah}-${entry.phraseId}`;
            const phraseDecision = mutashabihatDecisionsMap.get(decisionKey);
            if (!phraseDecision) return true;
            if (phraseDecision.status === 'ignored') return false;
            return !phraseDecision.confirmedAt;
        });
    }, [mutashabihatDecisionsMap, customMutashabihat]);

    const suspendedVerseGroupKeys = useMemo(() => {
        return deriveSuspendedVerseGroupKeys(reviewErrors, 3, settings?.suspendedVerseGroupsAcknowledged);
    }, [reviewErrors, settings?.suspendedVerseGroupsAcknowledged]);
    const reviewSortOrder = useMemo(() => normalizeReviewSortOrder(settings?.reviewSortOrder), [settings?.reviewSortOrder]);
    const currentDailyVerse = todaysPortion[currentVerseIndex] ?? null;
    const dailyPreviewWords = useMemo(() => {
        return (currentDailyVerse?.text ?? '').split(' ').filter(Boolean);
    }, [currentDailyVerse?.text]);
    const handleAudioWordIndexChange = useCallback((index: number) => {
        startTransition(() => {
            setHighlightedWordIndex(index);
        });
    }, []);

    // Order due nodes to keep mindmap + full-surah verses adjacent by surah
    const orderedDueNodes = useMemo(() => {
        if (!dueNodes.length) return [];
        const typeRank: Record<string, number> = {
            part_mindmap: 0,
            mindmap: 1,
            verse_segment: 2
        };
        const compareNodeIdentity = (a: MemoryNode, b: MemoryNode) => {
            const aType = typeRank[a.type] ?? 99;
            const bType = typeRank[b.type] ?? 99;
            if (aType !== bType) return aType - bType;

            const aPart = a.partId ?? 0;
            const bPart = b.partId ?? 0;
            if (aPart !== bPart) return aPart - bPart;

            const aSurah = resolveNodeSurahId(a) ?? 0;
            const bSurah = resolveNodeSurahId(b) ?? 0;
            if (aSurah !== bSurah) return aSurah - bSurah;

            const aStart = a.startVerse ?? 0;
            const bStart = b.startVerse ?? 0;
            if (aStart !== bStart) return aStart - bStart;

            const aEnd = a.endVerse ?? 0;
            const bEnd = b.endVerse ?? 0;
            if (aEnd !== bEnd) return aEnd - bEnd;

            const aTarget = a.targetId ?? '';
            const bTarget = b.targetId ?? '';
            if (aTarget !== bTarget) return aTarget.localeCompare(bTarget);

            return a.id.localeCompare(b.id);
        };

        const filteredDueNodes = filterReviewQueueNodes(dueNodes, settings, mindmaps, suspendedVerseGroupKeys);

        if (!filteredDueNodes.length) return [];

        if (reviewSortOrder === 'due_date') {
            return [...filteredDueNodes].sort((a, b) => {
                const aDue = getNodeDueDate(a);
                const bDue = getNodeDueDate(b);
                const aTime = aDue ? new Date(aDue).getTime() : 0;
                const bTime = bDue ? new Date(bDue).getTime() : 0;
                if (aTime !== bTime) return aTime - bTime;
                return compareNodeIdentity(a, b);
            });
        }

        if (reviewSortOrder === 'type_grouped') {
            return [...filteredDueNodes].sort((a, b) => {
                return compareNodeIdentity(a, b);
            });
        }

        const surahGroups = new Map<number, { mindmap?: MemoryNode; fullSurah?: MemoryNode; others: MemoryNode[] }>();
        const otherNodes: MemoryNode[] = [];

        const isFullSurah = (node: MemoryNode) => {
            if (node.type !== 'verse_segment') return false;
            const surahId = resolveNodeSurahId(node);
            if (!surahId) return false;
            const surah = getSurah(surahId);
            if (!surah) return false;
            return node.startVerse === 1 && node.endVerse === surah.verseCount;
        };

        filteredDueNodes.forEach(node => {
            const surahId = resolveNodeSurahId(node);
            if (surahId) {
                if (!surahGroups.has(surahId)) {
                    surahGroups.set(surahId, { others: [] });
                }
                const group = surahGroups.get(surahId)!;
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
                group.others.sort((a, b) => compareNodeIdentity(a, b));
                ordered.push(...group.others);
            }
        });

        if (otherNodes.length) {
            otherNodes.sort((a, b) => compareNodeIdentity(a, b));
            ordered.push(...otherNodes);
        }

        return ordered;
    }, [dueNodes, settings, mindmaps, suspendedVerseGroupKeys, reviewSortOrder]);

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
            const anchors = getEffectiveSurahAnchors(surahId, mindmapForAnchors);
            if (anchors.length > 0) {
                anchors.forEach(anchor => {
                    const anchorNodeExists = nodes.some(n =>
                        n.type === 'verse_segment' &&
                        resolveNodeSurahId(n) === surahId &&
                        Number(n.startVerse) === Number(anchor.startVerse) &&
                        Number(n.endVerse) === Number(anchor.endVerse)
                    );
                    if (!anchorNodeExists) {
                        const targetId = anchor.id || `anchor-${surahId}-${anchor.startVerse}-${anchor.endVerse}`;
                        nodesToCreate.push({
                            id: stableNodeId('memory_node', 'verse_segment', surahId, anchor.startVerse, anchor.endVerse),
                            type: 'verse_segment',
                            surahId,
                            startVerse: anchor.startVerse,
                            endVerse: anchor.endVerse,
                            targetId,
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
                (n.type === 'mindmap' && resolveNodeSurahId(n) === surahId)
            );
            if (mindmap && !mindmapNodeExists) {
                nodesToCreate.push({
                    id: stableNodeId('memory_node', 'mindmap', surahId),
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
                (n.type === 'part_mindmap' && resolveNodePartId(n) === partId)
            );
            if (partMindmap && !partMindmapNodeExists) {
                nodesToCreate.push({
                    id: stableNodeId('memory_node', 'part_mindmap', partId),
                    type: 'part_mindmap',
                    partId,
                    targetId: partTargetId,
                    scheduler: createNewFSRSState(),
                    createdAt: new Date().toISOString()
                });
            }
        });

        const nodesToPersist = nodesToCreate.filter((node) => !pendingAutoCreateNodeIdsRef.current.has(node.id));
        if (nodesToPersist.length === 0) return;

        nodesToPersist.forEach((node) => pendingAutoCreateNodeIdsRef.current.add(node.id));
        setPendingAutoCreateJobs((count) => count + 1);

        let cancelled = false;
        const persistMissingNodes = async () => {
            try {
                for (let i = 0; i < nodesToPersist.length; i += AUTO_NODE_CREATE_BATCH_SIZE) {
                    if (cancelled) break;
                    const batch = nodesToPersist.slice(i, i + AUTO_NODE_CREATE_BATCH_SIZE);
                    await Promise.all(batch.map((node) => updateInstantNode(node)));
                }
            } catch (error) {
                console.error('Failed to persist auto-created review nodes', error);
            } finally {
                nodesToPersist.forEach((node) => pendingAutoCreateNodeIdsRef.current.delete(node.id));
                setPendingAutoCreateJobs((count) => Math.max(0, count - 1));
            }
        };

        void persistMissingNodes();
        return () => {
            cancelled = true;
        };
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
            const wordEl = wordElementRefs.current[highlightedWordIndex];
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
    }, [currentVerseIndex, highlightedWordIndex, smoothScrollContainer]);

    useEffect(() => {
        const defaultMode = settings?.dailyPortionMode ?? 'audio';
        if (!isOnline) {
            setReadOnlyMode(true);
            return;
        }
        setReadOnlyMode(defaultMode === 'reading');
    }, [settings?.dailyPortionMode, isOnline]);

    useEffect(() => {
        setMobileSection(settings?.todayDefaultMode === 'review' ? 'review' : 'daily');
    }, [settings?.todayDefaultMode]);

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

    const activeReviewNodeId = orderedDueNodes[currentReviewIndex]?.id;

    useEffect(() => {
        if (didRestoreActiveNodeRef.current) return;
        if (typeof window === 'undefined') return;

        const storedNodeId = window.sessionStorage.getItem(ACTIVE_REVIEW_NODE_STORAGE_KEY);
        if (!storedNodeId || orderedDueNodes.length === 0) {
            didRestoreActiveNodeRef.current = true;
            setHasResolvedInitialReviewSelection(true);
            return;
        }

        const restoredIndex = orderedDueNodes.findIndex(node => node.id === storedNodeId);
        if (restoredIndex >= 0 && restoredIndex !== currentReviewIndex) {
            setCurrentReviewIndex(restoredIndex);
        }
        didRestoreActiveNodeRef.current = true;
        setHasResolvedInitialReviewSelection(true);
    }, [orderedDueNodes, currentReviewIndex]);

    useEffect(() => {
        if (hasHydratedReviewQueue) return;
        const queueDataReady = !settingsLoading && !nodesLoading && !mindmapsLoading && !reviewErrorsLoading;
        const isAutoCreatingNodes = pendingAutoCreateJobs > 0;
        if (!queueDataReady || !hasResolvedInitialReviewSelection || isAutoCreatingNodes) return;
        setHasHydratedReviewQueue(true);
    }, [
        hasHydratedReviewQueue,
        settingsLoading,
        nodesLoading,
        mindmapsLoading,
        reviewErrorsLoading,
        hasResolvedInitialReviewSelection,
        pendingAutoCreateJobs,
    ]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!didRestoreActiveNodeRef.current) return;
        if (activeReviewNodeId) {
            window.sessionStorage.setItem(ACTIVE_REVIEW_NODE_STORAGE_KEY, activeReviewNodeId);
        } else {
            window.sessionStorage.removeItem(ACTIVE_REVIEW_NODE_STORAGE_KEY);
        }
    }, [activeReviewNodeId]);

    useEffect(() => {
        activeNodeBeforeSortChangeRef.current = activeReviewNodeId ?? null;
    }, [activeReviewNodeId]);

    useEffect(() => {
        const previousReviewSortOrder = previousReviewSortOrderRef.current;
        if (previousReviewSortOrder === reviewSortOrder) return;
        previousReviewSortOrderRef.current = reviewSortOrder;
        if (!orderedDueNodes.length) return;
        const prevActiveNodeId = activeNodeBeforeSortChangeRef.current;
        if (!prevActiveNodeId) return;
        const preservedIndex = orderedDueNodes.findIndex(node => node.id === prevActiveNodeId);
        if (preservedIndex >= 0 && preservedIndex !== currentReviewIndex) {
            setCurrentReviewIndex(preservedIndex);
        }
    }, [reviewSortOrder, orderedDueNodes, currentReviewIndex]);

    useEffect(() => {
        const pending = pendingReviewAdvanceRef.current;
        if (!pending) return;

        const reviewedIndex = orderedDueNodes.findIndex(node => node.id === pending.reviewedNodeId);
        if (reviewedIndex >= 0) return;

        let targetIndex = currentReviewIndex;
        if (pending.nextNodeId) {
            const nextNodeIndex = orderedDueNodes.findIndex(node => node.id === pending.nextNodeId);
            if (nextNodeIndex >= 0) {
                targetIndex = nextNodeIndex;
            } else if (orderedDueNodes.length > 0) {
                targetIndex = Math.min(pending.beforeIndex, orderedDueNodes.length - 1);
            } else {
                targetIndex = 0;
            }
        } else if (orderedDueNodes.length > 0) {
            targetIndex = Math.min(pending.beforeIndex, orderedDueNodes.length - 1);
        } else {
            targetIndex = 0;
        }

        pendingReviewAdvanceRef.current = null;
        if (targetIndex !== currentReviewIndex) {
            setCurrentReviewIndex(targetIndex);
        }
    }, [orderedDueNodes, currentReviewIndex]);

    useEffect(() => {
        if (!activeReviewNodeId) return;
        setRevealedChunks(0);
        setCurrentVerseInReview(0);
        setShowGrading(false);
    }, [activeReviewNodeId]);

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
                if (mq.addEventListener) {
                    mq.addEventListener('change', handler);
                    return () => mq.removeEventListener('change', handler);
                }
                mq.addListener(handler);
                return () => mq.removeListener(handler);
            }
        }
    }, [theme]);

    // Mindmap Editor States
    const [activeMindmapEditor, setActiveMindmapEditor] = useState<{ surahId: number; snapshot?: any } | null>(null);
    const [activePartEditor, setActivePartEditor] = useState<{ partId: QuranPart; snapshot?: any } | null>(null);
    useMindmapBackGestureGuard(Boolean(activeMindmapEditor || activePartEditor));

    const toggleSection = (section: 'review' | 'daily') => {
        setViewState(prev => {
            if (!isMobile) return prev;

            if (section === 'review') {
                const newState = !prev.reviewExpanded;
                return { ...prev, reviewExpanded: newState };
            } else {
                const newState = !prev.dailyExpanded;
                return { ...prev, dailyExpanded: newState };
            }
        });
    };

    useEffect(() => {
        const handleResize = () => {
            const nextIsMobile = window.innerWidth < 768;
            setIsMobile(nextIsMobile);
            if (!nextIsMobile) {
                setViewState({ reviewExpanded: true, dailyExpanded: true });
            }
        };

        if (typeof window !== 'undefined') {
            const nextIsMobile = window.innerWidth < 768;
            setIsMobile(nextIsMobile);
            setViewState({ reviewExpanded: true, dailyExpanded: true });
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
    const { confirm } = useConfirmDialog();
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
    const UNDO_REDO_DAY_KEY_STORAGE_KEY = 'review_undo_redo_day_key_v1';
    const UNDO_STACK_LIMIT = 10;

    const getLocalDayKey = () => getLocalDayKeyNow();

    const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
    const undoStackRef = useRef<UndoEntry[]>([]);
    const [redoStack, setRedoStack] = useState<UndoEntry[]>([]);
    const redoStackRef = useRef<UndoEntry[]>([]);
    const historyDayKeyRef = useRef<string>(getLocalDayKey());

    const clearUndoRedoHistoryForNewDay = useCallback((nextDayKey: string) => {
        undoStackRef.current = [];
        redoStackRef.current = [];
        setUndoStack([]);
        setRedoStack([]);
        historyDayKeyRef.current = nextDayKey;
        try {
            localStorage.setItem(UNDO_REDO_DAY_KEY_STORAGE_KEY, nextDayKey);
            localStorage.removeItem(UNDO_STACK_STORAGE_KEY);
            localStorage.removeItem(REDO_STACK_STORAGE_KEY);
        } catch (e) {
            console.warn('Failed to reset undo/redo history for new day', e);
        }
    }, []);

    useEffect(() => {
        const todayKey = getLocalDayKey();
        const storedDayKey = localStorage.getItem(UNDO_REDO_DAY_KEY_STORAGE_KEY);
        if (storedDayKey !== todayKey) {
            clearUndoRedoHistoryForNewDay(todayKey);
        } else {
            historyDayKeyRef.current = todayKey;
        }
    }, [clearUndoRedoHistoryForNewDay]);

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

    useEffect(() => {
        const maybeResetForNewDay = () => {
            const todayKey = getLocalDayKey();
            if (todayKey !== historyDayKeyRef.current) {
                clearUndoRedoHistoryForNewDay(todayKey);
            }
        };

        const intervalId = window.setInterval(maybeResetForNewDay, 60_000);
        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                maybeResetForNewDay();
            }
        };
        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => {
            window.clearInterval(intervalId);
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, [clearUndoRedoHistoryForNewDay]);

    const persistUndoStack = useCallback((nextStack: UndoEntry[]) => {
        const todayKey = getLocalDayKey();
        if (todayKey !== historyDayKeyRef.current) {
            historyDayKeyRef.current = todayKey;
        }
        undoStackRef.current = nextStack;
        setUndoStack(nextStack);
        try {
            localStorage.setItem(UNDO_REDO_DAY_KEY_STORAGE_KEY, historyDayKeyRef.current);
            localStorage.setItem(UNDO_STACK_STORAGE_KEY, JSON.stringify(nextStack));
        } catch (e) {
            console.warn('Failed to persist undo history', e);
        }
    }, []);

    const persistRedoStack = useCallback((nextStack: UndoEntry[]) => {
        const todayKey = getLocalDayKey();
        if (todayKey !== historyDayKeyRef.current) {
            historyDayKeyRef.current = todayKey;
        }
        redoStackRef.current = nextStack;
        setRedoStack(nextStack);
        try {
            localStorage.setItem(UNDO_REDO_DAY_KEY_STORAGE_KEY, historyDayKeyRef.current);
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
        startTransition(() => {
            setToasts(prev => [...prev, { id, type, message, info }].slice(-3));
        });
        setTimeout(() => {
            startTransition(() => {
                setToasts(prev => prev.filter(t => t.id !== id));
            });
        }, 6000);
    }, []);

    // FSRS Optimization Check
    const { meta: optimizationMeta, weights: customWeights, saveMeta: saveOptimizationMeta, saveWeights: saveCustomWeights } = useInstantOptimization();

    useEffect(() => {
        if (!FSRS_OPTIMIZATION_ENABLED) {
            return;
        }

        const checkOptimization = async () => {
            const count = reviewLogs.length;

            // Optimization triggers when enough new logs are accumulated.
            if (count >= (optimizationMeta.logCountAtLastOptimization || 0) + FSRS_OPTIMIZATION_LOG_DELTA) {
                addToast('success', 'Optimizing FSRS...', 'Analyzing your review history...');

                try {
                    // Map logs to match ReviewLogInput interface
                    const formattedLogs = reviewLogs
                        .map(log => {
                            const nodeId = String(log?.nodeId || '').trim();
                            if (!nodeId) return null;
                            const review = String(log?.review_time || '').trim();
                            const reviewDate = review ? new Date(review) : null;
                            const elapsedDays = Number.isFinite(Number(log?.elapsed_days)) ? Number(log.elapsed_days) : 0;
                            return {
                                nodeId,
                                rating: (log.rating === 'Good' || log.rating === 3) ? 3 : 1, // Map string/number rating to FSRS number
                                elapsed_days: Math.max(0, Math.floor(elapsedDays)),
                                review: reviewDate && !Number.isNaN(reviewDate.getTime())
                                    ? reviewDate.toISOString()
                                    : new Date().toISOString()
                            };
                        })
                        .filter((log): log is { nodeId: string; rating: number; elapsed_days: number; review: string } => !!log);

                    if (formattedLogs.length === 0) return;

                    const result = await optimizeWeights(formattedLogs);

                    if (result.success && result.weights) {
                        await Promise.all([
                            saveCustomWeights(result.weights),
                            saveOptimizationMeta({
                            ...optimizationMeta,
                            logCountAtLastOptimization: count,
                            lastOptimizedAt: new Date().toISOString()
                            })
                        ]);
                        addToast('success', 'Optimization Complete', 'FSRS parameters updated based on your performance.');
                    } else {
                        console.error('Optimization failed:', result.error);
                    }
                } catch (err) {
                    console.error('Optimization error:', err);
                }
            }
        };

        const timer = setTimeout(checkOptimization, FSRS_OPTIMIZATION_DELAY_MS);
        return () => clearTimeout(timer);
    }, [addToast, reviewLogs, optimizationMeta, saveCustomWeights, saveOptimizationMeta]);

    const targetBoxRef = useRef<HTMLDivElement>(null);
    const [reviewLayoutVersion, setReviewLayoutVersion] = useState(0);
    const lastRevealPositionRef = useRef<{ verse: number; chunks: number; scrollTop: number } | null>(null);

    const resolveActivePartProgress = useCallback(() => {
        if (!settings) return undefined;
        const exact = listeningProgress.find(p => p.partId === settings.activePart);
        if (exact) return exact;
        if (settings.activePart === ALL_QURAN_PART && (settings.partSystemVersion ?? 1) < 2) {
            return listeningProgress.find(p => p.partId === LEGACY_ALL_QURAN_PART);
        }
        return undefined;
    }, [listeningProgress, settings]);

    // Load verses through shared loader/cache to avoid duplicate parse work.
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const verses = await getQuranVerses();
                if (cancelled) return;
                setAllVerses(verses);
            } catch {
                if (cancelled) return;
                setAllVerses([]);
            } finally {
                if (!cancelled) {
                    setIsVersesLoaded(true);
                }
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
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
        const partProgress = resolveActivePartProgress();
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
                    remainingLength += (allVersesInPart[i]?.text || '').length;
                    i++;
                }
                // If <= 5 verses or total text is short (< 400 chars)
                if (remainingCount <= 5 || remainingLength < 400) {
                    // Ignore surahs with very long verses (e.g. Baqarah 282)
                    const surahVerses = allVersesInPart.filter(v => v.surahId === lastVerseInProposed.surahId);
                    const hasVeryLongVerses = surahVerses.some(v => (v?.text || '').length > 600);

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
    }, [allVerses, settings, resolveActivePartProgress]);

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


    const queueReviewAdvance = useCallback((reviewedNodeId: string, beforeIndex: number) => {
        const nextNodeId = beforeIndex + 1 < orderedDueNodes.length
            ? orderedDueNodes[beforeIndex + 1].id
            : null;
        pendingReviewAdvanceRef.current = {
            reviewedNodeId,
            nextNodeId,
            beforeIndex,
        };
        setRevealedChunks(0);
        setCurrentVerseInReview(0);
        setShowGrading(false);
    }, [orderedDueNodes]);


    // Grade review
    const handleGrade = useCallback(async (remembered: boolean) => {
        if (reviewActionLockRef.current || historyActionLockRef.current || isPersistingReviewAction || isApplyingHistoryAction) return;
        const node = orderedDueNodes[currentReviewIndex];
        if (!node || !node.scheduler) return;
        reviewActionLockRef.current = true;
        setIsPersistingReviewAction(true);
        const resolvedSurahId = resolveNodeSurahId(node);

        const errorId = !remembered ? id() : undefined;
        let errorPayload: any | undefined;
        const info = node.type === 'part_mindmap' ? `Part ${node.partId}` :
            node.type === 'mindmap' ? getSurah(resolvedSurahId || 0)?.arabicName :
                `${getSurah(resolvedSurahId || 0)?.arabicName} (${node.startVerse}-${node.endVerse})`;

        const toastType = remembered ? 'success' : 'error';
        const toastMessage = remembered ? 'Remembered' : 'Forgot';

        // Use FSRS algorithm
        const customWeightsFromInstant = customWeights;
        const result = reviewCard(node.scheduler as any, remembered, node.id, customWeightsFromInstant);
        const afterNode = { ...node, scheduler: result.newState };

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

        if (!remembered) {
            const failedAyahId =
                node.type === 'verse_segment' && node.startVerse !== undefined
                    ? (() => {
                        const segmentStart = node.startVerse;
                        const segmentEnd = node.endVerse ?? segmentStart;
                        const currentAyah = Math.min(segmentEnd, segmentStart + currentVerseInReview);
                        const isAtBeginningOfUnrevealedVerse = revealedChunks === 0;
                        const isFirstVerseInCurrentReview = currentAyah === segmentStart;

                        // Only use previous-verse attribution after the first verse in this review range.
                        if (isAtBeginningOfUnrevealedVerse && !isFirstVerseInCurrentReview) {
                            return currentAyah - 1;
                        }
                        return currentAyah;
                    })()
                    : node.startVerse;

            const errorToSave: any = {
                id: errorId!,
                timestamp: new Date().toISOString(),
                nodeId: node.id,
                nodeType: node.type,
                grade: 1,
            };

            // Add optional fields only if they exist
            if (resolvedSurahId !== null) errorToSave.surahId = resolvedSurahId;
            if (node.partId !== undefined) errorToSave.partId = node.partId;
            if (node.startVerse !== undefined) errorToSave.startVerse = node.startVerse;
            if (node.endVerse !== undefined) errorToSave.endVerse = node.endVerse;

            const anchor = (node.startVerse !== undefined && node.endVerse !== undefined)
                ? findAnchorForRange(resolvedSurahId || 0, node.startVerse, node.endVerse)
                : undefined;

            if (anchor?.label) errorToSave.anchorLabel = anchor.label;
            if (anchor?.id) errorToSave.anchorId = anchor.id;

            const abs = failedAyahId && resolvedSurahId ? surahAyahToAbsolute(resolvedSurahId, failedAyahId) : undefined;
            if (abs !== undefined) {
                errorToSave.absoluteAyah = abs;
                if (isUnresolvedMutashabihatFailure(abs)) {
                    errorToSave.type = 'similarity';
                }
            }

            errorPayload = errorToSave;
            try {
                await Promise.all([
                    updateInstantNode(afterNode),
                    saveInstantReviewLog(logToSave),
                    saveInstantReviewError(errorToSave),
                ]);
            } catch (err) {
                console.error('Failed to persist forgot grading action', err);
                addToast('error', 'Failed to save grade', 'Please try again.');
                return;
            } finally {
                reviewActionLockRef.current = false;
                setIsPersistingReviewAction(false);
            }
        } else {
            try {
                await Promise.all([
                    updateInstantNode(afterNode),
                    saveInstantReviewLog(logToSave),
                ]);
            } catch (err) {
                console.error('Failed to persist remembered grading action', err);
                addToast('error', 'Failed to save grade', 'Please try again.');
                return;
            } finally {
                reviewActionLockRef.current = false;
                setIsPersistingReviewAction(false);
            }
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
        queueReviewAdvance(node.id, currentReviewIndex);
    }, [orderedDueNodes, currentReviewIndex, addToast, customWeights, updateInstantNode, saveInstantReviewLog, saveInstantReviewError, currentVerseInReview, revealedChunks, isPersistingReviewAction, isApplyingHistoryAction, isUnresolvedMutashabihatFailure, findAnchorForRange, pushUndoEntry, queueReviewAdvance]);

    const handlePostpone = useCallback(async () => {
        if (reviewActionLockRef.current || historyActionLockRef.current || isPersistingReviewAction || isApplyingHistoryAction) return;
        const node = orderedDueNodes[currentReviewIndex];
        if (!node || !node.scheduler) return;
        reviewActionLockRef.current = true;
        setIsPersistingReviewAction(true);
        const resolvedSurahId = resolveNodeSurahId(node);

        const info = node.type === 'part_mindmap' ? `Part ${node.partId}` :
            node.type === 'mindmap' ? getSurah(resolvedSurahId || 0)?.arabicName :
                `${getSurah(resolvedSurahId || 0)?.arabicName} (${node.startVerse}-${node.endVerse})`;

        // Postpone relative to now, not the existing due date.
        // If a card is already overdue, adding a day to its stale due date can
        // still leave it due today and require multiple taps to leave the queue.
        const scheduler = node.scheduler as any;
        const due = new Date();
        due.setDate(due.getDate() + 1);

        const afterNode = {
            ...node,
            scheduler: {
                ...scheduler,
                due: due.toISOString()
            }
        };

        try {
            await updateInstantNode(afterNode);
        } catch (err) {
            console.error('Failed to persist postpone action', err);
            addToast('error', 'Failed to save postpone', 'Please try again.');
            reviewActionLockRef.current = false;
            setIsPersistingReviewAction(false);
            return;
        }

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
        queueReviewAdvance(node.id, currentReviewIndex);
        reviewActionLockRef.current = false;
        setIsPersistingReviewAction(false);
    }, [orderedDueNodes, currentReviewIndex, addToast, updateInstantNode, isPersistingReviewAction, isApplyingHistoryAction, pushUndoEntry, queueReviewAdvance]);

    const handleUndo = useCallback(async (source: 'toast' | 'keyboard', toastId?: string) => {
        if (historyActionLockRef.current || reviewActionLockRef.current || isApplyingHistoryAction) return;
        const stack = undoStackRef.current;
        if (!stack.length) return;
        const last = stack[stack.length - 1];
        const nextStack = stack.slice(0, -1);
        const nextRedo = [...redoStackRef.current, last].slice(-UNDO_STACK_LIMIT);

        historyActionLockRef.current = true;
        setIsApplyingHistoryAction(true);
        try {
            if (last.kind === 'review') {
                await updateInstantNode(last.beforeNode);
                if (last.errorId) {
                    await removeInstantReviewError(last.errorId);
                }
                setCurrentReviewIndex(last.beforeIndex);
                setRevealedChunks(0);
                setCurrentVerseInReview(0);
                setShowGrading(last.beforeNode.type !== 'verse_segment');
            } else {
                const writes: Promise<any>[] = [];
                if (last.beforeProgress) {
                    writes.push(saveListeningProgress(last.partId, last.beforeProgress.lastVerseIndex, last.beforeProgress.cycles, last.beforeUpdatedAt));
                } else {
                    writes.push(deleteListeningProgress(last.partId));
                }
                Object.entries(last.beforeStats).forEach(([surahIdStr, stats]) => {
                    const surahId = Number(surahIdStr);
                    if (!Number.isFinite(surahId)) return;
                    if (stats) {
                        writes.push(saveListeningStats(surahId, stats));
                    } else {
                        writes.push(deleteListeningStats(surahId));
                    }
                });
                await Promise.all(writes);
                setListeningComplete(last.beforeListeningComplete);
            }
        } catch (err) {
            console.error('Failed to persist undo action', err);
            addToast('error', 'Undo failed', 'Please try again.');
            historyActionLockRef.current = false;
            setIsApplyingHistoryAction(false);
            return;
        }

        persistUndoStack(nextStack);
        persistRedoStack(nextRedo);
        if (source === 'toast' && toastId) {
            setToasts(prev => prev.filter(t => t.id !== toastId));
        }
        addToast(last.toastType, `Undid ${last.toastMessage}`, last.toastInfo);
        historyActionLockRef.current = false;
        setIsApplyingHistoryAction(false);
    }, [persistUndoStack, persistRedoStack, updateInstantNode, removeInstantReviewError, addToast, saveListeningProgress, deleteListeningProgress, saveListeningStats, deleteListeningStats, isApplyingHistoryAction]);

    const handleRedo = useCallback(async (source: 'toast' | 'keyboard', toastId?: string) => {
        if (historyActionLockRef.current || reviewActionLockRef.current || isApplyingHistoryAction) return;
        const stack = redoStackRef.current;
        if (!stack.length) return;
        const last = stack[stack.length - 1];
        const nextStack = stack.slice(0, -1);
        const nextUndo = [...undoStackRef.current, last].slice(-UNDO_STACK_LIMIT);

        historyActionLockRef.current = true;
        setIsApplyingHistoryAction(true);
        try {
            if (last.kind === 'review') {
                await updateInstantNode(last.afterNode);
                if (last.errorPayload) {
                    await saveInstantReviewError(last.errorPayload);
                }
                setCurrentReviewIndex(last.afterIndex);
                setRevealedChunks(0);
                setCurrentVerseInReview(0);
                setShowGrading(false);
            } else {
                const writes: Promise<any>[] = [
                    saveListeningProgress(last.partId, last.afterProgress.lastVerseIndex, last.afterProgress.cycles, last.afterUpdatedAt)
                ];
                Object.entries(last.afterStats).forEach(([surahIdStr, stats]) => {
                    const surahId = Number(surahIdStr);
                    if (!Number.isFinite(surahId)) return;
                    writes.push(saveListeningStats(surahId, stats));
                });
                await Promise.all(writes);
                setListeningComplete(last.afterListeningComplete);
            }
        } catch (err) {
            console.error('Failed to persist redo action', err);
            addToast('error', 'Redo failed', 'Please try again.');
            historyActionLockRef.current = false;
            setIsApplyingHistoryAction(false);
            return;
        }

        persistRedoStack(nextStack);
        persistUndoStack(nextUndo);
        if (source === 'toast' && toastId) {
            setToasts(prev => prev.filter(t => t.id !== toastId));
        }
        addToast(last.toastType, `Redid ${last.toastMessage}`, last.toastInfo);
        historyActionLockRef.current = false;
        setIsApplyingHistoryAction(false);
    }, [persistRedoStack, persistUndoStack, updateInstantNode, saveInstantReviewError, addToast, saveListeningProgress, saveListeningStats, isApplyingHistoryAction]);


    const handleCompleteListening = async () => {
        if (!settings) return;
        if (isPersistingDailyComplete) return;
        if (isApplyingHistoryAction) return;

        // Use InstantDB listening progress
        const partProgress = resolveActivePartProgress();
        const current = partProgress?.lastVerseIndex || 0;
        const totalInPart = portionData.totalVerses;
        if (totalInPart <= 0) return;
        setIsPersistingDailyComplete(true);

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

        // Update stats for each surah in the portion
        const surahsInPortion = new Set(todaysPortion.map(v => v.surahId));
        const beforeStats: Record<number, any | null> = {};
        const afterStats: Record<number, any> = {};
        const nowIso = afterUpdatedAt;
        const statsWrites: Promise<any>[] = [];

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

            statsWrites.push(saveListeningStats(surahId, {
                ...restNext,
                surahId
            }));
        });

        try {
            await Promise.all([
                saveListeningProgress(settings.activePart, next, cycles, afterUpdatedAt),
                ...statsWrites
            ]);
        } catch (err) {
            console.error('Failed to persist daily completion', err);
            addToast('error', 'Failed to save completion', 'Please try again.');
            setIsPersistingDailyComplete(false);
            return;
        }

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
        setIsPersistingDailyComplete(false);
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

    const versesBySurah = useMemo(() => {
        const map = new Map<number, Verse[]>();
        allVerses.forEach((verse) => {
            const existing = map.get(verse.surahId);
            if (existing) {
                existing.push(verse);
                return;
            }
            map.set(verse.surahId, [verse]);
        });
        return map;
    }, [allVerses]);

    const verseLookupBySurahAyah = useMemo(() => {
        const map = new Map<string, Verse>();
        allVerses.forEach((verse) => {
            map.set(`${verse.surahId}:${verse.ayahId}`, verse);
        });
        return map;
    }, [allVerses]);

    const activeContent = useMemo(() => {
        if (orderedDueNodes.length === 0 || currentReviewIndex >= orderedDueNodes.length) return null;
        const node = orderedDueNodes[currentReviewIndex];

        if (node.type === 'part_mindmap') {
            const partId = resolveNodePartId(node);
            if (partId === null) return null;
            const pm = partMindMaps.find(m => Number(m.partId) === partId);
            return { type: 'part_mindmap', partId, mindmap: pm } as const;
        }

        if (node.type === 'mindmap') {
            const surahId = resolveNodeSurahId(node);
            if (!surahId) return null;
            const surah = getSurah(surahId);
            const mindmap = mindmaps.find(mm => Number(mm.surahId) === surahId);
            const verses: Verse[] = [];
            if (mindmap?.anchors?.length) {
                mindmap.anchors.forEach(anchor => {
                    for (let ayahId = anchor.startVerse; ayahId <= anchor.endVerse; ayahId++) {
                        const verse = verseLookupBySurahAyah.get(`${anchor.surahId}:${ayahId}`);
                        if (verse) verses.push(verse);
                    }
                });
            }
            return { type: 'mindmap', surah, mindmap, verses } as const;
        }

        const surahId = resolveNodeSurahId(node);
        if (!surahId) return null;
        const surah = getSurah(surahId);
        const surahVerses = versesBySurah.get(surahId) || [];
        const startVerse = node.startVerse || 1;
        const endVerse = node.endVerse || 999;
        const verses = surahVerses.filter(v => v.ayahId >= startVerse && v.ayahId <= endVerse);
        const contextVerses: Verse[] = [];
        let lookback = 1;
        while (contextVerses.length < 2 || (contextVerses.length < 5 && hasMutashabihForAbsolute(surahAyahToAbsolute(surahId, startVerse - lookback + 1)))) {
            const candidate = verseLookupBySurahAyah.get(`${surahId}:${startVerse - lookback}`);
            if (!candidate) break;
            contextVerses.unshift(candidate);
            const abs = surahAyahToAbsolute(candidate.surahId, candidate.ayahId);
            if (!hasMutashabihForAbsolute(abs) && contextVerses.length >= 2) break;
            lookback++;
        }

        return { type: 'verse', surah, verses, contextVerses } as const;
    }, [orderedDueNodes, currentReviewIndex, partMindMaps, mindmaps, versesBySurah, verseLookupBySurahAyah]);

    const normalizedActiveVerses = useMemo(() => {
        const raw = activeContent?.verses;
        if (!raw || !Array.isArray(raw)) return [];
        return raw.filter((v): v is Verse => !!v && typeof v.text === 'string');
    }, [activeContent?.verses]);
    // Reveal Logic
    const getCurrentVerseChunks = () => {
        if (normalizedActiveVerses.length === 0) return [];
        const safeVerseIndex = Math.max(0, Math.min(currentVerseInReview, normalizedActiveVerses.length - 1));
        const v = normalizedActiveVerses[safeVerseIndex];
        if (!v?.text) return [];
        return splitIntoChunks(v.text);
    };

    const verseChunks = getCurrentVerseChunks();
    const totalChunks = verseChunks.length;
    const totalVerses = normalizedActiveVerses.length;

    const verseChunkMap = normalizedActiveVerses.map(v => splitIntoChunks(v?.text ?? ''));
    const hasCurrentVerseNextChunk = revealedChunks < totalChunks;
    const nextRevealVerseIndex =
        totalVerses > 0
            ? (hasCurrentVerseNextChunk
                ? currentVerseInReview
                : (currentVerseInReview < totalVerses - 1 ? currentVerseInReview + 1 : -1))
            : -1;
    const nextRevealChunkIndex = hasCurrentVerseNextChunk ? revealedChunks : 0;

    const handleRevealMindmap = useCallback(() => {
        setShowGrading(true);
        setIsMindmapRevealPending(true);
        requestAnimationFrame(() => {
            setIsMindmapRevealPending(false);
        });
    }, []);

    const handleRevealNext = useCallback(() => {
        if (activeContent && (activeContent.type === 'mindmap' || activeContent.type === 'part_mindmap')) {
            handleRevealMindmap();
            return;
        }
        if (revealedChunks < totalChunks) {
            setRevealedChunks(prev => prev + 1);
        } else if (currentVerseInReview < totalVerses - 1) {
            setCurrentVerseInReview(prev => prev + 1);
            setRevealedChunks(1); // One click moves and reveals first chunk
        }
    }, [revealedChunks, totalChunks, currentVerseInReview, totalVerses, activeContent, handleRevealMindmap]);

    const activeContentPreloadKey = useMemo(() => {
        if (!activeContent || (activeContent.type !== 'mindmap' && activeContent.type !== 'part_mindmap')) {
            return null;
        }
        return activeContent.type === 'mindmap' ? `mindmap-${activeContent?.surah?.id}` : `part-${activeContent?.partId}`;
    }, [activeContent]);

    useEffect(() => {
        if (!activeContentPreloadKey) return;
        void import('@/components/MindmapViewer');
    }, [activeContentPreloadKey]);

    useEffect(() => {
        if (!showGrading) {
            setIsMindmapRevealPending(false);
        }
    }, [showGrading, currentReviewIndex]);

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Check if we have any items to review
            const hasItems = orderedDueNodes.length > 0;
            if (!hasItems) return;
            if (reviewActionLockRef.current || historyActionLockRef.current || isPersistingReviewAction || isApplyingHistoryAction) return;

            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            if (activeContent?.type === 'verse') {
                const isVerseFullyRevealed =
                    totalVerses > 0 &&
                    revealedChunks >= totalChunks &&
                    currentVerseInReview >= totalVerses - 1;

                if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    handlePostpone();
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    handleGrade(false);
                } else if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    if (isVerseFullyRevealed) {
                        handleGrade(true);
                    } else {
                        handleRevealNext();
                    }
                }
            } else if (showGrading) {
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
    }, [orderedDueNodes, showGrading, handlePostpone, handleGrade, handleRevealNext, activeContent?.type, totalVerses, revealedChunks, totalChunks, currentVerseInReview, isPersistingReviewAction, isApplyingHistoryAction]);

    useEffect(() => {
        const container = targetBoxRef.current;
        if (!container) return;

        const reviewContainer = container.closest('.review-verse-container') as HTMLElement | null;
        const contextBox = reviewContainer?.querySelector('.context-box') as HTMLElement | null;

        if (typeof ResizeObserver !== 'undefined') {
            const observer = new ResizeObserver(() => {
                setReviewLayoutVersion(prev => prev + 1);
            });
            observer.observe(container);
            if (reviewContainer) observer.observe(reviewContainer);
            if (contextBox) observer.observe(contextBox);
            return () => observer.disconnect();
        }

        const onResize = () => setReviewLayoutVersion(prev => prev + 1);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [currentReviewIndex, activeContent?.type]);

    useEffect(() => {
        if (!targetBoxRef.current) return;

        requestAnimationFrame(() => {
            if (!targetBoxRef.current) return;
            const container = targetBoxRef.current;
            const containerHeight = container.clientHeight;
            const activeVerse = container.querySelector('.active-verse') as HTMLElement | null;

            if (activeVerse) {
                const textEl = activeVerse.querySelector('.grouped-verse-text') as HTMLElement | null;
                const nextChunkEl =
                    (textEl?.querySelector('.review-chunk--next') as HTMLElement | null) ||
                    (container.querySelector('.review-chunk--next') as HTMLElement | null);
                const visibleChunks = textEl
                    ? Array.from(textEl.querySelectorAll('.review-chunk--revealed')) as HTMLElement[]
                    : [];
                const lastRevealed = visibleChunks[visibleChunks.length - 1] as HTMLElement | undefined;
                const targetEl = lastRevealed || nextChunkEl || activeVerse;
                const containerRect = container.getBoundingClientRect();
                const targetRect = targetEl.getBoundingClientRect();
                const nextRect = nextChunkEl?.getBoundingClientRect();
                const styles = window.getComputedStyle(container);
                const paddingBottom = Number.parseFloat(styles.paddingBottom || '0') || 0;
                const paddingTop = Number.parseFloat(styles.paddingTop || '0') || 0;
                // Use almost the entire container viewport now that context is merged.
                const marginTop = Math.max(4, paddingTop);
                const marginBottom = Math.max(4, paddingBottom);
                const tolerance = 6;
                const topLimit = marginTop;
                const bottomSafetyZone = Math.max(56, marginBottom);
                const bottomLimit = containerHeight - bottomSafetyZone;
                const blurVisibilityBuffer = 36;
                const proactiveBottomThreshold = 22;

                const targetTop = targetRect.top - containerRect.top;
                const targetBottom = targetRect.bottom - containerRect.top;
                const nextTop = nextRect ? nextRect.top - containerRect.top : targetTop;
                const nextBottom = nextRect ? nextRect.bottom - containerRect.top : targetBottom;
                const combinedTop = Math.min(targetTop, nextTop);
                const combinedBottom = Math.max(targetBottom, nextBottom);
                const nextOutOfView = !!nextRect && (
                    nextTop < topLimit - tolerance ||
                    nextBottom > bottomLimit - proactiveBottomThreshold
                );

                if (combinedTop < topLimit - tolerance || combinedBottom > bottomLimit + tolerance || nextOutOfView) {
                    let desiredTop = container.scrollTop;
                    // Keep the first next blurred chunk always visible inside explicit viewport limits.
                    if (nextRect) {
                        if (nextTop < topLimit - tolerance) {
                            desiredTop = container.scrollTop + (nextTop - topLimit) - 8;
                        } else if (nextBottom > bottomLimit - proactiveBottomThreshold) {
                            desiredTop = container.scrollTop + (nextBottom - bottomLimit) + blurVisibilityBuffer;
                        }
                    } else if (combinedTop < topLimit - tolerance) {
                        desiredTop = container.scrollTop + combinedTop - topLimit;
                    } else if (combinedBottom > bottomLimit + tolerance) {
                        desiredTop = container.scrollTop + (combinedBottom - bottomLimit);
                    }

                    const lastPos = lastRevealPositionRef.current;
                    const isForwardReveal =
                        !showGrading &&
                        !!lastPos &&
                        (
                            currentVerseInReview > lastPos.verse ||
                            (currentVerseInReview === lastPos.verse && revealedChunks > lastPos.chunks)
                        );
                    // During forward reveal progression, never auto-scroll upward.
                    // Exception: allow upward motion if needed to keep next blurred chunk visible.
                    if (isForwardReveal && desiredTop < container.scrollTop && !nextOutOfView) {
                        desiredTop = container.scrollTop;
                    }
                    smoothScrollContainer(container, desiredTop, 420);
                }

                lastRevealPositionRef.current = {
                    verse: currentVerseInReview,
                    chunks: revealedChunks,
                    scrollTop: container.scrollTop
                };
                return;
            }

            if (showGrading) {
                smoothScrollContainer(container, container.scrollHeight, 420);
            }
        });
    }, [revealedChunks, currentVerseInReview, showGrading, smoothScrollContainer, reviewLayoutVersion]);

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
        const ok = await confirm({
            title: 'Edit Mindmap Later?',
            message: 'This will move the mindmap out of the Complete column and suspend it until you complete the editing.',
            confirmLabel: 'Edit Later',
            isDestructive: true,
        });
        if (!ok) return;

        const mm = mindmaps.find(m => Number((m as any).surahId) === Number(surahId));
        if (mm) {
            try {
                await saveMindMap(surahId, { isComplete: false }, { mergeExisting: false });
                await moveMindmapToInProgress(`surah-${surahId}`);
            } catch (err) {
                console.error('Failed to mark mindmap incomplete', err);
            }
        }
    };

    const handlePartMindmapIncomplete = async (partId: QuranPart) => {
        const ok = await confirm({
            title: 'Edit Mindmap Later?',
            message: 'This will move the mindmap out of the Complete column and suspend it until you complete the editing.',
            confirmLabel: 'Edit Later',
            isDestructive: true,
        });
        if (!ok) return;

        const mm = partMindMaps.find(m => Number((m as any).partId) === Number(partId));
        if (mm) {
            try {
                await savePartMindMap(partId, { isComplete: false }, { mergeExisting: false });
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
        try {
            await saveMindMap(surahId, newMindMap);
            if (shouldClose) {
                setActiveMindmapEditor(null);
            }
        } catch (error) {
            console.error('Failed to save mindmap editor changes', error);
            throw error;
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
        try {
            await savePartMindMap(partId, newMindMap);
            if (shouldClose) {
                setActivePartEditor(null);
            }
        } catch (error) {
            console.error('Failed to save part mindmap editor changes', error);
            throw error;
        }
    }, [activePartEditor, partMindMaps, savePartMindMap]);

    const getHistoryTooltip = (entry: UndoEntry | undefined, action: 'undo' | 'redo') => {
        if (!entry) {
            return action === 'undo' ? 'Nothing to undo' : 'Nothing to redo';
        }

        const actionLabel = action === 'undo' ? 'Undo' : 'Redo';
        const summary = entry.toastMessage?.trim() || (entry.kind === 'daily_complete' ? 'Completed daily portion' : 'Review change');
        const context = entry.toastInfo?.trim();

        return context ? `${actionLabel}: ${summary} - ${context}` : `${actionLabel}: ${summary}`;
    };

    const undoTooltip = getHistoryTooltip(undoStack[undoStack.length - 1], 'undo');
    const redoTooltip = getHistoryTooltip(redoStack[redoStack.length - 1], 'redo');
    const dailyReadingStyle = settings?.dailyReadingStyle ?? 'line_by_line';
    const dailyPortionSurahGroups = useMemo(() => groupVersesBySurah(todaysPortion), [todaysPortion]);
    const isReviewQueueHydrating = !hasHydratedReviewQueue;

    if (!isLoaded) {
        const loadingText = isVersesLoaded ? 'Preparing today...' : 'Loading Quran text...';
        return <TodayPageLoadingShell text={loadingText} />;
    }

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
            <div className="today-header">
                <h1 className="text-2xl font-bold">Today</h1>
                <div className="today-header-actions">
                    <button
                        className="today-header-btn"
                        onClick={() => handleUndo('keyboard')}
                        disabled={undoStack.length === 0 || isApplyingHistoryAction}
                        data-tooltip={undoTooltip}
                        data-tooltip-trigger="long-press"
                        aria-label="Undo"
                    >
                        <Undo2 size={16} />
                    </button>
                    {isMobile && (
                        <div className="adv-segmented today-segmented" role="radiogroup" aria-label="Today section">
                        <button
                            type="button"
                            role="radio"
                            aria-checked={mobileSection === 'daily'}
                            className={`adv-seg-btn ${mobileSection === 'daily' ? 'adv-seg-active' : ''}`}
                            onClick={() => setMobileSection('daily')}
                        >
                            <span>Daily Portion</span>
                        </button>
                        <button
                            type="button"
                            role="radio"
                            aria-checked={mobileSection === 'review'}
                            className={`adv-seg-btn ${mobileSection === 'review' ? 'adv-seg-active' : ''}`}
                            onClick={() => setMobileSection('review')}
                        >
                            <span>Reviews</span>
                        </button>
                        </div>
                    )}
                    <button
                        className="today-header-btn"
                        onClick={() => handleRedo('keyboard')}
                        disabled={redoStack.length === 0 || isApplyingHistoryAction}
                        data-tooltip={redoTooltip}
                        data-tooltip-trigger="long-press"
                        aria-label="Redo"
                    >
                        <Redo2 size={16} />
                    </button>
                </div>
            </div>

            <div className="today-grid">
                {/* Reviews Col */}
                {(!isMobile || mobileSection === 'review') && (
                <div className="card today-card today-card--review">
                    {!isMobile && (
                        <div className="collapsible-header today-column-header" onClick={() => toggleSection('review')}>
                            <div className="today-column-title flex items-center gap-2 text-base font-semibold text-foreground">
                                <span className="header-icon-badge"><CheckCircle size={20} /></span>
                                <span>Reviews</span>
                            </div>
                            <div className="today-column-meta">
                                {viewState.reviewExpanded && orderedDueNodes.length > 0 && activeContent && (
                                    <span className="review-header-context">
                                        {activeContent.type === 'part_mindmap' ? `Part ${activeContent.partId} Mindmap` :
                                            activeContent.type === 'mindmap' ? `${formatSurahContextLabel(activeContent.surah)} Mindmap` :
                                                `${formatSurahContextLabel(activeContent.surah)} (${activeContent.verses?.length || 0} verses)`}
                                    </span>
                                )}
                                <span className={`collapse-icon ${viewState.reviewExpanded ? 'open' : ''}`}><ChevronDown size={20} /></span>
                            </div>
                        </div>
                    )}

                    {viewState.reviewExpanded && (
                        <div className="review-section-content">
                            <div className="today-card-content">
                                {isReviewQueueHydrating ? (
                                    <div className="empty-state">
                                        <Spinner text="Preparing reviews..." />
                                    </div>
                                ) : orderedDueNodes.length === 0 ? (
                                    /* Empty state */
                                    <div className="empty-state">
                                        <CheckCircle size={40} className="empty-icon" />
                                        <p>No reviews due!</p>
                                    </div>
                                ) : activeContent && (
                                  <div
                                        className={`review-active-content ${activeContent.type === 'part_mindmap' || activeContent.type === 'mindmap' ? 'review-active-content--mindmap' : ''}`}
                                  >
                                        {/* Mobile-only context label (desktop lives in column header) */}
                                        {isMobile && (
                                            <div className="review-context-meta">
                                                <span className="review-context-meta__label">
                                                    {activeContent.type === 'part_mindmap' ? `Part ${activeContent.partId} Mindmap` :
                                                        activeContent.type === 'mindmap' ? `${formatSurahContextLabel(activeContent.surah)} Mindmap` :
                                                            `${formatSurahContextLabel(activeContent.surah)} (${activeContent.verses?.length || 0} verses)`}
                                                </span>
                                            </div>
                                        )}

                                        {/* Verse type content */}
                                        {activeContent.type === 'verse' && (
                                            <div
                                                className="review-verse-container"
                                                style={{ display: 'flex', flexDirection: 'column', height: '60vh', minHeight: 0 }}
                                            >
                                                {/* Scrollable verse content */}
                                                <div ref={targetBoxRef} className="target-box custom-scrollbar review-target-box" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                                                    <div className="grouped-verse" style={{ direction: 'rtl', fontSize: '1.2rem' }}>
                                                        {activeContent.contextVerses?.map((v) => (
                                                            <span key={`context-${v.ayahId}`} className="grouped-verse-block">
                                                                <span className="verse-badge" style={{ fontSize: '0.6rem', padding: '1px 4px', opacity: 0.8 }}>{v.ayahId}</span>
                                                                <span className="grouped-verse-text arabic-text" style={{ opacity: 0.65 }}>
                                                                    {v?.text || ''}
                                                                </span>
                                                            </span>
                                                        ))}
                                                        {normalizedActiveVerses.map((v, idx) => {
                                                            const chunks = verseChunkMap[idx] || [];
                                                            const isPast = idx < currentVerseInReview;
                                                            const isCurrent = idx === currentVerseInReview;
                                                            const showAll = showGrading || isPast;
                                                            const safeRevealedChunks = Math.max(0, Math.min(revealedChunks, chunks.length));
                                                            const isNextRevealVerse = !showAll && idx === nextRevealVerseIndex;

                                                            return (
                                                                <span key={v.ayahId} className={`grouped-verse-block ${isCurrent ? 'active-verse' : ''}`}>
                                                                    <span className="verse-badge" style={{ fontSize: '0.6rem', padding: '1px 4px' }}>{v.ayahId}</span>
                                                                    <span className="grouped-verse-text arabic-text">
                                                                        {chunks.map((chunk, chunkIdx) => {
                                                                            const chunkKey = `${v.ayahId}-c-${chunkIdx}`;
                                                                            const isRevealedChunk = showAll || (isCurrent && chunkIdx < safeRevealedChunks);
                                                                            const isNextChunk = !isRevealedChunk && isNextRevealVerse && chunkIdx === nextRevealChunkIndex;
                                                                            const chunkClassName = isRevealedChunk
                                                                                ? 'review-chunk review-chunk--revealed'
                                                                                : isNextChunk
                                                                                    ? 'review-chunk blurred-chunk next-blur review-chunk--next'
                                                                                    : 'review-chunk blurred-chunk strong-blur review-chunk--hidden';

                                                                            return (
                                                                                <span key={chunkKey} className={chunkClassName}>
                                                                                    {chunk}
                                                                                    {chunkIdx < chunks.length - 1 ? ' ' : ''}
                                                                                </span>
                                                                            );
                                                                        })}
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
                                            <div className="review-mindmap-content">
                                                <div className="review-mindmap-stage">
                                                    {!showGrading ? (
                                                        <div className="verse-hidden verse-hidden--static-icon review-mindmap-placeholder">
                                                            <EyeOff size={24} />
                                                            <p>Mindmap hidden</p>
                                                        </div>
                                                    ) : isMindmapRevealPending ? (
                                                        <div className="review-mindmap-viewer" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            <Spinner text="Loading mindmap..." />
                                                        </div>
                                                    ) : (
                                                        <>
                                                            {(() => {
                                                                const hasContent = !!activeContent.mindmap?.imageUrl || !!activeContent.mindmap?.imageUrlDark || !!activeContent.mindmap?.tldrawSnapshot;

                                                                if (!hasContent) {
                                                                    return (
                                                                        <div
                                                                            className="verse-hidden review-mindmap-placeholder"
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
                                                                    <MindmapViewer
                                                                        className="review-mindmap-viewer"
                                                                        snapshot={activeContent.mindmap?.tldrawSnapshot}
                                                                        imageUrl={activeContent.mindmap?.imageUrl}
                                                                        imageUrlDark={activeContent.mindmap?.imageUrlDark}
                                                                        isDark={isDark}
                                                                        title="Mindmap"
                                                                        contextLabel={activeContent.type === 'mindmap'
                                                                            ? `Surah ${activeContent.surah?.id}. ${activeContent.surah?.name}`
                                                                            : `Part ${activeContent.partId}`}
                                                                        docLink={activeContent.type === 'mindmap'
                                                                            ? `/docs/mindmaps/surah-${activeContent.surah?.id}`
                                                                            : `/docs/mindmaps/part-${activeContent.partId}`}
                                                                        height="100%"
                                                                    />
                                                                );
                                                            })()}
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            {!isReviewQueueHydrating && orderedDueNodes.length > 0 && activeContent && (
                                <div className="today-card-footer">
                                    {activeContent.type === 'verse' && (
                                        <div className="review-buttons" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                                            <button className="review-btn postpone std-normal-btn" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }} onClick={handlePostpone} disabled={isPersistingReviewAction}>
                                                <span style={{ fontSize: '0.85rem' }}>Not sure</span>
                                                <span style={{ fontSize: '0.65rem', opacity: 0.7 }}>Next: Tomorrow</span>
                                            </button>
                                            <button className="review-btn not-remembered std-normal-btn" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }} onClick={() => handleGrade(false)} disabled={isPersistingReviewAction}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><X size={14} /> <span style={{ fontSize: '0.85rem' }}>Not remembered</span></div>
                                                <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>
                                                    Next: {(() => {
                                                        const preview = getSchedulingPreview(orderedDueNodes[currentReviewIndex].scheduler as any, customWeights);
                                                        return preview.again;
                                                    })()}
                                                </span>
                                            </button>
                                            <button
                                                className="review-btn remembered std-normal-btn"
                                                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}
                                                onClick={() => {
                                                    const isVerseFullyRevealed =
                                                        totalVerses > 0 &&
                                                        revealedChunks >= totalChunks &&
                                                        currentVerseInReview >= totalVerses - 1;
                                                    if (isVerseFullyRevealed) {
                                                        handleGrade(true);
                                                    } else {
                                                        handleRevealNext();
                                                    }
                                                }}
                                                disabled={isPersistingReviewAction}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Check size={14} /> <span style={{ fontSize: '0.85rem' }}>Reveal / Good</span></div>
                                                <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>
                                                    {(() => {
                                                        const isVerseFullyRevealed =
                                                            totalVerses > 0 &&
                                                            revealedChunks >= totalChunks &&
                                                            currentVerseInReview >= totalVerses - 1;
                                                        if (!isVerseFullyRevealed) return 'Reveal next chunk';
                                                        const preview = getSchedulingPreview(orderedDueNodes[currentReviewIndex].scheduler as any, customWeights);
                                                        return `Next: ${preview.good}`;
                                                    })()}
                                                </span>
                                            </button>
                                        </div>
                                    )}
                                    {(activeContent.type === 'part_mindmap' || activeContent.type === 'mindmap') && (
                                        !showGrading ? (
                                            <button className="btn btn-primary btn-full std-normal-btn" onClick={handleRevealMindmap}>
                                                Reveal Mindmap
                                            </button>
                                        ) : (
                                            <>
                                                <div className="mindmap-quick-actions">
                                                    <button
                                                        className="btn btn-secondary std-normal-btn"
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
                                                        className="btn btn-secondary std-normal-btn std-normal-danger"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (activeContent.type === 'mindmap') {
                                                                handleMindmapIncomplete(activeContent.surah!.id);
                                                            } else {
                                                                handlePartMindmapIncomplete(activeContent.partId as QuranPart);
                                                            }
                                                        }}
                                                    >
                                                        <RotateCcw size={14} /> Edit later
                                                    </button>
                                                </div>
                                                <div className="review-buttons" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                                                    <button
                                                        className="review-btn postpone std-normal-btn"
                                                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}
                                                        onClick={handlePostpone}
                                                        disabled={isPersistingReviewAction}
                                                    >
                                                        <span style={{ fontSize: '0.85rem' }}>Not sure</span>
                                                        <span style={{ fontSize: '0.65rem', opacity: 0.7 }}>Next: Tomorrow</span>
                                                    </button>
                                                    <button
                                                        className="review-btn not-remembered std-normal-btn"
                                                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}
                                                        onClick={() => handleGrade(false)}
                                                        disabled={isPersistingReviewAction}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><X size={14} /> <span style={{ fontSize: '0.85rem' }}>Forgot</span></div>
                                                        <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>
                                                            Next: {(() => {
                                                                const preview = getSchedulingPreview(orderedDueNodes[currentReviewIndex].scheduler as any, customWeights);
                                                                return preview.again;
                                                            })()}
                                                        </span>
                                                    </button>
                                                    <button
                                                        className="review-btn remembered std-normal-btn"
                                                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}
                                                        onClick={() => handleGrade(true)}
                                                        disabled={isPersistingReviewAction}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Check size={14} /> <span style={{ fontSize: '0.85rem' }}>Remembered</span></div>
                                                        <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>
                                                            Next: {(() => {
                                                                const preview = getSchedulingPreview(orderedDueNodes[currentReviewIndex].scheduler as any, customWeights);
                                                                return preview.good;
                                                            })()}
                                                        </span>
                                                    </button>
                                                </div>
                                            </>
                                        )
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
                )}

                {/* Daily Portion Col */}
                {(!isMobile || mobileSection === 'daily') && (
                <div className="card today-card today-card--daily">
                    {!isMobile && (
                        <div className="collapsible-header today-column-header" onClick={() => toggleSection('daily')}>
                            <div className="today-column-title flex items-center gap-2 text-base font-semibold text-foreground">
                                <span className="header-icon-badge"><BookOpen size={20} /></span>
                                <span>Daily Portion</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <span className={`collapse-icon ${viewState.dailyExpanded ? 'open' : ''}`}><ChevronDown size={20} /></span>
                            </div>
                        </div>
                    )}

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
                                                        currentVerseWordCount={dailyPreviewWords.length}
                                                        onVerseChange={setCurrentVerseIndex}
                                                        onWordIndexChange={handleAudioWordIndexChange}
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
                                                    {currentDailyVerse && (
                                                        <>
                                                            <div className="verse-ref font-arabic">
                                                                {getSurah(currentDailyVerse.surahId)?.arabicName} : {currentDailyVerse.ayahId}
                                                            </div>
                                                            {currentDailyVerse.ayahId === 1 ? (
                                                                currentDailyVerse.surahId !== 1 &&
                                                                currentDailyVerse.surahId !== 9 && (
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
                                                                {dailyPreviewWords.map((word, i) => (
                                                                    <span
                                                                        key={i}
                                                                        ref={(element) => {
                                                                            wordElementRefs.current[i] = element;
                                                                        }}
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
                                            <div className="read-view custom-scrollbar">
                                                {dailyReadingStyle === 'paragraph' ? (
                                                    dailyPortionSurahGroups.map((group, groupIndex) => {
                                                        const surah = getSurah(group.surahId);
                                                        const firstVerse = group.verses[0];
                                                        if (!firstVerse) return null;

                                                        return (
                                                            <div key={`${group.surahId}-${groupIndex}`}>
                                                                {surah && (
                                                                    <div className="surah-header-transition" style={{ textAlign: 'center', padding: '1rem 0', margin: '1rem 0', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                                                                        <h3 className="font-arabic" style={{ fontSize: '1.2rem', marginBottom: 4 }}>{surah.arabicName}</h3>
                                                                        {firstVerse.ayahId === 1 ? (
                                                                            surah.id !== 9 && surah.id !== 1 && <p className="arabic-text" style={{ fontSize: '1.1rem' }}>بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ</p>
                                                                        ) : (
                                                                            <p className="arabic-text" style={{ fontSize: '1.1rem', opacity: 0.8 }}>أَعُوذُ بِٱللَّهِ مِنَ ٱلشَّيْطَانِ ٱلرَّجِيمِ</p>
                                                                        )}
                                                                    </div>
                                                                )}
                                                                <div className="verse-item" style={{ display: 'block', marginBottom: '0.85rem', textAlign: 'right' }}>
                                                                    <div
                                                                        className="grouped-verse"
                                                                        style={{
                                                                            fontSize: '1.05rem',
                                                                            lineHeight: 1.95,
                                                                            textAlign: 'justify',
                                                                            textAlignLast: 'right',
                                                                        }}
                                                                    >
                                                                        {group.verses.map((verse) => (
                                                                            <span key={`${verse.surahId}-${verse.ayahId}`} className="grouped-verse-block">
                                                                                <span className="verse-badge" style={{ fontSize: '0.6rem', padding: '1px 4px' }}>{verse.ayahId}</span>
                                                                                <span
                                                                                    className="grouped-verse-text arabic-text"
                                                                                    style={{ fontSize: '1.25rem', lineHeight: 1.9 }}
                                                                                >
                                                                                    {verse?.text || ''}
                                                                                </span>
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })
                                                ) : (
                                                    todaysPortion.map((v, idx) => {
                                                        const prevVerse = idx > 0 ? todaysPortion[idx - 1] : null;
                                                        const isNewSurah = !prevVerse || prevVerse.surahId !== v.surahId;
                                                        const surah = getSurah(v.surahId);

                                                        return (
                                                            <div key={idx}>
                                                                {isNewSurah && surah && (
                                                                    <div className="surah-header-transition" style={{ textAlign: 'center', padding: '1rem 0', margin: '1rem 0', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                                                                        <h3 className="font-arabic" style={{ fontSize: '1.2rem', marginBottom: 4 }}>{surah.arabicName}</h3>
                                                                        {v.ayahId === 1 ? (
                                                                            surah.id !== 9 && surah.id !== 1 && <p className="arabic-text" style={{ fontSize: '1.1rem' }}>بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ</p>
                                                                        ) : (
                                                                            <p className="arabic-text" style={{ fontSize: '1.1rem', opacity: 0.8 }}>أَعُوذُ بِٱللَّهِ مِنَ ٱلشَّيْطَانِ ٱلرَّجِيمِ</p>
                                                                        )}
                                                                    </div>
                                                                )}
                                                                <div className="verse-item" style={{ display: 'block', marginBottom: '0.5rem', textAlign: 'right' }}>
                                                                    <span className="verse-ref" style={{ float: 'left', fontSize: '0.7rem' }}>{v.ayahId}</span>
                                                                    <span className="arabic-text" style={{ fontSize: '1.2rem' }}>{v?.text || ''}</span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <div className="today-card-footer">
                                        <button className="btn btn-success btn-full std-normal-btn" onClick={handleCompleteListening} disabled={isPersistingDailyComplete || isApplyingHistoryAction}>
                                            <Check size={20} /> {isPersistingDailyComplete ? 'Saving...' : 'Complete'}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
                )}
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
