'use client';

import { useEffect, useMemo, useState, useCallback, useRef, useContext, startTransition } from 'react';
import {
    useSharedInstantMindMaps,
    useSharedInstantMutashabihat,
    useSharedInstantNodes,
    useSharedInstantReviewErrors,
    useSharedInstantSettings,
} from '@/components/InstantDataProvider';
import { SURAHS, getSurah, getQuranVerses } from '@/lib/quranData';
import {
    ALL_QURAN_PART,
    AppSettings,
    CORE_QURAN_PARTS,
    MindMap,
    PartMindMap,
    PartMindMapId,
    MutashabihatDecision,
    hasNodeBeenReviewed,
    QuranPart,
    MemoryNode
} from '@/lib/types';
import { createNewFSRSState } from '@/lib/fsrs';
import { getMutashabihatForAbsolute, absoluteToSurahAyah } from '@/lib/mutashabihat';
import { getEffectiveSurahAnchors } from '@/lib/surahSplits';
import { X } from 'lucide-react';
import dynamic from 'next/dynamic';
import { AnchorBuilderState } from '@/components/todo/AnchorBuilders';
import { appLogger } from '@/lib/logger';
import { AccessStateContext } from '@/components/Providers';
// Theme hook for responsive design adjustments
import { useTheme } from '@/components/ThemeProvider';
import { useConfirmDialog } from '@/components/ConfirmDialogProvider';
import FullScreenLoader from '@/components/ui/FullScreenLoader';
import { useMindmapBackGestureGuard } from '@/hooks/useMindmapBackGestureGuard';

const MindmapEditor = dynamic(() => import('@/components/MindmapEditor'), { ssr: false });
const MindmapViewer = dynamic(() => import('@/components/MindmapViewer'), { ssr: false });
const TodoKanban = dynamic(() => import('@/components/todo/TodoKanban'), { ssr: false });

const stableNodeId = (...parts: Array<string | number>) =>
    parts.map((part) => String(part).replace(/[^a-zA-Z0-9_-]/g, '_')).join('__');

const getVerseSegmentSurahId = (node: MemoryNode): number | null => {
    if (node.type !== 'verse_segment') return null;

    const direct = Number((node as any).surahId);
    if (Number.isFinite(direct) && direct > 0) return direct;

    const target = String((node as any).targetId || '');
    const fromAnchor = target.match(/^anchor-(\d+)-\d+-\d+$/);
    if (fromAnchor) {
        const parsed = Number(fromAnchor[1]);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }

    return null;
};

