'use client';

import React from 'react';
import { getReciters, fetchJsonWithObsidianFallback, loadRecitationData } from '@/lib/audio';
import type { Reciter } from '@/lib/audio';
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
} {    const [averageSurahDurations, setAverageSurahDurations] = useState<Record<number, number> | null>(
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

// ---------- per-reciter pace (Daily target follows the player's reciter) ----------

const reciterSpwPromises = new Map<string, Promise<Record<number, number> | null>>();

function verseDurationSec(entry: unknown): number | null {
    const rec = asRecord(entry);
    if (!rec) return null;
    const d = Number(rec.duration);
    if (Number.isFinite(d) && d > 0) return d;
    const segs = rec.segments;
    if (Array.isArray(segs) && segs.length > 0) {
        const last: unknown = segs[segs.length - 1];
        if (Array.isArray(last)) {
            const third: unknown = last[2];
            const end = Number(third);
            if (Number.isFinite(end) && end > 0) return end / 1000;
        }
    }
    return null;
}

/**
 * Seconds-per-word map for ONE reciter (the Daily Portion default), derived
 * from that reciter's own published durations — not an average across
 * reciters. Ayah-based: one map load, summed per surah. Surah-based: that
 * reciter's small surah.json. Returns null when nothing resolves (caller keeps
 * the legacy average map).
 */
export async function loadSecondsPerWordForReciter(reciterId: string): Promise<Record<number, number> | null> {
    if (!reciterId) return null;
    const cached = reciterSpwPromises.get(reciterId);
    if (cached) return cached;
    const promise = (async (): Promise<Record<number, number> | null> => {
        try {
            const reciters = await getReciters();
            const reciter: Reciter | undefined = reciters.find((r) => r.id === reciterId);
            if (!reciter) return null;
            const surahSeconds: Record<number, number> = {};
            if (reciter.type === 'ayah-based') {
                const data = await loadRecitationData(reciter, 1);
                const verses = asRecord(data?.verses);
                if (!verses) return null;
                for (const [key, entry] of Object.entries(verses)) {
                    const dur = verseDurationSec(entry);
                    if (dur === null) continue;
                    const surahId = Number(String(key).split(':')[0]);
                    if (!Number.isFinite(surahId)) continue;
                    surahSeconds[surahId] = (surahSeconds[surahId] || 0) + dur;
                }
            } else {
                const surahJson = asRecord(await fetchJsonWithObsidianFallback(`${reciter.relativePath}/surah.json`));
                if (!surahJson) return null;
                for (const [surahKey, entry] of Object.entries(surahJson)) {
                    const surahId = Number(surahKey);
                    const dur = Number(asRecord(entry)?.duration);
                    if (!Number.isFinite(surahId) || !Number.isFinite(dur) || dur <= 0) continue;
                    surahSeconds[surahId] = dur;
                }
            }
            if (Object.keys(surahSeconds).length === 0) return null;
            const spw = buildAverageSecondsPerWordBySurah(surahSeconds);
            return Object.keys(spw).length > 0 ? spw : null;
        } catch {
            return null;
        }
    })();
    reciterSpwPromises.set(reciterId, promise);
    return promise;
}

/** Reactive wrapper: per-reciter pace, null while loading/unavailable. */
export function useReciterTiming(reciterId: string | undefined): Record<number, number> | null {
    const [spw, setSpw] = useState<Record<number, number> | null>(null);
    useEffect(() => {
        let cancelled = false;
        setSpw(null);
        if (!reciterId) return;
        void loadSecondsPerWordForReciter(reciterId).then((map) => {
            if (!cancelled) setSpw(map);
        });
        return () => { cancelled = true; };
    }, [reciterId]);
    return spw;
}
