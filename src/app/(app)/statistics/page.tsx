'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Spinner from '@/components/ui/Spinner';
import FullScreenLoader from '@/components/ui/FullScreenLoader';
import { useAppShellTransition } from '@/components/AppShell';
import {
    useSharedInstantListeningProgress,
    useSharedInstantMindMaps,
    useSharedInstantMutashabihat,
    useSharedInstantNodes,
    useSharedInstantReviewErrors,
    useSharedInstantSettings,
} from '@/components/InstantDataProvider';
import { SURAHS } from '@/lib/quranData';
import {
    useInstantReviewLogs,
} from '@/hooks/useInstantData';
import { getAllMutashabihatRefs, absoluteToSurahAyah } from '@/lib/mutashabihat';
import {
    ALL_QURAN_PART,
    CORE_QURAN_PARTS,
    LEGACY_ALL_QURAN_PART,
    getNodeStability,
    getNodeDueDate,
    hasNodeBeenReviewed,
    MemoryNode
} from '@/lib/types';
import {
    getEligibleDailyPortionSurahs,
    getProgressStartIndexFromEligibleSurahs,
} from '@/lib/dailyPortionUtils';

import { Map as MapIcon, MapPinned, Repeat, RotateCcw, CalendarClock, BookCopy, AlertTriangle, CalendarDays, BarChart2, Activity } from 'lucide-react';

type MaturityBucket = 'new' | 'medium' | 'strong' | 'mastered';

function getMaturity(interval: number): MaturityBucket {
    if (interval >= 90) return 'mastered';
    if (interval >= 30) return 'strong';
    if (interval >= 14) return 'medium';
    return 'new';
}

interface StatSegment {
    label: string;
    count: number;
    displayValue?: number | string;
    color: string;
    opacity?: number;
    description: string;
}

type SurahRiskRange = '7d' | '30d' | '90d' | 'all';
type TrendDirection = 'up' | 'down' | 'flat';

interface SurahRiskRow {
    surahId: number;
    surahName: string;
    mistakes: number;
    attempts: number;
    errorRate: number;
    maturity: MaturityBucket;
    trend: TrendDirection;
}

interface ProgressBarStats {
    total: number;
    segments: StatSegment[];
    displayTotal?: number | string;
}

interface FutureDuePoint {
    day: number;
    count: number;
    cumulative: number;
}

interface FutureDueBucket {
    startDay: number;
    endDay: number;
    label: string;
    count: number;
    cumulative: number;
    containsToday: boolean;
}

function ChartEmptyState({ message = 'No data available', height = 200 }: { message?: string; height?: number }) {
    return (
        <div
            style={{
                height: `${height}px`,
                borderRadius: '16px',
                background: 'var(--reviews-chart-panel)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--foreground-secondary)',
                fontSize: '0.85rem',
                textAlign: 'center',
                padding: '0 1rem',
            }}
        >
            {message}
        </div>
    );
}

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

const resolveSurahIdFromErrorNodeRef = (nodeRef: unknown): number | null => {
    const value = String(nodeRef || '').trim();
    if (!value) return null;

    const anchorMatch = value.match(/^anchor-(\d+)-\d+-\d+$/);
    if (anchorMatch) return toPositiveInt(anchorMatch[1]);

    const mindmapMatch = value.match(/^mindmap-(\d+)$/);
    if (mindmapMatch) return toPositiveInt(mindmapMatch[1]);

    // Legacy/local ids can look like: memory_node__mindmap__3
    const legacyMindmapMatch = value.match(/(?:^|__)mindmap__(\d+)$/);
    if (legacyMindmapMatch) return toPositiveInt(legacyMindmapMatch[1]);

    return null;
};

