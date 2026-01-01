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
import { BarChart3, Layers, Hash, Info, ChevronRight, Map as MapIcon, MapPinned, Repeat, RotateCcw } from 'lucide-react';
import DocumentationModal from '@/components/DocumentationModal';
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
        let skipped = 0;
        let notCreated = 0;
        let notLearned = 0;
        let learnedNew = 0;
        let learnedMedium = 0;
        let learnedStrong = 0;
        let learnedMastered = 0;

        targetSurahs.forEach(s => {
            if (skippedSurahs.has(s.id)) {
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
            </div>

            <DocumentationModal
                title="Understanding Your Stats"
                cards={[
                    {
                        title: "Maturity Levels",
                        icon: BarChart3,
                        description: "Understand the strength of your memory through maturity levels.",
                        items: [
                            "Levels are based on the interval (days) between reviews.",
                            "Longer intervals indicate stronger, more durable memory.",
                            "The legend under each chart shows the specific day ranges."
                        ]
                    },
                    {
                        title: "Filtering",
                        icon: Hash,
                        description: "Stats are updated based on your active learning path.",
                        items: [
                            "Surah and Verse stats follow your Active Part selection.",
                            "Part Mindmaps always show global progress (all 4 parts).",
                            "Skipped elements are excluded to show true coverage."
                        ]
                    }
                ]}
            />
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
