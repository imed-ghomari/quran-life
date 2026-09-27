import { App, TFile, TFolder, normalizePath } from "obsidian";
import { getSurahsByPart } from "@/lib/quranData";
import { ACTIVE_PART_OPTIONS, QuranPart } from "@/lib/types";
import { Reciter, loadRecitationData, buildAyahAudioUrl } from "@/lib/audio";
import { getObsidianApp } from "@/lib/obsidianApp";
import { ensureFolder } from "./storage/vaultAdapter";

// Offline audio is stored inside plugin folder (not vault root) so only one folder to sync.
// Works on mobile as well because we use adapter directly for hidden paths.
export const OFFLINE_AUDIO_ROOT = ".obsidian/plugins/quran-life/offline-audio";
export const OFFLINE_MANIFEST_PATH = normalizePath(`${OFFLINE_AUDIO_ROOT}/manifest.json`);

/**
 * Typed subset of the Obsidian vault adapter surface consumed in this file.
 * Extracted once per helper via `as unknown as VaultFiles | undefined`
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
  rmdir?(path: string, recursive?: boolean): Promise<void>;
  list(path: string): Promise<{ files: string[]; folders: string[] }>;
  getResourcePath(path: string): string;
  stat(path: string): Promise<{ size?: number; stat?: { size?: number } } | null>;
}

/** Shape of Obsidian `requestUrl` binary responses as consumed in this file. */
interface ObsidianBinaryResponse {
  status?: number;
  text?: unknown;
  arrayBuffer?: ArrayBuffer | (() => Promise<ArrayBuffer>) | Uint8Array;
  body?: unknown;
}

interface ObsidianRequestOptions {
  url: string;
  method?: string;
}

type ObsidianRequestFn = (opts: ObsidianRequestOptions) => Promise<ObsidianBinaryResponse>;

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

function getApp(appOverride?: App | null): App | null {
  try {
    // Shared registry — Obsidian Mobile has no `window.app`, so downloads used
    // to lose `requestUrl` (CORS-free fetch) and the vault adapter entirely.
    return getObsidianApp(appOverride) ?? null;
  } catch { return null; }
}

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

export function getOfflineSurahAudioPath(reciterId: string, surahId: number): string {
  return normalizePath(`${OFFLINE_AUDIO_ROOT}/${reciterId}/surah-${pad3(surahId)}.mp3`);
}
export function getOfflineAyahAudioPath(reciterId: string, surahId: number, ayahId: number): string {
  return normalizePath(`${OFFLINE_AUDIO_ROOT}/${reciterId}/ayah/${pad3(surahId)}_${String(ayahId).padStart(3, "0")}.mp3`);
}
// Legacy helper for per-ayah subfolder variant
export function getOfflineAyahAudioPathLegacy(reciterId: string, surahId: number, ayahId: number): string {
  return normalizePath(`${OFFLINE_AUDIO_ROOT}/${reciterId}/ayah/${surahId}/${ayahId}.mp3`);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let idx = 0;
  let v = bytes;
  while (v >= 1024 && idx < units.length - 1) { v /= 1024; idx++; }
  return idx >= 2 ? `${v.toFixed(2)} ${units[idx]}` : `${v.toFixed(1)} ${units[idx]}`;
}

// ---------- low-level adapter helpers (hidden-aware, mobile-safe) ----------

async function adapterExists(app: App, path: string): Promise<boolean> {
  const normalized = normalizePath(path);
  // Documented cast: the only `unknown` -> typed boundary for the vault
  // adapter in this helper; every adapter call below is typed.
  const adapter = app?.vault?.adapter as unknown as VaultFiles | undefined;
  if (adapter?.exists) {
    try { return await adapter.exists(normalized); } catch { return false; }
  }
  return !!app.vault.getAbstractFileByPath(normalized);
}

async function adapterStatSize(app: App, path: string): Promise<number | null> {
  const normalized = normalizePath(path);
  // Documented cast: the only `unknown` -> typed boundary for the vault
  // adapter in this helper; every adapter call below is typed.
  const adapter = app?.vault?.adapter as unknown as VaultFiles | undefined;
  if (adapter?.stat) {
    try {
      const st = await adapter.stat(normalized);
      if (st && typeof st.size === "number") return st.size;
      if (st && typeof st.stat?.size === "number") return st.stat.size;
    } catch { /* best-effort only; ignore */ }
  }
  // fallback: readBinary length
  if (adapter?.readBinary) {
    try {
      const buf = await adapter.readBinary(normalized);
      return buf.byteLength;
    } catch { /* best-effort only; ignore */ }
  }
  return null;
}

async function adapterRemoveNoTrash(app: App, path: string): Promise<void> {
  const normalized = normalizePath(path);
  // Documented cast: the only `unknown` -> typed boundary for the vault
  // adapter in this helper; every adapter call below is typed.
  const adapter = app?.vault?.adapter as unknown as VaultFiles | undefined;
  // Always use adapter.remove to avoid Obsidian trash (which would duplicate storage)
  if (adapter?.remove) {
    try {
      if (adapter.exists && !(await adapter.exists(normalized))) return;
      await adapter.remove(normalized);
      return;
    } catch { /* best-effort only; ignore */ }
  }
  // Fallback: try vault.delete with force? but avoid trash – use adapter if possible
  try {
    const file = app.vault.getAbstractFileByPath(normalized);
    if (file) await app.vault.delete(file, true);
  } catch { /* best-effort only; ignore */ }
}

