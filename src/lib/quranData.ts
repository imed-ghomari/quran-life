// ========================================
// Qur'an data with app-specific active-part ranges
// ========================================

import { Surah, Verse, QuranPart, CoreQuranPart, ALL_QURAN_PART } from './types';
import { getObsidianApp, pluginPublishDir } from './obsidianApp';
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

/** Shape of Obsidian `requestUrl` text responses as consumed in this file. */
interface ObsidianTextResponse {
  status?: number;
  text?: unknown;
  arrayBuffer?: ArrayBuffer | (() => Promise<ArrayBuffer>) | Uint8Array;
  body?: unknown;
}

interface ObsidianRequestOptions {
  url: string;
  method?: string;
}

type ObsidianRequestFn = (opts: ObsidianRequestOptions) => Promise<ObsidianTextResponse>;

interface ObsidianRequestModule {
  requestUrl?: ObsidianRequestFn;
}

interface WindowWithRequestUrl {
  requestUrl?: ObsidianRequestFn;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

// Progress callback for the one-time Quran corpus download. Called ONLY when
// an actual network download happens (vault/session reads are silent).
// `totalBytes` is null when the transport can't report length.
export type QuranDownloadProgress = (downloadedBytes: number, totalBytes: number | null) => void;

// Download a text asset with streamed byte progress + hard timeout. Prefers
// Obsidian `requestUrl` (CORS-free from the app:// origin, no progress
// available → reports indeterminate) with progress-reporting fetch fallback.
async function downloadTextWithProgress(
  url: string,
  app: App | null,
  timeoutMs: number,
  onProgress?: QuranDownloadProgress
): Promise<string> {
  try {
    let req: ObsidianRequestFn | null = null;
    try {
      const obs = (await import('obsidian')) as unknown as ObsidianRequestModule;
      req = obs.requestUrl ?? null;
    } catch {
      req = (typeof window !== 'undefined' && (window as unknown as WindowWithRequestUrl).requestUrl) || null;
    }
    if (req) {
      onProgress?.(0, null);
      const res: ObsidianTextResponse = await Promise.race([
        req({ url, method: 'GET' }),
        new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('requestUrl timeout')), timeoutMs)),
      ]);
      if (typeof res.text === 'string' && res.text) {
        onProgress?.(res.text.length, res.text.length);
        return res.text;
      }
      if (res.arrayBuffer) {
        const rawBuf: unknown = typeof res.arrayBuffer === 'function' ? await res.arrayBuffer() : res.arrayBuffer;
        if (rawBuf instanceof ArrayBuffer || rawBuf instanceof Uint8Array) {
          const text = new TextDecoder().decode(rawBuf);
          onProgress?.(text.length, text.length);
          return text;
        }
      }
    }
  } catch {
    // fall through to fetch
  }
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? window.setTimeout(() => { try { ctrl.abort(); } catch { /* best-effort only; ignore */ } }, timeoutMs) : null;
  try {
    const res = await fetch(url, { signal: ctrl?.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const total = Number(res.headers.get('content-length')) || null;
    if (!res.body || typeof res.body.getReader !== 'function') {
      const text = await res.text();
      onProgress?.(text.length, total ?? text.length);
      return text;
    }
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    onProgress?.(0, total);
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        loaded += value.byteLength;
        onProgress?.(loaded, total);
      }
    }
    try { reader.releaseLock(); } catch { /* best-effort only; ignore */ }
    const merged = new Uint8Array(loaded);
    let off = 0;
    for (const c of chunks) {
      merged.set(c, off);
      off += c.byteLength;
    }
    return new TextDecoder().decode(merged);
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}

// Persist text into the vault best-effort (creates parent folders). Used to
// cache release-asset downloads so they happen exactly once.
async function persistTextToVault(app: App | null, filePath: string, text: string): Promise<void> {
    // Documented cast: the only `unknown` -> typed boundary for the vault
    // adapter in this scope; every adapter call below is typed.
    const adapter = app?.vault?.adapter as unknown as VaultFiles | undefined;
    if (!adapter) throw new Error('No vault adapter');
    const dir = (() => { const i = filePath.lastIndexOf("/"); return i < 0 ? "" : filePath.slice(0, i); })();
    if (dir && adapter.mkdir) {
        const parts = dir.split('/');
        let cur = '';
        for (const part of parts) {
            cur = cur ? `${cur}/${part}` : part;
            try {
                if (adapter.exists && (await adapter.exists(cur))) continue;
                await adapter.mkdir(cur);
            } catch { /* best-effort only; ignore */ }
        }
    }
    if (adapter.write) {
        await adapter.write(filePath, text);
        return;
    }
    throw new Error('Vault adapter cannot write');
}

