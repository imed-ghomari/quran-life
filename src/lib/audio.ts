
import { clientEnv } from './env/client';
import { getObsidianApp, getVaultConfigDir, isObsidianEnv } from './obsidianApp';
import type { App } from 'obsidian';

/**
 * Typed subset of the Obsidian vault adapter surface consumed in this file.
 * Extracted once via `as unknown as VaultFiles | undefined` at each use site
 * (documented cast) so all adapter calls below are fully typed.
 */
interface VaultFiles {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  readBinary(path: string): Promise<ArrayBuffer>;
  write(path: string, data: string): Promise<void>;
  writeBinary(path: string, data: ArrayBuffer): Promise<void>;
  mkdir(path: string): Promise<void>;
  remove(path: string): Promise<void>;
  list(path: string): Promise<{ files: string[]; folders: string[] }>;
  getResourcePath(path: string): string;
  stat(path: string): Promise<{ size?: number } | null>;
}

/** Shape of Obsidian `requestUrl` JSON responses as consumed in this file. */
interface ObsidianJsonResponse {
  status?: number;
  json?: unknown;
  text?: string;
  arrayBuffer?: ArrayBuffer | (() => Promise<ArrayBuffer>) | Uint8Array;
  body?: unknown;
}

interface ObsidianRequestOptions {
  url: string;
  method?: string;
  headers?: Record<string, string>;
}

type ObsidianRequestFn = (opts: ObsidianRequestOptions) => Promise<ObsidianJsonResponse>;

interface ObsidianRequestModule {
  requestUrl?: ObsidianRequestFn;
}

interface WindowWithRequestUrl {
  requestUrl?: ObsidianRequestFn;
}

/** Normalized recitation payload cached per reciter (and per surah for surah-based). */
interface RecitationData {
  surahId?: number;
  surahNumber?: number;
  audioUrl?: string;
  timings?: Record<string, unknown>;
  verses?: Record<string, unknown>;
  fromSegmentsCache?: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isNumberMatrix(value: unknown): value is number[][] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (row): row is number[] =>
        Array.isArray(row) && row.every((n) => typeof n === 'number' && Number.isFinite(n)),
    )
  );
}

export interface Reciter {
    id: string;
    name: string;
    type: 'surah-based' | 'ayah-based';
    relativePath: string;
    hasSegments?: boolean;
    /**
     * Ayah-based reciters publish one file per ayah named `<SSS><AAA>.mp3`
     * (3-digit zero-padded surah + 3-digit zero-padded ayah). Keeping the base
     * URL on the reciter lets us resolve a playable/downloadable URL without
     * loading the ~2-6MB `verses` map first — which is what made downloads fail
     * on mobile ("Failed to load ayah recitation map") and delayed every verse
     * handoff by a full metadata fetch.
     * Verified against every entry in `public/recitations/*.json` (6236/6236).
     */
    ayahAudioBase?: string;
}