async function adapterWriteBinary(app: App, path: string, data: ArrayBuffer): Promise<void> {
  const normalized = normalizePath(path);
  await ensureFolder(app, (() => { const i = normalized.lastIndexOf("/"); return i < 0 ? "" : normalized.slice(0, i); })() || "/");
  // Documented cast: the only `unknown` -> typed boundary for the vault
  // adapter in this helper; every adapter call below is typed.
  const adapter = app?.vault?.adapter as unknown as VaultFiles | undefined;
  if (adapter?.writeBinary) {
    try { await adapter.writeBinary(normalized, data); return; } catch { /* best-effort only; ignore */ }
  }
  if (adapter?.write) {
    // fallback: write as binary via write (may corrupt, but try)
    try {
      // For hidden paths, adapter.write expects string; try to write via base64?
      // Use writeBinary if available, else try vault create
      const u8 = new Uint8Array(data);
      let binary = "";
      for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]);
      await adapter.write(normalized, binary);
      return;
    } catch { /* best-effort only; ignore */ }
  }
  // last resort: use vault binary if supported
  const vaultWithBinary = app.vault as App['vault'] & { createBinary?: (path: string, data: ArrayBuffer) => Promise<unknown> };
  if (vaultWithBinary.createBinary) await vaultWithBinary.createBinary(normalized, data);
  else throw new Error("no binary write");
}

async function listFilesRecursive(app: App, dir: string, out: string[] = []): Promise<string[]> {
  const normalized = normalizePath(dir);
  // Documented cast: the only `unknown` -> typed boundary for the vault
  // adapter in this helper; every adapter call below is typed.
  const adapter = app?.vault?.adapter as unknown as VaultFiles | undefined;
  let entries: { files: string[]; folders: string[] } | null = null;
  if (adapter?.list) {
    try { entries = await adapter.list(normalized); } catch { /* best-effort only; ignore */ }
  }
  if (entries && Array.isArray(entries.files)) {
    for (const f of entries.files) out.push(f);
    for (const sub of entries.folders || []) {
      await listFilesRecursive(app, sub, out);
    }
    return out;
  }
  // fallback via vault
  const folder = app.vault.getAbstractFileByPath(normalized);
  if (folder instanceof TFolder) {
    for (const child of folder.children) {
      if (child instanceof TFile) out.push(child.path);
      else if (child instanceof TFolder) await listFilesRecursive(app, child.path, out);
    }
  }
  return out;
}

// ---------- offline status ----------

// ---------- library scan (one directory pass for the whole reciter) ----------

/**
 * The settings tab shows every Quran part at once, so probing each expected file
 * with `adapter.exists` (thousands of native bridge round-trips on mobile) is not
 * viable. A single recursive listing gives the same answer: filenames encode the
 * surah/ayah, so counts can be derived in JS.
 */
export interface OfflinePartScan {
  partId: QuranPart;
  totalFiles: number;
  existingFiles: number;
  skippedFiles: number;
  isComplete: boolean;
  isPartial: boolean;
}

export interface OfflineReciterScan {
  reciterId: string;
  parts: OfflinePartScan[];
  fileCount: number;
  /** Downloaded files belonging to each part (used for lazy size accounting). */
  filesByPart: Record<number, string[]>;
  /** Every downloaded audio file for this reciter (unique). */
  allFiles: string[];
}

const SUFFIX_RE = /\.mp3$/i;
const SURAH_FILE_RE = /surah-(\d{1,3})\.mp3$/i;
const AYAH_FILE_RE = /(\d{1,3})_(\d{1,3})\.mp3$/;
const LEGACY_AYAH_FILE_RE = /(\d{1,3})\/(\d{1,3})\.mp3$/;

