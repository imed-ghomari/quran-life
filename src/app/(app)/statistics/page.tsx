'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { SURAHS } from '@/lib/quranData';
import {
    useInstantSettings,
    useInstantMindMaps,
    useInstantNodes,
    useInstantListeningProgress,
    useInstantMutashabihat,
    useInstantReviewLogs,
} from '@/hooks/useInstantData';
import { getAllMutashabihatRefs, absoluteToSurahAyah } from '@/lib/mutashabihat';
import { getNodeStability, getNodeDueDate, MemoryNode } from '@/lib/types';

import { Map as MapIcon, MapPinned, Repeat, RotateCcw, CalendarClock, BookCopy } from 'lucide-react';

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
    color: string;
    opacity?: number;
    description: string;
}

export default function StatisticsPage() {
    const { settings, isLoading: settingsLoading } = useInstantSettings();
    const { mindmaps, partMindMaps, isLoading: mindmapsLoading } = useInstantMindMaps();
    const { nodes: memoryNodes, isLoading: nodesLoading } = useInstantNodes();
    const { progress: listeningProgress, isLoading: progressLoading } = useInstantListeningProgress();
    const { decisions: mutashabihatDecisions, isLoading: mutashabihatLoading } = useInstantMutashabihat();
    const { logs: reviewLogs, isLoading: reviewLogsLoading } = useInstantReviewLogs();

    const [verseChunkMode, setVerseChunkMode] = useState<'chunks' | 'surahs'>('chunks');

    const isLoading = settingsLoading || mindmapsLoading || nodesLoading || progressLoading || mutashabihatLoading || reviewLogsLoading;

    const activePart = settings?.activePart || 1;
    const skippedSurahs = useMemo(() => new Set(settings?.skippedSurahs || []), [settings?.skippedSurahs]);

    // 1. Part Mindmaps Data (Always Global)
    const partMindmapStats = useMemo(() => {
        let notCreated = 0;
        let notLearned = 0;
        let learnedNew = 0;
        let learnedMedium = 0;
        let learnedStrong = 0;
        let learnedMastered = 0;

        [1, 2, 3, 4].forEach(p => {
            const pmm = partMindMaps.find(m => m.partId === p);
            if (pmm) {
                if (pmm.isComplete) {
                    const node = memoryNodes.find(n => n.id === `part-mindmap-${p}`);
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
            total: 4,
            segments: [
                { label: 'Not Created', count: notCreated, color: 'var(--chart-not-created)', description: 'Part mindmap not yet created' },
                { label: 'Not Learned', count: notLearned, color: 'var(--chart-not-learned)', description: 'Part mindmap not yet complete' },
                { label: 'New (< 14d)', count: learnedNew, color: 'var(--chart-new)', description: 'Newly learned (< 14 days)' },
                { label: 'Medium (14-30d)', count: learnedMedium, color: 'var(--chart-medium)', description: 'Intermediate maturity (14-30 days)' },
                { label: 'Strong (30-90d)', count: learnedStrong, color: 'var(--chart-strong)', description: 'Strong memory (30-90 days)' },
                { label: 'Mastered (90d+)', count: learnedMastered, color: 'var(--chart-mastered)', description: 'Long-term mastery (90+ days)' },
            ].filter(s => s.count > 0)
        };
    }, [partMindMaps, memoryNodes]);

    // 2. Surah Mindmaps Data
    const surahMindmapStats = useMemo(() => {
        const targetSurahs = SURAHS.filter(s => activePart === 5 || s.part === activePart);
        const learnedVerses = settings?.learnedVerses || {};
        let skipped = 0;
        let notCreated = 0;
        let notLearned = 0;
        let learnedNew = 0;
        let learnedMedium = 0;
        let learnedStrong = 0;
        let learnedMastered = 0;

        targetSurahs.forEach(s => {
            const isLearned = learnedVerses[s.id.toString()];
            if (skippedSurahs.has(s.id)) {
                skipped++;
            } else {
                const mm = mindmaps.find(m => m.surahId === s.id);
                if (mm) {
                    if (mm.isComplete) {
                        const node = memoryNodes.find(n => n.id === `mindmap-${s.id}`);
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
            total: targetSurahs.length,
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
    }, [activePart, settings?.learnedVerses, mindmaps, memoryNodes, skippedSurahs]);

    // 3. Verse Chunks Data
    const verseChunkStats = useMemo(() => {
        const targetSurahs = SURAHS.filter(s => activePart === 5 || s.part === activePart);
        let skipped = 0;
        let notLearned = 0;
        let learnedNew = 0;
        let learnedMedium = 0;
        let learnedStrong = 0;
        let learnedMastered = 0;

        targetSurahs.forEach(s => {
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
                        const nodes = memoryNodes.filter(n => n.type === 'verse_segment' && n.surahId === s.id);
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
                                const nodes = memoryNodes.filter(n =>
                                    n.type === 'verse_segment' &&
                                    n.surahId === s.id &&
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

        const totalSegments = targetSurahs.reduce((acc, s) => {
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
    }, [activePart, settings?.learnedVerses, memoryNodes, skippedSurahs, verseChunkMode]);

    // 4. Daily Portion Data
    const dailyPortionStats = useMemo(() => {
        const partProgress = listeningProgress.find(p => p.partId === activePart);
        const progress = partProgress?.lastVerseIndex || 0;
        const cycles = partProgress?.cycles || 0;

        const surahsInPart = SURAHS.filter(s => activePart === 5 || s.part === activePart).filter(s => !skippedSurahs.has(s.id));

        const learnedVerseCount = progress;

        // Calculate surah counts
        let completedSurahs = 0;
        let currentVerseTotal = 0;
        surahsInPart.forEach(s => {
            if (currentVerseTotal + s.verseCount <= learnedVerseCount) {
                completedSurahs++;
            }
            currentVerseTotal += s.verseCount;
        });
        const remainingSurahs = Math.max(0, surahsInPart.length - completedSurahs);

        return {
            total: surahsInPart.length,
            completions: cycles,
            segments: [
                { label: 'Remaining', count: remainingSurahs, color: 'var(--chart-skipped)', description: 'Surahs remaining in current cycle' },
                { label: 'Completed', count: completedSurahs, color: 'var(--chart-mastered)', description: 'Surahs completed in current cycle' },
            ]
        };
    }, [activePart, skippedSurahs, listeningProgress]);

    // 5. Mutashabihat Coverage Data
    const mutashabihatStats = useMemo(() => {
        const allRefs = getAllMutashabihatRefs();
        const targetRefs = allRefs.filter(abs => {
            const { surahId } = absoluteToSurahAyah(abs);
            const surah = SURAHS.find(s => s.id === surahId);
            return activePart === 5 || surah?.part === activePart;
        });

        const total = targetRefs.length;
        if (total === 0) return { total: 0, segments: [] };

        let solvedMindmap = 0;
        let solvedNote = 0;
        let ignored = 0;
        let pending = 0;

        targetRefs.forEach(abs => {
            // Find decisions for this absolute ayah
            const verseDecisions = mutashabihatDecisions.filter(d => d.phraseId.startsWith(`${abs}-`) || d.phraseId === abs.toString());

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
    }, [activePart, mutashabihatDecisions]);

    // 6. Future Due Data
    const [timeRange, setTimeRange] = useState<'1m' | '3m' | '1y' | 'all'>('1m');
    const [showBacklog, setShowBacklog] = useState(true);

    const futureDueStats = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const targetSurahs = new Set(SURAHS.filter(s => activePart === 5 || s.part === activePart).map(s => s.id));
        const hasKanbanState = !!settings?.kanbanColumns && Object.keys(settings.kanbanColumns).length > 0;
        const completeIds = new Set<string>(hasKanbanState ? (settings?.kanbanColumns?.complete || []) : []);

        const hasAnchorForNode = (node: MemoryNode) => {
            if (node.type !== 'verse_segment' || !node.surahId) return true;
            const mm = mindmaps.find(m => m.surahId === node.surahId);
            const anchors = mm?.anchors || [];
            if (anchors.length === 0) return false;
            return anchors.some(a => a.startVerse === node.startVerse && a.endVerse === node.endVerse);
        };

        const nodes = memoryNodes.filter(node => {
            if (node.type !== 'verse_segment' && node.type !== 'mindmap' && node.type !== 'part_mindmap') return false;

            if (node.type === 'part_mindmap') {
                if (activePart !== 5 && node.partId !== activePart) return false;
                if (hasKanbanState && node.partId && !completeIds.has(`part-${node.partId}`)) return false;
                return true;
            }

            if (!node.surahId) return false;
            if (!targetSurahs.has(node.surahId)) return false;
            if (skippedSurahs.has(node.surahId)) return false;

            if (node.type === 'mindmap') {
                if (hasKanbanState && !completeIds.has(`surah-${node.surahId}`)) return false;
                return true;
            }

            return hasAnchorForNode(node);
        });

        const dayCounts: Record<number, number> = {};
        let totalReviews = 0;
        let totalFutureReviews = 0;
        let backlogCount = 0;
        let dueTomorrow = 0;

        const nodeById = new Map(memoryNodes.map(n => [n.id, n]));

        nodes.forEach(node => {
            const dueStr = getNodeDueDate(node);
            if (!dueStr) return;
            const dueDate = new Date(dueStr);
            dueDate.setHours(0, 0, 0, 0);

            const diffTime = dueDate.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays < 0) {
                backlogCount++;
                if (showBacklog) {
                    dayCounts[diffDays] = (dayCounts[diffDays] || 0) + 1;
                    totalReviews++;
                }
            } else {
                dayCounts[diffDays] = (dayCounts[diffDays] || 0) + 1;
                totalReviews++;
                totalFutureReviews++;
                if (diffDays === 1) dueTomorrow++;
            }
        });

        const rangeDays = timeRange === '1m' ? 31 : timeRange === '3m' ? 90 : timeRange === '1y' ? 365 : 0;

        // Determine x-axis range
        let minDay = showBacklog ? Math.min(...Object.keys(dayCounts).map(Number), -15) : 0;
        let maxDay = rangeDays || Math.max(...Object.keys(dayCounts).map(Number), 30);

        // If 'all', we might want to cap it or just show everything
        if (timeRange === 'all') {
            maxDay = Math.max(...Object.keys(dayCounts).map(Number), 30);
        }

        const data: { day: number; count: number; cumulative: number }[] = [];
        let cumulative = 0;

        // Calculate cumulative starting from the earliest day in dayCounts if backlog is shown
        const sortedDays = Object.keys(dayCounts).map(Number).sort((a, b) => a - b);
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
            if (activePart === 5) return true;
            const node = nodeById.get(log.nodeId);
            if (!node) return false;
            if (!node.surahId) return true;
            return targetSurahs.has(node.surahId);
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
            if (activePart === 5) return true;
            const node = nodeById.get(log.nodeId);
            if (!node) return false;
            if (!node.surahId) return true;
            return targetSurahs.has(node.surahId);
        }).length;

        return {
            data,
            total: totalReviews,
            average: average.toFixed(1),
            dueTomorrow,
            dailyLoad: dailyLoad.toFixed(1),
            reviewsToday,
            minDay,
            maxDay
        };
    }, [activePart, memoryNodes, mindmaps, reviewLogs, settings?.kanbanColumns, showBacklog, skippedSurahs, timeRange]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
            </div>
        );
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

           <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-4 items-start">
                    <ProgressBarSection
                        title="Part Mindmaps"
                        icon={<MapIcon size={20} />}
                        stats={partMindmapStats}
                    />

                    <ProgressBarSection
                        title="Surah Mindmaps"
                        icon={<MapPinned size={20} />}
                        stats={surahMindmapStats}
                    />

                    <ProgressBarSection
                        title="Verse Chunks"
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

                    <ProgressBarSection
                        title="Similar Verses Coverage"
                        icon={<BookCopy size={20} />}
                        stats={mutashabihatStats}
                    />

                    <ProgressBarSection
                        title="Daily Portion"
                        icon={<Repeat size={20} />}
                        stats={dailyPortionStats}
                        headerSuffix={
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--foreground-secondary)', fontSize: '0.8rem', fontWeight: 600 }}>
                                <Repeat size={14} />
                                <span>{dailyPortionStats.completions} cycles</span>
                            </div>
                        }
                    />

                    <FutureDueSection
                        stats={futureDueStats}
                        showBacklog={showBacklog}
                        setShowBacklog={setShowBacklog}
                        timeRange={timeRange}
                        setTimeRange={setTimeRange}
                    />
                </div>
            </div>

        </div>
    );
}

function FutureDueSection({ stats, showBacklog, setShowBacklog, timeRange, setTimeRange }: {
    stats: any;
    showBacklog: boolean;
    setShowBacklog: (v: boolean) => void;
    timeRange: '1m' | '3m' | '1y' | 'all';
    setTimeRange: (v: '1m' | '3m' | '1y' | 'all') => void;
}) {
    return (
        <div className="card modern-card" style={{ width: '100%', background: 'var(--background-secondary)' }}>
            <div className="future-due-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <div className="future-due-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ color: 'var(--accent)', background: 'var(--verse-bg)', padding: '6px', borderRadius: '8px', display: 'flex' }}>
                        <CalendarClock size={20} />
                    </div>
                    <h2 style={{ fontSize: '0.95rem', margin: 0, fontWeight: 700 }}>Reviews</h2>
                </div>
                <div className="future-due-actions" style={{ display: 'flex', gap: '0.5rem' }}>
                    <label className="future-due-toggle" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', fontSize: '0.75rem', padding: '4px 8px', background: 'var(--background)', borderRadius: '6px', border: '1px solid var(--border)', color: 'var(--foreground)' }}>
                        <input type="checkbox" checked={showBacklog} onChange={e => setShowBacklog(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
                        Include Overdue
                    </label>
                    <select
                        className="future-due-range"
                        value={timeRange}
                        onChange={(e) => setTimeRange(e.target.value as any)}
                        style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '0.75rem', background: 'var(--background)', outline: 'none', color: 'var(--foreground)' }}
                    >
                        <option value="1m">1 Month</option>
                        <option value="3m">3 Months</option>
                        <option value="1y">1 Year</option>
                        <option value="all">All Time</option>
                    </select>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <FutureDueChart data={stats.data} minDay={stats.minDay} maxDay={stats.maxDay} />

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                    <div style={{ padding: '0.75rem', borderRadius: '10px', background: 'var(--background)', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--foreground-secondary)', marginBottom: '0.25rem' }}>Average / Day</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--foreground)' }}>{stats.average}</div>
                    </div>
                    <div style={{ padding: '0.75rem', borderRadius: '10px', background: 'var(--background)', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--foreground-secondary)', marginBottom: '0.25rem' }}>Daily Load</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--foreground)' }}>{stats.dailyLoad}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function FutureDueChart({ data, minDay, maxDay }: { data: any[]; minDay: number; maxDay: number }) {
    if (data.length === 0) return <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--foreground-secondary)' }}>No data available</div>;

    const chartHeight = 210;
    const padding = { top: 12, right: 28, bottom: 38, left: 36 };
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [chartWidth, setChartWidth] = useState(0);

    const nonZeroData = data.filter(d => d.count > 0);
    if (nonZeroData.length === 0) {
        return <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--foreground-secondary)' }}>No data available</div>;
    }

    const maxCount = Math.max(...nonZeroData.map(d => d.count), 1);
    const niceStep = (val: number) => {
        if (val <= 10) return 10;
        return Math.ceil(val / 50) * 50;
    };
    const maxNice = niceStep(maxCount);
    const gradientSeed = useId();
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
                        const span = Math.max(1, nonZeroData.length);
                        const groupWidth = plotWidth * 0.72;
                        const groupStart = padding.left + (plotWidth - groupWidth) / 2;
                        const step = groupWidth / span;
                        const getX = (index: number) => groupStart + (index + 0.5) * step;
                        const getYCount = (count: number) => chartHeight - padding.bottom - (count / maxNice) * plotHeight;
                        const labelStep = Math.max(1, Math.ceil(nonZeroData.length / 6));
                        const formatDayLabel = (day: number) => {
                            if (day === 0) return 'Today';
                            if (day === 1) return '1d';
                            if (day === -1) return '1d ago';
                            if (day < 0) return `${Math.abs(day)}d ago`;
                            return `${day}d`;
                        };

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
                                    {/* Bars */}
                                    {nonZeroData.map((d, i) => {
                                        const barWidth = Math.max(14, Math.min(40, step * 0.96));
                                        const x = getX(i);
                                        const height = Math.max(0, chartHeight - padding.bottom - getYCount(d.count));
                                        const bgY = padding.top + 6;
                                        const bgHeight = plotHeight - 6;
                                        const isPeak = d.count === maxCount;
                                        return (
                                            <g key={i}>
                                                <path
                                                    d={roundedPath(x - barWidth / 2, bgY, barWidth, bgHeight, 14, 10)}
                                                    fill="var(--border)"
                                                    opacity="0.22"
                                                />
                                                <path
                                                    d={roundedPath(x - barWidth / 2, getYCount(d.count), barWidth, height, 14, 6)}
                                                    fill={isPeak ? 'var(--accent)' : 'var(--chart-medium)'}
                                                    opacity={d.day < 0 ? 0.45 : isPeak ? 0.95 : 0.6}
                                                    style={{ cursor: 'pointer' }}
                                                />
                                                <title>{`${d.count} review${d.count === 1 ? '' : 's'} (${formatDayLabel(d.day)})`}</title>
                                            </g>
                                        );
                                    })}
                                </g>

                                {/* X-axis */}
                                <line x1={padding.left} y1={chartHeight - padding.bottom} x2={vWidth - padding.right} y2={chartHeight - padding.bottom} stroke="var(--border)" opacity="0.5" />

                                {/* Left Y-axis (Daily Count) */}
                                <line x1={padding.left} y1={padding.top} x2={padding.left} y2={chartHeight - padding.bottom} stroke="var(--border)" opacity="0.35" />
                                {[0, 0.5, 1].map((p, i) => {
                                    const val = p * maxNice;
                                    const y = getYCount(val);
                                    return (
                                        <g key={i}>
                                            <text x={padding.left - 8} y={y + 4} textAnchor="end" fontSize="9" fill="var(--foreground-secondary)">{Math.round(val)}</text>
                                        </g>
                                    );
                                })}

                                {/* X-axis labels */}
                                {nonZeroData.map((d, i) => {
                                    if (i % labelStep !== 0 && i !== nonZeroData.length - 1) return null;
                                    const x = getX(i);
                                    return (
                                        <text
                                            key={`label-${i}`}
                                            x={x}
                                            y={chartHeight - padding.bottom + 18}
                                            textAnchor="middle"
                                            fontSize="10"
                                            fill="var(--foreground-secondary)"
                                        >
                                            {formatDayLabel(d.day)}
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

function HalfDonutChart({ total, segments }: { total: number; segments: StatSegment[] }) {
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
                <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--foreground)', lineHeight: 1.1 }}>{total.toLocaleString()}</span>
            </div>
        </div>
    );
}

function ProgressBarSection({ title, icon, stats, headerSuffix, minHeight, className }: { title: string; icon: React.ReactNode; stats: { total: number; segments: StatSegment[] }; headerSuffix?: React.ReactNode; minHeight?: number; className?: string }) {
    return (
        <div className={`card modern-card${className ? ` ${className}` : ''}`} style={{ width: '100%', background: 'var(--background-secondary)', minHeight }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ color: 'var(--accent)', background: 'var(--verse-bg)', padding: '6px', borderRadius: '8px', display: 'flex' }}>{icon}</div>
                    <h2 style={{ fontSize: '0.95rem', margin: 0, fontWeight: 700 }}>{title}</h2>
                </div>
                {headerSuffix}
            </div>

            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: '2rem', flexWrap: 'wrap', flex: 1 }}>
                <HalfDonutChart total={stats.total} segments={stats.segments} />

                <div style={{ flex: '1', minWidth: '200px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1rem', justifyContent: 'flex-start' }}>
                        {stats.segments.map((s, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '2px 0' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: s.color, opacity: s.opacity ?? 1, flexShrink: 0 }} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--foreground-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                        {s.label}
                                    </span>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--foreground)' }}>{s.count}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
