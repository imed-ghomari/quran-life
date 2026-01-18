'use client';

import { useEffect, useMemo, useState } from 'react';
import { SURAHS } from '@/lib/quranData';
import {
    getSettings,
    getSurahLearnedStatus,
    getMindMaps,
    getPartMindMaps,
    getMemoryNodes,
    getMutashabihatDecisions,
    getPortionPointer,
    getListeningCycles,
    getNodeStability,
    getNodeDueDate,
} from '@/lib/storage';
import { Map as MapIcon, MapPinned, Repeat, RotateCcw, CalendarClock, BookCopy } from 'lucide-react';
import { getListeningProgress } from '@/lib/storage';
import { getAllMutashabihatRefs, absoluteToSurahAyah } from '@/lib/mutashabihat';

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
    const [version, setVersion] = useState(0);
    const [verseChunkMode, setVerseChunkMode] = useState<'chunks' | 'surahs'>('chunks');
    const settings = useMemo(() => {
        version; // satisfy linter
        return getSettings();
    }, [version]);
    const activePart = settings.activePart;

    useEffect(() => {
        const interval = setInterval(() => setVersion(v => v + 1), 2000);
        return () => clearInterval(interval);
    }, []);

    const mindmaps = useMemo(() => {
        version; // satisfy linter
        return getMindMaps();
    }, [version]);
    const partMindmaps = useMemo(() => {
        version; // satisfy linter
        return getPartMindMaps();
    }, [version]);
    const memoryNodes = useMemo(() => {
        version; // satisfy linter
        return getMemoryNodes();
    }, [version]);
    const skippedSurahs = useMemo(() => new Set(settings.skippedSurahs || []), [settings.skippedSurahs]);

    // 1. Part Mindmaps Data (Always Global)
    const partMindmapStats = useMemo(() => {
        let notCreated = 0;
        let notLearned = 0;
        let learnedNew = 0;
        let learnedMedium = 0;
        let learnedStrong = 0;
        let learnedMastered = 0;

        [1, 2, 3, 4].forEach(p => {
            const pmm = partMindmaps[p];
            if (pmm) {
                if (pmm.isComplete) {
                    const node = memoryNodes.find(n => n.id === `part-mindmap-${p}`);
                    const maturity = node ? getMaturity(getNodeStability(node.scheduler)) : 'new';
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
    }, [partMindmaps, memoryNodes]);

    // 2. Surah Mindmaps Data
    const surahMindmapStats = useMemo(() => {
        const targetSurahs = SURAHS.filter(s => activePart === 5 || s.part === activePart);
        const settings = getSettings();
        const learnedVerses = settings.learnedVerses || {};
        let skipped = 0;
        let notCreated = 0;
        let notLearned = 0;
        let learnedNew = 0;
        let learnedMedium = 0;
        let learnedStrong = 0;
        let learnedMastered = 0;

        targetSurahs.forEach(s => {
            const isLearned = learnedVerses[s.id.toString()];
            if (skippedSurahs.has(s.id) || !isLearned) {
                skipped++;
            } else {
                const mm = mindmaps[s.id];
                if (mm) {
                    if (mm.isComplete) {
                        const node = memoryNodes.find(n => n.id === `mindmap-${s.id}`);
                        const maturity = node ? getMaturity(getNodeStability(node.scheduler)) : 'new';
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
    }, [activePart, mindmaps, memoryNodes, skippedSurahs]);

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
                    const { learned, total } = getSurahLearnedStatus(s.id);
                    if (learned === 0) {
                        notLearned++;
                    } else {
                        // If it has any learned verses, we look at the maturity of its nodes
                        const nodes = memoryNodes.filter(n => n.type === 'verse' && n.surahId === s.id);
                        if (nodes.length === 0) {
                            learnedNew++; // Learned but nodes not synced yet
                        } else {
                            const avgInterval = nodes.reduce((acc, n) => acc + getNodeStability(n.scheduler), 0) / nodes.length;
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
                    const learnedVerses = settings.learnedVerses[s.id] || [];

                    // Logic to calculate chunks directly from learnedVerses to avoid sync issues
                    const sortedVerses = [...learnedVerses].sort((a, b) => a - b);
                    let learnedChunksCount = 0;
                    const chunkMaturities: MaturityBucket[] = [];

                    if (sortedVerses.length > 0) {
                        let segmentStart = sortedVerses[0];
                        let segmentEnd = segmentStart;

                        for (let i = 1; i <= sortedVerses.length; i++) {
                            const isContiguous = i < sortedVerses.length && sortedVerses[i] === segmentEnd + 1;
                            const segmentSize = segmentEnd - segmentStart + 1;

                            if (!isContiguous || segmentSize >= 5 || i === sortedVerses.length) {
                                const nodeId = `verse-${s.id}-${segmentStart}-${segmentEnd}`;
                                const node = memoryNodes.find(n => n.id === nodeId);
                                chunkMaturities.push(node ? getMaturity(getNodeStability(node.scheduler)) : 'new');
                                learnedChunksCount++;

                                if (i < sortedVerses.length) {
                                    segmentStart = sortedVerses[i];
                                    segmentEnd = segmentStart;
                                }
                            } else {
                                segmentEnd = sortedVerses[i];
                            }
                        }
                    }

                    const unlearnedChunks = Math.max(0, totalChunks - learnedChunksCount);
                    notLearned += unlearnedChunks;

                    chunkMaturities.forEach(maturity => {
                        if (maturity === 'mastered') learnedMastered++;
                        else if (maturity === 'strong') learnedStrong++;
                        else if (maturity === 'medium') learnedMedium++;
                        else learnedNew++;
                    });
                }
            }
        });

        return {
            total: skipped + notLearned + learnedNew + learnedMedium + learnedStrong + learnedMastered,
            segments: [
                { label: 'Skipped', count: skipped, color: 'var(--chart-skipped)', description: verseChunkMode === 'surahs' ? 'Skipped surahs' : 'Verses in skipped surahs' },
                { label: 'Not Learned', count: notLearned, color: 'var(--chart-not-learned)', description: verseChunkMode === 'surahs' ? 'Surahs not yet started' : 'Verses not yet learned' },
                { label: 'New (< 14d)', count: learnedNew, color: 'var(--chart-new)', description: 'Newly learned (< 14 days)' },
                { label: 'Medium (14-30d)', count: learnedMedium, color: 'var(--chart-medium)', description: 'Intermediate maturity (14-30 days)' },
                { label: 'Strong (30-90d)', count: learnedStrong, color: 'var(--chart-strong)', description: 'Strong memory (30-90 days)' },
                { label: 'Mastered (90d+)', count: learnedMastered, color: 'var(--chart-mastered)', description: 'Long-term mastery (90+ days)' },
            ].filter(s => s.count > 0)
        };
    }, [activePart, memoryNodes, skippedSurahs, verseChunkMode, settings.learnedVerses]);

    // 4. Daily Portion Data
    const dailyPortionStats = useMemo(() => {
        const progress = getListeningProgress(activePart);
        const portionPointer = getPortionPointer(activePart);
        const cycles = getListeningCycles(activePart);

        const surahsInPart = SURAHS.filter(s => activePart === 5 || s.part === activePart).filter(s => !skippedSurahs.has(s.id));
        const totalVersesInPart = surahsInPart.reduce((acc, s) => acc + s.verseCount, 0);

        const learnedVerseCount = Math.min(totalVersesInPart, portionPointer + (progress.currentVerseIndex || 0));

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
    }, [activePart, skippedSurahs]);

    // 5. Mutashabihat Coverage Data
    const mutashabihatDecisions = useMemo(() => {
        version;
        return getMutashabihatDecisions();
    }, [version]);

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
            const decisions = Object.entries(mutashabihatDecisions).filter(([key]) => key.startsWith(`${abs}-`) || key === abs.toString());

            if (decisions.length > 0) {
                const anySolvedMindmap = decisions.some(([_, d]) => d.status === 'solved_mindmap');
                const anySolvedNote = decisions.some(([_, d]) => d.status === 'solved_note');
                const anyIgnored = decisions.some(([_, d]) => d.status === 'ignored');

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
        const nodes = memoryNodes.filter(n => !n.surahId || targetSurahs.has(n.surahId));

        const dayCounts: Record<number, number> = {};
        let totalReviews = 0;
        let backlogCount = 0;
        let dueTomorrow = 0;

        nodes.forEach(node => {
            const dueDate = new Date(getNodeDueDate(node.scheduler));
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

        const average = totalReviews / (maxDay - minDay + 1);

        return {
            data,
            total: totalReviews,
            average: average.toFixed(1),
            dueTomorrow,
            dailyLoad: (totalReviews / (maxDay - minDay + 1)).toFixed(1), // Simplified for now
            minDay,
            maxDay
        };
    }, [activePart, memoryNodes, showBacklog, timeRange]);

    return (
        <div className="statistics-container" style={{ width: '100%', paddingBottom: '2rem', maxWidth: '100%' }}>
            <div className="stats-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', width: '100%' }}>
                <div>
                    <h1 className="hide-mobile" style={{ marginBottom: '0.25rem' }}>Progress Statistics</h1>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div className="hide-mobile" style={{ padding: '0.5rem 0.75rem', background: 'var(--verse-bg)', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent)' }}>
                        {activePart === 5 ? 'All Quran' : `Part ${activePart}`}
                    </div>
                </div>
            </div>

            <div className="stats-grid-main">
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
                        <div style={{ display: 'flex', background: 'var(--background)', borderRadius: '8px', padding: '3px', border: '1px solid var(--border)' }}>
                            <button
                                onClick={() => setVerseChunkMode('chunks')}
                                style={{
                                    padding: '4px 10px',
                                    fontSize: '0.65rem',
                                    fontWeight: 700,
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: verseChunkMode === 'chunks' ? 'var(--accent)' : 'transparent',
                                    color: verseChunkMode === 'chunks' ? 'white' : 'var(--foreground-secondary)',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    boxShadow: verseChunkMode === 'chunks' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none'
                                }}
                            >
                                CHUNKS
                            </button>
                            <button
                                onClick={() => setVerseChunkMode('surahs')}
                                style={{
                                    padding: '4px 10px',
                                    fontSize: '0.65rem',
                                    fontWeight: 700,
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: verseChunkMode === 'surahs' ? 'var(--accent)' : 'transparent',
                                    color: verseChunkMode === 'surahs' ? 'white' : 'var(--foreground-secondary)',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    boxShadow: verseChunkMode === 'surahs' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none'
                                }}
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
        <div className="card modern-card" style={{ width: '100%', padding: '1.25rem', border: '1px solid var(--border)', borderRadius: '16px', background: 'var(--background-secondary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ color: 'var(--accent)', background: 'var(--verse-bg)', padding: '6px', borderRadius: '8px', display: 'flex' }}>
                        <CalendarClock size={20} />
                    </div>
                    <h2 style={{ fontSize: '1rem', margin: 0, fontWeight: 700 }}>Future Reviews</h2>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', fontSize: '0.75rem', padding: '4px 8px', background: 'var(--background)', borderRadius: '6px', border: '1px solid var(--border)', color: 'var(--foreground)' }}>
                        <input type="checkbox" checked={showBacklog} onChange={e => setShowBacklog(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
                        Backlog
                    </label>
                    <select
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
                        <div style={{ fontSize: '0.7rem', color: 'var(--foreground-secondary)', marginBottom: '0.25rem' }}>Total Reviews</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--foreground)' }}>{stats.total}</div>
                    </div>
                    <div style={{ padding: '0.75rem', borderRadius: '10px', background: 'var(--background)', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--foreground-secondary)', marginBottom: '0.25rem' }}>Average / Day</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--foreground)' }}>{stats.average}</div>
                    </div>
                    <div style={{ padding: '0.75rem', borderRadius: '10px', background: 'var(--background)', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--foreground-secondary)', marginBottom: '0.25rem' }}>Due Tomorrow</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent)' }}>{stats.dueTomorrow}</div>
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

    const chartHeight = 180;
    const padding = { top: 20, right: 10, bottom: 30, left: 35 };

    const maxCount = Math.max(...data.map(d => d.count), 1);
    const maxCumulative = Math.max(...data.map(d => d.cumulative), 1);

    // Use a ref to get the container width for responsiveness
    return (
        <div style={{ width: '100%', height: chartHeight, position: 'relative' }}>
            <svg width="100%" height={chartHeight} style={{ overflow: 'visible' }} preserveAspectRatio="none">
                {/* We use percentage-based coordinates or just let SVG handle scaling if possible, 
                    but for precise mapping we need the actual width. 
                    Actually, we can use viewBox for responsiveness. */}
                <svg viewBox={`0 0 500 ${chartHeight}`} width="100%" height="100%" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
                    {(() => {
                        const vWidth = 500;
                        const getX = (day: number) => padding.left + ((day - minDay) / (maxDay - minDay)) * (vWidth - padding.left - padding.right);
                        const getYCount = (count: number) => chartHeight - padding.bottom - (count / maxCount) * (chartHeight - padding.top - padding.bottom);
                        const getYCumulative = (cumulative: number) => chartHeight - padding.bottom - (cumulative / maxCumulative) * (chartHeight - padding.top - padding.bottom);

                        let areaPath = `M ${getX(data[0].day)} ${chartHeight - padding.bottom}`;
                        data.forEach(d => {
                            areaPath += ` L ${getX(d.day)} ${getYCumulative(d.cumulative)}`;
                        });
                        areaPath += ` L ${getX(data[data.length - 1].day)} ${chartHeight - padding.bottom} Z`;

                        return (
                            <>
                                {/* Cumulative Area */}
                                <path d={areaPath} fill="var(--chart-skipped)" opacity="0.1" />
                                <path d={areaPath.replace(' Z', '')} fill="none" stroke="var(--foreground-secondary)" strokeWidth="1" opacity="0.2" />

                                {/* Bars */}
                                {data.map((d, i) => {
                                    const barWidth = Math.max(1, (vWidth - padding.left - padding.right) / (maxDay - minDay + 1) - 0.5);
                                    return (
                                        <rect
                                            key={i}
                                            x={getX(d.day) - barWidth / 2}
                                            y={getYCount(d.count)}
                                            width={barWidth}
                                            height={Math.max(0, chartHeight - padding.bottom - getYCount(d.count))}
                                            fill="var(--chart-mastered)"
                                            opacity={d.day < 0 ? 0.8 : 0.6}
                                        />
                                    );
                                })}

                                {/* X-axis */}
                                <line x1={padding.left} y1={chartHeight - padding.bottom} x2={vWidth - padding.right} y2={chartHeight - padding.bottom} stroke="var(--border)" />

                                {/* Left Y-axis (Daily Count) */}
                                <line x1={padding.left} y1={padding.top} x2={padding.left} y2={chartHeight - padding.bottom} stroke="var(--border)" />
                                {[0, 0.5, 1].map((p, i) => {
                                    const val = p * maxCount;
                                    const y = getYCount(val);
                                    return (
                                        <g key={i}>
                                            <text x={padding.left - 8} y={y + 4} textAnchor="end" fontSize="9" fill="var(--foreground-secondary)">{Math.round(val)}</text>
                                        </g>
                                    );
                                })}
                            </>
                        );
                    })()}
                </svg>
            </svg>
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

function ProgressBarSection({ title, icon, stats, headerSuffix }: { title: string; icon: React.ReactNode; stats: { total: number; segments: StatSegment[] }; headerSuffix?: React.ReactNode }) {
    return (
        <div className="card modern-card" style={{ width: '100%', padding: '1.25rem', border: '1px solid var(--border)', borderRadius: '16px', background: 'var(--background-secondary)', display: 'flex', flexDirection: 'column' }}>
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
