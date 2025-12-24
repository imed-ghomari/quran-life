'use client';

import phrasesRaw from '../../Mutashabihat ul Quran/phrases.json';
import phraseVersesRaw from '../../Mutashabihat ul Quran/phrase_verses.json';
import { SURAHS } from './quranData';
import { getCustomMutashabihat } from './storage';

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

const phrases = phrasesRaw as Record<string, any>;
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

        const matches: MatchMeta[] = Object.entries(data.ayah).map(([key, ranges]: [string, any]) => {
            const abs = keyToAbsolute(key);
            // Default to the first range if multiple exist for the same verse
            const range = Array.isArray(ranges[0]) ? ranges[0] : ranges;
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

export function getMutashabihatForAbsolute(absoluteAyah: number): SimilarityEntry[] {
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
    const customs = getCustomMutashabihat();
    const customEntries: SimilarityEntry[] = customs
        .filter(c => {
            const abs1 = surahAyahToAbsolute(c.verse1.surahId, c.verse1.ayahId);
            const abs2 = surahAyahToAbsolute(c.verse2.surahId, c.verse2.ayahId);
            return abs1 === absoluteAyah || abs2 === absoluteAyah;
        })
        .map(c => {
             const abs1 = surahAyahToAbsolute(c.verse1.surahId, c.verse1.ayahId);
             const abs2 = surahAyahToAbsolute(c.verse2.surahId, c.verse2.ayahId);
             return {
                 phraseId: `custom-${c.id}`,
                 sources: [abs1],
                 matches: [abs2],
                 meta: { 
                     phraseId: `custom-${c.id}`,
                     sourceAbs: abs1,
                     sourceRange: [0, 0],
                     matches: [{ absolute: abs2, wordRange: [0, 0] }],
                     totalCount: 2,
                     isCustom: true,
                     customId: c.id
                 } as any,
                 isCustom: true
             };
         });

    return [...official, ...customEntries];
}

export function getAllMutashabihatRefs(): number[] {
    const officialRefs = Array.from(ayahSet.values());
    const customs = getCustomMutashabihat();
    const customRefs = customs.flatMap(c => [
        surahAyahToAbsolute(c.verse1.surahId, c.verse1.ayahId),
        surahAyahToAbsolute(c.verse2.surahId, c.verse2.ayahId)
    ]);
    return Array.from(new Set([...officialRefs, ...customRefs])).sort((a, b) => a - b);
}