const getMindmapSurahId = (node: MemoryNode): number | null => {
    if (node.type !== 'mindmap') return null;
    const direct = Number((node as any).surahId);
    if (Number.isFinite(direct) && direct > 0) return direct;
    const target = String((node as any).targetId || '');
    const match = target.match(/^mindmap-(\d+)$/);
    if (match) {
        const parsed = Number(match[1]);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return null;
};

const getPartMindmapPartId = (node: MemoryNode): PartMindMapId | null => {
    if (node.type !== 'part_mindmap') return null;
    const direct = Number((node as any).partId);
    if (Number.isFinite(direct) && direct >= 0 && direct <= ALL_QURAN_PART) {
        return direct as PartMindMapId;
    }
    const target = String((node as any).targetId || '');
    const match = target.match(/^part-mindmap-(\d+)$/);
    if (match) {
        const parsed = Number(match[1]);
        if (Number.isFinite(parsed) && parsed >= 0 && parsed <= ALL_QURAN_PART) {
            return parsed as PartMindMapId;
        }
    }
    return null;
};

const getMindmapFreshnessScore = (mindmap: any): number => {
    const updatedAt = Date.parse(String(mindmap?.updatedAt || ''));
    if (Number.isFinite(updatedAt)) return updatedAt;
    const createdAt = Date.parse(String(mindmap?.createdAt || ''));
    if (Number.isFinite(createdAt)) return createdAt;
    return 0;
};

/**
 * TodoPage Component
 * 
 * This is the main controller for the Quran Life Kanban board.
 * It handles:
 * 1. Data synchronization with InstantDB (Settings, Nodes, Mindmaps, Errors).
 * 2. Aggregating tasks (Surahs/Parts) into Kanban columns.
 * 3. Managing "Mutashabihat" (Similarity) errors and resolution flows.
 * 4. Editor state for Mindmaps (Surah and Part level).
 * 5. Anchor building logic for defining verse ranges.
 */
export default function TodoPage() {
    // -- 1. Data Hooks: Syncing with InstantDB --
    const { settings, saveSettings, isLoading: settingsLoading } = useSharedInstantSettings();
    const settingsWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
    const queueSettingsUpdate = useCallback((update: Partial<AppSettings>) => {
        const queued = settingsWriteQueueRef.current.then(() => saveSettings(update));
        settingsWriteQueueRef.current = queued.catch(() => { });
        return queued;
    }, [saveSettings]);
    const { nodes, saveNode, deleteNode, isLoading: nodesLoading } = useSharedInstantNodes();
    // Raw lists from DB - might contain duplicates due to sync/offline issues
    const { mindmaps: mindmapsList, partMindMaps: partMindmapsList, saveMindMap, savePartMindMap, deleteMindMap, deletePartMindMap, isLoading: mindmapsLoading } = useSharedInstantMindMaps();

    const { decisions, custom: customMutashabihat, saveDecision, saveCustom, isLoading: mutashabihatLoading } = useSharedInstantMutashabihat();
    const { errors, isLoading: reviewErrorsLoading } = useSharedInstantReviewErrors();

    const { isEditor } = useContext(AccessStateContext);
    const appMode = isEditor ? 'owner' : 'user';
    const [premadeIndex, setPremadeIndex] = useState<{ surah: number[]; part: number[]; updatedAt?: string } | null>(null);
    const autoImportedRef = useRef<Set<string>>(new Set());
    const autoImportInFlightRef = useRef(false);
    const [isAutoImportingPremades, setIsAutoImportingPremades] = useState(false);
    const [hasHydratedTodoData, setHasHydratedTodoData] = useState(false);
    const { alert } = useConfirmDialog();

    // -- 2. Data Memoization & Deduplication --
    // We map raw lists to a dictionary for O(1) access. 
    // CRITICAL: We also handle duplicates here. If multiple records exist for the same Surah/Part,
    // we only take the FIRST one. This prevents "ghost" items from overwriting valid data.
    const mindmaps = useMemo(() => {
        const acc: Record<number, MindMap> = {};
        mindmapsList.forEach((mm: any) => {
            const sId = Number(mm.surahId);
            if (!Number.isFinite(sId) || sId <= 0) return;
            const existing = acc[sId] as any;
            if (!existing) {
                acc[sId] = mm as unknown as MindMap;
                return;
            }
            const nextScore = getMindmapFreshnessScore(mm);
            const existingScore = getMindmapFreshnessScore(existing);
            if (nextScore > existingScore || (nextScore === existingScore && String(mm?.id || '') > String(existing?.id || ''))) {
                acc[sId] = mm as unknown as MindMap;
            }
        });
        return acc;
    }, [mindmapsList]);

    const partMindmapsMap = useMemo(() => {
        const acc: Record<number, PartMindMap> = {};
        partMindmapsList.forEach((pmm: any) => {
            const pId = Number(pmm.partId);
            if (!Number.isFinite(pId) || pId < 0) return;
            const existing = acc[pId] as any;
            if (!existing) {
                acc[pId] = pmm as unknown as PartMindMap;
                return;
            }
            const nextScore = getMindmapFreshnessScore(pmm);
            const existingScore = getMindmapFreshnessScore(existing);
            if (nextScore > existingScore || (nextScore === existingScore && String(pmm?.id || '') > String(existing?.id || ''))) {
                acc[pId] = pmm as unknown as PartMindMap;
            }
        });
        return acc;
    }, [partMindmapsList]);

    // -- 3. Local UI State --
    const [anchorBuilders, setAnchorBuilders] = useState<Record<number, AnchorBuilderState>>({});
    const [verses, setVerses] = useState<{ surahId: number; ayahId: number; text: string }[]>([]);

    // Check if the user has already reviewed chunks for this Surah (used to lock anchor editing)
    const hasReviewedChunks = useCallback((surahId: number) => {
        return nodes.some(n => n.type === 'verse_segment' && getVerseSegmentSurahId(n) === surahId && hasNodeBeenReviewed(n.scheduler));
    }, [nodes]);

    // Keep scheduler nodes aligned when split anchors change in Todo.
    // Without this, Today counters can lag until the Dashboard mount sync runs.
    useEffect(() => {
        if (settingsLoading || nodesLoading || mindmapsLoading) return;
        const completedIds = settings?.kanbanColumns?.complete || [];
        if (completedIds.length === 0) return;

        const completedSurahIds = completedIds
            .filter(itemId => itemId.startsWith('surah-'))
            .map(itemId => Number.parseInt(itemId.replace('surah-', ''), 10))
            .filter(id => Number.isFinite(id));

        const completedPartIds = completedIds
            .filter(itemId => itemId.startsWith('part-'))
            .map(itemId => Number.parseInt(itemId.replace('part-', ''), 10))
            .filter(id => Number.isFinite(id) && id >= 0) as PartMindMapId[];

        const nodesToCreate: MemoryNode[] = [];

        completedSurahIds.forEach(surahId => {
            const surah = getSurah(surahId);
            if (!surah) return;

            const mm = mindmaps[surahId];
            const anchors = getEffectiveSurahAnchors(surahId, mm);
            anchors.forEach(anchor => {
                const startVerse = Number(anchor.startVerse);
                const endVerse = Number(anchor.endVerse);
                const exists = nodes.some(n =>
                    n.type === 'verse_segment' &&
                    getVerseSegmentSurahId(n) === surahId &&
                    Number(n.startVerse) === startVerse &&
                    Number(n.endVerse) === endVerse
                );
                if (!exists) {
                    nodesToCreate.push({
                        id: stableNodeId('memory_node', 'verse_segment', surahId, startVerse, endVerse),
                        type: 'verse_segment',
                        surahId,
                        startVerse,
                        endVerse,
                        targetId: anchor.id || `anchor-${surahId}-${startVerse}-${endVerse}`,
                        scheduler: createNewFSRSState(),
                        createdAt: new Date().toISOString(),
                    });
                }
            });

            const mindmapExists = nodes.some(n => n.type === 'mindmap' && getMindmapSurahId(n) === surahId);
            if (mm && !mindmapExists) {
                nodesToCreate.push({
                    id: stableNodeId('memory_node', 'mindmap', surahId),
                    type: 'mindmap',
                    surahId,
                    targetId: `mindmap-${surahId}`,
                    scheduler: createNewFSRSState(),
                    createdAt: new Date().toISOString(),
                });
            }
        });

        completedPartIds.forEach(partId => {
            const partMap = partMindmapsMap[partId];
            const exists = nodes.some(n => n.type === 'part_mindmap' && getPartMindmapPartId(n) === partId);
            if (partMap && !exists) {
                nodesToCreate.push({
                    id: stableNodeId('memory_node', 'part_mindmap', partId),
                    type: 'part_mindmap',
                    partId,
                    targetId: `part-mindmap-${partId}`,
                    scheduler: createNewFSRSState(),
                    createdAt: new Date().toISOString(),
                });
            }
        });

        if (nodesToCreate.length === 0) return;
        Promise.all(nodesToCreate.map(node => saveNode(node))).catch((err) => {
            console.error('Failed syncing Todo split changes to FSRS nodes', err);
        });
    }, [settings?.kanbanColumns, nodes, mindmaps, partMindmapsMap, saveNode, settingsLoading, nodesLoading, mindmapsLoading]);

    // Theme detection
    const { theme } = useTheme();
    const [systemIsDark, setSystemIsDark] = useState(false);
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const mq = window.matchMedia('(prefers-color-scheme: dark)');
            setSystemIsDark(mq.matches);
            const handler = (e: MediaQueryListEvent) => setSystemIsDark(e.matches);
            if (mq.addEventListener) {
                mq.addEventListener('change', handler);
                return () => mq.removeEventListener('change', handler);
            }
            mq.addListener(handler);
            return () => mq.removeListener(handler);
        }
    }, []);
    const isDark = theme === 'system' ? systemIsDark : theme === 'dark';

    // Mindmap Editor State
    const [activeMindmapEditor, setActiveMindmapEditor] = useState<{ surahId: number; snapshot?: any } | null>(null);
    const [activePartEditor, setActivePartEditor] = useState<{ partId: PartMindMapId; snapshot?: any } | null>(null);
    const [activeMindmapPreview, setActiveMindmapPreview] = useState<{ surahId: number; snapshot?: any; imageUrl?: string | null; imageUrlDark?: string | null } | null>(null);
    useMindmapBackGestureGuard(Boolean(activeMindmapEditor || activePartEditor));

    const hasLoadedVersesRef = useRef(false);
    const loadVerses = useCallback(async () => {
        if (hasLoadedVersesRef.current) return;
        hasLoadedVersesRef.current = true;
        try {
            const loadedVerses = await getQuranVerses();
            startTransition(() => {
                setVerses(loadedVerses);
            });
        } catch {
            hasLoadedVersesRef.current = false;
            startTransition(() => {
                setVerses([]);
            });
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        const kickOffLoad = () => {
            if (cancelled) return;
            void loadVerses();
        };

        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
            const idleId = window.requestIdleCallback(() => {
                kickOffLoad();
            }, { timeout: 1500 });
            return () => {
                cancelled = true;
                window.cancelIdleCallback(idleId);
            };
        }

        const timerId = setTimeout(kickOffLoad, 0);
        return () => {
            cancelled = true;
            clearTimeout(timerId);
        };
    }, [loadVerses]);

    const decisionsMap = useMemo(() => {
        const acc: Record<string, any> = {};
        decisions.forEach(d => {
            if (d?.phraseId) acc[d.phraseId] = d;
            if (d?.id && !acc[d.id]) acc[d.id] = d;
        });
        return acc;
    }, [decisions]);

    // -- 4. Task Aggregation --
    const activePart = settings.activePart;

    // Filter Surahs based on the user's active part setting
    const surahTasks = useMemo(() => {
        const eligible = SURAHS.filter(s =>
            (activePart === ALL_QURAN_PART || s.part === activePart) &&
            !settings.skippedSurahs?.includes(s.id)
        );
        return eligible
            .map(s => ({ surah: s, mindmap: mindmaps[s.id] }))
            .sort((a, b) => a.surah.id - b.surah.id);
    }, [mindmaps, activePart, settings.skippedSurahs]);

    const partTasks = useMemo(() => {
        const metaPartTask = { part: 0, mindmap: partMindmapsMap[0] };
        const parts: QuranPart[] = Array.from(CORE_QURAN_PARTS);
        const regularPartTasks = parts
            .filter(p => activePart === ALL_QURAN_PART || p === activePart)
            .map(p => ({ part: p, mindmap: partMindmapsMap[p] }));
        return [metaPartTask, ...regularPartTasks];
    }, [partMindmapsMap, activePart]);

    const completedSimilarityCards = useMemo(() => {
        return new Set(
            (settings.kanbanColumns?.complete || [])
                .map((id) => String(id))
                .filter((id) => id.startsWith('similarity-'))
        );
    }, [settings.kanbanColumns?.complete]);

    // Gather Similarity Errors (Mutashabihat) that need resolution
    const similarityItems = useMemo(() => {
        const isPhraseResolved = (absolute: number, entry: any) => {
            const exact = decisionsMap[`${absolute}-${entry.phraseId}`];
            if (exact?.status === 'ignored' || !!exact?.confirmedAt) return true;

            const currentRef = absoluteToSurahAyah(absolute);
            const candidateAbs = Array.from(new Set<number>([
                absolute,
                ...(entry.sources || []),
                ...(entry.matches || []),
            ])).filter((absRef) => absoluteToSurahAyah(absRef).surahId === currentRef.surahId);

            return candidateAbs.some((absRef) => {
                const phraseDecision = decisionsMap[`${absRef}-${entry.phraseId}`];
                return phraseDecision?.status === 'ignored' || !!phraseDecision?.confirmedAt;
            });
        };

        const hasComparatorBeenReviewed = (absoluteComparator: number) => {
            const comparatorRef = absoluteToSurahAyah(absoluteComparator);
            return nodes.some((node) => {
                if (node.type !== 'verse_segment') return false;
                if (getVerseSegmentSurahId(node) !== comparatorRef.surahId) return false;
                const start = Number(node.startVerse || 0);
                const end = Number(node.endVerse || 0);
                if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
                if (comparatorRef.ayahId < start || comparatorRef.ayahId > end) return false;
                return hasNodeBeenReviewed(node.scheduler);
            });
        };

        return errors
            .filter(e => e.type === 'similarity' && e.absoluteAyah)
            .map(err => {
                const absolute = err.absoluteAyah!;
                const muts = getMutashabihatForAbsolute(err.absoluteAyah!, customMutashabihat);
                const unresolvedCount = muts.filter((m: any) => !isPhraseResolved(absolute, m)).length;
                const comparators = Array.from(new Set(
                    muts.flatMap((m: any) => (Array.isArray(m?.matches) ? m.matches : []))
                )).filter((absRef: number) => absRef !== absolute);
                const hasReviewedComparator = comparators.some(hasComparatorBeenReviewed);
                return { err, muts, unresolvedCount, hasReviewedComparator };
            })
            // Filter out items that are already resolved/ignored
            .filter(entry => {
                const absolute = entry.err.absoluteAyah!;
                const { surahId } = absoluteToSurahAyah(absolute);
                const isPinnedInComplete = completedSimilarityCards.has(`similarity-${surahId}`);
                if (isPinnedInComplete) return true;
                const verseDecision = decisionsMap[absolute.toString()];
                if (verseDecision?.status === 'ignored' || !!verseDecision?.confirmedAt) return false;
                if (entry.unresolvedCount <= 0) return false;
                return entry.hasReviewedComparator;
            });
    }, [errors, decisionsMap, customMutashabihat, nodes, completedSimilarityCards]);

    // Group similarity items by Surah for cleaner display in Kanban
    const groupedSimilarity = useMemo(() => {
        const groups: Record<number, typeof similarityItems> = {};
        similarityItems.forEach(item => {
            const ref = absoluteToSurahAyah(item.err.absoluteAyah!);
            if (!groups[ref.surahId]) groups[ref.surahId] = [];
            groups[ref.surahId].push(item);
        });
        return Object.entries(groups)
            .map(([surahId, items]) => ({
                surah: getSurah(parseInt(surahId)),
                items,
                count: items.reduce((sum, item) => sum + (item.unresolvedCount || 0), 0)
            }))
            .filter(g => g.surah);
    }, [similarityItems]);

    const SUSPEND_ERROR_THRESHOLD = 3;

    const suspendedAnchors = useMemo(() => {
        const toSurahId = (value: unknown): number | null => {
            const parsed = Number(value);
            return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
        };

        const byGroup = new Map<string, any[]>();
        const anchorsBySurahRange = new Map<number, Map<string, any>>();

        const getCurrentAnchorForRange = (surahId: number, startVerse: number, endVerse: number) => {
            const rangeKey = `${startVerse}-${endVerse}`;
            const existing = anchorsBySurahRange.get(surahId);
            if (existing) return existing.get(rangeKey);

            const surahAnchors = getEffectiveSurahAnchors(surahId, mindmaps[surahId]);
            const byRange = new Map<string, any>();
            surahAnchors.forEach((anchor) => {
                const anchorStart = Number(anchor?.startVerse);
                const anchorEnd = Number(anchor?.endVerse);
                if (!Number.isFinite(anchorStart) || !Number.isFinite(anchorEnd)) return;
                byRange.set(`${anchorStart}-${anchorEnd}`, anchor);
            });
            anchorsBySurahRange.set(surahId, byRange);
            return byRange.get(rangeKey);
        };

        errors
            .filter(e => e.nodeType === 'verse_segment' && e.surahId)
            .forEach(error => {
                const errorSurahId = toSurahId(error.surahId);
                if (!errorSurahId) return;
                const absoluteRef = error.absoluteAyah ? absoluteToSurahAyah(error.absoluteAyah) : null;
                const focusAyah =
                    absoluteRef && absoluteRef.surahId === errorSurahId
                        ? absoluteRef.ayahId
                        : (error.startVerse ?? 1);
                const startVerse = error.startVerse ?? focusAyah;
                const endVerse = error.endVerse ?? startVerse;
                const currentAnchor = getCurrentAnchorForRange(errorSurahId, startVerse, endVerse);
                if (!currentAnchor) {
                    // Split/range no longer exists in current surah anchors; treat historical error as obsolete.
                    return;
                }
                const fallbackAnchorId = `range-${startVerse}-${endVerse}`;
                const anchorId = currentAnchor.id || error.anchorId || fallbackAnchorId;
                const groupKey = `${errorSurahId}-${anchorId}`;
                const timestamp = error.timestamp || '';
                const ts = Date.parse(timestamp);

                const current = byGroup.get(groupKey) || [];
                current.push({
                    surahId: errorSurahId,
                    anchorId,
                    groupKey,
                    label: currentAnchor.label || error.anchorLabel || `Verses ${startVerse}-${endVerse}`,
                    startVerse,
                    endVerse,
                    focusAyah,
                    timestamp,
                    timestampMs: Number.isFinite(ts) ? ts : 0
                });
                byGroup.set(groupKey, current);
            });

        const suspended: any[] = [];
        const acknowledgedAtByGroup = settings?.suspendedVerseGroupsAcknowledged || {};

        byGroup.forEach((groupErrors, groupKey) => {
            const sorted = [...groupErrors].sort((a, b) => b.timestampMs - a.timestampMs);
            if (sorted.length < SUSPEND_ERROR_THRESHOLD) return;

            const latest = sorted[0];
            const ackIso = acknowledgedAtByGroup[groupKey];
            const ackMs = ackIso ? Date.parse(ackIso) : Number.NaN;
            if (Number.isFinite(ackMs) && ackMs >= (latest.timestampMs || 0)) {
                return;
            }
            const recentThree = sorted.slice(0, SUSPEND_ERROR_THRESHOLD);
            const countsByAyah = new Map<number, { ayahId: number; count: number; latestTimestampMs: number }>();

            recentThree.forEach(entry => {
                const ayahId = Number(entry.focusAyah) || Number(entry.startVerse) || 1;
                const existing = countsByAyah.get(ayahId);
                if (existing) {
                    existing.count += 1;
                    if (entry.timestampMs > existing.latestTimestampMs) {
                        existing.latestTimestampMs = entry.timestampMs;
                    }
                } else {
                    countsByAyah.set(ayahId, {
                        ayahId,
                        count: 1,
                        latestTimestampMs: entry.timestampMs
                    });
                }
            });

            const recentVerseWindow = Array.from(countsByAyah.values())
                .sort((a, b) => b.latestTimestampMs - a.latestTimestampMs);

            suspended.push({
                surahId: latest.surahId,
                anchorId: latest.anchorId,
                groupKey,
                label: latest.label,
                startVerse: latest.startVerse,
                endVerse: latest.endVerse,
                focusAyah: latest.focusAyah,
                timestamp: latest.timestamp,
                mistakeCount: sorted.length,
                recentVerseWindow
            });
        });

        return suspended.sort((a, b) => {
            if (a.surahId !== b.surahId) return a.surahId - b.surahId;
            if (a.startVerse !== b.startVerse) return a.startVerse - b.startVerse;
            return a.endVerse - b.endVerse;
        });
    }, [errors, settings?.suspendedVerseGroupsAcknowledged, SUSPEND_ERROR_THRESHOLD, mindmaps]);



    // -- 5. Anchor Logic --
    // Anchors define the breakdown of a Surah into chunks for memorization.
    const getBuilderState = (surahId: number) => {
        if (anchorBuilders[surahId]) return anchorBuilders[surahId];
        const surahMeta = SURAHS.find(s => s.id === surahId);
        const verseCount = surahMeta?.verseCount || 1;
        const mindmap = mindmaps[surahId];
        // If anchors exist in DB, rehydrate the builder state
        if (mindmap?.anchors?.length) {
            const sorted = [...mindmap.anchors].sort((a, b) => a.startVerse - b.startVerse);
            const breaks = sorted.slice(0, -1).map(a => Math.min(Math.max(1, a.endVerse + 1), verseCount - 1));
            const labels: Record<number, string> = {};
            sorted.forEach((a, idx) => { labels[idx] = a.label; });
            return { breaks, labels };
        }
        // Default clean state
        return { breaks: [], labels: {} };
    };

    const handleAddBreak = (surahId: number, breakPoint: number) => {
        const current = getBuilderState(surahId);
        const nextBreaks = Array.from(new Set([...current.breaks, breakPoint])).sort((a, b) => a - b);
        setAnchorBuilders(prev => ({ ...prev, [surahId]: { ...current, breaks: nextBreaks } }));
    };

    const handleRemoveBreakValue = (surahId: number, breakPoint: number) => {
        const current = getBuilderState(surahId);
        const nextBreaks = current.breaks.filter(b => b !== breakPoint);
        setAnchorBuilders(prev => ({ ...prev, [surahId]: { ...current, breaks: nextBreaks } }));
    };

    const handleSaveAnchors = async (surahId: number, verseCount: number) => {
        const builder = getBuilderState(surahId);
        const boundaries = [1, ...builder.breaks, verseCount + 1];
        const anchors = boundaries.slice(0, -1).map((start, idx) => {
            const end = boundaries[idx + 1] - 1;
            const label = builder.labels[idx] || `Verses ${start}-${end}`;
            return { start, end, label };
        });

        const existing = mindmaps[surahId] || { surahId, anchors: [], imageUrl: null, isComplete: false };
        const previousAnchorRanges = new Set(
            (existing.anchors || []).map((a: any) => `${Number(a.startVerse)}-${Number(a.endVerse)}`)
        );
        const newAnchors = anchors.map(a => ({
            id: `anchor-${surahId}-${a.start}-${a.end}`,
            surahId,
            startVerse: a.start,
            endVerse: a.end,
            label: a.label,
        }));
        await saveMindMap(surahId, { ...existing, anchors: newAnchors });

        // Keep existing verse-segment nodes in sync with updated splits.
        // We create new range nodes only when this surah currently participates in verse review
        // (either still in Complete or already has verse-segment nodes).
        const rangeKey = (start: number, end: number) => `${start}-${end}`;
        const nextRanges = new Set(newAnchors.map(a => rangeKey(Number(a.startVerse), Number(a.endVerse))));
        const existingVerseNodes = nodes.filter(n => n.type === 'verse_segment' && getVerseSegmentSurahId(n) === surahId);

        const completeIds = new Set<string>((settings.kanbanColumns?.complete || []).map((id) => String(id)));
        const isInCompleteColumn = completeIds.has(`surah-${surahId}`);
        const shouldCreateMissingRanges = isInCompleteColumn || existingVerseNodes.length > 0;
        const nextRangeKeys = Array.from(nextRanges).sort();
        const prevRangeKeys = Array.from(previousAnchorRanges).sort();
        const splitsChanged =
            nextRangeKeys.length !== prevRangeKeys.length ||
            nextRangeKeys.some((key, idx) => key !== prevRangeKeys[idx]);

        const staleNodes = existingVerseNodes.filter(n => !nextRanges.has(rangeKey(Number(n.startVerse), Number(n.endVerse))));
        if (staleNodes.length > 0) {
            await Promise.all(staleNodes.map(n => deleteNode(n.id)));
        }

        if (shouldCreateMissingRanges) {
            const existingByRange = new Map<string, MemoryNode>(
                existingVerseNodes.map(n => [rangeKey(Number(n.startVerse), Number(n.endVerse)), n] as const)
            );
            const shouldResetAllForComplete = isInCompleteColumn && splitsChanged;
            const nowIso = new Date().toISOString();

            const upserts = newAnchors.map(anchor => {
                const key = rangeKey(Number(anchor.startVerse), Number(anchor.endVerse));
                const existingNode = existingByRange.get(key);

                if (existingNode) {
                    return saveNode({
                        ...existingNode,
                        id: stableNodeId('memory_node', 'verse_segment', surahId, anchor.startVerse, anchor.endVerse),
                        type: 'verse_segment',
                        surahId,
                        startVerse: anchor.startVerse,
                        endVerse: anchor.endVerse,
                        targetId: anchor.id,
                        scheduler: shouldResetAllForComplete ? createNewFSRSState() : existingNode.scheduler,
                        createdAt: shouldResetAllForComplete ? nowIso : existingNode.createdAt,
                    } as MemoryNode);
                }

                return saveNode({
                    id: stableNodeId('memory_node', 'verse_segment', surahId, anchor.startVerse, anchor.endVerse),
                    type: 'verse_segment',
                    surahId,
                    startVerse: anchor.startVerse,
                    endVerse: anchor.endVerse,
                    targetId: anchor.id,
                    scheduler: createNewFSRSState(),
                    createdAt: nowIso
                } as MemoryNode);
            });

            if (upserts.length > 0) {
                await Promise.all(upserts);
            }
        }
    };

    // Marks a Mindmap (Surah level) as complete/incomplete
    const handleMarkComplete = async (surahId: number, currentMindmap?: any, forceState?: boolean) => {
        // Always prefer the latest persisted mindmap to avoid overwriting fresh splits
        // with stale card payloads during drag/drop completion transitions.
        const persisted = mindmaps[surahId];
        const existing = persisted || currentMindmap || { surahId, anchors: [], imageUrl: null, isComplete: false };
        const tldrawSnapshot = existing.tldrawSnapshot || currentMindmap?.tldrawSnapshot;

        const isNowComplete = forceState !== undefined ? forceState : !existing.isComplete;

        const updated = {
            ...existing,
            imageUrl: undefined, // Clear images to save storage
            imageUrlDark: undefined,
            tldrawSnapshot,
            isComplete: isNowComplete
        };

        await saveMindMap(surahId, updated);

        // If marking as complete, ensure a MemoryNode exists for scheduling
        if (isNowComplete) {
            const existingNode = nodes.find(n => n.type === 'mindmap' && getMindmapSurahId(n) === surahId);
            if (!existingNode) {
                const newNode: MemoryNode = {
                    id: stableNodeId('memory_node', 'mindmap', surahId),
                    type: 'mindmap',
                    surahId: surahId,
                    targetId: `mindmap-${surahId}`,
                    scheduler: createNewFSRSState(),
                    createdAt: new Date().toISOString()
                };
                await saveNode(newNode);
                appLogger.addLog(`Created scheduling node for Surah ${surahId} mindmap`, 'info');
            }
        } else {
            const behavior = settings.completeExitBehavior ?? 'mindmap_only';
            if (behavior === 'mindmap_and_verses') {
                // Suspension is visibility-only: verse nodes remain stored and are
                // filtered out from the review queue while the surah is outside Complete.
                appLogger.addLog(`Suspended verse reviews for Surah ${surahId} (non-destructive)`, 'info');
            }
        }
    };

    const handleImportPremade = useCallback(async (type: 'surah' | 'part', id: number, options?: { silent?: boolean }) => {
        const response = await fetch(`/assets/premade-mindmaps/${type}-${id}.tldraw`);
        if (!response.ok) {
            if (response.status === 404) {
                if (!options?.silent) {
                    await alert({
                        title: 'Premade Mindmap Not Available',
                        message: `Premade mindmap for this ${type} is not available yet.`,
                    });
                }
                throw new Error(`Premade not available for ${type} ${id}`);
            }
            if (!options?.silent) {
                await alert({
                    title: 'Import Failed',
                    message: `Failed to import mindmap: ${response.statusText}`,
                });
            }
            throw new Error(`Failed to import premade ${type} ${id}: ${response.statusText}`);
        }
        const data = await response.json();

        // Try to fetch premade anchors for surahs
        let importedAnchors: any[] = [];
        if (type === 'surah') {
            try {
                const anchorResponse = await fetch(`/assets/premade-mindmaps/surah-${id}.chunks.txt`);
                if (anchorResponse.ok) {
                    const text = await anchorResponse.text();
                    importedAnchors = text.split('\n')
                        .filter(line => line.trim())
                        .map((line, idx) => {
                            const parts = line.split('|').map(s => s.trim());
                            const range = parts[0];
                            const label = parts[1]; // Might be undefined
                            const [start, end] = range.split('-').map(n => parseInt(n.trim()));

                            // Skip if invalid range
                            if (isNaN(start)) return null;

                            return {
                                id: `imported-${id}-${idx}-${Date.now()}`,
                                surahId: id,
                                startVerse: start,
                                endVerse: end || start,
                                label: label || `Chunk ${idx + 1}`
                            };
                        })
                        .filter(Boolean); // Filter out nulls
                    appLogger.addLog(`Found and parsed ${importedAnchors.length} anchors for surah ${id}`, 'info');
                }
            } catch (anchorError) {
                console.warn('Error fetching or parsing premade anchors:', anchorError);
            }
        }

        try {
            if (type === 'surah') {
                const existing = mindmaps[id] || { surahId: id, anchors: [], imageUrl: null, isComplete: false };
                const updated = {
                    ...existing,
                    surahId: id, // Ensure ID matches
                    anchors: importedAnchors.length > 0 ? importedAnchors : (existing.anchors || []),
                    imageUrl: undefined,
                    imageUrlDark: undefined,
                    tldrawSnapshot: data,
                    // Importing a premade map should not change kanban completion state.
                    isComplete: !!existing.isComplete,
                    source: 'premade' as const,
                    premadeId: `surah-${id}`,
                    premadeImportedAt: new Date().toISOString(),
                    premadeEdited: false
                };
                await saveMindMap(id, updated);
            } else {
                const pId = id as QuranPart;
                const existing = partMindmapsMap[pId] || { partId: pId, description: '', imageUrl: null, isComplete: false };
                const updated = {
                    ...existing,
                    partId: pId,
                    imageUrl: undefined,
                    imageUrlDark: undefined,
                    tldrawSnapshot: data,
                    // Importing a premade map should not change kanban completion state.
                    isComplete: !!existing.isComplete,
                    source: 'premade' as const,
                    premadeId: `part-${id}`,
                    premadeImportedAt: new Date().toISOString(),
                    premadeEdited: false
                };
                await savePartMindMap(pId, updated);
            }
            appLogger.addLog(`Imported premade mindmap for ${type} ${id}`, 'success');
            if (!options?.silent) {
                await alert({
                    title: 'Import Complete',
                    message: `Premade mindmap for ${type} ${id} successfully imported!${importedAnchors.length > 0 ? ` (Imported ${importedAnchors.length} verse chunks)` : ''}`,
                });
            }
        } catch (error) {
            console.error('Import failed:', error);
            if (!options?.silent) {
                await alert({
                    title: 'Import Failed',
                    message: 'Failed to import mindmap. Please try again.',
                });
            }
            throw error;
        }
    }, [mindmaps, partMindmapsMap, saveMindMap, savePartMindMap, alert]);

    const handleExportPremade = useCallback(async (type: 'surah' | 'part', id: number) => {
        const mindmap = type === 'surah' ? mindmaps[id] : partMindmapsMap[id];
        if (!mindmap?.tldrawSnapshot) {
            await alert({
                title: 'Nothing to Export',
                message: 'No tldraw mindmap found to export.',
            });
            return;
        }
        const anchors = type === 'surah' ? (mindmaps[id]?.anchors || []) : [];
        try {
            const response = await fetch('/api/premade-mindmaps/export', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    type,
                    id,
                    tldrawSnapshot: mindmap.tldrawSnapshot,
                    anchors
                })
            });
            if (!response.ok) {
                const msg = await response.text();
                await alert({
                    title: 'Export Failed',
                    message: `Export failed: ${msg || response.statusText}`,
                });
                return;
            }
            const data = await response.json();
            setPremadeIndex(data.index || null);
            appLogger.addLog(`Exported premade mindmap for ${type} ${id}`, 'success');
            await alert({
                title: 'Export Complete',
                message: `Premade mindmap for ${type} ${id} exported successfully.`,
            });
        } catch (error) {
            console.error('Export failed:', error);
            await alert({
                title: 'Export Failed',
                message: 'Failed to export mindmap. Please try again.',
            });
        }
    }, [mindmaps, partMindmapsMap, alert]);

    const resetMindmapNodes = useCallback(async (type: 'surah' | 'part', id: number) => {
        const matching = nodes.filter(node => {
            if (type === 'surah') return node.type === 'mindmap' && getMindmapSurahId(node) === id;
            return node.type === 'part_mindmap' && getPartMindmapPartId(node) === id;
        });
        if (matching.length === 0) return;

        await Promise.all(matching.map(node => saveNode({
            ...node,
            scheduler: createNewFSRSState(),
            createdAt: new Date().toISOString()
        })));

        appLogger.addLog(`Reset memory nodes for ${type} ${id} mindmap`, 'info');
    }, [nodes, saveNode]);

    const handleResetMindmap = useCallback(async (type: 'surah' | 'part', id: number, options?: { resetMemoryNodes?: boolean }) => {
        await handleImportPremade(type, id);
        if (options?.resetMemoryNodes) {
            await resetMindmapNodes(type, id);
        }
    }, [handleImportPremade, resetMindmapNodes]);

    useEffect(() => {
        if (isEditor) return;
        fetch('/assets/premade-mindmaps/index.json', { cache: 'no-store' })
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (data && Array.isArray(data.surah) && Array.isArray(data.part)) {
                    setPremadeIndex(data);
                } else {
                    setPremadeIndex({ surah: [], part: [] });
                }
            })
            .catch(() => setPremadeIndex({ surah: [], part: [] }));
    }, [isEditor]);

    useEffect(() => {
        if (isEditor) return;
        if (mindmapsLoading) return;
        if (!premadeIndex) return;

        const hasAnyPremade = premadeIndex.surah.length > 0 || premadeIndex.part.length > 0;
        if (!hasAnyPremade) return;
        if (autoImportInFlightRef.current) return;

        autoImportInFlightRef.current = true;
        setIsAutoImportingPremades(true);
        void (async () => {
            let importedAny = false;

            for (const id of premadeIndex.surah) {
                const key = `surah-${id}`;
                if (autoImportedRef.current.has(key)) continue;
                if (mindmaps[id]) continue; // preserve user-created mindmap
                try {
                    await handleImportPremade('surah', id, { silent: true });
                    autoImportedRef.current.add(key);
                    importedAny = true;
                } catch (error) {
                    console.warn(`Auto-import failed for surah ${id}`, error);
                }
            }

            for (const id of premadeIndex.part) {
                const key = `part-${id}`;
                if (autoImportedRef.current.has(key)) continue;
                if (partMindmapsMap[id]) continue; // preserve user-created mindmap
                try {
                    await handleImportPremade('part', id, { silent: true });
                    autoImportedRef.current.add(key);
                    importedAny = true;
                } catch (error) {
                    console.warn(`Auto-import failed for part ${id}`, error);
                }
            }

            if (importedAny) {
                appLogger.addLog('Auto-imported premade mindmaps (per missing item)', 'info');
            }
        })().finally(() => {
            autoImportInFlightRef.current = false;
            setIsAutoImportingPremades(false);
        });
    }, [isEditor, premadeIndex, mindmaps, partMindmapsMap, mindmapsLoading, handleImportPremade]);

    const hasPremadeMindmap = useCallback((type: 'surah' | 'part', id: number) => {
        if (!premadeIndex) return false;
        return type === 'surah' ? premadeIndex.surah.includes(id) : premadeIndex.part.includes(id);
    }, [premadeIndex]);

    const handlePartComplete = async (part: PartMindMapId, forceState?: boolean) => {
        const existing = partMindmapsMap[part] || { partId: part, imageUrl: null, description: '', isComplete: false };
        const isNowComplete = forceState !== undefined ? forceState : !existing.isComplete;
        const updated = { ...existing, isComplete: isNowComplete };
        await savePartMindMap(part, updated);

        // If marking as complete, ensure a MemoryNode exists for scheduling
        if (isNowComplete) {
            const existingNode = nodes.find(n => n.type === 'part_mindmap' && getPartMindmapPartId(n) === part);
            if (!existingNode) {
                const newNode: MemoryNode = {
                    id: stableNodeId('memory_node', 'part_mindmap', part),
                    type: 'part_mindmap',
                    partId: part,
                    targetId: `part-mindmap-${part}`,
                    scheduler: createNewFSRSState(),
                    createdAt: new Date().toISOString()
                };
                await saveNode(newNode);
                appLogger.addLog(`Created scheduling node for Part ${part} mindmap`, 'info');
            }
        }
    };

    const handleFixConfirm = async (surahId: number, anchorId: string, confirm: boolean = true) => {
        const key = `${surahId}-${anchorId}`;
        const current = settings.suspendedVerseGroupsAcknowledged || {};
        if (!confirm) {
            const { [key]: _removed, ...rest } = current;
            await queueSettingsUpdate({
                suspendedVerseGroupsAcknowledged: rest
            });
            return;
        }
        await queueSettingsUpdate({
            suspendedVerseGroupsAcknowledged: {
                ...current,
                [key]: new Date().toISOString()
            }
        });
    };

    const handleSimilarityDecision = async (absoluteAyah: number, status: MutashabihatDecision['status'], phraseId?: string, confirm: boolean = true) => {
        if (phraseId?.startsWith('custom-')) {
            const customId = phraseId.replace('custom-', '');
            const mut = customMutashabihat.find((m: any) => m.id === customId);
            if (mut) {
                await saveCustom({ ...mut, status });
            }
        }

        const key = phraseId ? `${absoluteAyah}-${phraseId}` : absoluteAyah.toString();
        const existing = decisions.find(d => d.phraseId === key) || { status: 'pending', notes: '' };
        await saveDecision(key, {
            ...existing,
            status,
            confirmedAt: confirm ? new Date().toISOString() : undefined
        });
    };

    const handleMutashabihatDecisionUpdate = useCallback((_representativeAbs: number, update: any, decisionKey: string) => {
        const existing = decisions.find(d => d.phraseId === decisionKey) || { status: 'pending', notes: '' };
        const normalized = {
            ...existing,
            ...update,
            notes: update.notes ?? existing.notes ?? existing.note ?? '',
            phraseId: decisionKey
        };
        void saveDecision(decisionKey, normalized).catch((error) => {
            console.error('Failed to save mutashabihat decision update', error);
        });
    }, [decisions, saveDecision]);

    // Handles saving from the Mindmap Editor modal (Surah)
    const handleEditorSave = useCallback(async (snapshot: any, _images?: { light?: Blob, dark?: Blob }, shouldClose: boolean = true) => {
        if (!activeMindmapEditor) return;
        const { surahId } = activeMindmapEditor;

        const existing = mindmaps[surahId] || { surahId, anchors: [], imageUrl: null, isComplete: false };
        const source: 'premade' | 'custom' = existing.source === 'premade' ? 'premade' : 'custom';
        const updated = {
            ...existing,
            imageUrl: undefined,
            imageUrlDark: undefined,
            tldrawSnapshot: snapshot,
            source,
            premadeEdited: source === 'premade' ? true : existing.premadeEdited
        };
        await saveMindMap(surahId, updated);
        if (shouldClose) {
            setActiveMindmapEditor(null);
        }
    }, [activeMindmapEditor, mindmaps, saveMindMap]);

    const handlePartEditorSave = useCallback(async (snapshot: any, _images?: { light?: Blob, dark?: Blob }, shouldClose: boolean = true) => {
        if (!activePartEditor) return;
        const { partId } = activePartEditor;

        const existing = partMindmapsMap[partId] || { partId, imageUrl: null, description: '', isComplete: false };
        const source: 'premade' | 'custom' = existing.source === 'premade' ? 'premade' : 'custom';
        const updated = {
            ...existing,
            imageUrl: undefined,
            imageUrlDark: undefined,
            tldrawSnapshot: snapshot,
            source,
            premadeEdited: source === 'premade' ? true : existing.premadeEdited
        };
        await savePartMindMap(partId, updated);
        if (shouldClose) {
            setActivePartEditor(null);
        }
    }, [activePartEditor, partMindmapsMap, savePartMindMap]);

    const isPremadeIndexSettled = isEditor || premadeIndex !== null;
    const todoDataReady =
        !settingsLoading
        && !nodesLoading
        && !mindmapsLoading
        && !mutashabihatLoading
        && !reviewErrorsLoading
        && isPremadeIndexSettled
        && !isAutoImportingPremades;

    useEffect(() => {
        if (!todoDataReady) return;
        setHasHydratedTodoData(true);
    }, [todoDataReady]);

    const showTodoLoader = !hasHydratedTodoData;
    const todoLoaderText = 'Preparing Todo...';

    if (showTodoLoader) {
        return <FullScreenLoader text={todoLoaderText} />;
    }

    return (
        <div className="content-wrapper tab-content todo-page">
            {/* Surah Mindmap Editor */}
            {activeMindmapEditor && (
                <MindmapEditor
                    initialSnapshot={activeMindmapEditor.snapshot}
                    onSave={handleEditorSave}
                    onClose={() => setActiveMindmapEditor(null)}
                    title="Surah Mindmap Editor"
                    docLink={`/docs/mindmaps/surah-${activeMindmapEditor.surahId}`}
                />
            )}
            {/* Part Mindmap Editor */}
            {activePartEditor && (
                <MindmapEditor
                    initialSnapshot={activePartEditor.snapshot}
                    onSave={handlePartEditorSave}
                    onClose={() => setActivePartEditor(null)}
                    title={`Part ${activePartEditor.partId} Mindmap Editor`}
                    docLink={`/docs/mindmaps/part-${activePartEditor.partId}`}
                />
            )}

            {/* Mindmap Preview Modal */}
            {activeMindmapPreview && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 10000,
                    background: 'var(--background)',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    <div style={{
                        height: '50px',
                        borderBottom: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0 1rem'
                    }}>
                        <span style={{ fontWeight: 600 }}>Mindmap Preview</span>
                        <button
                            onClick={() => setActiveMindmapPreview(null)}
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--foreground)' }}
                        >
                            <X size={24} />
                        </button>
                    </div>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <MindmapViewer
                            snapshot={activeMindmapPreview.snapshot}
                            imageUrl={activeMindmapPreview.imageUrl}
                            imageUrlDark={activeMindmapPreview.imageUrlDark}
                            isDark={isDark}
                            title="Mindmap Preview"
                            contextLabel={`Surah ${activeMindmapPreview.surahId}${getSurah(activeMindmapPreview.surahId)?.name ? `. ${getSurah(activeMindmapPreview.surahId)?.name}` : ''}`}
                            docLink={`/docs/mindmaps/surah-${activeMindmapPreview.surahId}`}
                            height="100%"
                        />
                    </div>
                </div>
            )}
            {/* Kanban Board Replacement */}
            <div className="relative w-full h-full flex flex-col px-2 sm:px-4 md:px-6 py-2 sm:py-4" aria-busy={false}>
                <div className="h-full w-full">
                    <TodoKanban
                        suspendedAnchors={suspendedAnchors}
                        similarityGroups={groupedSimilarity}
                        partTasks={partTasks}
                        surahTasks={surahTasks}
                        verses={verses}
                        mindmaps={mindmaps}
                        isDark={isDark}
                        // Persisted State
                        kanbanState={settings.kanbanColumns}
                        defaultFilter={settings.todoDefaultFilter ?? 'all'}
                        completeExitBehavior={settings.completeExitBehavior ?? 'mindmap_only'}
                        kanbanSortOrder={settings.kanbanSortOrder ?? 'type_then_number'}
                        onKanbanStateChange={async (cols) => {
                            await queueSettingsUpdate({
                                kanbanColumns: cols
                            });
                        }}
                        onFixConfirm={handleFixConfirm}
                        onSimilarityDecision={handleSimilarityDecision}
                        onPartComplete={handlePartComplete}
                        onSurahComplete={handleMarkComplete}
                        onImportPremade={handleImportPremade}
                        onExportPremade={isEditor ? handleExportPremade : undefined}
                        onResetMindmap={!isEditor ? handleResetMindmap : undefined}
                        onEditMindmap={(id, snapshot, isPart) => {
                            if (isPart) {
                                setActivePartEditor({ partId: id as any, snapshot });
                            } else {
                                setActiveMindmapEditor({ surahId: id, snapshot });
                            }
                        }}
                        onDeleteMindmap={async (type, id) => {
                            if (type === 'surah') {
                                // Find specific entity to delete
                                const entity = mindmapsList.find((m: any) => Number(m.surahId) === id);
                                if (entity && (entity as any).id) {
                                    await deleteMindMap((entity as any).id);
                                }
                            } else {
                                // Find specific part entity to delete
                                const pId = id as QuranPart;
                                const entity = partMindmapsList.find((m: any) => Number(m.partId) === pId);
                                if (entity && (entity as any).id) {
                                    await deletePartMindMap((entity as any).id);
                                }
                            }
                        }}
                        appMode={appMode}
                        getHasPremade={hasPremadeMindmap}
                        mutashabihatDecisions={decisions}
                        onMutashabihatDecisionUpdate={handleMutashabihatDecisionUpdate}
                        getBuilderState={getBuilderState}
                        onAddBreak={(sid, val) => handleAddBreak(sid, val)}
                        onRemoveBreak={(sid, val) => handleRemoveBreakValue(sid, val)}
                        onSaveAnchors={handleSaveAnchors}
                        hasReviewedChunks={hasReviewedChunks}
                    />
                </div>
            </div>
        </div >
    );
}
