'use client';

import { useEffect, useMemo, useState } from 'react';
import { SURAHS } from '@/lib/quranData';
import {
    getSettings,
    getSurahLearnedStatus,
    getMindMaps,
    getPartMindMaps,
    getMemoryNodes,
    getDueNodes,
} from '@/lib/storage';
import { BarChart3, CheckCircle, Gauge, Layers, Timer, SkipForward, Activity } from 'lucide-react';
import HelpSection from '@/components/HelpSection';

type MaturityBucket = 'reset' | 'medium' | 'strong' | 'mastered';

function bucket(interval: number): MaturityBucket {
    if (interval >= 90) return 'mastered';
    if (interval >= 30) return 'strong';
    if (interval >= 14) return 'medium';
    return 'reset';
}

export default function StatisticsPage() {
    const [version, setVersion] = useState(0);
    const settings = getSettings();
    const learnedCounts = useMemo(() => {
        return SURAHS.map(s => {
            const { learned, total } = getSurahLearnedStatus(s.id);
            return { surahId: s.id, learned, total };
        });
    }, [version]);

    const mindmaps = getMindMaps();
    const partMindmaps = getPartMindMaps();
    const memoryNodes = getMemoryNodes();
    const dueNodes = getDueNodes(settings.activePart);

    useEffect(() => {
        const interval = setInterval(() => setVersion(v => v + 1), 1500);
        return () => clearInterval(interval);
    }, []);

    const totalLearned = learnedCounts.reduce((sum, s) => sum + s.learned, 0);
    const totalVerses = SURAHS.reduce((sum, s) => sum + s.verseCount, 0);
    const learnedPercent = Math.round((totalLearned / totalVerses) * 100);

    const surahMaturity = useMemo(() => {
        const buckets: Record<MaturityBucket, number> = { reset: 0, medium: 0, strong: 0, mastered: 0 };
        memoryNodes
            .filter(n => n.type === 'verse' || n.type === 'mindmap')
            .forEach(n => {
                buckets[bucket(n.scheduler.interval)] += 1;
            });
        return buckets;
    }, [version]);

    const totalMindmaps = SURAHS.length;
    const completedMindmaps = Object.values(mindmaps).filter(m => m.isComplete && m.imageUrl).length;

    const totalPartMaps = 4;
    const completedPartMaps = Object.values(partMindmaps).filter(m => m.isComplete && m.imageUrl).length;

    const skippedCount = settings.skippedSurahs?.length || 0;
    const overdue = dueNodes.length;
    const totalNodes = memoryNodes.length;

    const activePartSurahs = SURAHS.filter(s => settings.activePart === 5 || s.part === settings.activePart);
    const activePartLearned = activePartSurahs.reduce((acc, s) => acc + getSurahLearnedStatus(s.id).learned, 0);
    const activePartTotal = activePartSurahs.reduce((acc, s) => acc + s.verseCount, 0);

    const progressCards = [
        { icon: <CheckCircle size={22} />, label: 'Learned verses', value: `${totalLearned}/${totalVerses}`, sub: `${learnedPercent}% of Quran` },
        { icon: <Gauge size={22} />, label: settings.activePart === 5 ? 'Global Progress' : 'Active Part Progress', value: `${activePartLearned}/${activePartTotal}`, sub: settings.activePart === 5 ? 'All Quran' : `Part ${settings.activePart}` },
        { icon: <Timer size={22} />, label: 'Due Reviews', value: `${overdue}`, sub: `${totalNodes} total scheduled` },
        { icon: <Layers size={22} />, label: 'Surah Mindmaps', value: `${completedMindmaps}/${totalMindmaps}`, sub: 'Completed mindmaps' },
        { icon: <BarChart3 size={22} />, label: 'Part Mindmaps', value: `${completedPartMaps}/${totalPartMaps}`, sub: 'Complete overview per part' },
        { icon: <SkipForward size={22} />, label: 'Skipped Surahs', value: `${skippedCount}`, sub: 'Excluded from cycle' },
    ];

    return (
        <div className="content-wrapper">
            <h1>Statistics</h1>
            <p style={{ color: 'var(--foreground-secondary)', marginBottom: '1rem' }}>
                Focused on your current progress: learned verses, maturity levels, and mindmap readiness.
            </p>
            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.9rem' }}>
                {progressCards.map(card => {
                    // Extract progress percentage from value string like "10/100"
                    let pct = 0;
                    if (card.value.includes('/')) {
                        const [curr, tot] = card.value.split('/').map(n => parseInt(n.replace(/,/g, ''), 10));
                        pct = Math.min(100, Math.round((curr / tot) * 100));
                    } else if (card.label === 'Overdue Reviews') {
                        pct = 0; // No bar for raw counts like overdue
                    }

                    return (
                        <StatCard
                            key={card.label}
                            icon={card.icon}
                            label={card.label}
                            value={card.value}
                            sub={card.sub}
                            progress={pct > 0 ? pct : undefined}
                        />
                    );
                })}
            </div>

            <div className="card stat-card-highlight">
                <div className="section-title" style={{ color: 'var(--accent)' }}><Gauge size={18} /> <span>Maturity Distribution</span></div>
                <p style={{ color: 'var(--foreground-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                    Visual division of verses across all maturity levels.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem', padding: '1rem 0' }}>
                    {/* Unified Donut Chart */}
                    <div style={{ position: 'relative', width: '200px', height: '200px' }}>
                        <svg width="200" height="200" viewBox="0 0 200 200">
                            {(() => {
                                const buckets = ['reset', 'medium', 'strong', 'mastered'] as const;
                                const bucketColors: Record<string, string> = {
                                    reset: '#ef4444',
                                    medium: '#f59e0b',
                                    strong: '#0ea5e9',
                                    mastered: '#22c55e'
                                };
                                const total = Object.values(surahMaturity).reduce((a, b) => a + b, 0) || 1;
                                let currentOffset = 0;
                                const radius = 80;
                                const circumference = 2 * Math.PI * radius;

                                return buckets.map(key => {
                                    const value = surahMaturity[key];
                                    const percentage = (value / total) * 100;
                                    const strokeDashoffset = circumference * (1 - percentage / 100);
                                    const rotation = (currentOffset / total) * 360 - 90;
                                    currentOffset += value;

                                    if (value === 0) return null;

                                    return (
                                        <circle
                                            key={key}
                                            cx="100"
                                            cy="100"
                                            r={radius}
                                            fill="none"
                                            stroke={bucketColors[key]}
                                            strokeWidth="20"
                                            strokeDasharray={`${circumference}`}
                                            strokeDashoffset={strokeDashoffset}
                                            strokeLinecap="butt"
                                            transform={`rotate(${rotation} 100 100)`}
                                            style={{ transition: 'all 0.5s ease' }}
                                        />
                                    );
                                });
                            })()}
                        </svg>
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: '1.5rem', fontWeight: 800 }}>{Object.values(surahMaturity).reduce((a, b) => a + b, 0)}</span>
                            <span style={{ fontSize: '0.7rem', color: 'var(--foreground-secondary)' }}>Total Nodes</span>
                        </div>
                    </div>

                    {/* Legend */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', width: '100%' }}>
                        {(['reset', 'medium', 'strong', 'mastered'] as const).map(bucketKey => {
                            const bucketColors: Record<string, string> = {
                                reset: 'var(--danger)',
                                medium: 'var(--warning)',
                                strong: 'var(--accent)',
                                mastered: 'var(--success)'
                            };
                            const total = Object.values(surahMaturity).reduce((a, b) => a + b, 0) || 1;
                            const value = surahMaturity[bucketKey];
                            const pct = Math.round((value / total) * 100);
                            return (
                                <div key={bucketKey} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: 'var(--background-secondary)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                    <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: bucketColors[bucketKey] }} />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--foreground-secondary)' }}>{bucketKey}</div>
                                        <div style={{ fontSize: '1rem', fontWeight: 800 }}>{value}</div>
                                        <div style={{ fontSize: '0.7rem', color: bucketColors[bucketKey], fontWeight: 600 }}>{pct}%</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <HelpSection
                cards={[
                    {
                        title: "Maturity Distribution",
                        icon: BarChart3,
                        description: "Understand the strength of your memorization through the distribution of maturity levels.",
                        items: [
                            "Levels are calculated based on the interval (days) between successive reviews.",
                            "Reset: 0-14 days | Medium: 14-30 days",
                            "Strong: 30-90 days | Mastered: 90+ days"
                        ]
                    },
                    {
                        title: "Progress Tracking",
                        icon: Activity,
                        description: "A high-level view of your daily consistency and overall Quran coverage.",
                        items: [
                            "Learned Verses: The total percentage of the Quran you have marked as learned.",
                            "Active Part: Your progress specifically within the currently selected part.",
                            "Mindmap Readiness: Ensures you have visual anchors for every Surah."
                        ]
                    }
                ]}
            />
        </div>
    );
}

function StatCard({ icon, label, value, sub, progress }: { icon: React.ReactNode; label: string; value: string; sub?: string; progress?: number }) {
    return (
        <div className="stat-card" style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--foreground-secondary)' }}>
                {icon}
                <span style={{ fontWeight: 600 }}>{label}</span>
            </div>
            <div className="stat-value" style={{ fontSize: '1.3rem' }}>{value}</div>
            {progress !== undefined && (
                <div style={{ width: '100%', height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden', margin: '2px 0' }}>
                    <div style={{ width: `${progress}%`, height: '100%', background: 'var(--accent)' }} />
                </div>
            )}
            {sub && <div className="stat-label" style={{ fontSize: '0.7rem' }}>{sub}</div>}
        </div>
    );
}
