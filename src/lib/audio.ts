
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

const ALLOWED_RECITERS: Reciter[] = [
    {
        id: 'ayah-recitation-abdul-basit-abdul-samad-mujawwad-hafs-949',
        name: 'Abdul Basit Abdul Samad Mujawwad',
        type: 'surah-based',
        relativePath: '/recitations/surah-recitation-abdul-basit-abd-us-samad-mujawwad',
        hasSegments: true
    },
    {
        id: 'ayah-recitation-abdul-basit-abdul-samad-murattal-hafs-950',
        name: 'Abdul Basit Abdul Samad Murattal',
        type: 'ayah-based',
        relativePath: '/recitations/ayah-recitation-abdul-basit-abdul-samad-murattal-hafs-950.json',
        hasSegments: true
    },
    {
        id: 'ayah-recitation-abdul-rahman-al-sudais-murattal-hafs-951',
        name: 'Abdul Rahman Al Sudais Murattal',
        type: 'surah-based',
        relativePath: '/recitations/surah-recitation-abdul-rahman-al-sudais',
        hasSegments: true
    },
    {
        id: 'ayah-recitation-abu-bakr-al-shatri-murattal-hafs-952',
        name: 'Abu Bakr Al Shatri Murattal',
        type: 'surah-based',
        relativePath: '/recitations/surah-recitation-abu-bakr-al-shatri',
        hasSegments: true
    },
    {
        id: 'surah-recitation-ahmad-alnufais',
        name: 'Ahmad Alnufais',
        type: 'surah-based',
        relativePath: '/recitations/surah-recitation-ahmad-alnufais',
        hasSegments: true
    },
    {
        id: 'surah-recitation-hady-toure',
        name: 'Hady Toure',
        type: 'surah-based',
        relativePath: '/recitations/surah-recitation-hady-toure',
        hasSegments: true
    },
    {
        id: 'ayah-recitation-hani-ar-rifai-recitation-murattal-hafs-68',
        name: 'Hani Ar Rifai Murattal',
        type: 'ayah-based',
        relativePath: '/recitations/ayah-recitation-hani-ar-rifai-recitation-murattal-hafs-68.json',
        hasSegments: true
    },
    {
        id: 'surah-recitation-khalid-al-jalil',
        name: 'Khalid Al Jalil',
        type: 'surah-based',
        relativePath: '/recitations/surah-recitation-khalid-al-jalil',
        hasSegments: true
    },
    {
        id: 'ayah-recitation-khalifa-al-tunaiji-murattal-hafs-958',
        name: 'Khalifa Al Tunaiji Murattal',
        type: 'surah-based',
        relativePath: '/recitations/surah-recitation-khalifa-al-tunaiji',
        hasSegments: true
    },
    {
        id: 'ayah-recitation-maher-al-mu-aiqly-murattal-hafs-948',
        name: 'Maher Al Mu Aiqly Murattal',
        type: 'surah-based',
        relativePath: '/recitations/surah-recitation-maher-al-muaiqly',
        hasSegments: true
    },
    {
        id: 'surah-recitation-mahmoud-khaleel-al-husary',
        name: 'Mahmoud Khaleel Al Husary',
        type: 'surah-based',
        relativePath: '/recitations/surah-recitation-mahmoud-khaleel-al-husary',
        hasSegments: true
    },
    {
        id: 'ayah-recitation-mahmoud-khalil-al-husary-mujawwad-hafs-956',
        name: 'Mahmoud Khalil Al Husary Mujawwad',
        type: 'ayah-based',
        relativePath: '/recitations/ayah-recitation-mahmoud-khalil-al-husary-mujawwad-hafs-956.json',
        hasSegments: true
    },
    {
        id: 'surah-recitation-mahmoud-husary-muallim',
        name: 'Mahmoud Husary Muallim',
        type: 'surah-based',
        relativePath: '/recitations/surah-recitation-mahmoud-husary-muallim',
        hasSegments: true
    },
    {
        id: 'ayah-recitation-mishari-rashid-al-afasy-murattal-hafs-953',
        name: 'Mishari Rashid Al Afasy Murattal',
        type: 'surah-based',
        relativePath: '/recitations/surah-recitation-mishari-al-afasy',
        hasSegments: true
    },
    {
        id: 'ayah-recitation-mohamed-al-tablawi-recitation-murattal-hafs-73',
        name: 'Mohamed Al Tablawi Murattal',
        type: 'ayah-based',
        relativePath: '/recitations/ayah-recitation-mohamed-al-tablawi-recitation-murattal-hafs-73.json',
        hasSegments: true
    },
    {
        id: 'surah-recitation-muhammad-jibreel',
        name: 'Muhammad Jibreel',
        type: 'surah-based',
        relativePath: '/recitations/surah-recitation-muhammad-jibreel',
        hasSegments: true
    },
    {
        id: 'ayah-recitation-muhammad-siddiq-al-minshawi-murattal-hafs-959',
        name: 'Muhammad Siddiq Al Minshawi Murattal',
        type: 'surah-based',
        relativePath: '/recitations/surah-recitation-muhammad-siddiq-al-minshawy-murattal',
        hasSegments: true
    },
    {
        id: 'ayah-recitation-saad-al-ghamdi-murattal-hafs-954',
        name: 'Saad Al Ghamdi Murattal',
        type: 'ayah-based',
        relativePath: '/recitations/ayah-recitation-saad-al-ghamdi-murattal-hafs-954.json',
        hasSegments: true
    },
    {
        id: 'ayah-recitation-saud-al-shuraim-murattal-hafs-960',
        name: 'Saud Al Shuraim Murattal',
        type: 'surah-based',
        relativePath: '/recitations/surah-recitation-saud-al-shuraim',
        hasSegments: true
    },
    {
        id: 'ayah-recitation-yasser-al-dosari-murattal-hafs-961',
        name: 'Yasser Al Dosari Murattal',
        type: 'surah-based',
        relativePath: '/recitations/surah-recitation-yasser-al-dosari',
        hasSegments: true
    }
];