// Helper to determine part based on surah ID
function getPart(surahId: number): CoreQuranPart {
    if (surahId >= 1 && surahId <= 5) return 1;
    if (surahId >= 6 && surahId <= 9) return 2;
    if (surahId >= 10 && surahId <= 24) return 3;
    if (surahId >= 25 && surahId <= 33) return 4;
    if (surahId >= 34 && surahId <= 49) return 5;
    if (surahId >= 50 && surahId <= 66) return 6;
    return 7; // 67-114
}

// Complete Surah metadata (114 surahs)
export const SURAHS: Surah[] = [
    { id: 1, name: 'Al-Fatiha', arabicName: 'الفاتحة', verseCount: 7, part: getPart(1) },
    { id: 2, name: 'Al-Baqarah', arabicName: 'البقرة', verseCount: 286, part: getPart(2) },
    { id: 3, name: 'Aal-Imran', arabicName: 'آل عمران', verseCount: 200, part: getPart(3) },
    { id: 4, name: 'An-Nisa', arabicName: 'النساء', verseCount: 176, part: getPart(4) },
    { id: 5, name: 'Al-Maidah', arabicName: 'المائدة', verseCount: 120, part: getPart(5) },
    { id: 6, name: 'Al-Anam', arabicName: 'الأنعام', verseCount: 165, part: getPart(6) },
    { id: 7, name: 'Al-Araf', arabicName: 'الأعراف', verseCount: 206, part: getPart(7) },
    { id: 8, name: 'Al-Anfal', arabicName: 'الأنفال', verseCount: 75, part: getPart(8) },
    { id: 9, name: 'At-Tawbah', arabicName: 'التوبة', verseCount: 129, part: getPart(9) },
    { id: 10, name: 'Yunus', arabicName: 'يونس', verseCount: 109, part: getPart(10) },
    { id: 11, name: 'Hud', arabicName: 'هود', verseCount: 123, part: getPart(11) },
    { id: 12, name: 'Yusuf', arabicName: 'يوسف', verseCount: 111, part: getPart(12) },
    { id: 13, name: 'Ar-Rad', arabicName: 'الرعد', verseCount: 43, part: getPart(13) },
    { id: 14, name: 'Ibrahim', arabicName: 'إبراهيم', verseCount: 52, part: getPart(14) },
    { id: 15, name: 'Al-Hijr', arabicName: 'الحجر', verseCount: 99, part: getPart(15) },
    { id: 16, name: 'An-Nahl', arabicName: 'النحل', verseCount: 128, part: getPart(16) },
    { id: 17, name: 'Al-Isra', arabicName: 'الإسراء', verseCount: 111, part: getPart(17) },
    { id: 18, name: 'Al-Kahf', arabicName: 'الكهف', verseCount: 110, part: getPart(18) },
    { id: 19, name: 'Maryam', arabicName: 'مريم', verseCount: 98, part: getPart(19) },
    { id: 20, name: 'Ta-Ha', arabicName: 'طه', verseCount: 135, part: getPart(20) },
    { id: 21, name: 'Al-Anbiya', arabicName: 'الأنبياء', verseCount: 112, part: getPart(21) },
    { id: 22, name: 'Al-Hajj', arabicName: 'الحج', verseCount: 78, part: getPart(22) },
    { id: 23, name: 'Al-Muminun', arabicName: 'المؤمنون', verseCount: 118, part: getPart(23) },
    { id: 24, name: 'An-Nur', arabicName: 'النور', verseCount: 64, part: getPart(24) },
    { id: 25, name: 'Al-Furqan', arabicName: 'الفرقان', verseCount: 77, part: getPart(25) },
    { id: 26, name: 'Ash-Shuara', arabicName: 'الشعراء', verseCount: 227, part: getPart(26) },
    { id: 27, name: 'An-Naml', arabicName: 'النمل', verseCount: 93, part: getPart(27) },
    { id: 28, name: 'Al-Qasas', arabicName: 'القصص', verseCount: 88, part: getPart(28) },
    { id: 29, name: 'Al-Ankabut', arabicName: 'العنكبوت', verseCount: 69, part: getPart(29) },
    { id: 30, name: 'Ar-Rum', arabicName: 'الروم', verseCount: 60, part: getPart(30) },
    { id: 31, name: 'Luqman', arabicName: 'لقمان', verseCount: 34, part: getPart(31) },
    { id: 32, name: 'As-Sajdah', arabicName: 'السجدة', verseCount: 30, part: getPart(32) },
    { id: 33, name: 'Al-Ahzab', arabicName: 'الأحزاب', verseCount: 73, part: getPart(33) },
    { id: 34, name: 'Saba', arabicName: 'سبأ', verseCount: 54, part: getPart(34) },
    { id: 35, name: 'Fatir', arabicName: 'فاطر', verseCount: 45, part: getPart(35) },
    { id: 36, name: 'Ya-Sin', arabicName: 'يس', verseCount: 83, part: getPart(36) },
    { id: 37, name: 'As-Saffat', arabicName: 'الصافات', verseCount: 182, part: getPart(37) },
    { id: 38, name: 'Sad', arabicName: 'ص', verseCount: 88, part: getPart(38) },
    { id: 39, name: 'Az-Zumar', arabicName: 'الزمر', verseCount: 75, part: getPart(39) },
    { id: 40, name: 'Ghafir', arabicName: 'غافر', verseCount: 85, part: getPart(40) },
    { id: 41, name: 'Fussilat', arabicName: 'فصلت', verseCount: 54, part: getPart(41) },
    { id: 42, name: 'Ash-Shura', arabicName: 'الشورى', verseCount: 53, part: getPart(42) },
    { id: 43, name: 'Az-Zukhruf', arabicName: 'الزخرف', verseCount: 89, part: getPart(43) },
    { id: 44, name: 'Ad-Dukhan', arabicName: 'الدخان', verseCount: 59, part: getPart(44) },
    { id: 45, name: 'Al-Jathiyah', arabicName: 'الجاثية', verseCount: 37, part: getPart(45) },
    { id: 46, name: 'Al-Ahqaf', arabicName: 'الأحقاف', verseCount: 35, part: getPart(46) },
    { id: 47, name: 'Muhammad', arabicName: 'محمد', verseCount: 38, part: getPart(47) },
    { id: 48, name: 'Al-Fath', arabicName: 'الفتح', verseCount: 29, part: getPart(48) },
    { id: 49, name: 'Al-Hujurat', arabicName: 'الحجرات', verseCount: 18, part: getPart(49) },
    { id: 50, name: 'Qaf', arabicName: 'ق', verseCount: 45, part: getPart(50) },
    { id: 51, name: 'Adh-Dhariyat', arabicName: 'الذاريات', verseCount: 60, part: getPart(51) },
    { id: 52, name: 'At-Tur', arabicName: 'الطور', verseCount: 49, part: getPart(52) },
    { id: 53, name: 'An-Najm', arabicName: 'النجم', verseCount: 62, part: getPart(53) },
    { id: 54, name: 'Al-Qamar', arabicName: 'القمر', verseCount: 55, part: getPart(54) },
    { id: 55, name: 'Ar-Rahman', arabicName: 'الرحمن', verseCount: 78, part: getPart(55) },
    { id: 56, name: 'Al-Waqiah', arabicName: 'الواقعة', verseCount: 96, part: getPart(56) },
    { id: 57, name: 'Al-Hadid', arabicName: 'الحديد', verseCount: 29, part: getPart(57) },
    { id: 58, name: 'Al-Mujadila', arabicName: 'المجادلة', verseCount: 22, part: getPart(58) },
    { id: 59, name: 'Al-Hashr', arabicName: 'الحشر', verseCount: 24, part: getPart(59) },
    { id: 60, name: 'Al-Mumtahina', arabicName: 'الممتحنة', verseCount: 13, part: getPart(60) },
    { id: 61, name: 'As-Saff', arabicName: 'الصف', verseCount: 14, part: getPart(61) },
    { id: 62, name: 'Al-Jumuah', arabicName: 'الجمعة', verseCount: 11, part: getPart(62) },
    { id: 63, name: 'Al-Munafiqun', arabicName: 'المنافقون', verseCount: 11, part: getPart(63) },
    { id: 64, name: 'At-Taghabun', arabicName: 'التغابن', verseCount: 18, part: getPart(64) },
    { id: 65, name: 'At-Talaq', arabicName: 'الطلاق', verseCount: 12, part: getPart(65) },
    { id: 66, name: 'At-Tahrim', arabicName: 'التحريم', verseCount: 12, part: getPart(66) },
    { id: 67, name: 'Al-Mulk', arabicName: 'الملك', verseCount: 30, part: getPart(67) },
    { id: 68, name: 'Al-Qalam', arabicName: 'القلم', verseCount: 52, part: getPart(68) },
    { id: 69, name: 'Al-Haqqah', arabicName: 'الحاقة', verseCount: 52, part: getPart(69) },
    { id: 70, name: 'Al-Maarij', arabicName: 'المعارج', verseCount: 44, part: getPart(70) },
    { id: 71, name: 'Nuh', arabicName: 'نوح', verseCount: 28, part: getPart(71) },
    { id: 72, name: 'Al-Jinn', arabicName: 'الجن', verseCount: 28, part: getPart(72) },
    { id: 73, name: 'Al-Muzzammil', arabicName: 'المزمل', verseCount: 20, part: getPart(73) },
    { id: 74, name: 'Al-Muddathir', arabicName: 'المدثر', verseCount: 56, part: getPart(74) },
    { id: 75, name: 'Al-Qiyamah', arabicName: 'القيامة', verseCount: 40, part: getPart(75) },
    { id: 76, name: 'Al-Insan', arabicName: 'الإنسان', verseCount: 31, part: getPart(76) },
    { id: 77, name: 'Al-Mursalat', arabicName: 'المرسلات', verseCount: 50, part: getPart(77) },
    { id: 78, name: 'An-Naba', arabicName: 'النبأ', verseCount: 40, part: getPart(78) },
    { id: 79, name: 'An-Naziat', arabicName: 'النازعات', verseCount: 46, part: getPart(79) },
    { id: 80, name: 'Abasa', arabicName: 'عبس', verseCount: 42, part: getPart(80) },
    { id: 81, name: 'At-Takwir', arabicName: 'التكوير', verseCount: 29, part: getPart(81) },
    { id: 82, name: 'Al-Infitar', arabicName: 'الانفطار', verseCount: 19, part: getPart(82) },
    { id: 83, name: 'Al-Mutaffifin', arabicName: 'المطففين', verseCount: 36, part: getPart(83) },
    { id: 84, name: 'Al-Inshiqaq', arabicName: 'الانشقاق', verseCount: 25, part: getPart(84) },
    { id: 85, name: 'Al-Buruj', arabicName: 'البروج', verseCount: 22, part: getPart(85) },
    { id: 86, name: 'At-Tariq', arabicName: 'الطارق', verseCount: 17, part: getPart(86) },
    { id: 87, name: 'Al-Ala', arabicName: 'الأعلى', verseCount: 19, part: getPart(87) },
    { id: 88, name: 'Al-Ghashiyah', arabicName: 'الغاشية', verseCount: 26, part: getPart(88) },
    { id: 89, name: 'Al-Fajr', arabicName: 'الفجر', verseCount: 30, part: getPart(89) },
    { id: 90, name: 'Al-Balad', arabicName: 'البلد', verseCount: 20, part: getPart(90) },
    { id: 91, name: 'Ash-Shams', arabicName: 'الشمس', verseCount: 15, part: getPart(91) },
    { id: 92, name: 'Al-Layl', arabicName: 'الليل', verseCount: 21, part: getPart(92) },
    { id: 93, name: 'Ad-Duha', arabicName: 'الضحى', verseCount: 11, part: getPart(93) },
    { id: 94, name: 'Ash-Sharh', arabicName: 'الشرح', verseCount: 8, part: getPart(94) },
    { id: 95, name: 'At-Tin', arabicName: 'التين', verseCount: 8, part: getPart(95) },
    { id: 96, name: 'Al-Alaq', arabicName: 'العلق', verseCount: 19, part: getPart(96) },
    { id: 97, name: 'Al-Qadr', arabicName: 'القدر', verseCount: 5, part: getPart(97) },
    { id: 98, name: 'Al-Bayyinah', arabicName: 'البينة', verseCount: 8, part: getPart(98) },
    { id: 99, name: 'Az-Zalzalah', arabicName: 'الزلزلة', verseCount: 8, part: getPart(99) },
    { id: 100, name: 'Al-Adiyat', arabicName: 'العاديات', verseCount: 11, part: getPart(100) },
    { id: 101, name: 'Al-Qariah', arabicName: 'القارعة', verseCount: 11, part: getPart(101) },
    { id: 102, name: 'At-Takathur', arabicName: 'التكاثر', verseCount: 8, part: getPart(102) },
    { id: 103, name: 'Al-Asr', arabicName: 'العصر', verseCount: 3, part: getPart(103) },
    { id: 104, name: 'Al-Humazah', arabicName: 'الهمزة', verseCount: 9, part: getPart(104) },
    { id: 105, name: 'Al-Fil', arabicName: 'الفيل', verseCount: 5, part: getPart(105) },
    { id: 106, name: 'Quraysh', arabicName: 'قريش', verseCount: 4, part: getPart(106) },
    { id: 107, name: 'Al-Maun', arabicName: 'الماعون', verseCount: 7, part: getPart(107) },
    { id: 108, name: 'Al-Kawthar', arabicName: 'الكوثر', verseCount: 3, part: getPart(108) },
    { id: 109, name: 'Al-Kafirun', arabicName: 'الكافرون', verseCount: 6, part: getPart(109) },
    { id: 110, name: 'An-Nasr', arabicName: 'النصر', verseCount: 3, part: getPart(110) },
    { id: 111, name: 'Al-Masad', arabicName: 'المسد', verseCount: 5, part: getPart(111) },
    { id: 112, name: 'Al-Ikhlas', arabicName: 'الإخلاص', verseCount: 4, part: getPart(112) },
    { id: 113, name: 'Al-Falaq', arabicName: 'الفلق', verseCount: 5, part: getPart(113) },
    { id: 114, name: 'An-Nas', arabicName: 'الناس', verseCount: 6, part: getPart(114) },
];

