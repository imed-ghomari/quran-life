import { Verse } from './types';
import rubMetadataRaw from './metadata/quran-metadata-rub.json';
import rukuMetadataRaw from './metadata/quran-metadata-ruku.json';
import {
    clampDailyTargetMinutes,
    DailyPortionTimingMode,
    estimateVerseDurationMinutes,
    getVerseKey,
    getVerseWordCount,
    parseVerseKey,
} from './dailyPortionUtils';

type RubData = Record<string, { last_verse_key: string }>;
type RukuData = Record<string, { last_verse_key: string }>;

interface DailyPortionOptions {
    dailyTargetMinutes: number;
    mode: DailyPortionTimingMode;
    nextStartVerseKey?: string;
    legacyStartIndex?: number;
    averageSecondsPerWordBySurah?: Record<number, number> | null;
    /**
     * Recitation speed for audio mode. The target is wall-clock minutes, so
     * the portion is sized in 1x-minutes = target × speed — that way the
     * player's total (1x durations ÷ speed) lands on the target instead of
     * under it. Reading mode ignores speed. Defaults to 1 (unchanged).
     */
    playbackSpeed?: number;
}

const rubMetadata = rubMetadataRaw as RubData;
const rukuMetadata = rukuMetadataRaw as RukuData;

const rubEndKeys = new Set<string>();
for (const key in rubMetadata) {
    if (rubMetadata[key]?.last_verse_key) rubEndKeys.add(rubMetadata[key].last_verse_key);
}

const rukuEndKeys = new Set<string>();
for (const key in rukuMetadata) {
    if (rukuMetadata[key]?.last_verse_key) rukuEndKeys.add(rukuMetadata[key].last_verse_key);
}

export interface PortionResult {
    portion: Verse[];
    startVerseIndex: number;
    nextStartVerseIndex: number;
    startVerseKey?: string;
    nextStartVerseKey?: string;
    targetMinutes: number;
    snappedMinutes: number;
    targetWords: number;
    snappedWords: number;
    totalEstimatedMinutes: number;
    derivedCompletionDays: number;
    completedCycle: boolean;
}

function resolveStartIndex(allVersesInPart: Verse[], options: DailyPortionOptions): number {
    const parsedAnchor = parseVerseKey(options.nextStartVerseKey);
    if (parsedAnchor) {
        const exactIndex = allVersesInPart.findIndex((verse) => (
            verse.surahId === parsedAnchor.surahId && verse.ayahId === parsedAnchor.ayahId
        ));
        if (exactIndex >= 0) return exactIndex;

        const nextEligibleIndex = allVersesInPart.findIndex((verse) => (
            verse.surahId > parsedAnchor.surahId
            || (verse.surahId === parsedAnchor.surahId && verse.ayahId >= parsedAnchor.ayahId)
        ));
        return nextEligibleIndex >= 0 ? nextEligibleIndex : 0;
    }

    const legacyIndex = Number(options.legacyStartIndex);
    if (!Number.isFinite(legacyIndex) || legacyIndex <= 0) return 0;
    return Math.min(Math.max(Math.trunc(legacyIndex), 0), Math.max(allVersesInPart.length - 1, 0));
}

/**
 * Calculates a daily portion from a stable verse anchor and a fixed daily minutes target.
 * The cycle duration is derived from eligible content; the user's daily time target stays constant.
 */
