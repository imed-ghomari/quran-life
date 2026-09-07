import phrasesRaw from '../../Mutashabihat ul Quran/phrases.json';
import phraseVersesRaw from '../../Mutashabihat ul Quran/phrase_verses.json';
import { SURAHS } from './quranData';
import { CustomMutashabih } from './types';
import { doWordRangesOverlap, ReviewChunkWordRange } from './reviewVerseChunks';

/**
 * Metadata for a specific phrase match in a verse
 */
type MatchMeta = {
    absolute: number;
    wordRange: [number, number]; // [from, to]
};

/**
 * Unified entry structure for similarity comparisons
 */
type FlatEntry = {
    phraseId: string;
    sourceAbs: number;
    sourceRange: [number, number];
    matches: MatchMeta[];
    totalCount: number;
};

export interface SimilarityEntry {
    phraseId: string;
    sources: number[];
    matches: number[];
    meta: FlatEntry | { isCustom: true; customId: string };
    isCustom?: boolean;
}

const isValidWordRange = (range: unknown): range is ReviewChunkWordRange => (
    Array.isArray(range)
    && range.length === 2
    && Number.isFinite(Number(range[0]))
    && Number.isFinite(Number(range[1]))
);

const phrases = phrasesRaw as unknown as Record<string, {
    source: { key: string; from: number; to: number };
    ayah: Record<string, number[] | number[][]>;
    count: number;
}>;
const phraseVerses = phraseVersesRaw as Record<string, number[]>;

const flatEntries: FlatEntry[] = [];
const ayahSet = new Set<number>();
const ayahToEntryMap: Record<number, number[]> = {}; // Map absolute ID to indices in flatEntries

/**
 * Converts "Surah:Ayah" string (e.g. "2:23") to absolute ID (1-6236)
 */
export function keyToAbsolute(key: string): number {
    const [surahId, ayahId] = key.split(':').map(Number);
    let absolute = ayahId;
    for (let i = 0; i < surahId - 1; i++) {
        absolute += SURAHS[i].verseCount;
    }
    return absolute;
}

/**
 * Converts absolute ID to "Surah:Ayah" key
 */
export function absoluteToKey(absolute: number): string {
    let remaining = absolute;
    for (const s of SURAHS) {
        if (remaining <= s.verseCount) {
            return `${s.id}:${remaining}`;
        }
        remaining -= s.verseCount;
    }
    return `114:6`;
}

function init() {
    Object.entries(phrases).forEach(([id, data]) => {
        const sourceAbs = keyToAbsolute(data.source.key);
        const sourceRange: [number, number] = [data.source.from, data.source.to];

        const matches: MatchMeta[] = Object.entries(data.ayah).map(([key, ranges]) => {
            const abs = keyToAbsolute(key);
            // Default to the first range if multiple exist for the same verse
            const range = Array.isArray(ranges[0]) ? ranges[0] : (ranges as [number, number]);
            return {
                absolute: abs,
                wordRange: [range[0], range[1]] as [number, number]
            };
        });

        const entryIdx = flatEntries.length;
        flatEntries.push({
            phraseId: id,
            sourceAbs,
            sourceRange,
            matches,
            totalCount: data.count
        });

        // Add to global set and lookup map
        [...matches.map(m => m.absolute), sourceAbs].forEach(abs => {
            ayahSet.add(abs);
            if (!ayahToEntryMap[abs]) ayahToEntryMap[abs] = [];
            ayahToEntryMap[abs].push(entryIdx);
        });
    });
}

init();

export function surahAyahToAbsolute(surahId: number, ayahId: number): number {
    let absolute = ayahId;
    for (let i = 0; i < surahId - 1; i++) {
        absolute += SURAHS[i].verseCount;
    }
    return absolute;
}

export function absoluteToSurahAyah(absolute: number): { surahId: number; ayahId: number } {
    let remaining = absolute;
    for (const s of SURAHS) {
        if (remaining <= s.verseCount) {
            return { surahId: s.id, ayahId: remaining };
        }
        remaining -= s.verseCount;
    }
    const lastSurah = SURAHS[SURAHS.length - 1];
    return { surahId: lastSurah.id, ayahId: lastSurah.verseCount };
}