/**
 * Parse the Qur'an JSON file (word-by-word)
 * Format: { "surah:ayah:word": { text, ... } }
 */
export function parseQuranJson(data: Record<string, unknown>): Verse[] {
    const versesMap: Map<string, string[]> = new Map();
    const verseKeysOrder: string[] = [];

    // Keys are already mostly ordered in the JSON, but we iterate once
    // Optimization: Don't sort all keys if not necessary, or use a more efficient grouping
    const keys = Object.keys(data);
    
    for (const key of keys) {
        const item = asRecord(data[key]);
        if (!item) continue;
        const surahId = Number(item.surah);
        const ayahId = Number(item.ayah);
        if (!Number.isFinite(surahId) || !Number.isFinite(ayahId)) continue;
        const verseKey = `${surahId}:${ayahId}`;

        let verseWords = versesMap.get(verseKey);
        if (!verseWords) {
            verseWords = [];
            versesMap.set(verseKey, verseWords);
            verseKeysOrder.push(verseKey);
        }

        const text = typeof item.text === 'string' ? item.text : '';
        // Check if the word is a verse marker (Arabic digits)
        const isMarker = text.length <= 3 && /^[\u0660-\u0669]+$/.test(text);
        if (!isMarker && text.length > 0) {
            verseWords.push(text);
        }
    }

    return verseKeysOrder.map(verseKey => {
        const [surahId, ayahId] = verseKey.split(':').map(Number);
        return {
            surahId,
            ayahId,
            text: versesMap.get(verseKey)!.join(' '),
        };
    }).sort((a, b) => {
        if (a.surahId !== b.surahId) return a.surahId - b.surahId;
        return a.ayahId - b.ayahId;
    });
}