export async function scanOfflineAudioForReciter(
  reciter: Reciter,
  appOverride?: App | null,
  skippedSurahIds?: number[] | Set<number> | null
): Promise<OfflineReciterScan> {
  const skipped = toSkippedSet(skippedSurahIds);
  const empty: OfflineReciterScan = { reciterId: reciter.id, parts: [], fileCount: 0, filesByPart: {}, allFiles: [] };
  const app = getApp(appOverride);
  if (!app) return empty;

  const reciterDir = normalizePath(`${OFFLINE_AUDIO_ROOT}/${reciter.id}`);
  const listed = (await listFilesRecursive(app, reciterDir)).filter((f) => SUFFIX_RE.test(f));

  // Index what actually exists on disk, keeping the path so sizes can be summed later.
  const surahFiles = new Map<number, string>();
  const ayahFiles = new Map<string, string>(); // "s:a" -> path
  for (const path of listed) {
    const base = path.slice(path.lastIndexOf("/") + 1) || path;
    const surahMatch = base.match(SURAH_FILE_RE);
    if (surahMatch) {
      const sid = Number(surahMatch[1]);
      if (Number.isFinite(sid) && !surahFiles.has(sid)) surahFiles.set(sid, path);
      continue;
    }
    const ayahMatch = base.match(AYAH_FILE_RE) || path.match(LEGACY_AYAH_FILE_RE);
    if (ayahMatch) {
      const key = `${Number(ayahMatch[1])}:${Number(ayahMatch[2])}`;
      if (key !== 'NaN:NaN' && !ayahFiles.has(key)) ayahFiles.set(key, path);
    }
  }

  const basmalaPathForType = reciter.type === "surah-based"
    ? getOfflineSurahAudioPath(reciter.id, 1)
    : getOfflineAyahAudioPath(reciter.id, 1, 1);
  const basmalaExists = reciter.type === "surah-based"
    ? surahFiles.has(1)
    : ayahFiles.has("1:1") || !!listed.find((f) => normalizePath(f) === normalizePath(getOfflineAyahAudioPathLegacy(reciter.id, 1, 1)));
  const basmalaRealPath = reciter.type === "surah-based"
    ? surahFiles.get(1)
    : (ayahFiles.get("1:1") ?? listed.find((f) => normalizePath(f) === normalizePath(getOfflineAyahAudioPathLegacy(reciter.id, 1, 1))));
  void basmalaPathForType;

  const parts: OfflinePartScan[] = [];
  const filesByPart: Record<number, string[]> = {};

  for (const option of ACTIVE_PART_OPTIONS) {
    const partId = option.id;
    const allInPart = getSurahsByPart(partId);
    const surahs = allInPart.filter((s) => !skipped.has(s.id));
    const skippedCount = allInPart.length - surahs.length;
    let totalFiles = 0;
    let existingFiles = 0;
    const partFiles: string[] = [];

    for (const surah of surahs) {
      if (reciter.type === "surah-based") {
        totalFiles += 1;
        const path = surahFiles.get(surah.id);
        if (path) { existingFiles += 1; partFiles.push(path); }
      } else {
        for (let ayah = 1; ayah <= surah.verseCount; ayah++) {
          totalFiles += 1;
          const path = ayahFiles.get(`${surah.id}:${ayah}`);
          if (path) { existingFiles += 1; partFiles.push(path); }
        }
      }
    }

    // The Basmala interstitial file is bundled with every download (mirrors
    // getOfflinePartStatus so "Complete" also means transitions work offline).
    totalFiles += 1;
    if (basmalaExists) {
      existingFiles += 1;
      if (basmalaRealPath && !partFiles.includes(basmalaRealPath)) partFiles.push(basmalaRealPath);
    }

    parts.push({
      partId,
      totalFiles,
      existingFiles,
      skippedFiles: skippedCount > 0
        ? (reciter.type === "surah-based"
            ? skippedCount
            : allInPart.filter((s) => skipped.has(s.id)).reduce((sum, s) => sum + s.verseCount, 0))
        : 0,
      isComplete: totalFiles > 0 && existingFiles >= totalFiles,
      isPartial: existingFiles > 0 && existingFiles < totalFiles,
    });
    filesByPart[partId] = partFiles;
  }

  return {
    reciterId: reciter.id,
    parts,
    fileCount: listed.length,
    filesByPart,
    allFiles: listed,
  };
}

// ---------- size accounting (lazy + cached) ----------

const offlineSizeCache = new Map<string, number>();

/** Remember a size we already know (e.g. right after writing a download). */
export function cacheOfflineFileSize(path: string, bytes: number): void {
  if (Number.isFinite(bytes) && bytes >= 0) offlineSizeCache.set(normalizePath(path), bytes);
}

export function invalidateOfflineFileSize(path: string): void {
  offlineSizeCache.delete(normalizePath(path));
}

export function invalidateAllOfflineSizes(): void {
  offlineSizeCache.clear();
}

/**
 * Sum file sizes with bounded concurrency; `onProgress` fires as bytes arrive so
 * the UI can fill numbers in progressively instead of blocking on thousands of
 * stats (mobile file bridges are slow).
 */
export async function sumOfflineSizes(
  paths: string[],
  appOverride?: App | null,
  onProgress?: (bytes: number) => void
): Promise<number> {
  const app = getApp(appOverride);
  if (!app || paths.length === 0) return 0;
  let total = 0;
  let next = 0;
  let lastReport = 0;
  let pending = 0;

  const worker = async () => {
    while (next < paths.length) {
      const index = next++;
      const path = normalizePath(paths[index]);
      let size = offlineSizeCache.get(path);
      if (size === undefined) {
        size = (await adapterStatSize(app, path)) ?? 0;
        offlineSizeCache.set(path, size);
      }
      pending += 1;
      total += size;
      if (pending >= 16 || total - lastReport > 25 * 1024 * 1024) {
        pending = 0;
        lastReport = total;
        onProgress?.(total);
      }
    }
  };

  const workers: Promise<void>[] = [];
  const concurrency = Math.min(24, Math.max(4, Math.ceil(paths.length / 64)));
  for (let i = 0; i < concurrency; i++) workers.push(worker());
  await Promise.all(workers);
  onProgress?.(total);
  return total;
}

export interface OfflinePartStatus {
  reciterId: string;
  partId: QuranPart;
  totalFiles: number;
  existingFiles: number;
  totalBytes: number; // sum of existing file sizes (bytes)
  isComplete: boolean;
  isPartial: boolean;
  skippedFiles?: number; // files excluded because their surah is unselected in Daily Portion
}

