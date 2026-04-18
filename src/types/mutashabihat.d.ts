declare module '@/lib/mutashabihat' {
    export function isCustomSimilarityEntry(entry: any): boolean;
    export function getSimilarityEntryWordRangeForAbsolute(entry: any, absoluteAyah: number): [number, number] | null;
    export function doesSimilarityEntryOverlapChunk(entry: any, absoluteAyah: number, chunkWordRange: [number, number] | null | undefined): boolean;
    export function surahAyahToAbsolute(surahId: number, ayahId: number): number;
    export function absoluteToSurahAyah(absolute: number): { surahId: number; ayahId: number };
    export function hasMutashabihForAbsolute(absoluteAyah: number): boolean;
    export function getMutashabihatForAbsolute(absoluteAyah: number, customMutashabihat?: any[]): any[];
    export function getAllMutashabihatRefs(customMutashabihat?: any[]): number[];
}