/**
 * Standalone mushaf ornament tokens (rub el hizb ۞, sajda ۩, ayah end ۝).
 * The QPC word-by-word source embeds these inside word tokens with a space
 * (e.g. "۞ وَإِذَا", "يَسۡتَكۡبِرُونَ ۩"), so a naive text.split(' ') yields
 * extra tokens that have no corresponding recitation segment. They must be
 * excluded from word-timing indexing (but still rendered).
 */
export const VERSE_ORNAMENT_TOKENS: ReadonlySet<string> = new Set(['۞', '۩', '۝']);

export function isVerseOrnamentToken(token: string): boolean {
    return VERSE_ORNAMENT_TOKENS.has(token);
}

/** Display tokens: every whitespace-separated token, ornaments included. */
export function splitVerseDisplayWords(text: string): string[] {
    return (text ?? '').split(' ').filter(Boolean);
}

/** Highlight tokens: display tokens minus standalone ornaments (1:1 with segments). */
export function splitVerseHighlightWords(text: string): string[] {
    return splitVerseDisplayWords(text).filter((w) => !isVerseOrnamentToken(w));
}

/**
 * Map each display-word index to its highlight-word index (-1 for ornaments).
 * Used to render ornaments while highlighting only real words.
 */
export function mapDisplayToHighlightIndices(displayWords: string[]): number[] {
    const out: number[] = new Array(displayWords.length);
    let hi = 0;
    for (let i = 0; i < displayWords.length; i++) {
        if (isVerseOrnamentToken(displayWords[i])) out[i] = -1;
        else out[i] = hi++;
    }
    return out;
}