export function hasMutashabihForAbsolute(absoluteAyah: number): boolean {
    return ayahSet.has(absoluteAyah);
}

export function isCustomSimilarityEntry(entry: SimilarityEntry): boolean {
    return !!entry.isCustom || !!(entry.meta as any)?.isCustom;
}

export function getSimilarityEntryWordRangeForAbsolute(
    entry: SimilarityEntry,
    absoluteAyah: number
): ReviewChunkWordRange | null {
    if (isCustomSimilarityEntry(entry)) return null;

    const meta = entry.meta as FlatEntry;
    if (Number(meta?.sourceAbs) === absoluteAyah && isValidWordRange(meta?.sourceRange)) {
        return meta.sourceRange;
    }

    const match = Array.isArray(meta?.matches)
        ? meta.matches.find((candidate) => Number(candidate?.absolute) === absoluteAyah)
        : null;
    return match && isValidWordRange(match.wordRange) ? match.wordRange : null;
}

export function doesSimilarityEntryOverlapChunk(
    entry: SimilarityEntry,
    absoluteAyah: number,
    chunkWordRange: ReviewChunkWordRange | null | undefined
): boolean {
    if (isCustomSimilarityEntry(entry)) return true;
    if (!chunkWordRange) return true;

    const entryRange = getSimilarityEntryWordRangeForAbsolute(entry, absoluteAyah);
    if (!entryRange) return true;

    return doWordRangesOverlap(entryRange, chunkWordRange);
}

export function getMutashabihatForAbsolute(absoluteAyah: number, customMutashabihat: CustomMutashabih[] = []): SimilarityEntry[] {
    const indices = ayahToEntryMap[absoluteAyah] || [];
    const official = indices.map(idx => {
        const entry = flatEntries[idx];
        // Translate internal structure to what the UI expects
        return {
            phraseId: entry.phraseId,
            sources: [entry.sourceAbs],
            matches: entry.matches.map(m => m.absolute),
            meta: entry // Pass full meta for future word-level highlighting
        };
    });

    // Add custom ones
    const customEntries: SimilarityEntry[] = customMutashabihat
        .filter((c: CustomMutashabih) => {
            const [s1, a1] = c.verseId.split(':').map(Number);
            const [s2, a2] = c.targetVerseId.split(':').map(Number);
            const abs1 = surahAyahToAbsolute(s1, a1);
            const abs2 = surahAyahToAbsolute(s2, a2);
            return abs1 === absoluteAyah || abs2 === absoluteAyah;
        })
        .map((c: CustomMutashabih) => {
            const [s1, a1] = c.verseId.split(':').map(Number);
            const [s2, a2] = c.targetVerseId.split(':').map(Number);
             const abs1 = surahAyahToAbsolute(s1, a1);
             const abs2 = surahAyahToAbsolute(s2, a2);
             return {
                 phraseId: `custom-${c.id}`,
                 sources: [abs1],
                 matches: [abs2],
                 meta: { 
                     phraseId: `custom-${c.id}`,
                     sourceAbs: abs1,
                     sourceRange: [0, 0] as [number, number],
                     matches: [{ absolute: abs2, wordRange: [0, 0] as [number, number] }],
                     totalCount: 2,
                     isCustom: true,
                     customId: c.id
                 },
                 isCustom: true
             };
         });

    return [...official, ...customEntries];
}

export function getAllMutashabihatRefs(customMutashabihat: CustomMutashabih[] = []): number[] {
    const officialRefs = Array.from(ayahSet.values());
    const customRefs = customMutashabihat.flatMap((c: CustomMutashabih) => {
        const [s1, a1] = c.verseId.split(':').map(Number);
        const [s2, a2] = c.targetVerseId.split(':').map(Number);
        return [
            surahAyahToAbsolute(s1, a1),
            surahAyahToAbsolute(s2, a2)
        ];
    });
    return Array.from(new Set([...officialRefs, ...customRefs])).sort((a, b) => a - b);
}