function toSkippedSet(v?: number[] | Set<number> | null): Set<number> {
  if (v instanceof Set) {
    const out = new Set<number>();
    v.forEach(x => { const n = Number(x); if (Number.isInteger(n)) out.add(n); });
    return out;
  }
  const out = new Set<number>();
  if (Array.isArray(v)) v.forEach(x => { const n = Number(x); if (Number.isInteger(n)) out.add(n); });
  return out;
}

export async function getOfflinePartStatus(reciter: Reciter, partId: QuranPart, appOverride?: App | null, skippedSurahIds?: number[] | Set<number> | null): Promise<OfflinePartStatus> {
  const app = getApp(appOverride);
  if (!app) return { reciterId: reciter.id, partId, totalFiles: 0, existingFiles: 0, totalBytes: 0, isComplete: false, isPartial: false };
  const skipped = toSkippedSet(skippedSurahIds);
  const surahs = getSurahsByPart(partId).filter(s => !skipped.has(s.id));
  const skippedSurahs = getSurahsByPart(partId).length - surahs.length;
  let totalFiles = 0;
  if (reciter.type === "surah-based") totalFiles = surahs.length;
  else totalFiles = surahs.reduce((s, sh) => s + sh.verseCount, 0);
  let existingFiles = 0;
  let totalBytes = 0;
  for (const sh of surahs) {
    if (reciter.type === "surah-based") {
      const p = getOfflineSurahAudioPath(reciter.id, sh.id);
      if (await adapterExists(app, p)) {
        existingFiles++;
        const sz = await adapterStatSize(app, p);
        if (sz) totalBytes += sz;
      }
    } else {
      for (let ay = 1; ay <= sh.verseCount; ay++) {
        const p1 = getOfflineAyahAudioPath(reciter.id, sh.id, ay);
        const p2 = getOfflineAyahAudioPathLegacy(reciter.id, sh.id, ay);
        const exists = (await adapterExists(app, p1)) || (await adapterExists(app, p2));
        if (exists) {
          existingFiles++;
          const sz = (await adapterStatSize(app, p1)) ?? (await adapterStatSize(app, p2));
          if (sz) totalBytes += sz;
        }
      }
    }
  }
  // The Basmala interstitial (Surah 1:1 slice) is bundled with every download.
  // Count it so "Complete" is only reported when transitions can play offline.
  try {
    if (reciter.type === "surah-based") {
      const p = getOfflineSurahAudioPath(reciter.id, 1);
      totalFiles += 1;
      if (await adapterExists(app, p)) {
        existingFiles++;
        const sz = await adapterStatSize(app, p);
        if (sz) totalBytes += sz;
      }
    } else {
      const p1 = getOfflineAyahAudioPath(reciter.id, 1, 1);
      const p2 = getOfflineAyahAudioPathLegacy(reciter.id, 1, 1);
      totalFiles += 1;
      if ((await adapterExists(app, p1)) || (await adapterExists(app, p2))) {
        existingFiles++;
        const sz = (await adapterStatSize(app, p1)) ?? (await adapterStatSize(app, p2));
        if (sz) totalBytes += sz;
      }
    }
  } catch { /* status stays best-effort */ }
  return {
    reciterId: reciter.id,
    partId,
    totalFiles,
    existingFiles,
    totalBytes,
    isComplete: totalFiles > 0 && existingFiles >= totalFiles,
    isPartial: existingFiles > 0 && existingFiles < totalFiles,
    skippedFiles: skippedSurahs > 0
      ? (reciter.type === "surah-based"
          ? skippedSurahs
          : getSurahsByPart(partId).filter(s => skipped.has(s.id)).reduce((s, sh) => s + sh.verseCount, 0))
      : 0,
  };
}

export async function getTotalOfflineStorageUsage(appOverride?: App | null): Promise<{ totalBytes: number; fileCount: number; byReciter: Record<string, { bytes: number; files: number }> }> {
  const app = getApp(appOverride);
  if (!app) return { totalBytes: 0, fileCount: 0, byReciter: {} };
  const files = await listFilesRecursive(app, OFFLINE_AUDIO_ROOT);
  // Filter only mp3
  const mp3s = files.filter(f => f.toLowerCase().endsWith(".mp3"));
  let totalBytes = 0;
  const byReciter: Record<string, { bytes: number; files: number }> = {};
  for (const f of mp3s) {
    const sz = await adapterStatSize(app, f);
    const b = sz ?? 0;
    totalBytes += b;
    // reciterId is segment after offline-audio/
    const parts = f.split("/");
    // OFFLINE_AUDIO_ROOT = ".obsidian/plugins/quran-life/offline-audio"
    const idx = parts.indexOf("offline-audio");
    const reciterId = idx >= 0 && parts[idx + 1] ? parts[idx + 1] : "unknown";
    if (!byReciter[reciterId]) byReciter[reciterId] = { bytes: 0, files: 0 };
    byReciter[reciterId].bytes += b;
    byReciter[reciterId].files += 1;
  }
  return { totalBytes, fileCount: mp3s.length, byReciter };
}