export function getDailyPortion(
    allVersesInPart: Verse[],
    options: DailyPortionOptions,
): PortionResult {
    const targetMinutes = clampDailyTargetMinutes(options.dailyTargetMinutes);
    const playbackSpeed = options.mode === 'audio'
        && Number.isFinite(Number(options.playbackSpeed))
        && Number(options.playbackSpeed) > 0
        ? Number(options.playbackSpeed)
        : 1;
    // Wall-clock target: size the audio portion in 1x-minutes.
    const sizedTargetMinutes = targetMinutes * playbackSpeed;

    if (allVersesInPart.length === 0) {
        return {
            portion: [],
            startVerseIndex: 0,
            nextStartVerseIndex: 0,
            targetMinutes,
            snappedMinutes: 0,
            targetWords: 0,
            snappedWords: 0,
            totalEstimatedMinutes: 0,
            derivedCompletionDays: 0,
            completedCycle: false,
        };
    }

    const startIndex = resolveStartIndex(allVersesInPart, options);
    const wordCounts: number[] = new Array<number>(allVersesInPart.length).fill(0);
    const minuteEstimates: number[] = new Array<number>(allVersesInPart.length).fill(0);
    let totalWords = 0;
    let totalEstimatedMinutes = 0;

    for (let i = 0; i < allVersesInPart.length; i++) {
        const verse = allVersesInPart[i];
        const wordCount = getVerseWordCount(verse);
        const minuteEstimate = estimateVerseDurationMinutes(
            verse,
            options.mode,
            options.averageSecondsPerWordBySurah,
        );
        wordCounts[i] = wordCount;
        minuteEstimates[i] = minuteEstimate;
        totalWords += wordCount;
        totalEstimatedMinutes += minuteEstimate;
    }

    const derivedCompletionDays = totalEstimatedMinutes > 0
        ? Math.max(1, Math.ceil(totalEstimatedMinutes / sizedTargetMinutes))
        : 0;

    let remainingWords = 0;
    let remainingMinutes = 0;
    for (let i = startIndex; i < allVersesInPart.length; i++) {
        remainingWords += wordCounts[i] || 0;
        remainingMinutes += minuteEstimates[i] || 0;
    }

    let accumulatedWords = 0;
    let accumulatedMinutes = 0;
    const snapMin = sizedTargetMinutes * 0.85;
    const snapMax = sizedTargetMinutes * 1.15;

    const candidates: Array<{
        index: number;
        words: number;
        minutes: number;
        isSurahEnd: boolean;
        isRubEnd: boolean;
        isRukuEnd: boolean;
        isLastVerse: boolean;
    }> = [];

    let fallbackAyahIndex = startIndex;
    let fallbackDiff = Number.POSITIVE_INFINITY;

    for (let i = startIndex; i < allVersesInPart.length; i++) {
        const verse = allVersesInPart[i];
        accumulatedWords += wordCounts[i] || 0;
        accumulatedMinutes += minuteEstimates[i] || 0;

        const diff = Math.abs(accumulatedMinutes - sizedTargetMinutes);
        if (diff < fallbackDiff) {
            fallbackDiff = diff;
            fallbackAyahIndex = i;
        }

        if (accumulatedMinutes >= snapMin && accumulatedMinutes <= snapMax) {
            const verseKey = getVerseKey(verse);
            const nextVerse = allVersesInPart[i + 1];
            const isSurahEnd = nextVerse ? nextVerse.surahId !== verse.surahId : true;
            const isRubEnd = rubEndKeys.has(verseKey);
            const isRukuEnd = rukuEndKeys.has(verseKey);
            const isLastVerse = i === allVersesInPart.length - 1;

            candidates.push({
                index: i,
                words: accumulatedWords,
                minutes: accumulatedMinutes,
                isSurahEnd,
                isRubEnd,
                isRukuEnd,
                isLastVerse,
            });
        }

        if (accumulatedMinutes > snapMax) {
            break;
        }
    }

    let bestCandidate = candidates.find((candidate) => candidate.isSurahEnd || candidate.isLastVerse);
    if (!bestCandidate) bestCandidate = candidates.find((candidate) => candidate.isRubEnd);
    if (!bestCandidate) bestCandidate = candidates.find((candidate) => candidate.isRukuEnd);
    if (!bestCandidate && candidates.length > 0) {
        bestCandidate = candidates.reduce((best, current) => (
            Math.abs(current.minutes - sizedTargetMinutes) < Math.abs(best.minutes - sizedTargetMinutes) ? current : best
        ));
    }

    let bestIndex = fallbackAyahIndex;
    let snappedWords = 0;
    let snappedMinutes = 0;

    if (bestCandidate) {
        bestIndex = bestCandidate.index;
        snappedWords = bestCandidate.words;
        snappedMinutes = bestCandidate.minutes;
    } else {
        for (let i = startIndex; i <= bestIndex; i++) {
            snappedWords += wordCounts[i] || 0;
            snappedMinutes += minuteEstimates[i] || 0;
        }
    }

    if (remainingMinutes <= snapMax || bestIndex >= allVersesInPart.length - 1) {
        bestIndex = allVersesInPart.length - 1;
        snappedWords = remainingWords;
        snappedMinutes = remainingMinutes;
    }

    const completedCycle = bestIndex >= allVersesInPart.length - 1;
    const nextStartVerseIndex = completedCycle ? 0 : bestIndex + 1;
    const portion = allVersesInPart.slice(startIndex, bestIndex + 1);

    return {
        portion,
        startVerseIndex: startIndex,
        nextStartVerseIndex,
        startVerseKey: portion[0] ? getVerseKey(portion[0]) : undefined,
        nextStartVerseKey: completedCycle
            ? getVerseKey(allVersesInPart[0])
            : getVerseKey(allVersesInPart[nextStartVerseIndex]),
        targetMinutes,
        snappedMinutes,
        targetWords: Math.max(1, Math.ceil((totalWords / Math.max(totalEstimatedMinutes, targetMinutes)) * targetMinutes)),
        snappedWords,
        totalEstimatedMinutes,
        derivedCompletionDays,
        completedCycle,
    };
}
