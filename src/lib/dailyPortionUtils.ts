import { getSurahsByPart } from './quranData';
import {
    ListeningProgressEntry,
    MemoryNode,
    QuranPart,
    Surah,
    Verse,
    surahHasReviewedVerseGroup,
} from './types';

export type DailyPortionTimingMode = 'audio' | 'reading';

export const DAILY_TARGET_MINUTES_MIN = 5;
export const DAILY_TARGET_MINUTES_MAX = 180;
export const DEFAULT_DAILY_TARGET_MINUTES = 40;
export const DEFAULT_READING_WORDS_PER_MINUTE = 70;
export const DEFAULT_AUDIO_WORDS_PER_MINUTE = 55;

export const SURAH_WORD_COUNTS: Record<number, number> = {
    1: 29, 2: 6117, 3: 3481, 4: 3747, 5: 2804, 6: 3050, 7: 3320, 8: 1234, 9: 2498, 10: 1833,
    11: 1917, 12: 1777, 13: 854, 14: 830, 15: 655, 16: 1844, 17: 1556, 18: 1579, 19: 961, 20: 1335,
    21: 1169, 22: 1274, 23: 1050, 24: 1316, 25: 893, 26: 1318, 27: 1151, 28: 1430, 29: 976, 30: 817,
    31: 546, 32: 372, 33: 1287, 34: 883, 35: 775, 36: 725, 37: 860, 38: 733, 39: 1172, 40: 1219,
    41: 794, 42: 860, 43: 830, 44: 346, 45: 488, 46: 643, 47: 539, 48: 560, 49: 347, 50: 373,
    51: 360, 52: 312, 53: 360, 54: 342, 55: 351, 56: 379, 57: 574, 58: 472, 59: 445, 60: 348,
    61: 221, 62: 175, 63: 180, 64: 241, 65: 287, 66: 249, 67: 333, 68: 300, 69: 258, 70: 217,
    71: 226, 72: 285, 73: 199, 74: 255, 75: 164, 76: 243, 77: 181, 78: 173, 79: 179, 80: 133,
    81: 104, 82: 80, 83: 169, 84: 107, 85: 109, 86: 61, 87: 72, 88: 92, 89: 137, 90: 82,
    91: 54, 92: 71, 93: 40, 94: 27, 95: 34, 96: 72, 97: 30, 98: 94, 99: 36, 100: 40,
    101: 36, 102: 28, 103: 14, 104: 33, 105: 23, 106: 17, 107: 25, 108: 10, 109: 26, 110: 19,
    111: 23, 112: 15, 113: 23, 114: 20,
};

const isFinitePositive = (value: unknown): value is number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0;
};

export function clampDailyTargetMinutes(value: number): number {
    return Math.min(DAILY_TARGET_MINUTES_MAX, Math.max(DAILY_TARGET_MINUTES_MIN, Math.round(value)));
}

export function getVerseWordCount(verse: Verse): number {
    return (verse.text || '').split(/\s+/).filter(Boolean).length;
}

export function getSurahWordCount(surahId: number): number {
    return SURAH_WORD_COUNTS[surahId] || 0;
}

export function buildAverageSecondsPerWordBySurah(
    averageSurahDurations?: Record<number, number> | null,
): Record<number, number> {
    if (!averageSurahDurations) return {};

    const secondsPerWordBySurah: Record<number, number> = {};

    Object.entries(averageSurahDurations).forEach(([surahKey, durationSeconds]) => {
        const surahId = Number(surahKey);
        const wordCount = getSurahWordCount(surahId);
        if (!isFinitePositive(durationSeconds) || !isFinitePositive(wordCount)) return;
        secondsPerWordBySurah[surahId] = durationSeconds / wordCount;
    });

    return secondsPerWordBySurah;
}

export function estimateWordsDurationMinutes(
    wordCount: number,
    mode: DailyPortionTimingMode,
    averageSecondsPerWord?: number,
): number {
    if (!isFinitePositive(wordCount)) return 0;

    if (mode === 'audio') {
        const secondsPerWord = isFinitePositive(averageSecondsPerWord)
            ? averageSecondsPerWord
            : 60 / DEFAULT_AUDIO_WORDS_PER_MINUTE;
        return (wordCount * secondsPerWord) / 60;
    }

    return wordCount / DEFAULT_READING_WORDS_PER_MINUTE;
}

export function estimateVerseDurationMinutes(
    verse: Verse,
    mode: DailyPortionTimingMode,
    averageSecondsPerWordBySurah?: Record<number, number> | null,
): number {
    const wordCount = getVerseWordCount(verse);
    return estimateWordsDurationMinutes(
        wordCount,
        mode,
        averageSecondsPerWordBySurah?.[verse.surahId],
    );
}