// Cache for loaded recitation data
const recitationCache: Record<string, any> = {};

export async function getReciters(): Promise<Reciter[]> {
    return ALLOWED_RECITERS;
}

export async function loadRecitationData(reciter: Reciter, surahId: number) {
    const cacheKey = reciter.type === 'surah-based'
        ? `${reciter.id}-${surahId}`
        : reciter.id;
    if (recitationCache[cacheKey]) return recitationCache[cacheKey];

    let data: any = {};

    try {
        if (reciter.type === 'surah-based') {
            const [surahRes, segmentsRes] = await Promise.all([
                fetch(`${reciter.relativePath}/surah.json`),
                fetch(`${reciter.relativePath}/segments.json`)
            ]);

            const [surahData, segmentsData] = await Promise.all([
                surahRes.json(),
                segmentsRes.json(),
            ]);

            // Normalize
            data = {
                surahId,
                surahNumber: surahData[surahId]?.surah_number,
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
            
            const res = await fetch(reciter.relativePath);
            const json = await res.json();
            
            // This is a huge map "1:1" -> { audio_url ... }
            data = {
                verses: json
            };
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
        if (
            typeof data.surahNumber === 'number' &&
            Number.isFinite(data.surahNumber) &&
            data.surahNumber !== surahId
        ) {
            console.error(`Recitation data mismatch for ${reciter.id}: requested surah ${surahId}, loaded ${data.surahNumber}`);
            return null;
        }
        
        const key = `${surahId}:${ayahId}`;
        const timing = data.timings?.[key];
        
        if (!timing) {
            // Fallback: play from start if no timing? No, that's bad.
            return null;
        }

        const toFiniteNumber = (value: unknown): number | null => {
            if (typeof value !== 'number' || !Number.isFinite(value)) return null;
            return value;
        };

        const getSegmentBounds = (segments: unknown): { start: number; end: number } | null => {
            if (!Array.isArray(segments) || segments.length === 0) return null;

            let minStart = Number.POSITIVE_INFINITY;
            let maxEnd = Number.NEGATIVE_INFINITY;

            for (const segment of segments) {
                if (!Array.isArray(segment)) continue;
                const start = toFiniteNumber(segment[1]);
                const end = toFiniteNumber(segment[2]);
                if (start === null || end === null) continue;
                if (end <= start) continue;
                if (start < minStart) minStart = start;
                if (end > maxEnd) maxEnd = end;
            }

            if (!Number.isFinite(minStart) || !Number.isFinite(maxEnd) || maxEnd <= minStart) return null;
            return { start: minStart, end: maxEnd };
        };

        const getTimingStart = (candidate: any): number | null => {
            const timestampFrom = toFiniteNumber(candidate?.timestamp_from);
            const segmentBounds = getSegmentBounds(candidate?.segments);
            const segmentStart = segmentBounds?.start ?? null;

            if (timestampFrom === null) return segmentStart;
            if (segmentStart === null) return timestampFrom;

            const delta = segmentStart - timestampFrom;

            // Some reciters have slightly late `timestamp_from` values that clip
            // the opening, while others include a short lead-in before speech.
            // Prefer the first segment when the difference is plausible, but
            // ignore extreme outliers from noisy segment imports.
            if (delta < 0 && Math.abs(delta) <= 1500) {
                return segmentStart;
            }

            if (delta > 200 && delta <= 2500) {
                return segmentStart;
            }

            return timestampFrom;
        };

        const getTimingEnd = (candidate: any): number | null => {
            const timestampTo = toFiniteNumber(candidate?.timestamp_to);
            if (timestampTo !== null) return timestampTo;
            const segmentBounds = getSegmentBounds(candidate?.segments);
            return segmentBounds?.end ?? null;
        };

        let startMs = getTimingStart(timing);
        let endMs = getTimingEnd(timing);

        // Some imported segment files have null/invalid first-ayah bounds.
        // Recover from nearby ayah timings so auto-advance and preview stay in sync.
        if (startMs === null || endMs === null || endMs <= startMs) {
            let previousEnd: number | null = null;
            let nextStart: number | null = null;

            for (let prevAyah = ayahId - 1; prevAyah >= 1; prevAyah--) {
                const prevTiming = data.timings?.[`${surahId}:${prevAyah}`];
                if (!prevTiming) continue;
                const candidateEnd = getTimingEnd(prevTiming);
                if (candidateEnd !== null) {
                    previousEnd = candidateEnd;
                    break;
                }
            }

            for (let nextAyah = ayahId + 1; nextAyah <= 286; nextAyah++) {
                const nextTiming = data.timings?.[`${surahId}:${nextAyah}`];
                if (!nextTiming) continue;
                const candidateStart = getTimingStart(nextTiming);
                if (candidateStart !== null) {
                    nextStart = candidateStart;
                    break;
                }
            }

            if (startMs === null) startMs = previousEnd ?? 0;
            if (endMs === null || endMs <= startMs) {
                if (nextStart !== null && nextStart > startMs) {
                    endMs = nextStart - 1;
                } else {
                    endMs = startMs + 2000;
                }
            }
        }

        return {
            url: data.audioUrl,
            startTime: startMs / 1000,
            endTime: endMs / 1000,
            segments: timing.segments
        };
    }
}
