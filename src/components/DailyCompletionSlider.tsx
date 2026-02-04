'use client';

import { useMemo } from 'react';
import { SURAHS } from '@/lib/quranData';
import { QuranPart } from '@/lib/types';

const SURAH_WORD_COUNTS: Record<number, number> = { "1": 29, "2": 6117, "3": 3481, "4": 3747, "5": 2804, "6": 3050, "7": 3320, "8": 1234, "9": 2498, "10": 1833, "11": 1917, "12": 1777, "13": 854, "14": 830, "15": 655, "16": 1844, "17": 1556, "18": 1579, "19": 961, "20": 1335, "21": 1169, "22": 1274, "23": 1050, "24": 1316, "25": 893, "26": 1318, "27": 1151, "28": 1430, "29": 976, "30": 817, "31": 546, "32": 372, "33": 1287, "34": 883, "35": 775, "36": 725, "37": 860, "38": 733, "39": 1172, "40": 1219, "41": 794, "42": 860, "43": 830, "44": 346, "45": 488, "46": 643, "47": 539, "48": 560, "49": 347, "50": 373, "51": 360, "52": 312, "53": 360, "54": 342, "55": 351, "56": 379, "57": 574, "58": 472, "59": 445, "60": 348, "61": 221, "62": 175, "63": 180, "64": 241, "65": 287, "66": 249, "67": 333, "68": 300, "69": 258, "70": 217, "71": 226, "72": 285, "73": 199, "74": 255, "75": 164, "76": 243, "77": 181, "78": 173, "79": 179, "80": 133, "81": 104, "82": 80, "83": 169, "84": 107, "85": 109, "86": 61, "87": 72, "88": 92, "89": 137, "90": 82, "91": 54, "92": 71, "93": 40, "94": 27, "95": 34, "96": 72, "97": 30, "98": 94, "99": 36, "100": 40, "101": 36, "102": 28, "103": 14, "104": 33, "105": 23, "106": 17, "107": 25, "108": 10, "109": 26, "110": 19, "111": 23, "112": 15, "113": 23, "114": 20 };

interface DailyCompletionSliderProps {
    days: number;
    onChange: (days: number) => void;
    activePart: QuranPart;
}

export default function DailyCompletionSlider({ days, onChange, activePart }: DailyCompletionSliderProps) {
    const stats = useMemo(() => {
        const surahsInPart = SURAHS.filter(s => activePart === 5 || s.part === activePart);
        const totalVerses = surahsInPart.reduce((acc, s) => acc + s.verseCount, 0);
        const totalWords = surahsInPart.reduce((acc, s) => acc + (SURAH_WORD_COUNTS[s.id] || 0), 0);
        const wordsPerDay = Math.ceil(totalWords / days);

        return {
            versesPerDay: Math.ceil(totalVerses / days),
            wordsPerDay: wordsPerDay,
            minutesPerDay: Math.ceil(wordsPerDay / 70) // ~70 wpm reading speed
        };
    }, [activePart, days]);

    return (
        <div className="daily-completion-container" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ position: 'relative', width: '100%', padding: '10px 0' }}>
                <input
                    suppressHydrationWarning={true}
                    type="range"
                    min="7"
                    max="120"
                    value={days}
                    onChange={(e) => onChange(parseInt(e.target.value))}
                    className="custom-range-slider"
                    style={{
                        width: '100%',
                        WebkitAppearance: 'none',
                        height: '10px',
                        background: 'var(--border)',
                        borderRadius: '20px',
                        outline: 'none',
                        margin: 0,
                        cursor: 'pointer'
                    }}
                />
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: '12px',
                    color: 'var(--foreground-secondary)',
                    fontSize: '0.85rem',
                    fontWeight: 600
                }}>
                    <span>7 days</span>
                    <span>120 days</span>
                </div>
            </div>

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '0.75rem',
                width: '100%'
            }}>
                <div style={{
                    background: 'var(--verse-bg)',
                    padding: '1rem',
                    borderRadius: '16px',
                    textAlign: 'center',
                    border: '1px solid var(--border)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
                }}>
                    <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent)', display: 'block', lineHeight: 1 }}>{stats.versesPerDay}</span>
                    <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--foreground-secondary)', marginTop: '4px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Verses</span>
                </div>
                <div style={{
                    background: 'var(--verse-bg)',
                    padding: '1rem',
                    borderRadius: '16px',
                    textAlign: 'center',
                    border: '1px solid var(--border)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
                }}>
                    <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent)', display: 'block', lineHeight: 1 }}>{stats.wordsPerDay}</span>
                    <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--foreground-secondary)', marginTop: '4px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Words</span>
                </div>
                <div style={{
                    background: 'var(--verse-bg)',
                    padding: '1rem',
                    borderRadius: '16px',
                    textAlign: 'center',
                    border: '1px solid var(--border)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
                }}>
                    <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent)', display: 'block', lineHeight: 1 }}>{stats.minutesPerDay}</span>
                    <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--foreground-secondary)', marginTop: '4px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Mins</span>
                </div>
            </div>

            <div style={{
                background: 'var(--background)',
                padding: '0.75rem',
                borderRadius: '16px',
                textAlign: 'center',
                border: '1px solid var(--border)',
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px'
            }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground-secondary)' }}>Full Cycle Duration</span>
                <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--foreground)' }}>{days} <span style={{ fontSize: '0.8rem', color: 'var(--foreground-secondary)' }}>days</span></span>
            </div>

            <style jsx>{`
                .custom-range-slider::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    appearance: none;
                    width: 18px;
                    height: 18px;
                    background: var(--accent);
                    border: 3px solid white;
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
                    width: 18px;
                    height: 18px;
                    background: var(--accent);
                    border: 3px solid white;
                    border-radius: 50%;
                    cursor: pointer;
                    box-shadow: 0 4px 10px rgba(0,0,0,0.15);
                }
            `}</style>
        </div>
    );
}