// ---------- download ----------

export interface OfflineDownloadProgress {
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  downloadedBytes: number;
  currentFile?: string;
  percent: number; // 0-100
}

export interface OfflineDownloadOptions {
  concurrency?: number; // default 3
  delayMs?: number; // delay between starting each download, default 250
  signal?: AbortSignal;
  onProgress?: (p: OfflineDownloadProgress) => void;
  skipExisting?: boolean; // default true
  skippedSurahIds?: number[] | Set<number> | null; // surahs unselected in Daily Portion — excluded from download
}

async function fetchArrayBufferViaRequestUrl(url: string, app: App): Promise<ArrayBuffer> {
  // Use Obsidian requestUrl to bypass CORS for tarteel CDN
  let req: ObsidianRequestFn | null = null;
  try {
    const obs = (await import("obsidian")) as unknown as ObsidianRequestModule;
    req = obs.requestUrl ?? null;
  } catch { req = (window as unknown as WindowWithRequestUrl).requestUrl ?? null; }
  if (!req) {
    // fallback fetch
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.arrayBuffer();
  }
  const res: ObsidianBinaryResponse = await req({ url, method: "GET" });
  // Obsidian requestUrl returns arrayBuffer for binary
  const responseBuffer = typeof res.arrayBuffer === "function" ? await res.arrayBuffer() : res.arrayBuffer;
  const arrayBuffer = toArrayBuffer(responseBuffer) ?? toArrayBuffer(res.body);
  if (arrayBuffer && arrayBuffer.byteLength) return arrayBuffer;
  // Some versions return text for mp3? try fallback fetch
  if (typeof res.text === "string" && res.text) {
    // try fetch again via fetch (may fail CORS)
    const r2 = await fetch(url);
    if (r2.ok) return await r2.arrayBuffer();
    throw new Error("Empty response");
  }
  // fallback to fetch
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.arrayBuffer();
}

async function getSurahAudioUrlForReciter(reciter: Reciter, surahId: number, app: App): Promise<string | null> {
  try {
    const data = await loadRecitationData(reciter, surahId, app);
    if (!data) return null;
    if (reciter.type === "surah-based") {
      return data.audioUrl || null;
    } else {
      // ayah-based: need separate handling per ayah, not here
      return null;
    }
  } catch { return null; }
}