/**
 * Get surah by ID
 */
export function getSurah(surahId: number): Surah | undefined {
    return SURAHS.find(s => s.id === surahId);
}

// Global cache for parsed verses
let cachedVerses: Verse[] | null = null;
let versesLoadingPromise: Promise<Verse[]> | null = null;

async function readQuranResponseFromCache(): Promise<Response | null> {
    if (typeof window === 'undefined' || !('caches' in window)) return null;

    const candidates = [
        '/qpc-hafs-word-by-word.json',
        `${window.location.origin}/qpc-hafs-word-by-word.json`,
    ];

    for (const candidate of candidates) {
        const match = await caches.match(candidate, {
            ignoreSearch: true,
            ignoreVary: true,
        });
        if (match) return match;
    }

    return null;
}

/**
 * Get all verses, caching the result to avoid repeated parsing
 */
export async function getQuranVerses(onProgress?: QuranDownloadProgress): Promise<Verse[]> {
    if (cachedVerses) return cachedVerses;
    if (versesLoadingPromise) return versesLoadingPromise;

    versesLoadingPromise = (async () => {
        try {
            // Try Obsidian vault first (plugin context, no /public server)
            // Uses the shared app registry so Obsidian Mobile works too — mobile
            // does not expose `window.app`.
            const obsidianApp: App | null = getObsidianApp();
            const isObsidian = !!obsidianApp?.vault?.adapter;
            // Documented cast: the only `unknown` -> typed boundary for the
            // vault adapter in this scope; every adapter call below is typed.
            const adapter = obsidianApp?.vault?.adapter as unknown as VaultFiles | undefined;
            const publishDir = pluginPublishDir(obsidianApp);
            const candidates = [...new Set([
                `${publishDir}/data/assets/qpc-hafs-word-by-word.json`,
                '.obsidian/plugins/quran-life/data/assets/qpc-hafs-word-by-word.json',
                'QuranLife/assets/qpc-hafs-word-by-word.json',
                'QuranLife/qpc-hafs-word-by-word.json',
                `${publishDir}/qpc-hafs-word-by-word.json`,
                '.obsidian/plugins/quran-life/qpc-hafs-word-by-word.json',
                `${publishDir}/public/qpc-hafs-word-by-word.json`,
                '.obsidian/plugins/quran-life/public/qpc-hafs-word-by-word.json',
                `${publishDir}/data/qpc-hafs-word-by-word.json`,
                '.obsidian/plugins/quran-life/data/qpc-hafs-word-by-word.json',
                'qpc-hafs-word-by-word.json',
                'public/qpc-hafs-word-by-word.json',
            ])];
            if (isObsidian) {
                try {
                    // Try plugin-bundled asset via vault adapter resource path, or vault file QuranLife/assets/...
                    for (const cand of candidates) {
                        try {
                            const raw = await adapter?.read(cand);
                            if (raw) {
                                const parsed: unknown = JSON.parse(raw);
                                const rec = asRecord(parsed);
                                if (rec) {
                                    cachedVerses = parseQuranJson(rec);
                                    return cachedVerses;
                                }
                            }
                        } catch { /* best-effort only; ignore */ }
                    }
                    // Try via getResourcePath (app:// URL for plugin asset)
                    if (adapter?.getResourcePath) {
                        for (const cand of candidates) {
                            try {
                                const resourceUrl = adapter.getResourcePath(cand);
                                if (!resourceUrl) continue;
                                const r = await fetch(resourceUrl);
                                if (r.ok) {
                                    const parsed: unknown = await r.json();
                                    const rec = asRecord(parsed);
                                    if (rec) {
                                        cachedVerses = parseQuranJson(rec);
                                        return cachedVerses;
                                    }
                                }
                            } catch { /* best-effort only; ignore */ }
                        }
                    }
                } catch { /* best-effort only; ignore */ }
            }

            // In Obsidian, don't try web fetch to /public (no dev server) — it will always fail and log Failed to fetch
            if (isObsidian) {
                // Community-store installs only ship main.js/manifest.json/
                // styles.css, so the 8.8MB corpus may be missing entirely.
                // Download it once from the public repo and persist it into
                // the vault — every later launch is fully offline.
                // `onProgress` fires only here, so the UI can show a real
                // one-time download bar instead of a stuck spinner.
                try {
                    const raw = await downloadTextWithProgress(
                        'https://raw.githubusercontent.com/imed-ghomari/quran-life/main/public/qpc-hafs-word-by-word.json',
                        obsidianApp,
                        120000,
                        onProgress
                    );
                    if (raw && raw.trim().startsWith('{')) {
                        const parsed: unknown = JSON.parse(raw);
                        const rec = asRecord(parsed);
                        if (rec) {
                            cachedVerses = parseQuranJson(rec);
                            // Persist best-effort so this download happens exactly once
                            void persistTextToVault(obsidianApp, 'QuranLife/assets/qpc-hafs-word-by-word.json', raw).catch(() => {});
                            return cachedVerses;
                        }
                    }
                } catch (e) {
                    console.warn('[QuranLife] Quran JSON download from release failed', e);
                }
                console.warn('[QuranLife] Quran JSON not found in vault candidates, checked:', candidates);
                // Try one last vault read for legacy path without isObsidian check
                try {
                    const raw = await adapter?.read('QuranLife/assets/qpc-hafs-word-by-word.json');
                    if (raw) {
                        const parsed: unknown = JSON.parse(raw);
                        const rec = asRecord(parsed);
                        if (rec) {
                            cachedVerses = parseQuranJson(rec);
                            return cachedVerses;
                        }
                    }
                } catch { /* best-effort only; ignore */ }
                throw new Error('Quran data not found in vault. Ensure qpc-hafs-word-by-word.json is in plugin folder or QuranLife/assets/. Plugin will copy it on next restart from .obsidian/plugins/quran-life/qpc-hafs-word-by-word.json if present.');
            }

            const res = await fetch('/qpc-hafs-word-by-word.json', { cache: 'force-cache' });
            if (!res.ok) throw new Error(`Failed to load quran JSON: ${res.status}`);
            const parsed: unknown = await res.json();
            const rec = asRecord(parsed);
            if (!rec) throw new Error('Failed to parse quran JSON');
            cachedVerses = parseQuranJson(rec);
            return cachedVerses;
        } catch (err) {
             console.error('Failed to load verses', err);
             
             // Fallback to Cache API (for offline support)
            try {
                const cachedRes = await readQuranResponseFromCache();
                if (cachedRes) {
                    const parsed: unknown = await cachedRes.json();
                    const rec = asRecord(parsed);
                    if (rec) {
                        cachedVerses = parseQuranJson(rec);
                        return cachedVerses;
                    }
                }
            } catch (e) {
                console.warn('Failed to recover from cache', e);
            }
             
             return [];
        }
    })();

    return versesLoadingPromise;
}

/**
 * Get surahs by part
 */
export function getSurahsByPart(part: QuranPart): Surah[] {
    if (part === ALL_QURAN_PART) return SURAHS;
    return SURAHS.filter(s => s.part === part);
}

/**
 * Get verses for a surah from the full verses array
 */
export function getVersesForSurah(verses: Verse[], surahId: number): Verse[] {
    return verses.filter(v => v.surahId === surahId);
}

/**
 * Get verses for a segment
 */
export function getVersesForSegment(
    verses: Verse[],
    surahId: number,
    startVerse: number,
    endVerse: number
): Verse[] {
    return verses.filter(
        v => v.surahId === surahId && v.ayahId >= startVerse && v.ayahId <= endVerse
    );
}