/** Build the canonical per-ayah audio URL for an ayah-based reciter. */
export function buildAyahAudioUrl(reciter: Reciter | null | undefined, surahId: number, ayahId: number): string | null {
    const base = reciter?.ayahAudioBase;
    if (!base) return null;
    const file = `${String(surahId).padStart(3, '0')}${String(ayahId).padStart(3, '0')}.mp3`;
    return `${base.replace(/\/$/, '')}/${file}`;
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
        hasSegments: true,
        ayahAudioBase: 'https://audio-cdn.tarteel.ai/quran/abdulBasitMurattal'
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
        hasSegments: true,
        ayahAudioBase: 'https://audio.qurancdn.com/Sudais/mp3'
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
        hasSegments: true,
        ayahAudioBase: 'https://audio.qurancdn.com/Rifai/mp3'
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
        hasSegments: true,
        ayahAudioBase: 'https://audio-cdn.tarteel.ai/quran/husary'
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
        hasSegments: true,
        ayahAudioBase: 'https://mirrors.quranicaudio.com/everyayah/Mohammad_al_Tablaway_128kbps'
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
        hasSegments: true,
        ayahAudioBase: 'https://audio-cdn.tarteel.ai/quran/ghamadi'
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
const recitationCache: Record<string, RecitationData> = {};

export async function getReciters(): Promise<Reciter[]> {
    return ALLOWED_RECITERS;
}

export async function getAudioPlayerReciters(): Promise<Reciter[]> {
    if (AUDIO_PLAYER_RECITER_MODE === 'ayah-only') {
        return ALLOWED_RECITERS.filter((reciter) => reciter.type === 'ayah-based');
    }
    return ALLOWED_RECITERS;
}


async function fetchViaObsidianRequestUrl(url: string, appOverride?: App | null): Promise<Record<string, unknown> | null> {
    if (!isObsidianEnv(appOverride)) return null;
    try {
        let req: ObsidianRequestFn | null = null;
        try {
            const obs = (await import('obsidian')) as unknown as ObsidianRequestModule;
            req = obs.requestUrl ?? null;
        } catch {
            req = (window as unknown as WindowWithRequestUrl).requestUrl ?? null;
        }
        if (!req) return null;
        // requestUrl has no abort support — race a timeout so a dead network
        // can never leave the player hanging forever.
        const res = await Promise.race([
            req({ url, method: 'GET', headers: { 'Accept': 'application/json' } }),
            new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('requestUrl timeout')), 15000)),
        ]);
        const status: number = typeof res.status === 'number' ? res.status : 0;
        if (status >= 200 && status < 300) {
            if (res.json !== undefined && res.json !== null) {
                // Obsidian requestUrl returns parsed json if content-type is json
                if (typeof res.json === 'object') {
                    const rec = asRecord(res.json);
                    if (rec) return rec;
                } else if (typeof res.json === 'string' && res.json.trim()) {
                    try {
                        const parsed: unknown = JSON.parse(res.json);
                        const rec = asRecord(parsed);
                        if (rec) return rec;
                    } catch { /* best-effort only; ignore */ }
                }
            }
            if (typeof res.text === 'string' && res.text.trim()) {
                try {
                    const parsed: unknown = JSON.parse(res.text);
                    const rec = asRecord(parsed);
                    if (rec) return rec;
                } catch { /* best-effort only; ignore */ }
            }
            if (res.arrayBuffer) {
                try {
                    const raw = typeof res.arrayBuffer === 'function' ? await res.arrayBuffer() : res.arrayBuffer;
                    if (raw instanceof ArrayBuffer || raw instanceof Uint8Array) {
                        const txt = new TextDecoder().decode(raw);
                        if (txt.trim()) {
                            const parsed: unknown = JSON.parse(txt);
                            const rec = asRecord(parsed);
                            if (rec) return rec;
                        }
                    }
                } catch { /* best-effort only; ignore */ }
            }
        }
    } catch { /* best-effort only; ignore */ }
    return null;
}

const RECITATION_SITE_BASES = ['https://quran-life.org'];

/**
 * Resolve a bundled/public JSON (recitations, segments…) from whichever source
 * the current platform can actually reach:
 *   1. vault files (desktop bundle + Resilio-synced copies) — works offline,
 *   2. remote site via Obsidian `requestUrl` — the only CORS-free path on mobile,
 *   3. plain `fetch` — web build and same-origin cases.
 * Previously the remote step ran only for Electron/desktop because
 * `isObsidianEnv` relied on `window.app`, which mobile does not provide.
 */

