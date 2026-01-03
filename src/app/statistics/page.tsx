'use client';

import { useEffect, useMemo, useState } from 'react';
import { SURAHS } from '@/lib/quranData';
import {
    getSettings,
    getSurahLearnedStatus,
    getMindMaps,
    getPartMindMaps,
    getMemoryNodes,
    getPortionPointer,
    getListeningCycles,
} from '@/lib/storage';
import { BarChart3, Layers, Hash, ChevronRight, Map as MapIcon, MapPinned, Repeat, RotateCcw, CalendarClock } from 'lucide-react';
import { getListeningStats, getListeningProgress } from '@/lib/storage';

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
    const settings = getSettings();
    const activePart = settings.activePart;

    useEffect(() => {
        const interval = setInterval(() => setVersion(v => v + 1), 2000);
        return () => clearInterval(interval);
    }, []);

    const mindmaps = getMindMaps();
    const partMindmaps = getPartMindMaps();
    const memoryNodes = getMemoryNodes();
    const skippedSurahs = new Set(settings.skippedSurahs || []);

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
                    const maturity = node ? getMaturity(node.scheduler.interval) : 'new';
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

        return {
            total: 4,
            segments: [
                { label: 'Not Created', count: notCreated, color: 'var(--chart-skipped)', opacity: 0.5, description: 'Part mindmap not yet created' },
                { label: 'Not Learned', count: notLearned, color: 'var(--chart-not-learned)', description: 'Part mindmap not yet complete' },
                { label: 'New (< 14d)', count: learnedNew, color: 'var(--chart-new)', description: 'Newly learned (< 14 days)' },
                { label: 'Medium (14-30d)', count: learnedMedium, color: 'var(--chart-medium)', description: 'Intermediate maturity (14-30 days)' },
                { label: 'Strong (30-90d)', count: learnedStrong, color: 'var(--chart-strong)', description: 'Strong memory (30-90 days)' },
                { label: 'Mastered (90d+)', count: learnedMastered, color: 'var(--chart-mastered)', description: 'Long-term mastery (90+ days)' },
            ].filter(s => s.count > 0)
        };
    }, [version, partMindmaps, memoryNodes]);

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
                        const maturity = node ? getMaturity(node.scheduler.interval) : 'new';
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
                { label: 'Skipped', count: skipped, color: 'var(--chart-skipped)', opacity: 0.5, description: 'Surahs excluded from cycle' },
                { label: 'Not Created', count: notCreated, color: 'var(--chart-skipped)', opacity: 0.5, description: 'Mindmap not created' },
                { label: 'Not Learned', count: notLearned, color: 'var(--chart-not-learned)', description: 'Mindmap incomplete' },
                { label: 'New (< 14d)', count: learnedNew, color: 'var(--chart-new)', description: 'Newly learned (< 14 days)' },
                { label: 'Medium (14-30d)', count: learnedMedium, color: 'var(--chart-medium)', description: 'Intermediate maturity (14-30 days)' },
                { label: 'Strong (30-90d)', count: learnedStrong, color: 'var(--chart-strong)', description: 'Strong memory (30-90 days)' },
                { label: 'Mastered (90d+)', count: learnedMastered, color: 'var(--chart-mastered)', description: 'Long-term mastery (90+ days)' },
            ].filter(s => s.count > 0)
        };
    }, [version, activePart, mindmaps, memoryNodes, skippedSurahs]);

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
                            const avgInterval = nodes.reduce((acc, n) => acc + n.scheduler.interval, 0) / nodes.length;
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
                                chunkMaturities.push(node ? getMaturity(node.scheduler.interval) : 'new');
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
    }, [version, activePart, memoryNodes, skippedSurahs, verseChunkMode, settings.learnedVerses]);

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
                { label: 'Completed', count: completedSurahs, color: 'var(--chart-mastered)', description: 'Surahs completed in current cycle' },
                { label: 'Remaining', count: remainingSurahs, color: 'var(--chart-skipped)', opacity: 0.5, description: 'Surahs remaining in current cycle' },
            ]
        };
    }, [version, activePart, skippedSurahs]);

    // 5. Future Due Data
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
            const dueDate = new Date(node.scheduler.dueDate);
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
    }, [version, activePart, memoryNodes, showBacklog, timeRange]);

    return (
        <div className="content-wrapper" style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '2rem', paddingLeft: '1rem', paddingRight: '1rem' }}>
            <div className="stats-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <div>
                    <h1 className="hide-mobile" style={{ marginBottom: '0.25rem' }}>Progress Statistics</h1>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ padding: '0.5rem 0.75rem', background: 'var(--verse-bg)', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent)' }}>
                        {activePart === 5 ? 'All Quran' : `Part ${activePart}`}
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '0 0.5rem' }}>
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
                        <div style={{ display: 'flex', background: 'var(--verse-bg)', borderRadius: '8px', padding: '2px' }}>
                            <button
                                onClick={() => setVerseChunkMode('chunks')}
                                style={{
                                    padding: '4px 8px',
                                    fontSize: '0.65rem',
                                    fontWeight: 700,
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: verseChunkMode === 'chunks' ? 'var(--accent)' : 'transparent',
                                    color: verseChunkMode === 'chunks' ? 'white' : 'var(--foreground-secondary)',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                CHUNKS
                            </button>
                            <button
                                onClick={() => setVerseChunkMode('surahs')}
                                style={{
                                    padding: '4px 8px',
                                    fontSize: '0.65rem',
                                    fontWeight: 700,
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: verseChunkMode === 'surahs' ? 'var(--accent)' : 'transparent',
                                    color: verseChunkMode === 'surahs' ? 'white' : 'var(--foreground-secondary)',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                SURAHS
                            </button>
                        </div>
                    }
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
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', fontSize: '0.75rem', padding: '4px 8px', background: 'var(--background)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                        <input type="checkbox" checked={showBacklog} onChange={e => setShowBacklog(e.target.checked)} />
                        Backlog
                    </label>
                    <select
                        value={timeRange}
                        onChange={(e) => setTimeRange(e.target.value as any)}
                        style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '0.75rem', background: 'var(--background)', outline: 'none' }}
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

    const chartHeight = 200;
    const chartWidth = 700;
    const padding = { top: 20, right: 40, bottom: 30, left: 40 };

    const maxCount = Math.max(...data.map(d => d.count), 1);
    const maxCumulative = Math.max(...data.map(d => d.cumulative), 1);

    const getX = (day: number) => padding.left + ((day - minDay) / (maxDay - minDay)) * (chartWidth - padding.left - padding.right);
    const getYCount = (count: number) => chartHeight - padding.bottom - (count / maxCount) * (chartHeight - padding.top - padding.bottom);
    const getYCumulative = (cumulative: number) => chartHeight - padding.bottom - (cumulative / maxCumulative) * (chartHeight - padding.top - padding.bottom);

    // Area path for cumulative
    let areaPath = `M ${getX(data[0].day)} ${chartHeight - padding.bottom}`;
    data.forEach(d => {
        areaPath += ` L ${getX(d.day)} ${getYCumulative(d.cumulative)}`;
    });
    areaPath += ` L ${getX(data[data.length - 1].day)} ${chartHeight - padding.bottom} Z`;

    // Grid lines and axes
    const yTicksCount = 4;
    const yTicksCumulative = 4;
    const xTicksCount = 10;

    return (
        <div style={{ overflowX: 'auto', width: '100%' }}>
            <svg width={chartWidth} height={chartHeight} style={{ overflow: 'visible' }}>
                {/* Cumulative Area */}
                <path d={areaPath} fill="var(--chart-skipped)" opacity="0.1" />
                <path d={areaPath.replace(' Z', '')} fill="none" stroke="var(--foreground-secondary)" strokeWidth="1" opacity="0.2" />

                {/* Bars */}
                {data.map((d, i) => {
                    const barWidth = Math.max(2, (chartWidth - padding.left - padding.right) / (maxDay - minDay + 1) - 1);
                    return (
                        <rect
                            key={i}
                            x={getX(d.day) - barWidth / 2}
                            y={getYCount(d.count)}
                            width={barWidth}
                            height={chartHeight - padding.bottom - getYCount(d.count)}
                            fill="var(--chart-mastered)"
                            opacity={d.day < 0 ? 0.8 : 0.6}
                        />
                    );
                })}

                {/* X-axis */}
                <line x1={padding.left} y1={chartHeight - padding.bottom} x2={chartWidth - padding.right} y2={chartHeight - padding.bottom} stroke="var(--border)" />
                {Array.from({ length: xTicksCount + 1 }).map((_, i) => {
                    const day = Math.round(minDay + (i / xTicksCount) * (maxDay - minDay));
                    return (
                        <g key={i}>
                            <line x1={getX(day)} y1={chartHeight - padding.bottom} x2={getX(day)} y2={chartHeight - padding.bottom + 5} stroke="var(--border)" />
                            <text x={getX(day)} y={chartHeight - padding.bottom + 20} textAnchor="middle" fontSize="10" fill="var(--foreground-secondary)">{day}</text>
                        </g>
                    );
                })}

                {/* Left Y-axis (Daily Count) */}
                <line x1={padding.left} y1={padding.top} x2={padding.left} y2={chartHeight - padding.bottom} stroke="var(--border)" />
                {Array.from({ length: yTicksCount + 1 }).map((_, i) => {
                    const val = (i / yTicksCount) * maxCount;
                    const y = getYCount(val);
                    return (
                        <g key={i}>
                            <line x1={padding.left - 5} y1={y} x2={padding.left} y2={y} stroke="var(--border)" />
                            <text x={padding.left - 10} y={y + 4} textAnchor="end" fontSize="10" fill="var(--foreground-secondary)">{val % 1 === 0 ? val : val.toFixed(1)}</text>
                        </g>
                    );
                })}

                {/* Right Y-axis (Cumulative) */}
                <line x1={chartWidth - padding.right} y1={padding.top} x2={chartWidth - padding.right} y2={chartHeight - padding.bottom} stroke="var(--border)" />
                {Array.from({ length: yTicksCumulative + 1 }).map((_, i) => {
                    const val = (i / yTicksCumulative) * maxCumulative;
                    const y = getYCumulative(val);
                    return (
                        <g key={i}>
                            <line x1={chartWidth - padding.right} y1={y} x2={chartWidth - padding.right + 5} y2={y} stroke="var(--border)" />
                            <text x={chartWidth - padding.right + 10} y={y + 4} textAnchor="start" fontSize="10" fill="var(--foreground-secondary)">{Math.round(val)}</text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}

function ProgressBarSection({ title, icon, stats, headerSuffix }: { title: string; icon: React.ReactNode; stats: { total: number; segments: StatSegment[] }; headerSuffix?: React.ReactNode }) {
    return (
        <div className="card modern-card" style={{ width: '100%', padding: '1.25rem', border: '1px solid var(--border)', borderRadius: '16px', background: 'var(--background-secondary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ color: 'var(--accent)', background: 'var(--verse-bg)', padding: '6px', borderRadius: '8px', display: 'flex' }}>{icon}</div>
                    <h2 style={{ fontSize: '1rem', margin: 0, fontWeight: 700 }}>{title}</h2>
                </div>
                {headerSuffix}
            </div>

            <div style={{
                width: '100%',
                height: '32px',
                background: 'var(--border)',
                borderRadius: '12px',
                overflow: 'hidden',
                display: 'flex',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)'
            }}>
                {stats.segments.map((segment, idx) => {
                    const width = (segment.count / stats.total) * 100;
                    return (
                        <div
                            key={idx}
                            title={`${segment.label}: ${segment.count} (${Math.round(width)}%)`}
                            style={{
                                width: `${width}%`,
                                height: '100%',
                                background: segment.color,
                                opacity: segment.opacity || 1,
                                transition: 'width 0.5s ease',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                position: 'relative',
                                cursor: 'help'
                            }}
                        >
                            {width > 8 && (
                                <span style={{
                                    fontSize: '0.7rem',
                                    fontWeight: 800,
                                    color: 'rgba(0,0,0,0.6)',
                                    pointerEvents: 'none'
                                }}>
                                    {segment.count}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Legend with Labels (Numbers moved to chart) */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.5rem' }}>
                {stats.segments.map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: s.color, opacity: s.opacity ?? 1 }} />
                        <span style={{ fontSize: '0.7rem', color: 'var(--foreground-secondary)', fontWeight: 600 }}>
                            {s.label}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