export async function downloadPartAudio(
  reciter: Reciter,
  partId: QuranPart,
  appOverride?: App | null,
  opts: OfflineDownloadOptions = {}
): Promise<{ downloadedFiles: number; failedFiles: number; totalBytes: number }> {
  const app = getApp(appOverride);
  if (!app) throw new Error("Obsidian app not available");
  const concurrency = Math.max(1, Math.min(6, opts.concurrency ?? 3));
  const delayMs = opts.delayMs ?? 250;
  const skipExisting = opts.skipExisting ?? true;
  const skipped = toSkippedSet(opts.skippedSurahIds);

  const surahs = getSurahsByPart(partId).filter(s => !skipped.has(s.id));
  type Task = { type: "surah" | "ayah"; surahId: number; ayahId?: number; remoteUrl: string; offlinePath: string; label: string };
  const tasks: Task[] = [];

  if (reciter.type === "surah-based") {
    // Build tasks: one per surah
    for (const sh of surahs) {
      const offlinePath = getOfflineSurahAudioPath(reciter.id, sh.id);
      if (skipExisting && (await adapterExists(app, offlinePath))) continue;
      // Need remote URL via recitation data (local JSON, no extra network)
      const remoteUrl = await getSurahAudioUrlForReciter(reciter, sh.id, app);
      if (!remoteUrl) continue;
      tasks.push({ type: "surah", surahId: sh.id, remoteUrl, offlinePath, label: `Surah ${sh.id}` });
    }
    // If all skipped, check if we already have all files
    if (tasks.length === 0) {
      // verify completeness
      const status = await getOfflinePartStatus(reciter, partId, app, skipped);
      if (status.isComplete) return { downloadedFiles: 0, failedFiles: 0, totalBytes: status.totalBytes };
    }
  } else {
    // ayah-based: use the large `verses` map when it loads (it also carries the
    // per-word segments), but never hard-fail on it — every ayah-based reciter
    // publishes `<ayahAudioBase>/<SSS><AAA>.mp3`, so downloads still work when
    // the map cannot be fetched (this is what used to throw
    // "Failed to load ayah recitation map" on mobile).
    let ayahData: Awaited<ReturnType<typeof loadRecitationData>> = null;
    try { ayahData = await loadRecitationData(reciter, 1, app); } catch { /* best-effort only; ignore */ }
    const ayahMap: Record<string, unknown> | null = ayahData?.verses ?? null;
    if (!ayahMap && !reciter.ayahAudioBase) throw new Error("Failed to load ayah recitation map");
    for (const sh of surahs) {
      for (let ay = 1; ay <= sh.verseCount; ay++) {
        const offlinePath = getOfflineAyahAudioPath(reciter.id, sh.id, ay);
        const legacyPath = getOfflineAyahAudioPathLegacy(reciter.id, sh.id, ay);
        if (skipExisting && ((await adapterExists(app, offlinePath)) || (await adapterExists(app, legacyPath)))) continue;
        const key = `${sh.id}:${ay}`;
        const mapAudioUrl: unknown = asRecord(ayahMap?.[key])?.audio_url;
        const remoteUrl = (typeof mapAudioUrl === 'string' && mapAudioUrl ? mapAudioUrl : null) ?? buildAyahAudioUrl(reciter, sh.id, ay);
        if (!remoteUrl) continue;
        tasks.push({ type: "ayah", surahId: sh.id, ayahId: ay, remoteUrl, offlinePath, label: `${sh.id}:${ay}` });
      }
    }
  }

  // The player inserts a Basmala interstitial (Surah 1:1 slice) on every surah
  // transition. Without it downloaded, Basmala is silently skipped whenever the
  // portion plays from offline files. Always bundle it (1 extra file).
  try {
    if (reciter.type === "surah-based") {
      const basmalaPath = getOfflineSurahAudioPath(reciter.id, 1);
      const alreadyHave = skipExisting && (await adapterExists(app, basmalaPath));
      const alreadyQueued = tasks.some(t => t.offlinePath === basmalaPath);
      if (!alreadyHave && !alreadyQueued) {
        const basmalaUrl = await getSurahAudioUrlForReciter(reciter, 1, app);
        if (basmalaUrl) tasks.push({ type: "surah", surahId: 1, remoteUrl: basmalaUrl, offlinePath: basmalaPath, label: "Basmala (Surah 1)" });
      }
    } else {
      const basmalaPath = getOfflineAyahAudioPath(reciter.id, 1, 1);
      const legacyPath = getOfflineAyahAudioPathLegacy(reciter.id, 1, 1);
      const alreadyHave = skipExisting && ((await adapterExists(app, basmalaPath)) || (await adapterExists(app, legacyPath)));
      const alreadyQueued = tasks.some(t => t.offlinePath === basmalaPath);
      if (!alreadyHave && !alreadyQueued) {
        // Resolve 1:1 from the map when available, else from the URL pattern.
        let basmalaUrl: string | null = null;
        try {
          const basmalaData: Awaited<ReturnType<typeof loadRecitationData>> = await loadRecitationData(reciter, 1, app);
          const basmalaAudioUrl: unknown = asRecord(basmalaData?.verses?.["1:1"])?.audio_url;
          basmalaUrl = typeof basmalaAudioUrl === 'string' ? basmalaAudioUrl : null;
        } catch { /* best-effort only; ignore */ }
        if (!basmalaUrl) basmalaUrl = buildAyahAudioUrl(reciter, 1, 1);
        if (basmalaUrl) tasks.push({ type: "ayah", surahId: 1, ayahId: 1, remoteUrl: basmalaUrl, offlinePath: basmalaPath, label: "Basmala (1:1)" });
      }
    }
  } catch { /* basmala bundling is best-effort; never fail the download */ }

  const totalFiles = tasks.length;
  // If skipExisting and tasks empty, nothing to do
  if (totalFiles === 0) {
    opts.onProgress?.({ totalFiles: 0, completedFiles: 0, failedFiles: 0, downloadedBytes: 0, percent: 100 });
    return { downloadedFiles: 0, failedFiles: 0, totalBytes: 0 };
  }

  // For progress, we need to report against original total including skipped? Use tasks as remaining
  // But to give user correct progress, we should consider already-existing files as completed.
  // Let's compute existing count
  const statusBefore = await getOfflinePartStatus(reciter, partId, app, skipped);
  const alreadyExisting = statusBefore.existingFiles;
  const totalForPart = statusBefore.totalFiles || totalFiles + alreadyExisting;
  let completedFiles = alreadyExisting;
  let failedFiles = 0;
  let downloadedBytes = statusBefore.totalBytes;

  const report = (currentFile?: string) => {
    const percent = totalForPart > 0 ? Math.round((completedFiles / totalForPart) * 100) : 0;
    opts.onProgress?.({
      totalFiles: totalForPart,
      completedFiles,
      failedFiles,
      downloadedBytes,
      currentFile,
      percent: Math.max(0, Math.min(100, percent)),
    });
  };
  report();

  // Moderated concurrent download with stagger
  let nextIndex = 0;
  let aborted = false;
  const abortHandler = () => { aborted = true; };
  opts.signal?.addEventListener("abort", abortHandler);

  const downloadOne = async (task: Task, attempt = 1): Promise<void> => {
    if (aborted || opts.signal?.aborted) throw new Error("aborted");
    try {
      const buf = await fetchArrayBufferViaRequestUrl(task.remoteUrl, app);
      if (aborted || opts.signal?.aborted) return;
      await adapterWriteBinary(app, task.offlinePath, buf);
      cacheOfflineFileSize(task.offlinePath, buf.byteLength);
      completedFiles++;
      downloadedBytes += buf.byteLength;
      report(task.label);
    } catch (e) {
      const message: unknown = typeof e === 'object' && e !== null ? (e as Record<string, unknown>).message : undefined;
      if (typeof message === 'string' && message.includes("aborted")) throw e;
      if (attempt < 3) {
        // exponential backoff 1s, 2s
        await new Promise(r => window.setTimeout(r, attempt * 1000));
        if (aborted || opts.signal?.aborted) return;
        return downloadOne(task, attempt + 1);
      }
      failedFiles++;
      report(task.label);
      console.warn(`Offline download failed for ${task.label} after ${attempt} attempts`, e);
    }
  };

  const workers: Promise<void>[] = [];
  const runWorker = async () => {
    while (nextIndex < tasks.length && !aborted && !opts.signal?.aborted) {
      const idx = nextIndex++;
      if (idx >= tasks.length) break;
      const task = tasks[idx];
      // stagger start
      if (idx !== 0 && delayMs > 0) await new Promise(r => window.setTimeout(r, delayMs));
      if (aborted || opts.signal?.aborted) break;
      await downloadOne(task);
    }
  };

  for (let i = 0; i < concurrency; i++) workers.push(runWorker());
  try {
    await Promise.all(workers);
  } finally {
    opts.signal?.removeEventListener("abort", abortHandler);
  }

  if (aborted || opts.signal?.aborted) throw new Error("Download cancelled");

  // Verify final status
  const finalStatus = await getOfflinePartStatus(reciter, partId, app, skipped);
  return { downloadedFiles: completedFiles - alreadyExisting, failedFiles, totalBytes: finalStatus.totalBytes };
}