// JSON fetch with a hard timeout: without this a stalled network leaves the
// player spinner hanging forever (offline + no cached metadata). Timeouts
// reject so callers fall through to the next source / graceful error.
async function fetchJsonWithTimeout(url: string, timeoutMs = 12000): Promise<Record<string, unknown> | null> {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? window.setTimeout(() => { try { ctrl.abort(); } catch { /* best-effort only; ignore */ } }, timeoutMs) : null;
    try {
        const res = await fetch(url, { signal: ctrl?.signal });
        if (!res.ok) return null;
        try {
            const parsed: unknown = (await res.json()) as unknown;
            return asRecord(parsed);
        } catch { return null; }
    } catch {
        return null;
    } finally {
        if (timer) window.clearTimeout(timer);
    }
}
async function fetchJsonWithObsidianFallback(urlPath: string, appOverride?: App | null): Promise<Record<string, unknown> | null> {
    const app = getObsidianApp(appOverride);
    const usesPublicOrigin = /^https?:\/\//i.test(urlPath);

    if (app) {
        // Documented cast: the only `unknown -> typed` boundary for the vault
        // adapter in this scope; every adapter call below is typed.
        const adapter = app?.vault?.adapter as unknown as VaultFiles | undefined;
        if (adapter) {
            const normalized = urlPath.replace(/^https?:\/\/[^/]+/i, '').replace(/^\//, '');
            const configDir = getVaultConfigDir(app);
            const pluginDir = configDir ? `${configDir}/plugins/quran-life` : null;
            const candidates = [
                normalized, // e.g. recitations/.../surah.json
                `public/${normalized}`,
                pluginDir ? `${pluginDir}/${normalized}` : null,
                pluginDir ? `${pluginDir}/public/${normalized}` : null,
                `QuranLife/${normalized}`,
            ].filter((c): c is string => typeof c === 'string' && c.length > 0);
            // 1) direct vault adapter read (hidden-aware)
            for (const cand of candidates) {
                try {
                    if (adapter.exists && !(await adapter.exists(cand))) continue;
                    const raw = await adapter.read(cand);
                    if (raw && raw.trim()) {
                        try {
                            const parsed: unknown = JSON.parse(raw);
                            const rec = asRecord(parsed);
                            if (rec) return rec;
                        } catch { /* best-effort only; ignore */ }
                    }
                } catch { /* best-effort only; ignore */ }
            }
            // 2) via getResourcePath -> app:// URL
            if (adapter.getResourcePath) {
                for (const cand of candidates) {
                    try {
                        const resourceUrl = adapter.getResourcePath(cand);
                        if (!resourceUrl) continue;
                        const data = await fetchJsonWithTimeout(resourceUrl);
                        if (data) return data;
                    } catch { /* best-effort only; ignore */ }
                }
            }
        }
    }

    // 3) remote — requestUrl bypasses CORS, which plain fetch cannot do from the
    // Obsidian WebView (mobile included).
    if (app) {
        const remoteTargets = usesPublicOrigin
            ? [urlPath]
            : RECITATION_SITE_BASES.map((base) => `${base.replace(/\/$/, '')}${urlPath}`);
        for (const target of remoteTargets) {
            const viaRequest = await fetchViaObsidianRequestUrl(target, app);
            if (viaRequest) return viaRequest;
        }
    }

    // 4) plain fetch (web build / already-absolute same-origin paths)
    const fetchTargets = usesPublicOrigin
        ? [urlPath]
        : RECITATION_SITE_BASES.map((base) => `${base.replace(/\/$/, '')}${urlPath}`);
    fetchTargets.push(urlPath);
    for (const target of fetchTargets) {
        // Skip cross-origin plain fetch inside Obsidian: without CORS it fails
        // anyway, and on a dead network it is the slowest hang — requestUrl
        // above is the supported path there.
        if (app && /^https?:\/\//i.test(target)) continue;
        const data = await fetchJsonWithTimeout(target);
        if (data) return data;
    }
    return null;
}

// ---------- recitation metadata cache (plugin-provided, vault-backed) ----------
// Ayah-based metadata is a ~2MB map whose `segments` tables are what drive word
// highlighting. Mobile cannot always fetch it (offline / CORS / big download),
// so the plugin registers a small store here and we persist a compact
// `{ "s: a": segments }` slice once it has been fetched. Offline playback can
// then still highlight the exact words the reciter is reciting.
export interface RecitationCacheStore {
    read: (reciterId: string) => Promise<{ segments?: Record<string, number[][]> } | null>;
    write: (reciterId: string, data: { segments: Record<string, number[][]> }) => Promise<void>;
}

let recitationCacheStore: RecitationCacheStore | null = null;
export function registerRecitationCacheStore(store: RecitationCacheStore | null): void {
    recitationCacheStore = store;
}

const segmentsMemoryCache: Record<string, Record<string, number[][]> | null> = {};

function extractSegmentsMap(json: Record<string, unknown>): Record<string, number[][]> {
    const out: Record<string, number[][]> = {};
    for (const [key, value] of Object.entries(json || {})) {
        const rec = asRecord(value);
        const segments: unknown = rec?.segments;
        if (isNumberMatrix(segments)) out[key] = segments;
    }
    return out;
}

async function loadCachedSegments(reciterId: string): Promise<Record<string, number[][]> | null> {
    if (reciterId in segmentsMemoryCache) return segmentsMemoryCache[reciterId];
    if (!recitationCacheStore) return null;
    try {
        const stored = await recitationCacheStore.read(reciterId);
        const segments = stored?.segments && typeof stored.segments === 'object' ? stored.segments : null;
        segmentsMemoryCache[reciterId] = segments;
        return segments;
    } catch {
        segmentsMemoryCache[reciterId] = null;
        return null;
    }
}

function persistSegments(reciterId: string, json: Record<string, unknown>): void {
    if (!recitationCacheStore || segmentsMemoryCache[reciterId]) return;
    const segments = extractSegmentsMap(json);
    if (!Object.keys(segments).length) return;
    segmentsMemoryCache[reciterId] = segments;
    void Promise.resolve(recitationCacheStore.write(reciterId, { segments })).catch(() => {
        segmentsMemoryCache[reciterId] = null;
    });
}

/** Build ayah `verses` entries from cached segments + the reciter's URL pattern. */
function buildVersesFromSegments(reciter: Reciter, segments: Record<string, number[][]>): Record<string, { audio_url: string; segments?: number[][] }> {
    const verses: Record<string, { audio_url: string; segments?: number[][] }> = {};
    for (const [key, segs] of Object.entries(segments)) {
        const [surahId, ayahId] = key.split(':').map(Number);
        if (!Number.isFinite(surahId) || !Number.isFinite(ayahId)) continue;
        const url = buildAyahAudioUrl(reciter, surahId, ayahId);
        if (!url) continue;
        verses[key] = { audio_url: url, segments: segs };
    }
    return verses;
}

export async function loadRecitationData(reciter: Reciter, surahId: number, appOverride?: App | null): Promise<RecitationData | null> {
    const cacheKey = reciter.type === 'surah-based'
        ? `${reciter.id}-${surahId}`
        : reciter.id;
    if (recitationCache[cacheKey]) return recitationCache[cacheKey];

    let data: RecitationData = {};

    try {
        if (reciter.type === 'surah-based') {
            const [surahData, segmentsData] = await Promise.all([
                fetchJsonWithObsidianFallback(`${reciter.relativePath}/surah.json`, appOverride),
                fetchJsonWithObsidianFallback(`${reciter.relativePath}/segments.json`, appOverride)
            ]);

            if (!surahData) throw new Error(`surah.json not found for ${reciter.id}`);

            const surahEntry = asRecord(surahData[surahId] ?? surahData[String(surahId)]);
            const surahNumberRaw: unknown = surahEntry?.surah_number;
            // Normalize — segments may be null in Obsidian if file missing, but allow playback without word timing
            data = {
                surahId,
                surahNumber: typeof surahNumberRaw === 'number' && Number.isFinite(surahNumberRaw) ? surahNumberRaw : surahId,
                audioUrl: typeof surahEntry?.audio_url === 'string' ? surahEntry.audio_url : undefined,
                timings: segmentsData || {} // Keyed by "Surah:Ayah" — may be empty, getAudioInfo will fallback
            };
            if (!data.audioUrl) {
                // Some reciters use different structure — try alternative
                const alt = asRecord(surahData[surahId] ?? surahData[String(surahId)]);
                if (typeof alt?.audio_url === 'string') data.audioUrl = alt.audio_url;
            }
        } else {
            const json = await fetchJsonWithObsidianFallback(reciter.relativePath, appOverride);
            if (!json) {
                // Offline / failed fetch: fall back to cached segments + URL pattern
                // so playback, surah transitions and word highlighting keep working.
                const cached = await loadCachedSegments(reciter.id);
                if (cached) {
                    data = { verses: buildVersesFromSegments(reciter, cached), fromSegmentsCache: true };
                    recitationCache[cacheKey] = data;
                    return data;
                }
                throw new Error(`recitation json not found for ${reciter.id}`);
            }

            // This is a huge map "1:1" -> { audio_url ... }
            // Persist the segments slice (best-effort, off the hot path) so the
            // next offline session can still follow the reciter word by word.
            persistSegments(reciter.id, json);
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
        const view = value;
        return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
    }
    return null;
}

/**
 * Hosts verified to serve audio with `access-control-allow-origin: *` AND
 * `accept-ranges: bytes` (tarteel CDN, quran.qurancdn.com, quranicaudio mirrors).
 * These stream directly: playback starts on the first bytes instead of waiting
 * for `requestUrl` to download the whole file into a Blob, which is what added a
 * multi-hundred-millisecond gap between every verse on mobile.
 */
const DIRECT_AUDIO_HOSTS = [
    'audio-cdn.tarteel.ai',
    'audio.qurancdn.com',
    'mirrors.quranicaudio.com',
    'download.quranicaudio.com',
    'everyayah.com',
    'verses.quran.com',
];

export function audioHostAllowsDirectPlayback(url: string): boolean {
    return DIRECT_AUDIO_HOSTS.some((host) => url.includes(host));
}

/** Force the CORS-free `requestUrl` → Blob path (used as an error fallback). */
export async function resolveAudioUrlProxied(url: string, appOverride?: App | null): Promise<string> {
    if (!url) return url;
    if (!isObsidianEnv(appOverride)) return url;
    if (audioBlobUrlCache.has(url)) return audioBlobUrlCache.get(url)!;
    try {
        let req: ObsidianRequestFn | null = null;
        try {
            const obs = (await import('obsidian')) as unknown as ObsidianRequestModule;
            req = obs.requestUrl ?? null;
        } catch {
            req = (window as unknown as WindowWithRequestUrl).requestUrl ?? null;
        }
        if (!req) return url;
        // Full-file download via requestUrl — generous timeout (slow networks
        // are real) but never unbounded, so playback can't hang forever.
        const res: ObsidianJsonResponse = await Promise.race([
            req({ url, method: 'GET' }),
            new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('audio download timeout')), 120000)),
        ]);
        const responseBuffer = typeof res.arrayBuffer === 'function' ? await res.arrayBuffer() : res.arrayBuffer;
        const buf: ArrayBuffer | null = toArrayBuffer(responseBuffer) ?? toArrayBuffer(res.body);
        if (!buf || buf.byteLength === 0) return url;
        const blob = new Blob([buf], { type: 'audio/mpeg' });
        const blobUrl = URL.createObjectURL(blob);
        audioBlobUrlCache.set(url, blobUrl);
        return blobUrl;
    } catch (e) {
        console.warn('resolveAudioUrlProxied failed, falling back to direct url', url, e);
        return url;
    }
}

