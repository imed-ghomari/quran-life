'use client';

import React from 'react';
import { getReciters, Reciter } from '@/lib/audio';
import { buildAverageSecondsPerWordBySurah } from '@/lib/dailyPortionUtils';

const { useEffect, useMemo, useState } = React;

let averageSurahDurationsCache: Record<number, number> | null = null;
let averageSurahDurationsPromise: Promise<Record<number, number>> | null = null;

export async function loadAverageSurahDurations(): Promise<Record<number, number>> {
    if (averageSurahDurationsCache) return averageSurahDurationsCache;
    if (averageSurahDurationsPromise) return averageSurahDurationsPromise;

    averageSurahDurationsPromise = (async () => {
        try {
            const reciters = await getReciters();
            const surahBasedReciters = reciters.filter((reciter: Reciter) => reciter.type === 'surah-based');
            if (surahBasedReciters.length === 0) {
                averageSurahDurationsCache = {};
                return averageSurahDurationsCache;
            }

            const surahDurationMaps = await Promise.all(
                surahBasedReciters.map(async (reciter) => {
                    try {
                        const response = await fetch(`${reciter.relativePath}/surah.json`);
                        if (!response.ok) return null;
                        return await response.json();
                    } catch {
                        return null;
                    }
                }),
            );

            const totalsBySurah: Record<number, { totalSeconds: number; count: number }> = {};

            for (const durationMap of surahDurationMaps) {
                if (!durationMap) continue;

                Object.entries(durationMap as Record<string, unknown>).forEach(([surahKey, rawValue]) => {
                    const surahId = Number(surahKey);
                    const durationValue = rawValue as { duration?: unknown };
                    const durationSeconds = Number(durationValue?.duration);

                    if (!Number.isFinite(surahId) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
                        return;
                    }

                    if (!totalsBySurah[surahId]) {
                        totalsBySurah[surahId] = { totalSeconds: 0, count: 0 };
                    }

                    totalsBySurah[surahId].totalSeconds += durationSeconds;
                    totalsBySurah[surahId].count += 1;
                });
            }

            averageSurahDurationsCache = Object.fromEntries(
                Object.entries(totalsBySurah)
                    .filter(([, value]) => value.count > 0)
                    .map(([surahKey, value]) => [Number(surahKey), value.totalSeconds / value.count]),
            );

            return averageSurahDurationsCache;
        } catch (error) {
            console.error('Failed to load reciter averages for daily portion timing', error);
            averageSurahDurationsCache = {};
            return averageSurahDurationsCache;
        } finally {
            averageSurahDurationsPromise = null;
        }
    })();

    return averageSurahDurationsPromise;
}

export function useDailyPortionTiming() {
    const [averageSurahDurations, setAverageSurahDurations] = useState<Record<number, number> | null>(
        averageSurahDurationsCache,
    );

    useEffect(() => {
        let cancelled = false;

        void loadAverageSurahDurations().then((durations) => {
            if (!cancelled) {
                setAverageSurahDurations(durations);
            }
        });

        return () => {
            cancelled = true;
        };
    }, []);

    const averageSecondsPerWordBySurah = useMemo(
        () => buildAverageSecondsPerWordBySurah(averageSurahDurations),
        [averageSurahDurations],
    );

    return {
        averageSurahDurations,
        averageSecondsPerWordBySurah,
        isReady: averageSurahDurations !== null,
    };
}
