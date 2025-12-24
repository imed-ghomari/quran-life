declare module '@/lib/mutashabihat' {
    export function surahAyahToAbsolute(surahId: number, ayahId: number): number;
    export function absoluteToSurahAyah(absolute: number): { surahId: number; ayahId: number };
    export function hasMutashabihForAbsolute(absoluteAyah: number): boolean;
    export function getMutashabihatForAbsolute(absoluteAyah: number): any[];
    export function getAllMutashabihatRefs(): number[];
}