export async function resolveAudioUrl(url: string, appOverride?: App | null): Promise<string> {
    if (!url) return url;
    if (!isObsidianEnv(appOverride)) return url;
    // Media elements load cross-origin without a CORS check, and these hosts
    // support range requests — play them straight from the CDN.
    if (audioHostAllowsDirectPlayback(url)) return url;
    // Unknown host: proxy through requestUrl so playback never depends on CORS.
    return resolveAudioUrlProxied(url, appOverride);
}

export function getAudioInfoForVerse(
    reciter: Reciter,
    data: RecitationData | null | undefined,
    surahId: number,
    ayahId: number
): { url: string; startTime?: number; endTime?: number; segments?: number[][] | null } | null {
    if (reciter.type === 'ayah-based') {
        const key = `${surahId}:${ayahId}`;
        const verseData = asRecord(data?.verses?.[key]);
        const verseAudioUrl: unknown = verseData?.audio_url;
        const verseSegments: unknown = verseData?.segments;
        if (typeof verseAudioUrl === 'string' && verseAudioUrl) {
            return {
                url: verseAudioUrl,
                segments: isNumberMatrix(verseSegments) ? verseSegments : undefined,
            };
        }
        // Metadata (the large `verses` map) may be unavailable — offline, or the
        // mobile fetch has not resolved yet. The per-ayah URL is deterministic,
        // so resolve it directly instead of declaring the verse unplayable.
        const derived = buildAyahAudioUrl(reciter, surahId, ayahId);
        if (derived) return { url: derived, segments: undefined };
        return null;
    }

    if (!data) return null;

    {
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
                return { url: data.audioUrl, segments: null };
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

        const getTimingStart = (candidate: unknown): number | null => {
            const candidateRec = asRecord(candidate);
            const timestampFrom = toFiniteNumber(candidateRec?.timestamp_from);
            const segmentBounds = getSegmentBounds(candidateRec?.segments);
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

        const getTimingEnd = (candidate: unknown): number | null => {
            const candidateRec = asRecord(candidate);
            const timestampTo = toFiniteNumber(candidateRec?.timestamp_to);
            if (timestampTo !== null) return timestampTo;
            const segmentBounds = getSegmentBounds(candidateRec?.segments);
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

        const timingSegments: unknown = asRecord(timing)?.segments;
        return {
            url: data.audioUrl,
            startTime: startMs / 1000,
            endTime: endMs / 1000,
            segments: isNumberMatrix(timingSegments) ? timingSegments : undefined
        };
    }
}
