import type { CustomMutashabih } from '@/lib/types';
import type { ReviewChunkWordRange } from '@/lib/reviewVerseChunks';

/**
 * Structural mirror of `SimilarityEntry` in `@/lib/mutashabihat`
 * (declared here instead of imported to avoid a circular module reference).
 */
interface SimilarityEntryShape {
    phraseId: string;
    sources: number[];
    matches: number[];
    meta: unknown;
    isCustom?: boolean;
}

declare module '@/lib/mutashabihat' {
    export function isCustomSimilarityEntry(entry: SimilarityEntryShape): boolean;
    export function getSimilarityEntryWordRangeForAbsolute(entry: SimilarityEntryShape, absoluteAyah: number): ReviewChunkWordRange | null;
    export function doesSimilarityEntryOverlapChunk(entry: SimilarityEntryShape, absoluteAyah: number, chunkWordRange: ReviewChunkWordRange | null | undefined): boolean;
    export function surahAyahToAbsolute(surahId: number, ayahId: number): number;
    export function absoluteToSurahAyah(absolute: number): { surahId: number; ayahId: number };
    export function hasMutashabihForAbsolute(absoluteAyah: number): boolean;
    export function getMutashabihatForAbsolute(absoluteAyah: number, customMutashabihat?: CustomMutashabih[]): SimilarityEntryShape[];
    export function getAllMutashabihatRefs(customMutashabihat?: CustomMutashabih[]): number[];
}
