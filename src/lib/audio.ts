
import { Verse } from './types';
import { clientEnv } from './env/client';

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

const AUDIO_PLAYER_RECITER_MODE = clientEnv.NEXT_PUBLIC_AUDIO_PLAYER_RECITER_MODE;

export const ALLOWED_RECITERS: Reciter[] = [
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
        id: 'ayah-recitation-abdur-rahman-as-sudais-recitation',
        name: 'Abdur Rahman As Sudais',
        type: 'ayah-based',
        relativePath: '/recitations/ayah-recitation-abdur-rahman-as-sudais-recitation.json',
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
        id: 'ayah-recitation-mahmoud-khalil-al-husary-murattal-hafs-957',
        name: 'Mahmoud Khalil Al Husary Murattal',
        type: 'ayah-based',
        relativePath: '/recitations/ayah-recitation-mahmoud-khalil-al-husary-murattal-hafs-957.json',
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

export async function getAudioPlayerReciters(): Promise<Reciter[]> {
    if (AUDIO_PLAYER_RECITER_MODE === 'ayah-only') {
        return ALLOWED_RECITERS.filter((reciter) => reciter.type === 'ayah-based');
    }
    return ALLOWED_RECITERS;
}

function getObsidianApp(appOverride?: any): any | null {
    try {
        const app = appOverride ?? (typeof window !== 'undefined' ? (window as any)?.app : null);
        return app?.vault?.adapter ? app : null;
    } catch { return null; }
}

function isObsidianEnv(appOverride?: any): boolean {
    return getObsidianApp(appOverride) !== null;
}

async function fetchViaObsidianRequestUrl(url: string, appOverride?: any): Promise<any | null> {
    if (!isObsidianEnv(appOverride)) return null;
    try {
        let req: any = null;
        try {
            const obs: any = await import('obsidian');
            req = obs.requestUrl;
        } catch {
            req = (window as any).requestUrl;
        }
        if (!req) return null;
        const res: any = await req({ url, method: 'GET', headers: { 'Accept': 'application/json' } });
        const status: number = typeof res.status === 'number' ? res.status : 0;
        if (status >= 200 && status < 300) {
            if (res.json !== undefined && res.json !== null) {
                // Obsidian requestUrl returns parsed json if content-type is json
                if (typeof res.json === 'object') return res.json;
                try { return JSON.parse(res.json); } catch {}
            }
            if (typeof res.text === 'string' && res.text.trim()) {
                try { return JSON.parse(res.text); } catch {}
            }
            if (res.arrayBuffer) {
                try {
                    const txt = new TextDecoder().decode(res.arrayBuffer);
                    if (txt.trim()) return JSON.parse(txt);
                } catch {}
            }
        }
    } catch {}
    return null;
}

async function fetchJsonWithObsidianFallback(urlPath: string, appOverride?: any): Promise<any | null> {
    // 1) Try normal fetch first (web)
    try {
        const res = await fetch(urlPath);
        if (res.ok) {
            const j = await res.json();
            return j;
        }
    } catch {}

    const app = getObsidianApp(appOverride);
    if (!app) return null;

    const adapter: any = app?.vault?.adapter;
    if (!adapter) return null;

    // Candidate vault paths to try
    const normalized = urlPath.startsWith('/') ? urlPath.slice(1) : urlPath;
    const candidates = [
        normalized, // e.g. recitations/.../surah.json
        `public/${normalized}`,
        `.obsidian/plugins/quran-life/${normalized}`,
        `.obsidian/plugins/quran-life/public/${normalized}`,
        `QuranLife/${normalized}`,
    ];
    // 2) Try direct vault adapter read (hidden-aware)
    for (const cand of candidates) {
        try {
            if (adapter.exists) {
                const exists = await adapter.exists(cand);
                if (!exists) continue;
            }
            const raw = await adapter.read(cand);
            if (raw && raw.trim()) {
                try { return JSON.parse(raw); } catch {}
            }
        } catch {}
    }
    // 3) Try via getResourcePath -> fetch app:// URL
    if (adapter.getResourcePath) {
        for (const cand of candidates) {
            try {
                const resourceUrl = adapter.getResourcePath(cand);
                if (!resourceUrl) continue;
                const res = await fetch(resourceUrl);
                if (res.ok) {
                    const j = await res.json();
                    return j;
                }
            } catch {}
        }
    }
    // 4) Final fallback: try absolute site URL (for Obsidian where local files not bundled)
    // Use Obsidian requestUrl to bypass CORS in Electron
    const siteBase = (typeof window !== 'undefined' && (window as any)?.location?.origin && !(window as any).location.origin.startsWith('app://') && !(window as any).location.origin.startsWith('capacitor://'))
        ? (window as any).location.origin
        : 'https://quran-life.org';
    const absolute = `${siteBase.replace(/\/$/, '')}${urlPath}`;
    // Try native fetch first (works in web, may fail in Obsidian due to CORS)
    try {
        const res = await fetch(absolute);
        if (res.ok) return await res.json();
    } catch {}
    // Fallback to Obsidian requestUrl (no CORS)
    const viaRequest = await fetchViaObsidianRequestUrl(absolute, app);
    if (viaRequest) return viaRequest;
    // Also try original urlPath via requestUrl (in case urlPath already absolute or same-origin)
    const viaOriginal = await fetchViaObsidianRequestUrl(urlPath, app);
    if (viaOriginal) return viaOriginal;
    return null;
}

export async function loadRecitationData(reciter: Reciter, surahId: number, appOverride?: any) {
    const cacheKey = reciter.type === 'surah-based'
        ? `${reciter.id}-${surahId}`
        : reciter.id;
    if (recitationCache[cacheKey]) return recitationCache[cacheKey];

    let data: any = {};

    try {
        if (reciter.type === 'surah-based') {
            const [surahData, segmentsData] = await Promise.all([
                fetchJsonWithObsidianFallback(`${reciter.relativePath}/surah.json`, appOverride),
                fetchJsonWithObsidianFallback(`${reciter.relativePath}/segments.json`, appOverride)
            ]);

            if (!surahData) throw new Error(`surah.json not found for ${reciter.id}`);

            // Normalize — segments may be null in Obsidian if file missing, but allow playback without word timing
            data = {
                surahId,
                surahNumber: surahData[surahId]?.surah_number ?? surahId,
                audioUrl: surahData[surahId]?.audio_url,
                timings: segmentsData || {} // Keyed by "Surah:Ayah" — may be empty, getAudioInfo will fallback
            };
            if (!data.audioUrl) {
                // Some reciters use different structure — try alternative
                const alt = surahData[surahId] || surahData[String(surahId)];
                if (alt?.audio_url) data.audioUrl = alt.audio_url;
            }
        } else {
            const json = await fetchJsonWithObsidianFallback(reciter.relativePath, appOverride);
            if (!json) throw new Error(`recitation json not found for ${reciter.id}`);
            
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

const audioBlobUrlCache = new Map<string, string>();

function toArrayBuffer(value: unknown): ArrayBuffer | null {
    if (value instanceof ArrayBuffer) return value;
    if (ArrayBuffer.isView(value)) {
        const view = value as ArrayBufferView;
        return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
    }
    return null;
}

export async function resolveAudioUrl(url: string, appOverride?: any): Promise<string> {
    if (!url) return url;
    if (!isObsidianEnv(appOverride)) return url;
    // Only proxy tarteel CDN which lacks CORS; quranicaudio already has CORS
    const needsProxy = url.includes('audio-cdn.tarteel.ai') || url.includes('tarteel');
    if (!needsProxy) return url;
    if (audioBlobUrlCache.has(url)) return audioBlobUrlCache.get(url)!;
    try {
        let req: any = null;
        try {
            const obs: any = await import('obsidian');
            req = obs.requestUrl;
        } catch {
            req = (window as any).requestUrl;
        }
        if (!req) return url;
        const res: any = await req({ url, method: 'GET' });
        // Obsidian requestUrl returns arrayBuffer for binary
        const responseBuffer = typeof res.arrayBuffer === 'function' ? await res.arrayBuffer() : res.arrayBuffer;
        let buf: ArrayBuffer | null = toArrayBuffer(responseBuffer) ?? toArrayBuffer(res.body);
        if (!buf || buf.byteLength === 0) return url;
        const blob = new Blob([buf], { type: 'audio/mpeg' });
        const blobUrl = URL.createObjectURL(blob);
        audioBlobUrlCache.set(url, blobUrl);
        return blobUrl;
    } catch (e) {
        console.warn('resolveAudioUrl failed, falling back to direct url', url, e);
        return url;
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
            // Obsidian fallback: if segments.json missing or timing not found, still allow playback of whole surah file.
            // This keeps play button enabled; word highlight will be disabled (no segments) but audio will work.
            if (data.audioUrl) {
                return { url: data.audioUrl, segments: null as any };
            }
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
