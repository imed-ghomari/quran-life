'use client';

import { useEffect, useMemo, useState } from 'react';
import { SURAHS } from '@/lib/quranData';
import {
    getSettings,
    getSurahLearnedStatus,
    getMindMaps,
    getPartMindMaps,
    getMemoryNodes,
} from '@/lib/storage';
import { BarChart3, Layers, Hash, Info, ChevronRight } from 'lucide-react';
import DocumentationModal from '@/components/DocumentationModal';

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

    // 1. Surah Mindmaps Data
    const surahMindmapStats = useMemo(() => {
        const targetSurahs = SURAHS.filter(s => activePart === 5 || s.part === activePart);
        let skipped = 0;
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
                if (mm?.isComplete) {
                    const node = memoryNodes.find(n => n.id === `mindmap-${s.id}`);
                    const maturity = node ? getMaturity(node.scheduler.interval) : 'new';
                    if (maturity === 'mastered') learnedMastered++;
                    else if (maturity === 'strong') learnedStrong++;
                    else if (maturity === 'medium') learnedMedium++;
                    else learnedNew++;
                } else {
                    notLearned++;
                }
            }
        });

        return {
            total: targetSurahs.length,
            segments: [
                { label: 'Skipped', count: skipped, color: '#94a3b8', description: 'Surahs excluded from cycle' },
                { label: 'Not Learned', count: notLearned, color: '#ef4444', description: 'Mindmap not yet complete' },
                { label: 'New', count: learnedNew, color: '#22c55e', opacity: 0.25, description: 'Newly learned (< 14 days)' },
                { label: 'Medium', count: learnedMedium, color: '#22c55e', opacity: 0.45, description: 'Intermediate maturity (14-30 days)' },
                { label: 'Strong', count: learnedStrong, color: '#22c55e', opacity: 0.7, description: 'Strong memory (30-90 days)' },
                { label: 'Mastered', count: learnedMastered, color: '#22c55e', opacity: 1, description: 'Long-term mastery (90+ days)' },
            ].filter(s => s.count > 0)
        };
    }, [version, activePart, mindmaps, memoryNodes, skippedSurahs]);

    // 2. Part Mindmaps Data (Always Global)
    const partMindmapStats = useMemo(() => {
        let notLearned = 0;
        let learnedNew = 0;
        let learnedMedium = 0;
        let learnedStrong = 0;
        let learnedMastered = 0;

        [1, 2, 3, 4].forEach(p => {
            const pmm = partMindmaps[p];
            if (pmm?.isComplete) {
                const node = memoryNodes.find(n => n.id === `part-mindmap-${p}`);
                const maturity = node ? getMaturity(node.scheduler.interval) : 'new';
                if (maturity === 'mastered') learnedMastered++;
                else if (maturity === 'strong') learnedStrong++;
                else if (maturity === 'medium') learnedMedium++;
                else learnedNew++;
            } else {
                notLearned++;
            }
        });

        return {
            total: 4,
            segments: [
                { label: 'Not Learned', count: notLearned, color: '#ef4444', description: 'Part mindmap not yet complete' },
                { label: 'New', count: learnedNew, color: '#22c55e', opacity: 0.25, description: 'Newly learned' },
                { label: 'Medium', count: learnedMedium, color: '#22c55e', opacity: 0.45, description: 'Intermediate maturity' },
                { label: 'Strong', count: learnedStrong, color: '#22c55e', opacity: 0.7, description: 'Strong memory' },
                { label: 'Mastered', count: learnedMastered, color: '#22c55e', opacity: 1, description: 'Long-term mastery' },
            ].filter(s => s.count > 0)
        };
    }, [version, partMindmaps, memoryNodes]);

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
            const totalChunks = Math.ceil(s.verseCount / 5);
            if (skippedSurahs.has(s.id)) {
                skipped += totalChunks;
            } else {
                const nodes = memoryNodes.filter(n => n.type === 'verse' && n.surahId === s.id);
                const learnedCount = nodes.length;
                notLearned += Math.max(0, totalChunks - learnedCount);

                nodes.forEach(n => {
                    const maturity = getMaturity(n.scheduler.interval);
                    if (maturity === 'mastered') learnedMastered++;
                    else if (maturity === 'strong') learnedStrong++;
                    else if (maturity === 'medium') learnedMedium++;
                    else learnedNew++;
                });
            }
        });

        return {
            total: skipped + notLearned + learnedNew + learnedMedium + learnedStrong + learnedMastered,
            segments: [
                { label: 'Skipped', count: skipped, color: '#94a3b8', description: 'Verses in skipped surahs' },
                { label: 'Not Learned', count: notLearned, color: '#ef4444', description: 'Verses not yet learned' },
                { label: 'New', count: learnedNew, color: '#22c55e', opacity: 0.25, description: 'Newly learned' },
                { label: 'Medium', count: learnedMedium, color: '#22c55e', opacity: 0.45, description: 'Intermediate maturity' },
                { label: 'Strong', count: learnedStrong, color: '#22c55e', opacity: 0.7, description: 'Strong memory' },
                { label: 'Mastered', count: learnedMastered, color: '#22c55e', opacity: 1, description: 'Long-term mastery' },
            ].filter(s => s.count > 0)
        };
    }, [version, activePart, memoryNodes, skippedSurahs]);

    return (
        <div className="content-wrapper" style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <div>
                    <h1 style={{ marginBottom: '0.25rem' }}>Progress Statistics</h1>
                    <p style={{ color: 'var(--foreground-secondary)', fontSize: '0.9rem' }}>
                        {activePart === 5 ? 'Global Overview' : `Focusing on Part ${activePart}`}
                    </p>
                </div>
                <div style={{ padding: '0.5rem 0.75rem', background: 'var(--verse-bg)', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent)' }}>
                    {activePart === 5 ? 'All Quran' : `Part ${activePart}`}
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                <ProgressBarSection
                    title="Surah Mindmaps"
                    icon={<Layers size={20} />}
                    stats={surahMindmapStats}
                />

                <ProgressBarSection
                    title="Part Mindmaps (Global)"
                    icon={<BarChart3 size={20} />}
                    stats={partMindmapStats}
                />

                <ProgressBarSection
                    title="Verse Chunks"
                    icon={<Hash size={20} />}
                    stats={verseChunkStats}
                />
            </div>

            <div className="card" style={{ marginTop: '2.5rem', background: 'rgba(91, 143, 185, 0.05)', border: '1px dashed var(--accent)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                    <Info size={18} color="var(--accent)" />
                    <h3 style={{ margin: 0 }}>Legend & Maturity Levels</h3>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
                    <LegendItem color="#94a3b8" label="Skipped" sub="Excluded" />
                    <LegendItem color="#ef4444" label="Not Learned" sub="Remaining" />
                    <LegendItem color="#22c55e" opacity={0.25} label="New" sub="< 14 days" />
                    <LegendItem color="#22c55e" opacity={0.45} label="Medium" sub="14-30 days" />
                    <LegendItem color="#22c55e" opacity={0.7} label="Strong" sub="30-90 days" />
                    <LegendItem color="#22c55e" opacity={1} label="Mastered" sub="90+ days" />
                </div>
            </div>

            <DocumentationModal
                title="Understanding Your Stats"
                cards={[
                    {
                        title: "Maturity Distribution",
                        icon: BarChart3,
                        description: "Understand the strength of your memorization through the distribution of maturity levels.",
                        items: [
                            "Levels are calculated based on the interval (days) between successive reviews.",
                            "Recently Learned: < 14 days",
                            "Medium: 14-30 days",
                            "Strong: 30-90 days",
                            "Mastered: 90+ days"
                        ]
                    },
                    {
                        title: "Filtering",
                        icon: Hash,
                        description: "Stats are focused on your current learning path.",
                        items: [
                            "Surah and Verse stats follow your Active Part selection in Settings.",
                            "Part Mindmaps always show global progress (all 4 parts).",
                            "Skipped elements are counted separately to show true coverage."
                        ]
                    }
                ]}
            />
        </div>
    );
}

function ProgressBarSection({ title, icon, stats }: { title: string; icon: React.ReactNode; stats: { total: number; segments: StatSegment[] } }) {
    return (
        <div style={{ width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <div style={{ color: 'var(--accent)' }}>{icon}</div>
                <h2 style={{ fontSize: '1rem', margin: 0, fontWeight: 700 }}>{title}</h2>
                <div style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--foreground-secondary)', fontWeight: 600 }}>
                    {stats.total} total
                </div>
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
                                opacity: segment.opacity ?? 1,
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
                                    color: segment.opacity && segment.opacity < 0.5 ? 'var(--foreground)' : 'white',
                                    fontSize: '0.75rem',
                                    fontWeight: 800,
                                    textShadow: segment.opacity && segment.opacity < 0.5 ? 'none' : '0 1px 2px rgba(0,0,0,0.2)'
                                }}>
                                    {segment.count}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Sub-labels for Mobile Friendly visibility if tooltip is hard */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.5rem' }}>
                {stats.segments.map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: s.color, opacity: s.opacity ?? 1 }} />
                        <span style={{ fontSize: '0.7rem', color: 'var(--foreground-secondary)', fontWeight: 600 }}>
                            {s.label} ({s.count})
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function LegendItem({ color, opacity, label, sub }: { color: string; opacity?: number; label: string; sub: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '24px', height: '12px', borderRadius: '4px', background: color, opacity: opacity ?? 1 }} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>{label}</span>
                <span style={{ fontSize: '0.65rem', color: 'var(--foreground-secondary)' }}>{sub}</span>
            </div>
        </div>
    );
}
