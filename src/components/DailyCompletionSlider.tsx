'use client';

import { useMemo } from 'react';
import { useDailyPortionTiming } from '@/hooks/useDailyPortionTiming';
import {
    clampDailyTargetMinutes,
    DAILY_TARGET_MINUTES_MAX,
    DAILY_TARGET_MINUTES_MIN,
    DailyPortionTimingMode,
    estimateEligibleCycleDays,
    getEligibleDailyPortionSurahs,
    getSurahWordCount,
} from '@/lib/dailyPortionUtils';
import { MemoryNode, QuranPart } from '@/lib/types';

interface DailyCompletionSliderProps {
    minutes: number;
    onChange: (minutes: number) => void;
    activePart: QuranPart;
    skippedSurahs?: number[];
    nodes?: MemoryNode[];
    mode?: DailyPortionTimingMode;
}

export default function DailyCompletionSlider({
    minutes,
    onChange,
    activePart,
    skippedSurahs = [],
    nodes = [],
    mode = 'audio',
}: DailyCompletionSliderProps) {
    const { averageSurahDurations } = useDailyPortionTiming();
    const clampedMinutes = clampDailyTargetMinutes(minutes);

    const stats = useMemo(() => {
        const eligibleSurahs = getEligibleDailyPortionSurahs(activePart, skippedSurahs, nodes);
        const totalVerses = eligibleSurahs.reduce((total, surah) => total + surah.verseCount, 0);
        const totalWords = eligibleSurahs.reduce((total, surah) => total + getSurahWordCount(surah.id), 0);
        const cycleDays = estimateEligibleCycleDays(
            eligibleSurahs,
            clampedMinutes,
            mode,
            averageSurahDurations,
        );

        return {
            cycleDays,
            totalVerses,
            totalWords,
            versesPerDay: cycleDays > 0 ? Math.ceil(totalVerses / cycleDays) : 0,
            wordsPerDay: cycleDays > 0 ? Math.ceil(totalWords / cycleDays) : 0,
        };
    }, [activePart, averageSurahDurations, clampedMinutes, mode, nodes, skippedSurahs]);

    return (
        <div className="daily-completion-container" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ position: 'relative', width: '100%', padding: '10px 0' }}>
                <input
                    suppressHydrationWarning={true}
                    type="range"
                    min={String(DAILY_TARGET_MINUTES_MIN)}
                    max={String(DAILY_TARGET_MINUTES_MAX)}
                    value={clampedMinutes}
                    onChange={(e) => onChange(parseInt(e.target.value, 10))}
                    className="custom-range-slider"
                    style={{
                        width: '100%',
                        WebkitAppearance: 'none',
                        height: '10px',
                        background: 'var(--border)',
                        borderRadius: '20px',
                        outline: 'none',
                        margin: 0,
                        cursor: 'pointer',
                    }}
                />
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: '12px',
                    color: 'var(--foreground-secondary)',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                }}>
                    <span>{DAILY_TARGET_MINUTES_MIN} min</span>
                    <span>{DAILY_TARGET_MINUTES_MAX} min</span>
                </div>
            </div>

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '0.75rem',
                width: '100%',
            }}>
                {[
                    { label: 'Minutes', value: clampedMinutes },
                    { label: 'Verses', value: stats.versesPerDay },
                    { label: 'Words', value: stats.wordsPerDay },
                    { label: 'Cycle Days', value: stats.cycleDays || '0' },
                ].map((item) => (
                    <div
                        key={item.label}
                        style={{
                            background: 'var(--verse-bg)',
                            padding: '1rem',
                            borderRadius: '16px',
                            textAlign: 'center',
                            border: '1px solid var(--border)',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                        }}
                    >
                        <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent)', display: 'block', lineHeight: 1 }}>
                            {item.value}
                        </span>
                        <span style={{
                            fontSize: '0.65rem',
                            fontWeight: 600,
                            color: 'var(--foreground-secondary)',
                            marginTop: '4px',
                            display: 'block',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                        }}>
                            {item.label}
                        </span>
                    </div>
                ))}
            </div>


            <style jsx>{`
                .custom-range-slider::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    appearance: none;
                    width: 26px;
                    height: 26px;
                    background: var(--accent);
                    border: 4px solid white;
                    border-radius: 50%;
                    cursor: pointer;
                    box-shadow: 0 4px 10px rgba(0,0,0,0.15);
                    transition: transform 0.1s ease;
                }
                .custom-range-slider::-webkit-slider-thumb:hover {
                    transform: scale(1.1);
                }
                .custom-range-slider::-webkit-slider-thumb:active {
                    transform: scale(0.95);
                }
                .custom-range-slider::-moz-range-thumb {
                    width: 26px;
                    height: 26px;
                    background: var(--accent);
                    border: 4px solid white;
                    border-radius: 50%;
                    cursor: pointer;
                    box-shadow: 0 4px 10px rgba(0,0,0,0.15);
                }
                @media (max-width: 640px) {
                    .daily-completion-container > div:nth-child(2) {
                        grid-template-columns: repeat(2, 1fr) !important;
                    }
                }
            `}</style>
        </div>
    );
}
