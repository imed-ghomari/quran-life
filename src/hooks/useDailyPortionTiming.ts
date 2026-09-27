'use client';

import React from 'react';
import { getReciters, fetchJsonWithObsidianFallback } from '@/lib/audio';
import { buildAverageSecondsPerWordBySurah } from '@/lib/dailyPortionUtils';

const { useEffect, useMemo, useState } = React;

let averageSurahDurationsCache: Record<number, number> | null = null;
let averageSurahDurationsPromise: Promise<Record<number, number>> | null = null;

/** One reciter's `surah.json`: surah id -> entry carrying a `duration` in seconds. */
interface SurahDurationMap {
  [surahId: string]: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function loadAverageSurahDurations(): Promise<Record<number, number>> {
    if (averageSurahDurationsCache) return averageSurahDurationsCache;
    if (averageSurahDurationsPromise) return averageSurahDurationsPromise;

    averageSurahDurationsPromise = (async () => {
        try {
            const reciters = await getReciters();
            const surahBasedReciters = reciters.filter((reciter) => reciter.type === 'surah-based');
            if (surahBasedReciters.length === 0) {
                averageSurahDurationsCache = {};
                return averageSurahDurationsCache;
            }

            const surahDurationMaps = await Promise.all(
                surahBasedReciters.map(async (reciter): Promise<SurahDurationMap | null> => {
                    try {
                        // Vault → requestUrl → CDN chain (a bare relative fetch
                        // cannot resolve inside Obsidian, so it always failed
                        // here and durations silently stayed empty).
                        const rec = asRecord(await fetchJsonWithObsidianFallback(`${reciter.relativePath}/surah.json`));
                        return rec ?? null;
                    } catch {
                        return null;
                    }
                }),
            );

            const totalsBySurah: Record<number, { totalSeconds: number; count: number }> = {};

            for (const durationMap of surahDurationMaps) {
                if (!durationMap) continue;

                Object.entries(durationMap).forEach(([surahKey, rawValue]) => {
                    const surahId = Number(surahKey);
                    const durationValue = asRecord(rawValue);
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

            const averaged: Record<number, number> = {};
            for (const [surahKey, value] of Object.entries(totalsBySurah)) {
                if (value.count <= 0) continue;
                const surahId = Number(surahKey);
                if (!Number.isFinite(surahId)) continue;
                averaged[surahId] = value.totalSeconds / value.count;
            }
            averageSurahDurationsCache = averaged;

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

export function useDailyPortionTiming(): {
    averageSurahDurations: Record<number, number> | null;
    averageSecondsPerWordBySurah: Record<number, number>;
    isReady: boolean;
} {
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
