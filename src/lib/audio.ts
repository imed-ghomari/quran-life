
import { Verse } from './types';

export interface Reciter {
    id: string;
    name: string;
    type: 'surah-based' | 'ayah-based';
    relativePath: string;
    hasSegments?: boolean;
}

export interface RecitationTiming {
    timestamp_from: number; // ms
    timestamp_to: number;   // ms
    duration_ms: number;
    segments?: number[][]; // [wordIndex, start, end]
}

export interface AyahRecitationData {
    audio_url: string;
    segments?: number[][];
}

// Cache for loaded recitation data
const recitationCache: Record<string, any> = {};

export async function getReciters(): Promise<Reciter[]> {
    try {
        const res = await fetch('/recitations/reciters.json');
        if (!res.ok) throw new Error('Failed to load reciters');
        return await res.json();
    } catch (e) {
        console.error(e);
        return [];
    }
}

export async function loadRecitationData(reciter: Reciter, surahId: number) {
    const cacheKey = reciter.type === 'surah-based'
        ? reciter.id
        : `${reciter.id}-${surahId}`;
    if (recitationCache[cacheKey]) return recitationCache[cacheKey];

    let data: any = {};

    try {
        if (reciter.type === 'surah-based') {
            const [surahRes, segmentsRes] = await Promise.all([
                fetch(`${reciter.relativePath}/surah.json`),
                fetch(`${reciter.relativePath}/segments.json`)
            ]);

            const surahData = await surahRes.json();
            const segmentsData = await segmentsRes.json();

            // Normalize
            data = {
                audioUrl: surahData[surahId]?.audio_url,
                timings: segmentsData // Keyed by "Surah:Ayah"
            };
        } else {
            // Ayah based - single large file for all Quran or per surah?
            // The file structure seen is "ayah-recitation-NAME.json" which likely contains ALL verses?
            // Let's assume it contains all verses based on file size/naming.
            // If it's huge, we might need to be careful. But we fetch it once.
            // Wait, "ayah-recitation-....json" - does it contain 6236 keys?
            // I should check the size of one of these files.
            
            // If it's already loaded for another surah, good.
            if (recitationCache[reciter.id]) {
                return recitationCache[reciter.id];
            }

            const res = await fetch(reciter.relativePath);
            const json = await res.json();
            
            // This is a huge map "1:1" -> { audio_url ... }
            data = {
                verses: json
            };
            
            // Cache at reciter level since it's one file for whole Quran
            recitationCache[reciter.id] = data;
            return data;
        }

        recitationCache[cacheKey] = data;
        return data;
    } catch (e) {
        console.error('Error loading recitation data', e);
        return null;
    }
}

export function getAudioInfoForVerse(
    reciter: Reciter, 
    data: any, 
    surahId: number, 
    ayahId: number
): { url: string; startTime?: number; endTime?: number; segments?: number[][] } | null {
    if (!data) return null;

    if (reciter.type === 'ayah-based') {
        const key = `${surahId}:${ayahId}`;
        const verseData = data.verses?.[key];
        if (!verseData?.audio_url) return null;
        return { url: verseData.audio_url, segments: verseData.segments };
    } else {
        // Surah based
        if (!data.audioUrl) return null;
        
        const key = `${surahId}:${ayahId}`;
        const timing = data.timings?.[key];
        
        if (!timing) {
            // Fallback: play from start if no timing? No, that's bad.
            return null;
        }

        return {
            url: data.audioUrl,
            startTime: timing.timestamp_from / 1000,
            endTime: timing.timestamp_to / 1000,
            segments: timing.segments
        };
    }
}