export async function deletePartAudio(reciterId: string, partId: QuranPart, appOverride?: App | null): Promise<{ deletedFiles: number; freedBytes: number }> {
  const app = getApp(appOverride);
  if (!app) throw new Error("Obsidian app not available");
  const surahs = getSurahsByPart(partId);
  let deletedFiles = 0;
  let freedBytes = 0;
  // Need to know reciter type – infer by checking both path patterns
  // We try both surah and ayah paths; whichever exists we delete.
  for (const sh of surahs) {
    // Try surah path first
    const surahPath = getOfflineSurahAudioPath(reciterId, sh.id);
    if (await adapterExists(app, surahPath)) {
      const sz = await adapterStatSize(app, surahPath);
      await adapterRemoveNoTrash(app, surahPath);
      revokeOfflineBlobCacheForPath(surahPath);
      invalidateOfflineFileSize(surahPath);
      deletedFiles++;
      if (sz) freedBytes += sz;
      continue; // surah-based reciter will have surah file, no need to check ayah
    }
    // Try ayah paths
    for (let ay = 1; ay <= sh.verseCount; ay++) {
      const p1 = getOfflineAyahAudioPath(reciterId, sh.id, ay);
      const p2 = getOfflineAyahAudioPathLegacy(reciterId, sh.id, ay);
      for (const p of [p1, p2]) {
        if (await adapterExists(app, p)) {
          const sz = await adapterStatSize(app, p);
          await adapterRemoveNoTrash(app, p);
          revokeOfflineBlobCacheForPath(p);
          invalidateOfflineFileSize(p);
          deletedFiles++;
          if (sz) freedBytes += sz;
        }
      }
    }
  }
  // Also try to clean empty reciter folder if no files left
  try {
    const reciterDir = normalizePath(`${OFFLINE_AUDIO_ROOT}/${reciterId}`);
    const remaining = await listFilesRecursive(app, reciterDir);
    if (remaining.length === 0) {
      // remove empty dir via adapter
      // Documented cast: the only `unknown` -> typed boundary for the vault
      // adapter in this scope; every adapter call below is typed.
      const adapter = app?.vault?.adapter as unknown as VaultFiles | undefined;
      if (adapter?.rmdir) try { await adapter.rmdir(reciterDir, false); } catch { /* best-effort only; ignore */ }
    }
  } catch { /* best-effort only; ignore */ }

  return { deletedFiles, freedBytes };
}

export async function deleteAllOfflineAudioForReciter(reciterId: string, appOverride?: App | null): Promise<{ deletedFiles: number; freedBytes: number }> {
  const app = getApp(appOverride);
  if (!app) throw new Error("Obsidian app not available");
  const reciterDir = normalizePath(`${OFFLINE_AUDIO_ROOT}/${reciterId}`);
  const files = await listFilesRecursive(app, reciterDir);
  let deletedFiles = 0;
  let freedBytes = 0;
  for (const f of files) {
    if (!f.toLowerCase().endsWith(".mp3")) continue;
    const sz = await adapterStatSize(app, f);
    await adapterRemoveNoTrash(app, f);
    revokeOfflineBlobCacheForPath(f);
    invalidateOfflineFileSize(f);
    deletedFiles++;
    if (sz) freedBytes += sz;
  }
  // try rmdir
  try {
    // Documented cast: the only `unknown` -> typed boundary for the vault
    // adapter in this scope; every adapter call below is typed.
    const adapter = app?.vault?.adapter as unknown as VaultFiles | undefined;
    if (adapter?.rmdir) try { await adapter.rmdir(reciterDir, true); } catch { /* best-effort only; ignore */ }
  } catch { /* best-effort only; ignore */ }
  return { deletedFiles, freedBytes };
}

// ---------- offline URL resolution for player (blob-based for reliable offline playback) ----------

const offlineBlobCache = new Map<string, string>();

function toArrayBuffer(value: unknown): ArrayBuffer | null {
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) {
    const view = value;
    return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
  }
  return null;
}

