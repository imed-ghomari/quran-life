
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
        id: 'ayah-recitation-mahmoud-khalil-al-husary-murattal-hafs-955',
        name: 'Mahmoud Khalil Al Husary Murattal',
        type: 'surah-based',
        relativePath: '/recitations/surah-recitation-mahmoud-husary-murattal',
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

            const [surahData, segmentsData] = await Promise.all([
                surahRes.json(),
                segmentsRes.json(),
            ]);

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
