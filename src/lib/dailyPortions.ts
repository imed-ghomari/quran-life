import { Verse } from './types';
import rubMetadataRaw from './metadata/quran-metadata-rub.json';
import rukuMetadataRaw from './metadata/quran-metadata-ruku.json';

type RubData = Record<string, { last_verse_key: string }>;
type RukuData = Record<string, { last_verse_key: string }>;

const rubMetadata = rubMetadataRaw as RubData;
const rukuMetadata = rukuMetadataRaw as RukuData;

// Pre-compute sets of end keys
const rubEndKeys = new Set<string>();
for (const key in rubMetadata) {
    if (rubMetadata[key]?.last_verse_key) rubEndKeys.add(rubMetadata[key].last_verse_key);
}

const rukuEndKeys = new Set<string>();
for (const key in rukuMetadata) {
    if (rukuMetadata[key]?.last_verse_key) rukuEndKeys.add(rukuMetadata[key].last_verse_key);
}

function getWordCount(verse: Verse): number {
    return (verse.text || '').split(/\s+/).filter(Boolean).length;
}

export interface PortionResult {
    portion: Verse[];
    startVerseIndex: number;
    nextStartVerseIndex: number;
    targetWords: number;
    snappedWords: number;
}

/**
 * Calculates a daily portion starting from `startIndex`.
 * Uses absolute word counts mapped to verses to snap to boundaries.
 */
export function getDailyPortion(
    allVersesInPart: Verse[],
    startIndex: number,
    completionDays: number
): PortionResult {
    if (startIndex >= allVersesInPart.length) {
        return { portion: [], startVerseIndex: startIndex, nextStartVerseIndex: startIndex, targetWords: 0, snappedWords: 0 };
    }

    const wordCounts: number[] = new Array(allVersesInPart.length);
    let totalWords = 0;
    let wordsRead = 0;

    for (let i = 0; i < allVersesInPart.length; i++) {
        const count = getWordCount(allVersesInPart[i]);
        wordCounts[i] = count;
        totalWords += count;
        if (i < startIndex) {
            wordsRead += count;
        }
    }

    const remainingWords = totalWords - wordsRead;
    const baseTargetPerDay = totalWords / completionDays;
    
    // Estimate days spent to dynamically adjust the remaining days
    const daysSpentApprox = Math.round(wordsRead / (baseTargetPerDay || 1));
    let remainingDays = completionDays - daysSpentApprox;
    if (remainingDays < 1) remainingDays = 1;

    // TARGET CALCULATION
    const targetWordsPerDay = Math.ceil(remainingWords / remainingDays);

    // Accumulate words to find the base target index
    let accumulatedWords = 0;
    
    // Bounds check (+/- 15% window)
    const snapMin = targetWordsPerDay * 0.85;
    const snapMax = targetWordsPerDay * 1.15;

    // Build list of candidate ends within the window
    const candidates: Array<{
        index: number;
        words: number;
        isSurahEnd: boolean;
        isRubEnd: boolean;
        isRukuEnd: boolean;
        isLastVerse: boolean;
    }> = [];

    let fallbackAyahIndex = startIndex;
    let fallbackDiff = Infinity;

    for (let i = startIndex; i < allVersesInPart.length; i++) {
        const verse = allVersesInPart[i];
        accumulatedWords += (wordCounts[i] || 0);

        // Keep track of the ayah closest to the target in case we have to fallback entirely
        const diff = Math.abs(accumulatedWords - targetWordsPerDay);
        if (diff < fallbackDiff) {
            fallbackDiff = diff;
            fallbackAyahIndex = i;
        }

        if (accumulatedWords >= snapMin && accumulatedWords <= snapMax) {
            const verseKey = `${verse.surahId}:${verse.ayahId}`;
            const nextVerse = allVersesInPart[i + 1];
            const isSurahEnd = nextVerse ? nextVerse.surahId !== verse.surahId : true;
            const isRubEnd = rubEndKeys.has(verseKey);
            const isRukuEnd = rukuEndKeys.has(verseKey);
            const isLastVerse = i === allVersesInPart.length - 1;

            candidates.push({
                index: i,
                words: accumulatedWords,
                isSurahEnd,
                isRubEnd,
                isRukuEnd,
                isLastVerse
            });
        }

        // Optimization: stop iterating once we pass the window
        if (accumulatedWords > snapMax) {
            break;
        }
    }

    // Find the best candidate based on hierarchy
    let bestIndex = -1;
    let snappedWords = 0;

    // Priority 1: Surah End (or Last Verse in Part)
    let bestCandidate = candidates.find(c => c.isSurahEnd || c.isLastVerse);

    // Priority 2: Rub End
    if (!bestCandidate) bestCandidate = candidates.find(c => c.isRubEnd);

    // Priority 3: Ruku End
    if (!bestCandidate) bestCandidate = candidates.find(c => c.isRukuEnd);

    // Priority 4: Ayah End closest to target within window
    if (!bestCandidate && candidates.length > 0) {
        bestCandidate = candidates.reduce((prev, curr) => {
            return Math.abs(curr.words - targetWordsPerDay) < Math.abs(prev.words - targetWordsPerDay) ? curr : prev;
        });
    }

    if (bestCandidate) {
        bestIndex = bestCandidate.index;
        snappedWords = bestCandidate.words;
    } else {
        // Fallback: snapped exactly outside the window, use closest overall Ayah limit
        bestIndex = fallbackAyahIndex;
        let tempWords = 0;
        for (let i = startIndex; i <= bestIndex; i++) {
            tempWords += wordCounts[i] || 0;
        }
        snappedWords = tempWords;
    }

    // Edge case: if remaining days is 1 or remaining words is very small (< 115%), take all
    if (remainingDays === 1 || remainingWords <= targetWordsPerDay * 1.15) {
        bestIndex = allVersesInPart.length - 1;
        snappedWords = remainingWords;
    }

    const portion = allVersesInPart.slice(startIndex, bestIndex + 1);

    return {
        portion,
        startVerseIndex: startIndex,
        nextStartVerseIndex: bestIndex + 1,
        targetWords: targetWordsPerDay,
        snappedWords
    };
}