async function getOfflineBlobUrl(app: App, path: string): Promise<string | null> {
  const normalized = normalizePath(path);
  if (offlineBlobCache.has(normalized)) return offlineBlobCache.get(normalized)!;
  // Documented cast: the only `unknown` -> typed boundary for the vault
  // adapter in this helper; every adapter call below is typed.
  const adapter = app?.vault?.adapter as unknown as VaultFiles | undefined;
  try {
    let buf: ArrayBuffer | null = null;
    if (adapter?.readBinary) {
      try { buf = toArrayBuffer(await adapter.readBinary(normalized)); } catch { /* best-effort only; ignore */ }
    }
    if (!buf || !(buf instanceof ArrayBuffer) || buf.byteLength === 0) {
      // fallback: try adapter.read as binary string -> convert
      if (adapter?.read) {
        try {
          const txt: string = await adapter.read(normalized);
          if (txt) {
            const arr = new Uint8Array(txt.length);
            for (let i = 0; i < txt.length; i++) arr[i] = txt.charCodeAt(i) & 0xff;
            buf = arr.buffer;
          }
        } catch { /* best-effort only; ignore */ }
      }
    }
    if (!buf || !(buf instanceof ArrayBuffer) || buf.byteLength === 0) return null;
    const blob = new Blob([buf], { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);
    offlineBlobCache.set(normalized, url);
    return url;
  } catch { return null; }
}

export function revokeOfflineBlobCacheForPath(path: string): void {
  const normalized = normalizePath(path);
  const url = offlineBlobCache.get(normalized);
  if (url) {
    try { URL.revokeObjectURL(url); } catch { /* best-effort only; ignore */ }
    offlineBlobCache.delete(normalized);
  }
}

/**
 * Synchronous cache peek (no vault I/O) for the player's hot path.
 * After the first verse of a surah resolves its Blob URL, following verses in
 * the same surah/file reuse it without another adapter round-trip — this
 * removes the per-verse async gap during seamless surah-based playback.
 */
export function peekOfflineAudioUrlIfCached(reciter: Reciter, surahId: number, ayahId: number): string | null {
  if (reciter.type === "surah-based") {
    return offlineBlobCache.get(normalizePath(getOfflineSurahAudioPath(reciter.id, surahId))) ?? null;
  }
  for (const p of [getOfflineAyahAudioPath(reciter.id, surahId, ayahId), getOfflineAyahAudioPathLegacy(reciter.id, surahId, ayahId)]) {
    const hit = offlineBlobCache.get(normalizePath(p));
    if (hit) return hit;
  }
  return null;
}

export async function getOfflineAudioUrlForSurah(reciterId: string, surahId: number, appOverride?: App | null): Promise<string | null> {
  const app = getApp(appOverride);
  if (!app) return null;
  const p = getOfflineSurahAudioPath(reciterId, surahId);
  if (!(await adapterExists(app, p))) return null;
  // Prefer blob URL for reliable playback on mobile (hidden .obsidian paths may not be served via getResourcePath on Capacitor)
  const blobUrl = await getOfflineBlobUrl(app, p);
  if (blobUrl) return blobUrl;
  // Documented cast: the only `unknown` -> typed boundary for the vault
  // adapter in this scope; every adapter call below is typed.
  const adapter = app?.vault?.adapter as unknown as VaultFiles | undefined;
  if (adapter?.getResourcePath) {
    try { return adapter.getResourcePath(p); } catch { /* best-effort only; ignore */ }
  }
  return null;
}

export async function getOfflineAudioUrlForAyah(reciterId: string, surahId: number, ayahId: number, appOverride?: App | null): Promise<string | null> {
  const app = getApp(appOverride);
  if (!app) return null;
  const p1 = getOfflineAyahAudioPath(reciterId, surahId, ayahId);
  const p2 = getOfflineAyahAudioPathLegacy(reciterId, surahId, ayahId);
  for (const p of [p1, p2]) {
    if (await adapterExists(app, p)) {
      const blobUrl = await getOfflineBlobUrl(app, p);
      if (blobUrl) return blobUrl;
      // Documented cast: the only `unknown` -> typed boundary for the vault
      // adapter in this scope; every adapter call below is typed.
      const adapter = app?.vault?.adapter as unknown as VaultFiles | undefined;
      if (adapter?.getResourcePath) {
        try { return adapter.getResourcePath(p); } catch { /* best-effort only; ignore */ }
      }
    }
  }
  return null;
}

export async function getOfflineAudioUrlIfAvailable(reciter: Reciter, surahId: number, ayahId: number, appOverride?: App | null): Promise<string | null> {
  if (reciter.type === "surah-based") {
    return getOfflineAudioUrlForSurah(reciter.id, surahId, appOverride);
  } else {
    return getOfflineAudioUrlForAyah(reciter.id, surahId, ayahId, appOverride);
  }
}

// Helper to check existence without generating URL (for UI status)
export async function isOfflineAvailable(reciter: Reciter, surahId: number, ayahId: number, appOverride?: App | null): Promise<boolean> {
  const url = await getOfflineAudioUrlIfAvailable(reciter, surahId, ayahId, appOverride);
  return !!url;
}