export function estimateVersesDurationMinutes(
    verses: Verse[],
    mode: DailyPortionTimingMode,
    averageSecondsPerWordBySurah?: Record<number, number> | null,
): number {
    return verses.reduce((total, verse) => (
        total + estimateVerseDurationMinutes(verse, mode, averageSecondsPerWordBySurah)
    ), 0);
}

export function estimateSurahDurationMinutes(
    surahId: number,
    mode: DailyPortionTimingMode,
    averageSurahDurations?: Record<number, number> | null,
): number {
    if (mode === 'audio') {
        const durationSeconds = averageSurahDurations?.[surahId];
        if (isFinitePositive(durationSeconds)) {
            return durationSeconds / 60;
        }
    }

    return estimateWordsDurationMinutes(getSurahWordCount(surahId), mode);
}

export function estimateEligibleCycleDays(
    eligibleSurahs: Surah[],
    dailyTargetMinutes: number,
    mode: DailyPortionTimingMode,
    averageSurahDurations?: Record<number, number> | null,
): number {
    const targetMinutes = clampDailyTargetMinutes(dailyTargetMinutes);
    const totalMinutes = eligibleSurahs.reduce((total, surah) => (
        total + estimateSurahDurationMinutes(surah.id, mode, averageSurahDurations)
    ), 0);

    if (totalMinutes <= 0) return 0;
    return Math.max(1, Math.ceil(totalMinutes / targetMinutes));
}

export function getEligibleDailyPortionSurahs(
    activePart: QuranPart,
    skippedSurahs: number[] | Set<number> | undefined,
    nodes: MemoryNode[],
): Surah[] {
    const skipped = skippedSurahs instanceof Set ? skippedSurahs : new Set(skippedSurahs || []);

    return getSurahsByPart(activePart).filter((surah) => (
        !skipped.has(surah.id) && !surahHasReviewedVerseGroup(nodes, surah.id)
    ));
}

export function getVerseKey(verse: Pick<Verse, 'surahId' | 'ayahId'>): string {
    return `${verse.surahId}:${verse.ayahId}`;
}

export function parseVerseKey(verseKey?: string | null): { surahId: number; ayahId: number } | null {
    if (!verseKey) return null;
    const [surahId, ayahId] = String(verseKey).split(':').map(Number);
    if (!Number.isFinite(surahId) || !Number.isFinite(ayahId)) return null;
    if (surahId <= 0 || ayahId <= 0) return null;
    return { surahId, ayahId };
}

export function getEligibleVerseCount(eligibleSurahs: Surah[]): number {
    return eligibleSurahs.reduce((total, surah) => total + surah.verseCount, 0);
}

export function getProgressStartIndexFromEligibleSurahs(
    eligibleSurahs: Surah[],
    progress?: Pick<ListeningProgressEntry, 'lastVerseIndex' | 'nextStartVerseKey'> | null,
): number {
    if (eligibleSurahs.length === 0) return 0;

    const anchor = parseVerseKey(progress?.nextStartVerseKey);
    if (anchor) {
        let traversedVerses = 0;

        for (const surah of eligibleSurahs) {
            if (surah.id === anchor.surahId) {
                const boundedAyah = Math.min(Math.max(anchor.ayahId, 1), surah.verseCount);
                return traversedVerses + (boundedAyah - 1);
            }

            if (surah.id > anchor.surahId) {
                return traversedVerses;
            }

            traversedVerses += surah.verseCount;
        }

        return 0;
    }

    const totalVerses = getEligibleVerseCount(eligibleSurahs);
    if (totalVerses <= 0) return 0;

    const legacyIndex = Number(progress?.lastVerseIndex);
    if (!Number.isFinite(legacyIndex) || legacyIndex <= 0) return 0;
    return Math.min(Math.max(Math.trunc(legacyIndex), 0), Math.max(totalVerses - 1, 0));
}

export function getVerseKeyAtEligibleIndex(
    eligibleSurahs: Surah[],
    startIndex: number,
): string | undefined {
    if (eligibleSurahs.length === 0) return undefined;

    const totalVerses = getEligibleVerseCount(eligibleSurahs);
    if (totalVerses <= 0) return undefined;

    const normalizedIndex = Math.min(Math.max(startIndex, 0), totalVerses - 1);
    let traversedVerses = 0;

    for (const surah of eligibleSurahs) {
        const nextTraversed = traversedVerses + surah.verseCount;
        if (normalizedIndex < nextTraversed) {
            return `${surah.id}:${(normalizedIndex - traversedVerses) + 1}`;
        }
        traversedVerses = nextTraversed;
    }

    return `${eligibleSurahs[0].id}:1`;
}