export default function StatisticsPage() {
    const { isTransitionPendingForCurrentRoute, markCurrentRouteReady } = useAppShellTransition();
    const { settings, isLoading: settingsLoading } = useSharedInstantSettings();
    const { mindmaps, partMindMaps, isLoading: mindmapsLoading } = useSharedInstantMindMaps();
    const { nodes: memoryNodes, isLoading: nodesLoading } = useSharedInstantNodes();
    const { progress: listeningProgress, isLoading: progressLoading } = useSharedInstantListeningProgress();
    const { decisions: mutashabihatDecisions, isLoading: mutashabihatLoading } = useSharedInstantMutashabihat();
    const { logs: reviewLogs, isLoading: reviewLogsLoading } = useInstantReviewLogs();
    const { errors: reviewErrors, isLoading: reviewErrorsLoading } = useSharedInstantReviewErrors();

    const [verseChunkMode, setVerseChunkMode] = useState<'chunks' | 'surahs'>('chunks');
    const [surahRiskRange, setSurahRiskRange] = useState<SurahRiskRange>('30d');

    const isLoading = settingsLoading || mindmapsLoading || nodesLoading || progressLoading || mutashabihatLoading || reviewLogsLoading || reviewErrorsLoading;
    const statisticsReady = !isLoading;

    useEffect(() => {
        if (!statisticsReady) return;
        markCurrentRouteReady();
    }, [markCurrentRouteReady, statisticsReady]);

    const activePart = settings?.activePart || ALL_QURAN_PART;
    const skippedSurahs = useMemo(() => new Set(settings?.skippedSurahs || []), [settings?.skippedSurahs]);
    const activePartSurahs = useMemo(
        () => SURAHS.filter((surah) => activePart === ALL_QURAN_PART || surah.part === activePart),
        [activePart],
    );
    const activePartSurahIds = useMemo(
        () => new Set(activePartSurahs.map((surah) => surah.id)),
        [activePartSurahs],
    );
    const activeUnskippedSurahs = useMemo(
        () => activePartSurahs.filter((surah) => !skippedSurahs.has(surah.id)),
        [activePartSurahs, skippedSurahs],
    );
    const eligibleDailyPortionSurahs = useMemo(
        () => getEligibleDailyPortionSurahs(activePart, skippedSurahs, memoryNodes),
        [activePart, memoryNodes, skippedSurahs],
    );

    const {
        mindmapBySurahId,
        partMindMapByPartId,
        nodeById,
        partMindmapNodeByPartId,
        mindmapNodeBySurahId,
        verseSegmentNodesBySurahId,
        verseAndMindmapStabilityBySurahId,
        mutashabihatDecisionsByAbsolute,
        listeningProgressByPartId,
    } = useMemo(() => {
        const mindmapBySurahId = new Map<number, any>();
        const partMindMapByPartId = new Map<number, any>();
        const nodeById = new Map<string, MemoryNode>();
        const partMindmapNodeByPartId = new Map<number, MemoryNode>();
        const mindmapNodeBySurahId = new Map<number, MemoryNode>();
        const verseSegmentNodesBySurahId = new Map<number, MemoryNode[]>();
        const verseAndMindmapStabilityBySurahId = new Map<number, { totalStability: number; count: number }>();
        const mutashabihatDecisionsByAbsolute = new Map<number, any[]>();
        const listeningProgressByPartId = new Map<number, any>();

        if (!statisticsReady) {
            return {
                mindmapBySurahId,
                partMindMapByPartId,
                nodeById,
                partMindmapNodeByPartId,
                mindmapNodeBySurahId,
                verseSegmentNodesBySurahId,
                verseAndMindmapStabilityBySurahId,
                mutashabihatDecisionsByAbsolute,
                listeningProgressByPartId,
            };
        }

        for (const mindmap of mindmaps) {
            const surahId = Number((mindmap as any)?.surahId);
            if (!Number.isFinite(surahId) || mindmapBySurahId.has(surahId)) continue;
            mindmapBySurahId.set(surahId, mindmap);
        }

        for (const partMindMap of partMindMaps) {
            const partId = Number((partMindMap as any)?.partId);
            if (!Number.isFinite(partId) || partMindMapByPartId.has(partId)) continue;
            partMindMapByPartId.set(partId, partMindMap);
        }

        for (const node of memoryNodes) {
            nodeById.set(node.id, node);

            if (node.type === 'part_mindmap') {
                const partId = resolveNodePartId(node);
                if (partId !== null && !partMindmapNodeByPartId.has(partId)) {
                    partMindmapNodeByPartId.set(partId, node);
                }
                continue;
            }

            const surahId = resolveNodeSurahId(node);
            if (!surahId) continue;

            if (node.type === 'mindmap' && !mindmapNodeBySurahId.has(surahId)) {
                mindmapNodeBySurahId.set(surahId, node);
            }

            if (node.type === 'verse_segment') {
                const bucket = verseSegmentNodesBySurahId.get(surahId);
                if (bucket) bucket.push(node);
                else verseSegmentNodesBySurahId.set(surahId, [node]);
            }

            if (node.type === 'verse_segment' || node.type === 'mindmap') {
                const current = verseAndMindmapStabilityBySurahId.get(surahId) || { totalStability: 0, count: 0 };
                verseAndMindmapStabilityBySurahId.set(surahId, {
                    totalStability: current.totalStability + getNodeStability(node),
                    count: current.count + 1,
                });
            }
        }

        for (const decision of mutashabihatDecisions) {
            const phraseId = String((decision as any)?.phraseId || '');
            if (!phraseId) continue;
            const absToken = phraseId.split('-')[0];
            const absolute = Number.parseInt(absToken, 10);
            if (!Number.isFinite(absolute)) continue;
            const bucket = mutashabihatDecisionsByAbsolute.get(absolute);
            if (bucket) bucket.push(decision);
            else mutashabihatDecisionsByAbsolute.set(absolute, [decision]);
        }

        for (const progress of listeningProgress) {
            const partId = Number((progress as any)?.partId);
            if (!Number.isFinite(partId) || listeningProgressByPartId.has(partId)) continue;
            listeningProgressByPartId.set(partId, progress);
        }

        return {
            mindmapBySurahId,
            partMindMapByPartId,
            nodeById,
            partMindmapNodeByPartId,
            mindmapNodeBySurahId,
            verseSegmentNodesBySurahId,
            verseAndMindmapStabilityBySurahId,
            mutashabihatDecisionsByAbsolute,
            listeningProgressByPartId,
        };
    }, [statisticsReady, listeningProgress, memoryNodes, mindmaps, mutashabihatDecisions, partMindMaps]);

    // 1. Part Mindmaps Data (Always Global)
    const partMindmapStats = useMemo(() => {
        if (!statisticsReady) {
            return { total: CORE_QURAN_PARTS.length, segments: [] as StatSegment[] };
        }

        let notCreated = 0;
        let notLearned = 0;
        let learnedNew = 0;
        let learnedMedium = 0;
        let learnedStrong = 0;
        let learnedMastered = 0;

        CORE_QURAN_PARTS.forEach(p => {
            const pmm = partMindMapByPartId.get(p);
            if (pmm) {
                if (pmm.isComplete) {
                    const node = partMindmapNodeByPartId.get(p);
                    const maturity = node ? getMaturity(getNodeStability(node)) : 'new';
                    if (maturity === 'mastered') learnedMastered++;
                    else if (maturity === 'strong') learnedStrong++;
                    else if (maturity === 'medium') learnedMedium++;
                    else learnedNew++;
                } else {
                    notLearned++;
                }
            } else {
                notCreated++;
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
        return {
            total: CORE_QURAN_PARTS.length,
            segments: [
                { label: 'Not Created', count: notCreated, color: 'var(--chart-not-created)', description: 'Part mindmap not yet created' },
                { label: 'Not Learned', count: notLearned, color: 'var(--chart-not-learned)', description: 'Part mindmap not yet complete' },
                { label: 'New (< 14d)', count: learnedNew, color: 'var(--chart-new)', description: 'Newly learned (< 14 days)' },
                { label: 'Medium (14-30d)', count: learnedMedium, color: 'var(--chart-medium)', description: 'Intermediate maturity (14-30 days)' },
                { label: 'Strong (30-90d)', count: learnedStrong, color: 'var(--chart-strong)', description: 'Strong memory (30-90 days)' },
                { label: 'Mastered (90d+)', count: learnedMastered, color: 'var(--chart-mastered)', description: 'Long-term mastery (90+ days)' },
            ].filter(s => s.count > 0)
        };
    }, [partMindMapByPartId, partMindmapNodeByPartId, statisticsReady]);

    // 2. Surah Mindmaps Data
    const surahMindmapStats = useMemo(() => {
        if (!statisticsReady) {
            return { total: activePartSurahs.length, segments: [] as StatSegment[] };
        }

        let skipped = 0;
        let notCreated = 0;
        let notLearned = 0;
        let learnedNew = 0;
        let learnedMedium = 0;
        let learnedStrong = 0;
        let learnedMastered = 0;

        activePartSurahs.forEach(s => {
            if (skippedSurahs.has(s.id)) {
                skipped++;
            } else {
                const mm = mindmapBySurahId.get(s.id);
                if (mm) {
                    if (mm.isComplete) {
                        const node = mindmapNodeBySurahId.get(s.id);
                        const maturity = node ? getMaturity(getNodeStability(node)) : 'new';
                        if (maturity === 'mastered') learnedMastered++;
                        else if (maturity === 'strong') learnedStrong++;
                        else if (maturity === 'medium') learnedMedium++;
                        else learnedNew++;
                    } else {
                        // Created but not reviewed (not complete) -> Not Learned
                        notLearned++;
                    }
                } else {
                    // Not yet created -> Same color as skipped
                    notCreated++;
                }
            }
        });

        return {
            total: activePartSurahs.length,
            segments: [
                { label: 'Skipped', count: skipped, color: 'var(--chart-skipped)', description: 'Surahs excluded from cycle' },
                { label: 'Not Created', count: notCreated, color: 'var(--chart-not-created)', description: 'Mindmap not created' },
                { label: 'Not Learned', count: notLearned, color: 'var(--chart-not-learned)', description: 'Mindmap incomplete' },
                { label: 'New (< 14d)', count: learnedNew, color: 'var(--chart-new)', description: 'Newly learned (< 14 days)' },
                { label: 'Medium (14-30d)', count: learnedMedium, color: 'var(--chart-medium)', description: 'Intermediate maturity (14-30 days)' },
                { label: 'Strong (30-90d)', count: learnedStrong, color: 'var(--chart-strong)', description: 'Strong memory (30-90 days)' },
                { label: 'Mastered (90d+)', count: learnedMastered, color: 'var(--chart-mastered)', description: 'Long-term mastery (90+ days)' },
            ].filter(s => s.count > 0)
        };
    }, [activePartSurahs, skippedSurahs, mindmapBySurahId, mindmapNodeBySurahId, statisticsReady]);

    // 3. Verse Chunks Data
    const verseChunkStats = useMemo(() => {
        if (!statisticsReady) {
            const totalSegments = activePartSurahs.reduce((acc, s) => {
                if (verseChunkMode === 'surahs') return acc + 1;
                return acc + Math.ceil(s.verseCount / 5);
            }, 0);
            return { total: totalSegments, segments: [] as StatSegment[] };
        }

        let skipped = 0;
        let notLearned = 0;
        let learnedNew = 0;
        let learnedMedium = 0;
        let learnedStrong = 0;
        let learnedMastered = 0;

        activePartSurahs.forEach(s => {
            if (verseChunkMode === 'surahs') {
                if (skippedSurahs.has(s.id)) {
                    skipped++;
                } else {
                    const learnedVerses = settings?.learnedVerses?.[s.id.toString()] || [];
                    const learned = learnedVerses.length;
                    if (learned === 0) {
                        notLearned++;
                    } else {
                        // If it has any learned verses, we look at the maturity of its nodes
                        const nodes = verseSegmentNodesBySurahId.get(s.id) || [];
                        if (nodes.length === 0) {
                            learnedNew++; // Learned but nodes not synced yet
                        } else {
                            const totalStability = nodes.reduce((acc, n) => acc + getNodeStability(n), 0);
                            const avgInterval = totalStability / nodes.length;
                            const maturity = getMaturity(avgInterval);
                            if (maturity === 'mastered') learnedMastered++;
                            else if (maturity === 'strong') learnedStrong++;
                            else if (maturity === 'medium') learnedMedium++;
                            else learnedNew++;
                        }
                    }
                }
            } else {
                // Chunk Mode (Aya Chunks of 5)
                const totalChunks = Math.ceil(s.verseCount / 5);
                if (skippedSurahs.has(s.id)) {
                    skipped += totalChunks;
                } else {
                    const learnedVerses = settings?.learnedVerses?.[s.id.toString()] || [];

                    // Logic to calculate chunks directly from learnedVerses to avoid sync issues
                    const sortedVerses = [...learnedVerses].sort((a, b) => a - b);
                    const chunkMaturities: MaturityBucket[] = [];

                    if (sortedVerses.length > 0) {
                        let segmentStart = sortedVerses[0];
                        let segmentEnd = segmentStart;

                        for (let i = 1; i <= sortedVerses.length; i++) {
                            const isContiguous = i < sortedVerses.length && sortedVerses[i] === segmentEnd + 1;
                            if (isContiguous) {
                                segmentEnd = sortedVerses[i];
                            } else {
                                // End of segment, calculate chunks
                                const segmentLength = segmentEnd - segmentStart + 1;
                                const chunks = Math.ceil(segmentLength / 5);

                                // Get maturity for this segment
                                const nodes = (verseSegmentNodesBySurahId.get(s.id) || []).filter(n =>
                                    resolveNodeSurahId(n) === s.id &&
                                    (n.startVerse ?? 0) >= segmentStart &&
                                    (n.endVerse ?? 0) <= segmentEnd
                                );

                                let maturity: MaturityBucket = 'new';
                                if (nodes.length > 0) {
                                    const totalStability = nodes.reduce((acc, n) => acc + getNodeStability(n), 0);
                                    const avgInterval = totalStability / nodes.length;
                                    maturity = getMaturity(avgInterval);
                                }

                                for (let c = 0; c < chunks; c++) {
                                    chunkMaturities.push(maturity);
                                }

                                if (i < sortedVerses.length) {
                                    segmentStart = sortedVerses[i];
                                    segmentEnd = segmentStart;
                                }
                            }
                        }
                    }

                    const learnedChunksCount = chunkMaturities.length;
                    const unlearnedChunks = totalChunks - learnedChunksCount;

                    notLearned += Math.max(0, unlearnedChunks);

                    chunkMaturities.forEach(m => {
                        if (m === 'mastered') learnedMastered++;
                        else if (m === 'strong') learnedStrong++;
                        else if (m === 'medium') learnedMedium++;
                        else learnedNew++;
                    });
                }
            }
        });

        const totalSegments = activePartSurahs.reduce((acc, s) => {
            if (verseChunkMode === 'surahs') return acc + 1;
            return acc + Math.ceil(s.verseCount / 5);
        }, 0);

        return {
            total: totalSegments,
            segments: [
                { label: 'Skipped', count: skipped, color: 'var(--chart-skipped)', description: 'Excluded from cycle' },
                { label: 'Not Learned', count: notLearned, color: 'var(--chart-not-learned)', description: 'Not yet memorized' },
                { label: 'New (< 14d)', count: learnedNew, color: 'var(--chart-new)', description: 'Newly learned (< 14 days)' },
                { label: 'Medium (14-30d)', count: learnedMedium, color: 'var(--chart-medium)', description: 'Intermediate maturity (14-30 days)' },
                { label: 'Strong (30-90d)', count: learnedStrong, color: 'var(--chart-strong)', description: 'Strong memory (30-90 days)' },
                { label: 'Mastered (90d+)', count: learnedMastered, color: 'var(--chart-mastered)', description: 'Long-term mastery (90+ days)' },
            ].filter(s => s.count > 0)
        };
    }, [activePartSurahs, settings?.learnedVerses, skippedSurahs, statisticsReady, verseChunkMode, verseSegmentNodesBySurahId]);

    // 4. Daily Portion Data
    const dailyPortionStats = useMemo(() => {
        if (!statisticsReady) {
            return {
                total: 0,
                completions: 0,
                completedToday: false,
                segments: [] as StatSegment[],
                displayTotal: 0,
            };
        }

        const partProgress = listeningProgressByPartId.get(Number(activePart))
            ?? (activePart === ALL_QURAN_PART && (settings?.partSystemVersion ?? 1) < 2
                ? listeningProgressByPartId.get(LEGACY_ALL_QURAN_PART)
                : undefined);
        const progress = getProgressStartIndexFromEligibleSurahs(eligibleDailyPortionSurahs, partProgress);
        const cycles = partProgress?.cycles || 0;
        const completedToday = Boolean(partProgress?.updatedAt && new Date(partProgress.updatedAt).toDateString() === new Date().toDateString());

        const surahsInPart = eligibleDailyPortionSurahs;
        const totalVerses = surahsInPart.reduce((sum, surah) => sum + surah.verseCount, 0);
        const completedVerses = totalVerses > 0 ? Math.min(progress, totalVerses) : 0;
        const remainingVerses = Math.max(0, totalVerses - completedVerses);
        let completedSurahs = 0;
        let traversedVerses = 0;

        for (const surah of surahsInPart) {
            traversedVerses += surah.verseCount;
            if (completedVerses >= traversedVerses) {
                completedSurahs += 1;
            } else {
                break;
            }
        }

        const remainingSurahs = Math.max(0, surahsInPart.length - completedSurahs);

        return {
            total: totalVerses,
            displayTotal: surahsInPart.length,
            completions: cycles,
            completedToday,
            segments: [
                {
                    label: 'Remaining',
                    count: remainingVerses,
                    displayValue: remainingSurahs,
                    color: 'var(--chart-skipped)',
                    description: 'Surahs remaining in current cycle',
                },
                {
                    label: 'Completed',
                    count: completedVerses,
                    displayValue: completedSurahs,
                    color: 'var(--chart-mastered)',
                    description: 'Surahs completed in current cycle',
                },
            ]
        };
    }, [activePart, eligibleDailyPortionSurahs, listeningProgressByPartId, settings?.partSystemVersion, statisticsReady]);

    // 5. Mutashabihat Coverage Data
    const mutashabihatStats = useMemo(() => {
        if (!statisticsReady) {
            return { total: 0, segments: [] as StatSegment[] };
        }

        const allRefs = getAllMutashabihatRefs();
        const targetRefs = allRefs.filter(abs => {
            const { surahId } = absoluteToSurahAyah(abs);
            if (activePart === ALL_QURAN_PART) return true;
            return activePartSurahIds.has(surahId);
        });

        const total = targetRefs.length;
        if (total === 0) return { total: 0, segments: [] };

        let solvedMindmap = 0;
        let solvedNote = 0;
        let ignored = 0;
        let pending = 0;

        targetRefs.forEach(abs => {
            // Find decisions for this absolute ayah
            const verseDecisions = mutashabihatDecisionsByAbsolute.get(abs) || [];

            if (verseDecisions.length > 0) {
                const anySolvedMindmap = verseDecisions.some(d => d.status === 'solved_mindmap');
                const anySolvedNote = verseDecisions.some(d => d.status === 'solved_note');
                const anyIgnored = verseDecisions.some(d => d.status === 'ignored');

                if (anySolvedMindmap) solvedMindmap++;
                else if (anySolvedNote) solvedNote++;
                else if (anyIgnored) ignored++;
                else pending++;
            } else {
                pending++;
            }
        });

        return {
            total,
            segments: [
                { label: 'Pending', count: pending, color: 'var(--chart-not-learned)', description: 'Verses with mutashabihat not yet addressed' },
                { label: 'Ignored', count: ignored, color: 'var(--chart-skipped)', description: 'Marked as not requiring attention' },
                { label: 'Solved (Note)', count: solvedNote, color: 'var(--chart-medium)', description: 'Addressed with a memory note' },
                { label: 'Solved (MM)', count: solvedMindmap, color: 'var(--chart-mastered)', description: 'Addressed within a mindmap' },
            ].filter(s => s.count > 0)
        };
    }, [activePart, activePartSurahIds, mutashabihatDecisionsByAbsolute, statisticsReady]);

    // 6. Future Due Data
    const [timeRange, setTimeRange] = useState<'1m' | '3m' | '1y' | 'all'>('1m');

    const futureDueStats = useMemo(() => {
        if (!statisticsReady) {
            return {
                data: [] as Array<{ day: number; count: number; cumulative: number }>,
                total: 0,
                average: '0.0',
                dueTomorrow: 0,
                overdueCount: 0,
                dailyLoad: '0.0',
                reviewsToday: 0,
                minDay: -15,
                maxDay: 30,
            };
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const targetSurahs = activePartSurahIds;
        const hasKanbanState = !!settings?.kanbanColumns && Object.keys(settings.kanbanColumns).length > 0;
        const completeIds = new Set<string>(hasKanbanState ? (settings?.kanbanColumns?.complete || []) : []);
        const completeExitBehavior = settings?.completeExitBehavior ?? 'mindmap_only';

        const hasAnchorForNode = (node: MemoryNode) => {
            if (node.type !== 'verse_segment') return true;
            const surahId = resolveNodeSurahId(node);
            if (!surahId) return true;
            const mm = mindmapBySurahId.get(surahId);
            const anchors = mm?.anchors || [];
            if (anchors.length === 0) return false;
            return anchors.some((a: any) => Number(a.startVerse) === Number(node.startVerse) && Number(a.endVerse) === Number(node.endVerse));
        };

        const reviewPlanNodes = memoryNodes.filter(node => {
            if (node.type !== 'verse_segment' && node.type !== 'mindmap' && node.type !== 'part_mindmap') return false;

            if (node.type === 'part_mindmap') {
                const partId = resolveNodePartId(node);
                if (!partId) return false;
                if (activePart !== ALL_QURAN_PART && partId !== activePart) return false;
                if (hasKanbanState && !completeIds.has(`part-${partId}`)) return false;
                return true;
            }

            const surahId = resolveNodeSurahId(node);
            if (!surahId) return false;
            if (!targetSurahs.has(surahId)) return false;
            if (skippedSurahs.has(surahId)) return false;

            if (node.type === 'mindmap') {
                if (hasKanbanState && !completeIds.has(`surah-${surahId}`)) return false;
                return true;
            }

            if (hasKanbanState && completeExitBehavior === 'mindmap_and_verses' && !completeIds.has(`surah-${surahId}`)) {
                return false;
            }
            return hasAnchorForNode(node);
        });

        const nodes = reviewPlanNodes.filter(node => hasNodeBeenReviewed(node.scheduler));

        const allDayCounts: Record<number, number> = {};
        let totalReviews = 0;
        let totalFutureReviews = 0;
        let backlogCount = 0;
        let dueTomorrow = 0;

        nodes.forEach(node => {
            const dueStr = getNodeDueDate(node);
            if (!dueStr) return;
            const dueDate = new Date(dueStr);
            if (isNaN(dueDate.getTime())) return;
            dueDate.setHours(0, 0, 0, 0);

            const diffTime = dueDate.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (!Number.isFinite(diffDays)) return;

            if (diffDays < 0) {
                backlogCount++;
            } else {
                totalFutureReviews++;
                if (diffDays === 1) dueTomorrow++;
            }

            allDayCounts[diffDays] = (allDayCounts[diffDays] || 0) + 1;
        });

        const dayCounts = allDayCounts;

        totalReviews = Object.values(dayCounts).reduce((sum, count) => sum + count, 0);

        const rangeDays = timeRange === '1m' ? 31 : timeRange === '3m' ? 90 : timeRange === '1y' ? 365 : 0;
        const finiteDays = Object.keys(dayCounts).map(Number).filter(Number.isFinite);

        // Determine x-axis range
        let minDay = Math.min(...finiteDays, -15);
        let maxDay = rangeDays || Math.max(...finiteDays, 30);

        // If 'all', we might want to cap it or just show everything
        if (timeRange === 'all') {
            maxDay = Math.max(...finiteDays, 30);
        }

        const data: FutureDuePoint[] = [];
        let cumulative = 0;

        // Calculate cumulative starting from the earliest day in dayCounts if backlog is shown
        const sortedDays = finiteDays.sort((a, b) => a - b);
        const earliestDay = sortedDays[0] || 0;

        for (let d = earliestDay; d <= maxDay; d++) {
            const count = dayCounts[d] || 0;
            cumulative += count;
            if (d >= minDay) {
                data.push({ day: d, count, cumulative });
            }
        }

        const totalDays = Math.max(1, maxDay - minDay + 1);
        const futureStart = Math.max(0, minDay);
        const futureDays = Math.max(1, maxDay - futureStart + 1);
        const dailyLoad = totalFutureReviews / futureDays;

        const filterLogByActivePart = (log: any) => {
            if (!log.review_time) return false;
            if (activePart === ALL_QURAN_PART) return true;
            const node = nodeById.get(log.nodeId);
            if (!node) return false;
            const surahId = resolveNodeSurahId(node);
            if (!surahId) return true;
            return targetSurahs.has(surahId);
        };

        const validLogs = reviewLogs.filter(filterLogByActivePart).filter(log => {
            const reviewDate = new Date(log.review_time);
            return !isNaN(reviewDate.getTime());
        });

        let historyStartDate = new Date(today);
        let historyDays = 1;
        if (timeRange === 'all') {
            const earliest = validLogs.reduce<Date | null>((min, log) => {
                const d = new Date(log.review_time);
                if (!min || d < min) return d;
                return min;
            }, null);
            if (earliest) {
                earliest.setHours(0, 0, 0, 0);
                historyStartDate = earliest;
                historyDays = Math.max(1, Math.ceil((today.getTime() - earliest.getTime()) / (1000 * 60 * 60 * 24)) + 1);
            }
        } else {
            historyDays = rangeDays;
            historyStartDate = new Date(today);
            historyStartDate.setDate(historyStartDate.getDate() - rangeDays + 1);
        }

        const historyCount = validLogs.filter(log => {
            const reviewDate = new Date(log.review_time);
            reviewDate.setHours(0, 0, 0, 0);
            return reviewDate >= historyStartDate && reviewDate <= today;
        }).length;

        const average = historyCount / historyDays;

        const reviewsToday = reviewLogs.filter(log => {
            if (!log.review_time) return false;
            const reviewDate = new Date(log.review_time);
            if (isNaN(reviewDate.getTime())) return false;
            reviewDate.setHours(0, 0, 0, 0);
            if (reviewDate.getTime() !== today.getTime()) return false;
            if (activePart === ALL_QURAN_PART) return true;
            const node = nodeById.get(log.nodeId);
            if (!node) return false;
            const surahId = resolveNodeSurahId(node);
            if (!surahId) return true;
            return targetSurahs.has(surahId);
        }).length;

        return {
            data,
            total: totalReviews,
            average: average.toFixed(1),
            dueTomorrow,
            overdueCount: backlogCount,
            dailyLoad: dailyLoad.toFixed(1),
            reviewsToday,
            minDay,
            maxDay
        };
    }, [activePart, activePartSurahIds, memoryNodes, mindmapBySurahId, nodeById, reviewLogs, settings?.kanbanColumns, settings?.completeExitBehavior, skippedSurahs, statisticsReady, timeRange]);

    const surahRiskStats = useMemo(() => {
        if (!statisticsReady) {
            return {
                rows: [] as SurahRiskRow[],
                hasData: false,
            };
        }

        const nowMs = Date.now();
        const dayMs = 1000 * 60 * 60 * 24;
        const rangeDays = surahRiskRange === '7d' ? 7 : surahRiskRange === '30d' ? 30 : surahRiskRange === '90d' ? 90 : null;
        const rangeStartMs = rangeDays ? nowMs - rangeDays * dayMs : Number.NEGATIVE_INFINITY;
        const trendWindowDays = rangeDays ?? 30;
        const currentWindowStartMs = nowMs - trendWindowDays * dayMs;
        const previousWindowStartMs = currentWindowStartMs - trendWindowDays * dayMs;

        const targetSurahs = activeUnskippedSurahs;
        const targetSurahIds = new Set(targetSurahs.map(s => s.id));

        const toMs = (value: unknown): number | null => {
            const parsed = Date.parse(String(value || ''));
            return Number.isFinite(parsed) ? parsed : null;
        };

        const resolveErrorSurahId = (error: any): number | null => {
            const direct = toPositiveInt(error?.surahId);
            if (direct) return direct;

            const fromErrorRef = resolveSurahIdFromErrorNodeRef(error?.targetId) || resolveSurahIdFromErrorNodeRef(error?.nodeId);
            if (fromErrorRef) return fromErrorRef;

            const nodeId = String(error?.nodeId || '');
            const node = nodeId ? nodeById.get(nodeId) : undefined;
            if (node) {
                const fromNode = resolveNodeSurahId(node);
                if (fromNode) return fromNode;
            }
            const absolute = toPositiveInt(error?.absoluteAyah);
            if (absolute) {
                const ref = absoluteToSurahAyah(absolute);
                return toPositiveInt(ref?.surahId);
            }
            return null;
        };

        const resolveLogSurahId = (log: any): number | null => {
            const nodeId = String(log?.nodeId || '');
            const node = nodeId ? nodeById.get(nodeId) : undefined;
            if (node) {
                const fromNode = resolveNodeSurahId(node);
                if (fromNode) return fromNode;
            }
            return toPositiveInt(log?.surahId);
        };

        const inWindow = (ms: number, startMs: number, endMs: number) => ms >= startMs && ms < endMs;
        const makeCounter = () => new Map<number, number>();
        const inc = (map: Map<number, number>, surahId: number, amount = 1) => {
            map.set(surahId, (map.get(surahId) || 0) + amount);
        };

        const mistakesInRange = makeCounter();
        const attemptsInRange = makeCounter();
        const mistakesCurrent = makeCounter();
        const attemptsCurrent = makeCounter();
        const mistakesPrevious = makeCounter();
        const attemptsPrevious = makeCounter();

        reviewErrors.forEach(error => {
            const timestampMs = toMs(error?.timestamp);
            if (timestampMs === null) return;
            const surahId = resolveErrorSurahId(error);
            if (!surahId || !targetSurahIds.has(surahId)) return;

            if (timestampMs >= rangeStartMs && timestampMs <= nowMs) {
                inc(mistakesInRange, surahId);
            }

            if (inWindow(timestampMs, currentWindowStartMs, nowMs + 1)) {
                inc(mistakesCurrent, surahId);
            } else if (inWindow(timestampMs, previousWindowStartMs, currentWindowStartMs)) {
                inc(mistakesPrevious, surahId);
            }
        });

        reviewLogs.forEach(log => {
            const reviewMs = toMs(log?.review_time);
            if (reviewMs === null) return;
            const surahId = resolveLogSurahId(log);
            if (!surahId || !targetSurahIds.has(surahId)) return;

            if (reviewMs >= rangeStartMs && reviewMs <= nowMs) {
                inc(attemptsInRange, surahId);
            }

            if (inWindow(reviewMs, currentWindowStartMs, nowMs + 1)) {
                inc(attemptsCurrent, surahId);
            } else if (inWindow(reviewMs, previousWindowStartMs, currentWindowStartMs)) {
                inc(attemptsPrevious, surahId);
            }
        });

        const surahMaturity = new Map<number, MaturityBucket>();
        targetSurahs.forEach(surah => {
            const stats = verseAndMindmapStabilityBySurahId.get(surah.id);
            if (!stats || stats.count === 0) {
                surahMaturity.set(surah.id, 'new');
                return;
            }
            const averageStability = stats.totalStability / stats.count;
            surahMaturity.set(surah.id, getMaturity(averageStability));
        });

        const rows: SurahRiskRow[] = targetSurahs
            .map(surah => {
                const mistakes = mistakesInRange.get(surah.id) || 0;
                const attempts = attemptsInRange.get(surah.id) || 0;
                const maturity = surahMaturity.get(surah.id) || 'new';

                const errorRateRaw = mistakes / Math.max(1, attempts);

                const currentMistakes = mistakesCurrent.get(surah.id) || 0;
                const currentAttempts = attemptsCurrent.get(surah.id) || 0;
                const previousMistakes = mistakesPrevious.get(surah.id) || 0;
                const previousAttempts = attemptsPrevious.get(surah.id) || 0;

                const currentRate = currentMistakes / Math.max(1, currentAttempts);
                const previousRate = previousMistakes / Math.max(1, previousAttempts);
                const trendDelta = currentRate - previousRate;

                let trend: TrendDirection = 'flat';
                if (trendDelta > 0.05) trend = 'up';
                else if (trendDelta < -0.05) trend = 'down';

                return {
                    surahId: surah.id,
                    surahName: surah.name,
                    mistakes,
                    attempts,
                    errorRate: errorRateRaw,
                    maturity,
                    trend,
                };
            })
            .filter(row => row.mistakes > 0)
            .sort((a, b) => {
                if (b.mistakes !== a.mistakes) return b.mistakes - a.mistakes;
                if (b.errorRate !== a.errorRate) return b.errorRate - a.errorRate;
                return b.attempts - a.attempts;
            })
            .slice(0, 5);

        const totalAttempts = Array.from(attemptsInRange.values()).reduce((sum, value) => sum + value, 0);
        const totalMistakes = Array.from(mistakesInRange.values()).reduce((sum, value) => sum + value, 0);
        return {
            rows,
            hasData: totalAttempts > 0 || totalMistakes > 0,
        };
    }, [activeUnskippedSurahs, nodeById, reviewErrors, reviewLogs, statisticsReady, surahRiskRange, verseAndMindmapStabilityBySurahId]);

    const reviewHeatmapStats = useMemo(() => {
        if (!statisticsReady) {
            return {
                weeks: [] as Array<Array<{ key: string; dateLabel: string; count: number; inRange: boolean; dow: number; isToday: boolean }>>,
                maxCount: 0,
                averagePerDay: '0.0',
            };
        }

        const rangeDays = 180;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const start = new Date(today);
        start.setDate(start.getDate() - (rangeDays - 1));

        const targetSurahs = activePartSurahIds;

        const toDayKey = (date: Date) => {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        };
        const formatDate = (date: Date) =>
            date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

        const dayCounts = new Map<string, number>();
        const isLogInScope = (log: any) => {
            const reviewDate = new Date(log?.review_time || '');
            if (Number.isNaN(reviewDate.getTime())) return false;
            reviewDate.setHours(0, 0, 0, 0);
            if (reviewDate < start || reviewDate > today) return false;
            if (activePart === ALL_QURAN_PART) return true;
            const node = nodeById.get(String(log?.nodeId || ''));
            if (!node) return false;
            const surahId = resolveNodeSurahId(node);
            if (!surahId) return false;
            if (!targetSurahs.has(surahId)) return false;
            if (skippedSurahs.has(surahId)) return false;
            return true;
        };

        for (const log of reviewLogs) {
            if (!isLogInScope(log)) continue;
            const d = new Date(log.review_time);
            d.setHours(0, 0, 0, 0);
            const key = toDayKey(d);
            dayCounts.set(key, (dayCounts.get(key) || 0) + 1);
        }

        const startGrid = new Date(start);
        startGrid.setDate(startGrid.getDate() - startGrid.getDay());
        const endGrid = new Date(today);
        endGrid.setDate(endGrid.getDate() + (6 - endGrid.getDay()));

        const days: Array<{ key: string; dateLabel: string; count: number; inRange: boolean; dow: number; isToday: boolean }> = [];
        const cursor = new Date(startGrid);
        const todayKey = toDayKey(today);
        while (cursor <= endGrid) {
            const key = toDayKey(cursor);
            const inRange = cursor >= start && cursor <= today;
            days.push({
                key,
                dateLabel: formatDate(cursor),
                count: inRange ? (dayCounts.get(key) || 0) : 0,
                inRange,
                dow: cursor.getDay(),
                isToday: key === todayKey,
            });
            cursor.setDate(cursor.getDate() + 1);
        }

        const weeks: typeof days[] = [];
        for (let i = 0; i < days.length; i += 7) {
            weeks.push(days.slice(i, i + 7));
        }

        const maxCount = Math.max(0, ...days.map(day => day.count));
        const totalReviews = days.reduce((sum, day) => sum + day.count, 0);
        const averagePerDay = totalReviews / rangeDays;

        return {
            weeks,
            maxCount,
            averagePerDay: averagePerDay.toFixed(1),
        };
    }, [activePart, activePartSurahIds, nodeById, reviewLogs, skippedSurahs, statisticsReady]);

    if (!statisticsReady) {
        if (isTransitionPendingForCurrentRoute) return null;
        return <FullScreenLoader text="Preparing statistics..." />;
    }

    return (
        <div className="content-wrapper tab-content">
            <h1 className="hidden md:block text-2xl font-bold mb-6">Statistics</h1>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="stats-header md:hidden" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <div>
                        {/* Mobile Title Placeholder if needed */}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    </div>
                </div>

           <div className="stats-masonry">
                    <div className="stats-masonry-item">
                        <ProgressBarSection
                            title="Part Mindmaps"
                            icon={<MapIcon size={20} />}
                            stats={partMindmapStats}
                        />
                    </div>

                    <div className="stats-masonry-item">
                        <ProgressBarSection
                            title="Surah Mindmaps"
                            icon={<MapPinned size={20} />}
                            stats={surahMindmapStats}
                        />
                    </div>

                    <div className="stats-masonry-item">
                        <ProgressBarSection
                            title="Verse Progress"
                            icon={<RotateCcw size={20} />}
                            stats={verseChunkStats}
                            headerSuffix={
                                <div className="segmented-compact">
                                    <button
                                        onClick={() => setVerseChunkMode('chunks')}
                                        className={`adv-seg-btn ${verseChunkMode === 'chunks' ? 'adv-seg-active' : ''}`}
                                    >
                                        CHUNKS
                                    </button>
                                    <button
                                        onClick={() => setVerseChunkMode('surahs')}
                                        className={`adv-seg-btn ${verseChunkMode === 'surahs' ? 'adv-seg-active' : ''}`}
                                    >
                                        SURAHS
                                    </button>
                                </div>
                            }
                        />
                    </div>

                    <div className="stats-masonry-item">
                        <ProgressBarSection
                            title="Similar Verses Coverage"
                            icon={<BookCopy size={20} />}
                            stats={mutashabihatStats}
                        />
                    </div>

                    <div className="stats-masonry-item">
                        <ProgressBarSection
                            title="Daily Portion"
                            icon={<Repeat size={20} />}
                            stats={dailyPortionStats}
                            headerSuffix={
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', color: 'var(--foreground-secondary)', fontSize: '0.8rem', fontWeight: 600, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                    <Repeat size={14} />
                                    <span>{dailyPortionStats.completions} cycles</span>
                                    {dailyPortionStats.completedToday ? (
                                        <span style={{ color: 'var(--accent)' }}>Completed today</span>
                                    ) : null}
                                </div>
                            }
                        />
                    </div>

                    <div className="stats-masonry-item">
                        <ReviewsHeatmapSection
                            weeks={reviewHeatmapStats.weeks}
                            maxCount={reviewHeatmapStats.maxCount}
                            averagePerDay={reviewHeatmapStats.averagePerDay}
                        />
                    </div>

                    <div className="stats-masonry-item">
                        <SurahRiskMaturitySection
                            rows={surahRiskStats.rows}
                            hasData={surahRiskStats.hasData}
                            range={surahRiskRange}
                            onRangeChange={setSurahRiskRange}
                        />
                    </div>

                    <div className="stats-masonry-item">
                        <FutureDueSection
                            stats={futureDueStats}
                            timeRange={timeRange}
                            setTimeRange={setTimeRange}
                        />
                    </div>
                </div>
            </div>

        </div>
    );
}

function ReviewsHeatmapSection({
    weeks,
    maxCount,
    averagePerDay,
}: {
    weeks: Array<Array<{ key: string; dateLabel: string; count: number; inRange: boolean; dow: number; isToday: boolean }>>;
    maxCount: number;
    averagePerDay: string;
}) {
    const panelRef = useRef<HTMLDivElement | null>(null);
    const [panelWidth, setPanelWidth] = useState(0);

    useEffect(() => {
        if (!panelRef.current) return;
        const el = panelRef.current;
        const update = () => setPanelWidth(Math.max(0, Math.floor(el.clientWidth)));
        update();
        const ro = new ResizeObserver(() => update());
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const cellSize = 12;
    const cellGap = 4;
    const totalWeeks = weeks.length;
    const gridWidth = totalWeeks > 0 ? totalWeeks * cellSize + (totalWeeks - 1) * cellGap : 0;
    const alignToEnd = panelWidth > 0 && gridWidth > panelWidth;

    const getCellColor = (count: number, inRange: boolean, isToday: boolean) => {
        if (isToday) {
            return count > 0
                ? 'color-mix(in srgb, var(--accent) 95%, transparent)'
                : 'color-mix(in srgb, var(--accent) 45%, transparent)';
        }
        if (!inRange) return 'transparent';
        if (count <= 0) return 'color-mix(in srgb, var(--border) 50%, transparent)';
        const intensity = maxCount <= 0 ? 0 : count / maxCount;
        if (intensity < 0.25) return 'color-mix(in srgb, var(--chart-medium) 25%, transparent)';
        if (intensity < 0.5) return 'color-mix(in srgb, var(--chart-medium) 45%, transparent)';
        if (intensity < 0.75) return 'color-mix(in srgb, var(--chart-medium) 65%, transparent)';
        return 'color-mix(in srgb, var(--accent) 85%, transparent)';
    };

    return (
        <div className="card modern-card" style={{ width: '100%', background: 'var(--background-secondary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', gap: '0.5rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div className="header-icon-badge">
                        <CalendarDays size={20} />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '0.95rem', margin: 0, fontWeight: 700 }}>Daily Reviews</h2>
                    </div>
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--foreground-secondary)', fontWeight: 700 }}>
                    Avg/Day <span style={{ color: 'var(--foreground)', fontSize: '0.86rem' }}>{averagePerDay}</span>
                </div>
            </div>

            <div ref={panelRef} style={{ borderRadius: '14px', border: '1px solid var(--border)', background: 'var(--reviews-chart-panel)', padding: '0.7rem', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: alignToEnd ? 'flex-end' : 'flex-start', width: '100%' }}>
                    {weeks.map((week, weekIndex) => (
                        <div key={`week-${weekIndex}`} style={{ display: 'grid', gridTemplateRows: 'repeat(7, 12px)', gap: `${cellGap}px`, marginLeft: weekIndex === 0 ? 0 : `${cellGap}px` }}>
                            {week.map(day => (
                                <div
                                    key={day.key}
                                    data-tooltip={`${day.dateLabel}: ${day.count} review${day.count === 1 ? '' : 's'}${day.isToday ? ' (today)' : ''}`}
                                    data-tooltip-trigger="tap"
                                    style={{
                                        width: `${cellSize}px`,
                                        height: `${cellSize}px`,
                                        borderRadius: '3px',
                                        background: getCellColor(day.count, day.inRange, day.isToday),
                                        border: `1px solid ${day.isToday ? 'var(--accent)' : day.inRange ? 'color-mix(in srgb, var(--border) 60%, transparent)' : 'transparent'}`,
                                        boxShadow: day.isToday ? '0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent)' : 'none',
                                    }}
                                />
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function SurahRiskMaturitySection({
    rows,
    hasData,
    range,
    onRangeChange,
}: {
    rows: SurahRiskRow[];
    hasData: boolean;
    range: SurahRiskRange;
    onRangeChange: (value: SurahRiskRange) => void;
}) {
    const rangeLabel = range === '7d' ? '7 days' : range === '30d' ? '30 days' : range === '90d' ? '90 days' : 'all time';

    return (
        <div className="card modern-card" style={{ width: '100%', background: 'var(--background-secondary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', gap: '0.5rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div className="header-icon-badge">
                        <AlertTriangle size={20} />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '0.95rem', margin: 0, fontWeight: 700 }}>Weak Surahs</h2>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <div className="segmented-compact">
                        <button type="button" onClick={() => onRangeChange('7d')} className={`adv-seg-btn ${range === '7d' ? 'adv-seg-active' : ''}`}>7d</button>
                        <button type="button" onClick={() => onRangeChange('30d')} className={`adv-seg-btn ${range === '30d' ? 'adv-seg-active' : ''}`}>30d</button>
                        <button type="button" onClick={() => onRangeChange('90d')} className={`adv-seg-btn ${range === '90d' ? 'adv-seg-active' : ''}`}>90d</button>
                        <button type="button" onClick={() => onRangeChange('all')} className={`adv-seg-btn ${range === 'all' ? 'adv-seg-active' : ''}`}>all</button>
                    </div>
                </div>
            </div>

            {!hasData ? (
                <ChartEmptyState message="No review data available" />
            ) : (
                <SurahRiskBarsChart rows={rows} rangeLabel={rangeLabel} />
            )}
        </div>
    );
}

function SurahRiskBarsChart({ rows, rangeLabel }: { rows: SurahRiskRow[]; rangeLabel: string }) {
    const MAX_Y_AXIS_LEGENDS = 6;
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [chartWidth, setChartWidth] = useState(0);
    const gradientSeed = useId();
    const chartHeight = 220;
    const padding = { top: 20, right: 34, bottom: 58, left: 34 };
    const maxMistakes = Math.max(1, ...rows.map(row => row.mistakes));
    const ids = {
        clip: `risk-chart-clip-${gradientSeed}`,
    };

    useEffect(() => {
        if (!containerRef.current) return;
        const el = containerRef.current;
        const update = () => setChartWidth(Math.max(0, Math.floor(el.clientWidth)));
        update();
        const ro = new ResizeObserver(() => update());
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    if (rows.length === 0) {
        return null;
    }

    const shortSurahLabel = (name: string, maxChars: number) => (name.length > maxChars ? `${name.slice(0, maxChars)}…` : name);

    return (
        <div ref={containerRef} className="reviews-chart" style={{ width: '100%', height: chartHeight, position: 'relative' }}>
            {chartWidth > 0 && (
                <svg
                    width={chartWidth}
                    height={chartHeight}
                    viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                    preserveAspectRatio="xMidYMid meet"
                    style={{ overflow: 'visible', display: 'block', width: '100%', height: chartHeight }}
                >
                    <defs>
                        <clipPath id={ids.clip}>
                            <rect x={padding.left} y={padding.top} width={chartWidth - padding.left - padding.right} height={chartHeight - padding.top - padding.bottom} rx="16" ry="16" />
                        </clipPath>
                    </defs>
                    {(() => {
                        const plotWidth = chartWidth - padding.left - padding.right;
                        const plotHeight = chartHeight - padding.top - padding.bottom;
                        const span = Math.max(1, rows.length);
                        const groupWidth = plotWidth * 0.76;
                        const groupStart = padding.left + (plotWidth - groupWidth) / 2;
                        const step = groupWidth / span;
                        const getX = (index: number) => groupStart + (index + 0.5) * step;
                        const labelMaxChars = step < 70 ? 5 : step < 90 ? 7 : 10;
                        const tickCount = maxMistakes <= 8 ? Math.max(2, maxMistakes) : 4;
                        const tickStep = maxMistakes <= 8 ? 1 : Math.max(2, Math.ceil(maxMistakes / tickCount / 2) * 2);
                        const maxNice = Math.max(1, tickCount * tickStep);
                        const allTicks = Array.from({ length: tickCount + 1 }, (_, i) => i * tickStep);
                        const yLegendStep = Math.max(1, Math.ceil((allTicks.length - 1) / Math.max(1, MAX_Y_AXIS_LEGENDS - 1)));
                        const ticks = allTicks.filter((_, i) => i % yLegendStep === 0 || i === allTicks.length - 1);
                        const getYBars = (value: number) => chartHeight - padding.bottom - (value / maxNice) * plotHeight;
                        const roundedPath = (x: number, y: number, w: number, h: number, rt: number, rb: number) => {
                            const right = x + w;
                            const bottom = y + h;
                            const rTop = Math.min(rt, w / 2, h / 2);
                            const rBottom = Math.min(rb, w / 2, h / 2);
                            return [
                                `M ${x} ${y + rTop}`,
                                `Q ${x} ${y} ${x + rTop} ${y}`,
                                `L ${right - rTop} ${y}`,
                                `Q ${right} ${y} ${right} ${y + rTop}`,
                                `L ${right} ${bottom - rBottom}`,
                                `Q ${right} ${bottom} ${right - rBottom} ${bottom}`,
                                `L ${x + rBottom} ${bottom}`,
                                `Q ${x} ${bottom} ${x} ${bottom - rBottom}`,
                                'Z'
                            ].join(' ');
                        };
                        return (
                            <>
                                <rect x={padding.left} y={padding.top} width={plotWidth} height={plotHeight} rx={16} ry={16} fill="var(--reviews-chart-panel)" stroke="none" />
                                <g clipPath={`url(#${ids.clip})`}>
                                    {rows.map((row, i) => {
                                        const value = Math.max(0, row.mistakes);
                                        const barWidth = Math.max(16, Math.min(34, step * 0.62));
                                        const x = getX(i) - barWidth / 2;
                                        const y = getYBars(value);
                                        const h = Math.max(0, chartHeight - padding.bottom - y);
                                        const tooltip = `${row.mistakes} mistakes`;
                                        return (
                                            <g key={row.surahId}>
                                                <path
                                                    d={roundedPath(x, padding.top + 6, barWidth, plotHeight - 6, 14, 10)}
                                                    fill="var(--border)"
                                                    opacity="0.2"
                                                />
                                                <path
                                                    d={roundedPath(x, y, barWidth, h, 14, 6)}
                                                    fill="color-mix(in srgb, var(--accent) 72%, var(--background) 28%)"
                                                    opacity={i === 0 ? 0.95 : 0.7}
                                                    data-tooltip={tooltip}
                                                    data-tooltip-trigger="tap"
                                                    style={{ cursor: 'pointer' }}
                                                />
                                            </g>
                                        );
                                    })}
                                </g>

                                <line x1={padding.left} y1={chartHeight - padding.bottom} x2={chartWidth - padding.right} y2={chartHeight - padding.bottom} stroke="var(--border)" opacity="0.5" />
                                <line x1={padding.left} y1={padding.top} x2={padding.left} y2={chartHeight - padding.bottom} stroke="var(--border)" opacity="0.35" />

                                {ticks.map(tick => (
                                    <text key={tick} x={padding.left - 7} y={getYBars(tick) + 4} textAnchor="end" fontSize="9" fill="var(--foreground-secondary)">
                                        {tick}
                                    </text>
                                ))}

                                {rows.map((row, i) => {
                                    const x = getX(i);
                                    const y = chartHeight - padding.bottom + 18;
                                    const label = shortSurahLabel(row.surahName, labelMaxChars);
                                    const isTruncated = label !== row.surahName;
                                    return (
                                        <text
                                            key={`x-${row.surahId}`}
                                            x={x}
                                            y={y}
                                            textAnchor="middle"
                                            fontSize="10"
                                            fill="var(--foreground-secondary)"
                                            data-tooltip={isTruncated ? row.surahName : undefined}
                                            data-tooltip-trigger={isTruncated ? 'tap' : undefined}
                                            style={isTruncated ? { cursor: 'help' } : undefined}
                                        >
                                            {isTruncated ? <title>{row.surahName}</title> : null}
                                            {label}
                                        </text>
                                    );
                                })}
                            </>
                        );
                    })()}
                </svg>
            )}
        </div>
    );
}

function FutureDueSection({ stats, timeRange, setTimeRange }: {
    stats: any;
    timeRange: '1m' | '3m' | '1y' | 'all';
    setTimeRange: (v: '1m' | '3m' | '1y' | 'all') => void;
}) {
    const [chartType, setChartType] = useState<'bar' | 'line'>('line');

    return (
        <div className="card modern-card" style={{ width: '100%', background: 'var(--background-secondary)' }}>
            <div className="future-due-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <div className="future-due-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div className="header-icon-badge">
                        <CalendarClock size={20} />
                    </div>
                    <h2 style={{ fontSize: '0.95rem', margin: 0, fontWeight: 700 }}>Review Plan</h2>
                </div>
                <div className="future-due-actions" style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
                    <div className="segmented-compact">
                        <button
                            type="button"
                            onClick={() => setChartType('bar')}
                            className={`adv-seg-btn ${chartType === 'bar' ? 'adv-seg-active' : ''}`}
                            title="Bar Chart"
                            style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                            <BarChart2 size={15} />
                        </button>
                        <button
                            type="button"
                            onClick={() => setChartType('line')}
                            className={`adv-seg-btn ${chartType === 'line' ? 'adv-seg-active' : ''}`}
                            title="Line Chart"
                            style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                            <Activity size={15} />
                        </button>
                    </div>
                    <div className="segmented-compact">
                        <button type="button" onClick={() => setTimeRange('1m')} className={`adv-seg-btn ${timeRange === '1m' ? 'adv-seg-active' : ''}`}>1m</button>
                        <button type="button" onClick={() => setTimeRange('3m')} className={`adv-seg-btn ${timeRange === '3m' ? 'adv-seg-active' : ''}`}>3m</button>
                        <button type="button" onClick={() => setTimeRange('1y')} className={`adv-seg-btn ${timeRange === '1y' ? 'adv-seg-active' : ''}`}>1y</button>
                        <button type="button" onClick={() => setTimeRange('all')} className={`adv-seg-btn ${timeRange === 'all' ? 'adv-seg-active' : ''}`}>all</button>
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {chartType === 'bar' ? (
                    <FutureDueChart data={stats.data} minDay={stats.minDay} maxDay={stats.maxDay} dailyLoad={stats.dailyLoad} />
                ) : (
                    <FutureDueLineChart data={stats.data} minDay={stats.minDay} maxDay={stats.maxDay} dailyLoad={stats.dailyLoad} />
                )}
            </div>
        </div>
    );
}

function FutureDueLineChart({ data, minDay, maxDay, dailyLoad }: { data: FutureDuePoint[]; minDay: number; maxDay: number; dailyLoad: string }) {
    const DESKTOP_MAX_X_AXIS_LEGENDS = 6;
    const MAX_Y_AXIS_LEGENDS = 6;
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [chartWidth, setChartWidth] = useState(0);
    const gradientSeed = useId();
    const chartHeight = 210;
    const padding = { top: 12, right: 28, bottom: 38, left: 36 };

    const bucketedData = useMemo<FutureDueBucket[]>(() => {
        const nonZeroData = data.filter(d => d.count > 0);
        if (nonZeroData.length === 0) return [];

        const width = Math.max(320, chartWidth || 0);
        const isSmallScreen = width <= 480;
        const isTablet = width > 480 && width <= 900;
        const maxBars = isSmallScreen ? 12 : isTablet ? 18 : 24;
        const spanDays = Math.max(1, maxDay - minDay + 1);

        let bucketSize = 1;
        if (spanDays > 120) {
            bucketSize = 30;
        } else if (spanDays > 45) {
            bucketSize = 7;
        }

        if (bucketSize === 1) {
            const visibleDays = Math.max(1, nonZeroData[nonZeroData.length - 1].day - nonZeroData[0].day + 1);
            if (visibleDays > maxBars) {
                bucketSize = Math.ceil(visibleDays / maxBars);
            }
        }

        const buckets = new Map<number, FutureDueBucket>();

        nonZeroData.forEach(point => {
            const bucketStart = Math.floor(point.day / bucketSize) * bucketSize;
            const bucketEnd = bucketStart + bucketSize - 1;
            const existing = buckets.get(bucketStart);
            if (existing) {
                existing.count += point.count;
                existing.cumulative = point.cumulative;
                existing.containsToday = existing.containsToday || (point.day >= bucketStart && point.day <= bucketEnd && bucketStart <= 0 && bucketEnd >= 0);
                return;
            }

            buckets.set(bucketStart, {
                startDay: bucketStart,
                endDay: bucketEnd,
                label: '',
                count: point.count,
                cumulative: point.cumulative,
                containsToday: bucketStart <= 0 && bucketEnd >= 0,
            });
        });

        const formatSingleDayLabel = (day: number) => {
            if (day === 0) return 'Today';
            if (day === 1) return '1d';
            if (day < 0) return `${Math.abs(day)}d ago`;
            return `${day}d`;
        };

        const formatRangeLabel = (startDay: number, endDay: number) => {
            if (startDay === endDay) return formatSingleDayLabel(startDay);
            if (startDay < 0 && endDay < 0) return `${Math.abs(startDay)}d to ${Math.abs(endDay)}d ago`;
            if (startDay < 0 && endDay >= 0) {
                const endStr = endDay === 0 ? 'Today' : formatSingleDayLabel(endDay);
                return `${Math.abs(startDay)}d ago to ${endStr}`;
            }
            if (startDay === 0 && endDay > 0) return `Today to ${formatSingleDayLabel(endDay)}`;
            return `${formatSingleDayLabel(startDay)} to ${formatSingleDayLabel(endDay)}`;
        };

        return Array.from(buckets.values())
            .sort((a, b) => a.startDay - b.startDay)
            .map(bucket => ({
                ...bucket,
                label: formatRangeLabel(bucket.startDay, bucket.endDay),
            }));
    }, [chartWidth, data, maxDay, minDay]);

    const maxCount = Math.max(...bucketedData.map(d => d.count), 1);
    const isSmallRange = maxCount <= 8;
    const tickCount = isSmallRange ? Math.max(2, maxCount) : 4;
    const tickStep = isSmallRange ? 1 : Math.max(2, Math.ceil(maxCount / tickCount / 2) * 2);
    const maxNice = Math.max(1, tickStep * tickCount);
    const allYTicks = Array.from({ length: tickCount + 1 }, (_, i) => i * tickStep);
    const yLegendStep = Math.max(1, Math.ceil((allYTicks.length - 1) / Math.max(1, MAX_Y_AXIS_LEGENDS - 1)));
    const yTicks = allYTicks.filter((_, i) => i % yLegendStep === 0 || i === allYTicks.length - 1);

    const ids = {
        clip: `reviews-line-clip-${gradientSeed}`,
        gradient: `reviews-line-grad-${gradientSeed}`,
    };

    useEffect(() => {
        if (!containerRef.current) return;
        const el = containerRef.current;
        const update = () => setChartWidth(Math.max(0, Math.floor(el.clientWidth)));
        update();
        const ro = new ResizeObserver(() => update());
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    if (data.length === 0 || bucketedData.length === 0) return <ChartEmptyState />;

    return (
        <div ref={containerRef} className="reviews-chart" style={{ width: '100%', height: chartHeight, position: 'relative' }}>
            {chartWidth > 0 && (
                <svg
                    width={chartWidth}
                    height={chartHeight}
                    viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                    preserveAspectRatio="xMidYMid meet"
                    style={{ overflow: 'visible', display: 'block', width: '100%', height: chartHeight }}
                >
                    <defs>
                        <clipPath id={ids.clip}>
                            <rect x={padding.left} y={padding.top} width={chartWidth - padding.left - padding.right} height={chartHeight - padding.top - padding.bottom} rx="16" ry="16" />
                        </clipPath>
                        <linearGradient id={ids.gradient} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--accent)" stopOpacity="0.3" />
                            <stop offset="95%" stopColor="var(--accent)" stopOpacity="0.0" />
                        </linearGradient>
                    </defs>
                    {(() => {
                        const vWidth = chartWidth;
                        const plotWidth = vWidth - padding.left - padding.right;
                        const plotHeight = chartHeight - padding.top - padding.bottom;
                        const span = Math.max(1, bucketedData.length);
                        const groupWidth = plotWidth * 0.88;
                        const groupStart = padding.left + (plotWidth - groupWidth) / 2;
                        const step = groupWidth / (span > 1 ? span - 1 : 1);
                        const getX = (index: number) => span === 1 ? padding.left + plotWidth / 2 : groupStart + index * step;
                        const getYCount = (count: number) => chartHeight - padding.bottom - (count / maxNice) * plotHeight;

                        const isSmallScreen = chartWidth <= 480;
                        const isTablet = chartWidth > 480 && chartWidth <= 900;
                        const maxXAxisLegends = isSmallScreen ? 4 : isTablet ? 5 : DESKTOP_MAX_X_AXIS_LEGENDS;
                        const xAxisFontSize = isSmallScreen ? 9 : 10;
                        const rotateLabels = step < (isSmallScreen ? 46 : 40);
                        const dailyLoadValue = Number(dailyLoad);
                        const showDailyLoadLine = Number.isFinite(dailyLoadValue) && dailyLoadValue >= 1;

                        const points = bucketedData.map((d, i) => ({ x: getX(i), y: getYCount(d.count) }));

                        const isTooMuchData = bucketedData.length > 8;
                        let linePath = "";
                        if (points.length > 1) {
                            if (isTooMuchData) {
                                // Smooth line
                                linePath = `M ${points[0].x} ${points[0].y}`;
                                for (let i = 0; i < points.length - 1; i++) {
                                    const curr = points[i];
                                    const next = points[i + 1];
                                    const cp1x = curr.x + (next.x - curr.x) / 2;
                                    const cp2x = curr.x + (next.x - curr.x) / 2;
                                    linePath += ` C ${cp1x} ${curr.y}, ${cp2x} ${next.y}, ${next.x} ${next.y}`;
                                }
                            } else {
                                // Straight lines
                                linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                            }
                        }

                        const areaPath = points.length > 1
                            ? `${linePath} L ${points[points.length - 1].x} ${chartHeight - padding.bottom} L ${points[0].x} ${chartHeight - padding.bottom} Z`
                            : "";

                        // Reuse label logic
                        const baseLabelStep = Math.max(1, Math.ceil(bucketedData.length / maxXAxisLegends));
                        const longestLabelLength = Math.max(...bucketedData.map(d => d.label.length), 1);
                        const estimatedLabelWidth = longestLabelLength * xAxisFontSize * 0.56 + 8;
                        const minStepForWidth = Math.max(1, Math.ceil(estimatedLabelWidth / Math.max(step, 1)));
                        const labelStep = Math.max(baseLabelStep, minStepForWidth);
                        const minLabelGapPx = estimatedLabelWidth;

                        const todayIndex = bucketedData.findIndex(d => d.containsToday);
                        const visibleLabelIndices = new Set<number>();
                        const canPlaceLabel = (index: number) => {
                            const x = getX(index);
                            for (const existingIndex of visibleLabelIndices) {
                                if (Math.abs(x - getX(existingIndex)) < minLabelGapPx) return false;
                            }
                            return true;
                        };
                        const forcePlaceLabel = (index: number) => {
                            const x = getX(index);
                            Array.from(visibleLabelIndices).forEach(existingIndex => {
                                if (Math.abs(x - getX(existingIndex)) < minLabelGapPx) visibleLabelIndices.delete(existingIndex);
                            });
                            visibleLabelIndices.add(index);
                        };
                        const priorityIndices = [todayIndex, 0, bucketedData.length - 1].filter((idx, pos, arr): idx is number => idx >= 0 && arr.indexOf(idx) === pos);
                        priorityIndices.forEach(index => {
                            if (index === todayIndex) { forcePlaceLabel(index); return; }
                            if (canPlaceLabel(index)) visibleLabelIndices.add(index);
                        });
                        bucketedData.forEach((_, i) => {
                            if (i % labelStep === 0 && !visibleLabelIndices.has(i) && canPlaceLabel(i)) visibleLabelIndices.add(i);
                        });

                        return (
                            <>
                                <rect x={padding.left} y={padding.top} width={plotWidth} height={plotHeight} rx={16} ry={16} fill="var(--reviews-chart-panel)" stroke="none" />

                                <g clipPath={`url(#${ids.clip})`}>
                                    {showDailyLoadLine && (
                                        <line
                                            x1={padding.left}
                                            y1={getYCount(dailyLoadValue)}
                                            x2={vWidth - padding.right}
                                            y2={getYCount(dailyLoadValue)}
                                            stroke="var(--chart-strong)"
                                            strokeWidth="1.2"
                                            strokeDasharray="4 3"
                                            opacity="0.9"
                                        />
                                    )}

                                    {points.length > 1 && (
                                        <>
                                            <path d={areaPath} fill={`url(#${ids.gradient})`} opacity="0.6" />
                                            <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                        </>
                                    )}

                                    {bucketedData.map((d, i) => {
                                        const x = getX(i);
                                        const y = getYCount(d.count);
                                        const reviewLabel = `${d.count} review${d.count === 1 ? '' : 's'}`;
                                        const tooltip = d.startDay === d.endDay ? reviewLabel : `${reviewLabel} (${d.label})`;
                                        return (
                                            <g key={i}>
                                                {/* Transparent larger circle for easier hovering */}
                                                <circle
                                                    cx={x}
                                                    cy={y}
                                                    r={10}
                                                    fill="transparent"
                                                    data-tooltip={tooltip}
                                                    data-tooltip-trigger="tap"
                                                    style={{ cursor: 'pointer' }}
                                                />
                                                <circle
                                                    cx={x}
                                                    cy={y}
                                                    r={4}
                                                    fill="var(--background)"
                                                    stroke="var(--accent)"
                                                    strokeWidth="2"
                                                    pointerEvents="none"
                                                />
                                            </g>
                                        );
                                    })}
                                </g>

                                <line x1={padding.left} y1={chartHeight - padding.bottom} x2={vWidth - padding.right} y2={chartHeight - padding.bottom} stroke="var(--border)" opacity="0.5" />
                                <line x1={padding.left} y1={padding.top} x2={padding.left} y2={chartHeight - padding.bottom} stroke="var(--border)" opacity="0.35" />

                                {yTicks.map((val, i) => (
                                    <text key={i} x={padding.left - 8} y={getYCount(val) + 4} textAnchor="end" fontSize="9" fill="var(--foreground-secondary)">{val}</text>
                                ))}

                                {bucketedData.map((d, i) => {
                                    if (!visibleLabelIndices.has(i)) return null;
                                    const x = getX(i);
                                    const y = chartHeight - padding.bottom + 18;
                                    return (
                                        <text
                                            key={`label-${i}`}
                                            x={x}
                                            y={y}
                                            textAnchor="middle"
                                            fontSize={xAxisFontSize}
                                            fill="var(--foreground-secondary)"
                                            transform={rotateLabels ? `rotate(-22 ${x} ${y})` : undefined}
                                        >
                                            {d.label}
                                        </text>
                                    );
                                })}
                            </>
                        );
                    })()}
                </svg>
            )}
        </div>
    );
}

function FutureDueChart({ data, minDay, maxDay, dailyLoad }: { data: FutureDuePoint[]; minDay: number; maxDay: number; dailyLoad: string }) {
    const DESKTOP_MAX_X_AXIS_LEGENDS = 6;
    const MAX_Y_AXIS_LEGENDS = 6;
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [chartWidth, setChartWidth] = useState(0);
    const gradientSeed = useId();
    const chartHeight = 210;
    const padding = { top: 8, right: 28, bottom: 38, left: 36 };

    const bucketedData = useMemo<FutureDueBucket[]>(() => {
        const nonZeroData = data.filter(d => d.count > 0);
        if (nonZeroData.length === 0) return [];

        const width = Math.max(320, chartWidth || 0);
        const isSmallScreen = width <= 480;
        const isTablet = width > 480 && width <= 900;
        const maxBars = isSmallScreen ? 12 : isTablet ? 18 : 24;
        const spanDays = Math.max(1, maxDay - minDay + 1);

        let bucketSize = 1;
        if (spanDays > 120) {
            bucketSize = 30;
        } else if (spanDays > 45) {
            bucketSize = 7;
        }

        if (bucketSize === 1) {
            const visibleDays = Math.max(1, nonZeroData[nonZeroData.length - 1].day - nonZeroData[0].day + 1);
            if (visibleDays > maxBars) {
                bucketSize = Math.ceil(visibleDays / maxBars);
            }
        }

        const buckets = new Map<number, FutureDueBucket>();

        nonZeroData.forEach(point => {
            const bucketStart = Math.floor(point.day / bucketSize) * bucketSize;
            const bucketEnd = bucketStart + bucketSize - 1;
            const existing = buckets.get(bucketStart);
            if (existing) {
                existing.count += point.count;
                existing.cumulative = point.cumulative;
                existing.containsToday = existing.containsToday || (point.day >= bucketStart && point.day <= bucketEnd && bucketStart <= 0 && bucketEnd >= 0);
                return;
            }

            buckets.set(bucketStart, {
                startDay: bucketStart,
                endDay: bucketEnd,
                label: '',
                count: point.count,
                cumulative: point.cumulative,
                containsToday: bucketStart <= 0 && bucketEnd >= 0,
            });
        });

        const formatSingleDayLabel = (day: number) => {
            if (day === 0) return 'Today';
            if (day === 1) return '1d';
            if (day < 0) return `${Math.abs(day)}d ago`;
            return `${day}d`;
        };

        const formatRangeLabel = (startDay: number, endDay: number) => {
            if (startDay === endDay) return formatSingleDayLabel(startDay);

            // Overdue range (both negative)
            if (startDay < 0 && endDay < 0) {
                return `${Math.abs(startDay)}d to ${Math.abs(endDay)}d ago`;
            }

            // Range including Today
            if (startDay < 0 && endDay >= 0) {
                const endStr = endDay === 0 ? 'Today' : formatSingleDayLabel(endDay);
                return `${Math.abs(startDay)}d ago to ${endStr}`;
            }

            // Future range starting from Today
            if (startDay === 0 && endDay > 0) {
                return `Today to ${formatSingleDayLabel(endDay)}`;
            }

            // Future range (both positive)
            return `${formatSingleDayLabel(startDay)} to ${formatSingleDayLabel(endDay)}`;
        };

        return Array.from(buckets.values())
            .sort((a, b) => a.startDay - b.startDay)
            .map(bucket => ({
                ...bucket,
                label: formatRangeLabel(bucket.startDay, bucket.endDay),
            }));
    }, [chartWidth, data, maxDay, minDay]);

    const maxCount = Math.max(...bucketedData.map(d => d.count), 1);
    const isSmallRange = maxCount <= 8;
    const tickCount = isSmallRange ? Math.max(2, maxCount) : 4;
    const tickStep = isSmallRange ? 1 : Math.max(2, Math.ceil(maxCount / tickCount / 2) * 2);
    const maxNice = Math.max(1, tickStep * tickCount);
    const allYTicks = Array.from({ length: tickCount + 1 }, (_, i) => i * tickStep);
    const yLegendStep = Math.max(1, Math.ceil((allYTicks.length - 1) / Math.max(1, MAX_Y_AXIS_LEGENDS - 1)));
    const yTicks = allYTicks.filter((_, i) => i % yLegendStep === 0 || i === allYTicks.length - 1);
    const ids = {
        bar: `reviews-bar-${gradientSeed}`,
        clip: `reviews-chart-clip-${gradientSeed}`,
    };

    useEffect(() => {
        if (!containerRef.current) return;
        const el = containerRef.current;
        const update = () => setChartWidth(Math.max(0, Math.floor(el.clientWidth)));
        update();
        const ro = new ResizeObserver(() => update());
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    if (data.length === 0) return <ChartEmptyState />;
    if (bucketedData.length === 0) {
        return <ChartEmptyState />;
    }

    return (
        <div ref={containerRef} className="reviews-chart" style={{ width: '100%', height: chartHeight, position: 'relative' }}>
            {chartWidth > 0 && (
                <svg
                    width={chartWidth}
                    height={chartHeight}
                    viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                    preserveAspectRatio="xMidYMid meet"
                    style={{ overflow: 'visible', display: 'block', width: '100%', height: chartHeight }}
                >
                    <defs>
                        <clipPath id={ids.clip}>
                            <rect x={padding.left} y={padding.top} width={chartWidth - padding.left - padding.right} height={chartHeight - padding.top - padding.bottom} rx="16" ry="16" />
                        </clipPath>
                    </defs>
                    {(() => {
                        const vWidth = chartWidth;
                        const plotWidth = vWidth - padding.left - padding.right;
                        const plotHeight = chartHeight - padding.top - padding.bottom;
                        const span = Math.max(1, bucketedData.length);
                        const groupWidth = plotWidth * 0.72;
                        const groupStart = padding.left + (plotWidth - groupWidth) / 2;
                        const step = groupWidth / span;
                        const getX = (index: number) => groupStart + (index + 0.5) * step;
                        const getYCount = (count: number) => chartHeight - padding.bottom - (count / maxNice) * plotHeight;
                        const isSmallScreen = chartWidth <= 480;
                        const isTablet = chartWidth > 480 && chartWidth <= 900;
                        const maxXAxisLegends = isSmallScreen ? 4 : isTablet ? 5 : DESKTOP_MAX_X_AXIS_LEGENDS;
                        const xAxisFontSize = isSmallScreen ? 9 : 10;
                        const rotateLabels = step < (isSmallScreen ? 46 : 40);
                        const dailyLoadValue = Number(dailyLoad);
                        const showDailyLoadLine = Number.isFinite(dailyLoadValue) && dailyLoadValue >= 1;
                        const baseLabelStep = Math.max(1, Math.ceil(bucketedData.length / maxXAxisLegends));
                        const longestLabelLength = Math.max(...bucketedData.map(d => d.label.length), 1);
                        const estimatedLabelWidth = longestLabelLength * xAxisFontSize * 0.56 + 8;
                        const minStepForWidth = Math.max(1, Math.ceil(estimatedLabelWidth / Math.max(step, 1)));
                        const labelStep = Math.max(baseLabelStep, minStepForWidth);
                        const minLabelGapPx = estimatedLabelWidth;

                        const candidateLabelIndices = bucketedData
                            .map((d, i) => {
                                const shouldShow = i === 0 || i === bucketedData.length - 1 || d.containsToday || i % labelStep === 0;
                                return shouldShow ? i : -1;
                            })
                            .filter((i): i is number => i >= 0);

                        const todayIndex = bucketedData.findIndex(d => d.containsToday);
                        const visibleLabelIndices = new Set<number>();
                        const canPlaceLabel = (index: number) => {
                            const x = getX(index);
                            for (const existingIndex of visibleLabelIndices) {
                                if (Math.abs(x - getX(existingIndex)) < minLabelGapPx) {
                                    return false;
                                }
                            }
                            return true;
                        };

                        const forcePlaceLabel = (index: number) => {
                            const x = getX(index);
                            Array.from(visibleLabelIndices).forEach(existingIndex => {
                                if (Math.abs(x - getX(existingIndex)) < minLabelGapPx) {
                                    visibleLabelIndices.delete(existingIndex);
                                }
                            });
                            visibleLabelIndices.add(index);
                        };

                        const priorityIndices = [todayIndex, 0, bucketedData.length - 1].filter(
                            (idx, pos, arr): idx is number => idx >= 0 && arr.indexOf(idx) === pos
                        );

                        priorityIndices.forEach(index => {
                            if (index === todayIndex) {
                                forcePlaceLabel(index);
                                return;
                            }
                            if (canPlaceLabel(index)) {
                                visibleLabelIndices.add(index);
                            }
                        });

                        candidateLabelIndices.forEach(index => {
                            if (!visibleLabelIndices.has(index) && canPlaceLabel(index)) {
                                visibleLabelIndices.add(index);
                            }
                        });

                        const roundedPath = (x: number, y: number, w: number, h: number, rt: number, rb: number) => {
                            const right = x + w;
                            const bottom = y + h;
                            const rTop = Math.min(rt, w / 2, h / 2);
                            const rBottom = Math.min(rb, w / 2, h / 2);
                            return [
                                `M ${x} ${y + rTop}`,
                                `Q ${x} ${y} ${x + rTop} ${y}`,
                                `L ${right - rTop} ${y}`,
                                `Q ${right} ${y} ${right} ${y + rTop}`,
                                `L ${right} ${bottom - rBottom}`,
                                `Q ${right} ${bottom} ${right - rBottom} ${bottom}`,
                                `L ${x + rBottom} ${bottom}`,
                                `Q ${x} ${bottom} ${x} ${bottom - rBottom}`,
                                'Z'
                            ].join(' ');
                        };
                        return (
                            <>
                                <rect
                                    x={padding.left}
                                    y={padding.top}
                                    width={plotWidth}
                                    height={chartHeight - padding.top - padding.bottom}
                                    rx={16}
                                    ry={16}
                                    fill="var(--reviews-chart-panel)"
                                    stroke="none"
                                />

                                <g clipPath={`url(#${ids.clip})`}>
                                    {showDailyLoadLine && (
                                        <>
                                            <line
                                                x1={padding.left}
                                                y1={getYCount(dailyLoadValue)}
                                                x2={vWidth - padding.right}
                                                y2={getYCount(dailyLoadValue)}
                                                stroke="var(--chart-strong)"
                                                strokeWidth="1.2"
                                                strokeDasharray="4 3"
                                                opacity="0.9"
                                            />
                                        </>
                                    )}
                                    {/* Bars */}
                                    {bucketedData.map((d, i) => {
                                        const barWidth = Math.max(14, Math.min(40, step * 0.96));
                                        const x = getX(i);
                                        const height = Math.max(0, chartHeight - padding.bottom - getYCount(d.count));
                                        const bgY = padding.top + 6;
                                        const bgHeight = plotHeight - 6;
                                        const isPeak = d.count === maxCount;
                                        const reviewLabel = `${d.count} review${d.count === 1 ? '' : 's'}`;
                                        const tooltip = d.startDay === d.endDay
                                            ? reviewLabel
                                            : `${reviewLabel} (${d.label})`;
                                        return (
                                            <g key={i}>
                                                <path
                                                    d={roundedPath(x - barWidth / 2, bgY, barWidth, bgHeight, 14, 10)}
                                                    fill="var(--border)"
                                                    opacity="0.22"
                                                />
                                                <path
                                                    d={roundedPath(x - barWidth / 2, getYCount(d.count), barWidth, height, 14, 6)}
                                                    fill="color-mix(in srgb, var(--accent) 72%, var(--background) 28%)"
                                                    opacity={d.endDay < 0 ? 0.45 : isPeak ? 0.95 : 0.6}
                                                    data-tooltip={tooltip}
                                                    data-tooltip-trigger="tap"
                                                    style={{ cursor: 'pointer' }}
                                                />
                                            </g>
                                        );
                                    })}
                                </g>

                                {/* X-axis */}
                                <line x1={padding.left} y1={chartHeight - padding.bottom} x2={vWidth - padding.right} y2={chartHeight - padding.bottom} stroke="var(--border)" opacity="0.5" />

                                {/* Left Y-axis (Daily Count) */}
                                <line x1={padding.left} y1={padding.top} x2={padding.left} y2={chartHeight - padding.bottom} stroke="var(--border)" opacity="0.35" />
                                {yTicks.map((val, i) => {
                                    const y = getYCount(val);
                                    return (
                                        <g key={i}>
                                            <text x={padding.left - 8} y={y + 4} textAnchor="end" fontSize="9" fill="var(--foreground-secondary)">{val}</text>
                                        </g>
                                    );
                                })}

                                {/* X-axis labels */}
                                {bucketedData.map((d, i) => {
                                    if (!visibleLabelIndices.has(i)) return null;
                                    const x = getX(i);
                                    const y = chartHeight - padding.bottom + 18;
                                    return (
                                        <text
                                            key={`label-${i}`}
                                            x={x}
                                            y={y}
                                            textAnchor="middle"
                                            fontSize={xAxisFontSize}
                                            fill="var(--foreground-secondary)"
                                            transform={rotateLabels ? `rotate(-22 ${x} ${y})` : undefined}
                                        >
                                            {d.label}
                                        </text>
                                    );
                                })}
                            </>
                        );
                    })()}
                </svg>
            )}
        </div>
    );
}

function HalfDonutChart({ total, segments, displayTotal }: { total: number; segments: StatSegment[]; displayTotal?: number | string }) {
    const radius = 65;
    const strokeWidth = 12;
    const viewBoxWidth = 160;
    const viewBoxHeight = 100; // Increased height to prevent clipping
    const centerX = viewBoxWidth / 2;
    const centerY = 85;

    // Filter segments with count > 0 to avoid rendering artifacts
    const activeSegments = segments.filter(s => s.count > 0);

    // Calculate gaps: we want a small gap between segments
    // Total degrees available is 180.
    const gapDegrees = activeSegments.length > 1 ? 4 : 0;
    const totalGapDegrees = gapDegrees * (activeSegments.length - 1);
    const availableDegrees = 180 - totalGapDegrees;

    let currentStartAngle = 180; // Start from left

    return (
        <div style={{ position: 'relative', width: '180px', height: '100px', display: 'flex', justifyContent: 'center' }}>
            <svg viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`} style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                {/* Background track */}
                <path
                    d={`M ${centerX - radius} ${centerY} A ${radius} ${radius} 0 0 1 ${centerX + radius} ${centerY}`}
                    fill="none"
                    stroke="var(--border)"
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    opacity="0.1"
                />

                {activeSegments.map((segment, idx) => {
                    const segmentDegrees = (segment.count / total) * availableDegrees;

                    const startAngle = currentStartAngle;
                    const endAngle = startAngle - segmentDegrees;

                    // Update currentStartAngle for next segment, including gap
                    currentStartAngle = endAngle - gapDegrees;

                    // Convert angles to polar coordinates for SVG path
                    // SVG angles: 0 is right, 90 is bottom, 180 is left, 270 is top
                    // But we want 180 to be left, 90 to be top, 0 to be right
                    const startRad = (startAngle * Math.PI) / 180;
                    const endRad = (endAngle * Math.PI) / 180;

                    const x1 = centerX + radius * Math.cos(startRad);
                    const y1 = centerY - radius * Math.sin(startRad);
                    const x2 = centerX + radius * Math.cos(endRad);
                    const y2 = centerY - radius * Math.sin(endRad);

                    // Large arc flag is 0 because no segment can be > 180 degrees
                    // Sweep flag is 1 because we are moving clockwise from left to right (in our custom coord system)
                    return (
                        <path
                            key={idx}
                            d={`M ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2}`}
                            fill="none"
                            stroke={segment.color}
                            strokeOpacity={segment.opacity ?? 1}
                            strokeWidth={strokeWidth}
                            strokeLinecap="round"
                            style={{ transition: 'all 0.5s ease' }}
                        />
                    );
                })}
            </svg>
            <div style={{
                position: 'absolute',
                bottom: '12px',
                left: '0',
                right: '0',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                pointerEvents: 'none'
            }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--foreground-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Total</span>
                <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--foreground)', lineHeight: 1.1 }}>
                    {(displayTotal ?? total).toLocaleString()}
                </span>
            </div>
        </div>
    );
}

function ProgressBarSection({ title, icon, stats, headerSuffix, minHeight, className }: { title: string; icon: React.ReactNode; stats: ProgressBarStats; headerSuffix?: React.ReactNode; minHeight?: number; className?: string }) {
    return (
        <div className={`card modern-card${className ? ` ${className}` : ''}`} style={{ width: '100%', background: 'var(--background-secondary)', minHeight }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div className="header-icon-badge">{icon}</div>
                    <h2 style={{ fontSize: '0.95rem', margin: 0, fontWeight: 700 }}>{title}</h2>
                </div>
                {headerSuffix}
            </div>

            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: '2rem', flexWrap: 'wrap', flex: 1 }}>
                <HalfDonutChart total={stats.total} segments={stats.segments} displayTotal={stats.displayTotal} />

                <div style={{ flex: '1', minWidth: '200px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1rem', justifyContent: 'flex-start' }}>
                        {stats.segments.map((s, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '2px 0' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: s.color, opacity: s.opacity ?? 1, flexShrink: 0 }} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--foreground-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                        {s.label}
                                    </span>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--foreground)' }}>
                                        {s.displayValue ?? s.count}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
