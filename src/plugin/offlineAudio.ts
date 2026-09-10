import { App, TFile, TFolder, normalizePath, Notice } from "obsidian";
import { SURAHS, getSurahsByPart } from "@/lib/quranData";
import { QuranPart } from "@/lib/types";
import { Reciter, loadRecitationData, getAudioInfoForVerse } from "@/lib/audio";
import { ensureFolder, isHiddenPath } from "./storage/vaultAdapter";

// Offline audio is stored inside plugin folder (not vault root) so only one folder to sync.
// Works on mobile as well because we use adapter directly for hidden paths.
export const OFFLINE_AUDIO_ROOT = ".obsidian/plugins/quran-life/offline-audio";
export const OFFLINE_MANIFEST_PATH = normalizePath(`${OFFLINE_AUDIO_ROOT}/manifest.json`);

function getApp(appOverride?: any): App | null {
  try {
    const app = appOverride ?? (typeof window !== 'undefined' ? (window as any).app : null);
    return app?.vault?.adapter ? app : null;
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
  const adapter: any = (app as any).vault?.adapter;
  if (adapter?.exists) {
    try { return await adapter.exists(normalized); } catch { return false; }
  }
  return !!app.vault.getAbstractFileByPath(normalized);
}

async function adapterStatSize(app: App, path: string): Promise<number | null> {
  const normalized = normalizePath(path);
  const adapter: any = (app as any).vault?.adapter;
  if (adapter?.stat) {
    try {
      const st = await adapter.stat(normalized);
      if (st && typeof st.size === "number") return st.size;
      if (st && typeof st.stat?.size === "number") return st.stat.size;
    } catch {}
  }
  // fallback: readBinary length
  if (adapter?.readBinary) {
    try {
      const buf = await adapter.readBinary(normalized);
      if (buf instanceof ArrayBuffer) return buf.byteLength;
      if (buf?.byteLength) return buf.byteLength;
    } catch {}
  }
  return null;
}

async function adapterRemoveNoTrash(app: App, path: string): Promise<void> {
  const normalized = normalizePath(path);
  const adapter: any = (app as any).vault?.adapter;
  // Always use adapter.remove to avoid Obsidian trash (which would duplicate storage)
  if (adapter?.remove) {
    try {
      if (adapter.exists && !(await adapter.exists(normalized))) return;
      await adapter.remove(normalized);
      return;
    } catch {}
  }
  // Fallback: try vault.delete with force? but avoid trash – use adapter if possible
  try {
    const file: any = app.vault.getAbstractFileByPath(normalized);
    if (file) await app.vault.delete(file, true);
  } catch {}
}

async function adapterWriteBinary(app: App, path: string, data: ArrayBuffer): Promise<void> {
  const normalized = normalizePath(path);
  await ensureFolder(app, normalized.split("/").slice(0, -1).join("/") || "/");
  const adapter: any = (app as any).vault?.adapter;
  if (adapter?.writeBinary) {
    try { await adapter.writeBinary(normalized, data); return; } catch {}
  }
  if (adapter?.write) {
    // fallback: write as binary via write (may corrupt, but try)
    try {
      // For hidden paths, adapter.write expects string; try to write via base64?
      // Use writeBinary if available, else try vault create
      const u8 = new Uint8Array(data);
      let binary = "";
      for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]);
      // @ts-ignore
      await adapter.write(normalized, binary);
      return;
    } catch {}
  }
  // last resort: use vault binary if supported
  try {
    // @ts-ignore
    if (app.vault.createBinary) await (app.vault as any).createBinary(normalized, data);
    else throw new Error("no binary write");
  } catch (e) {
    throw e;
  }
}

async function adapterListFiles(app: App, dirPath: string): Promise<string[]> {
  const normalized = normalizePath(dirPath);
  const adapter: any = (app as any).vault?.adapter;
  if (adapter?.list) {
    try {
      const listed = await adapter.list(normalized);
      if (Array.isArray(listed?.files)) return listed.files;
      if (Array.isArray(listed)) return listed;
    } catch {}
  }
  const folder: any = app.vault.getAbstractFileByPath(normalized);
  if (folder && folder.children) {
    return folder.children.filter((c: any) => c instanceof TFile).map((c: any) => c.path);
  }
  return [];
}

async function listFilesRecursive(app: App, dir: string, out: string[] = []): Promise<string[]> {
  const normalized = normalizePath(dir);
  const adapter: any = (app as any).vault?.adapter;
  let entries: { files: string[]; folders: string[] } | null = null;
  if (adapter?.list) {
    try { entries = await adapter.list(normalized); } catch {}
  }
  if (entries && Array.isArray(entries.files)) {
    for (const f of entries.files) out.push(f);
    for (const sub of entries.folders || []) {
      await listFilesRecursive(app, sub, out);
    }
    return out;
  }
  // fallback via vault
  const folder: any = app.vault.getAbstractFileByPath(normalized);
  if (folder && folder.children) {
    for (const child of folder.children) {
      if (child instanceof TFile) out.push(child.path);
      else if (child instanceof TFolder) await listFilesRecursive(app, child.path, out);
    }
  }
  return out;
}

// ---------- offline status ----------

export interface OfflinePartStatus {
  reciterId: string;
  partId: QuranPart;
  totalFiles: number;
  existingFiles: number;
  totalBytes: number; // sum of existing file sizes (bytes)
  isComplete: boolean;
  isPartial: boolean;
}

export async function getOfflinePartStatus(reciter: Reciter, partId: QuranPart, appOverride?: any): Promise<OfflinePartStatus> {
  const app = getApp(appOverride);
  if (!app) return { reciterId: reciter.id, partId, totalFiles: 0, existingFiles: 0, totalBytes: 0, isComplete: false, isPartial: false };
  const surahs = getSurahsByPart(partId);
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
  return {
    reciterId: reciter.id,
    partId,
    totalFiles,
    existingFiles,
    totalBytes,
    isComplete: totalFiles > 0 && existingFiles >= totalFiles,
    isPartial: existingFiles > 0 && existingFiles < totalFiles,
  };
}

export async function getTotalOfflineStorageUsage(appOverride?: any): Promise<{ totalBytes: number; fileCount: number; byReciter: Record<string, { bytes: number; files: number }> }> {
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
}

async function fetchArrayBufferViaRequestUrl(url: string, app: App): Promise<ArrayBuffer> {
  // Use Obsidian requestUrl to bypass CORS for tarteel CDN
  let req: any = null;
  try {
    const obs: any = await import("obsidian");
    req = obs.requestUrl;
  } catch { req = (window as any).requestUrl; }
  if (!req) {
    // fallback fetch
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.arrayBuffer();
  }
  const res: any = await req({ url, method: "GET" });
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
  appOverride?: any,
  opts: OfflineDownloadOptions = {}
): Promise<{ downloadedFiles: number; failedFiles: number; totalBytes: number }> {
  const app = getApp(appOverride);
  if (!app) throw new Error("Obsidian app not available");
  const concurrency = Math.max(1, Math.min(6, opts.concurrency ?? 3));
  const delayMs = opts.delayMs ?? 250;
  const skipExisting = opts.skipExisting ?? true;

  const surahs = getSurahsByPart(partId);
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
      const status = await getOfflinePartStatus(reciter, partId, app);
      if (status.isComplete) return { downloadedFiles: 0, failedFiles: 0, totalBytes: status.totalBytes };
    }
  } else {
    // ayah-based: need the large verses map JSON locally
    // Load once
    let ayahData: any = null;
    try { ayahData = await loadRecitationData(reciter, 1, app); } catch {}
    if (!ayahData?.verses) throw new Error("Failed to load ayah recitation map");
    for (const sh of surahs) {
      for (let ay = 1; ay <= sh.verseCount; ay++) {
        const offlinePath = getOfflineAyahAudioPath(reciter.id, sh.id, ay);
        const legacyPath = getOfflineAyahAudioPathLegacy(reciter.id, sh.id, ay);
        if (skipExisting && ((await adapterExists(app, offlinePath)) || (await adapterExists(app, legacyPath)))) continue;
        const key = `${sh.id}:${ay}`;
        const entry = ayahData.verses[key];
        const remoteUrl = entry?.audio_url;
        if (!remoteUrl) continue;
        tasks.push({ type: "ayah", surahId: sh.id, ayahId: ay, remoteUrl, offlinePath, label: `${sh.id}:${ay}` });
      }
    }
  }

  const totalFiles = tasks.length;
  // If skipExisting and tasks empty, nothing to do
  if (totalFiles === 0) {
    opts.onProgress?.({ totalFiles: 0, completedFiles: 0, failedFiles: 0, downloadedBytes: 0, percent: 100 });
    return { downloadedFiles: 0, failedFiles: 0, totalBytes: 0 };
  }

  // For progress, we need to report against original total including skipped? Use tasks as remaining
  // But to give user correct progress, we should consider already-existing files as completed.
  // Let's compute existing count
  const statusBefore = await getOfflinePartStatus(reciter, partId, app);
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
      completedFiles++;
      downloadedBytes += buf.byteLength;
      report(task.label);
    } catch (e) {
      if (String((e as any)?.message || "").includes("aborted")) throw e;
      if (attempt < 3) {
        // exponential backoff 1s, 2s
        await new Promise(r => setTimeout(r, attempt * 1000));
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
      if (idx !== 0 && delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
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
  const finalStatus = await getOfflinePartStatus(reciter, partId, app);
  return { downloadedFiles: completedFiles - alreadyExisting, failedFiles, totalBytes: finalStatus.totalBytes };
}

export async function deletePartAudio(reciterId: string, partId: QuranPart, appOverride?: any): Promise<{ deletedFiles: number; freedBytes: number }> {
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
      const adapter: any = (app as any).vault?.adapter;
      if (adapter?.rmdir) try { await adapter.rmdir(reciterDir, false); } catch {}
    }
  } catch {}

  return { deletedFiles, freedBytes };
}

export async function deleteAllOfflineAudioForReciter(reciterId: string, appOverride?: any): Promise<{ deletedFiles: number; freedBytes: number }> {
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
    deletedFiles++;
    if (sz) freedBytes += sz;
  }
  // try rmdir
  try {
    const adapter: any = (app as any).vault?.adapter;
    if (adapter?.rmdir) try { await adapter.rmdir(reciterDir, true); } catch {}
  } catch {}
  return { deletedFiles, freedBytes };
}

// ---------- offline URL resolution for player (blob-based for reliable offline playback) ----------

const offlineBlobCache = new Map<string, string>();

function toArrayBuffer(value: unknown): ArrayBuffer | null {
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
  }
  return null;
}

async function getOfflineBlobUrl(app: App, path: string): Promise<string | null> {
  const normalized = normalizePath(path);
  if (offlineBlobCache.has(normalized)) return offlineBlobCache.get(normalized)!;
  const adapter: any = (app as any).vault?.adapter;
  try {
    let buf: ArrayBuffer | null = null;
    if (adapter?.readBinary) {
      try { buf = toArrayBuffer(await adapter.readBinary(normalized)); } catch {}
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
        } catch {}
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
    try { URL.revokeObjectURL(url); } catch {}
    offlineBlobCache.delete(normalized);
  }
}

export async function getOfflineAudioUrlForSurah(reciterId: string, surahId: number, appOverride?: any): Promise<string | null> {
  const app = getApp(appOverride);
  if (!app) return null;
  const p = getOfflineSurahAudioPath(reciterId, surahId);
  if (!(await adapterExists(app, p))) return null;
  // Prefer blob URL for reliable playback on mobile (hidden .obsidian paths may not be served via getResourcePath on Capacitor)
  const blobUrl = await getOfflineBlobUrl(app, p);
  if (blobUrl) return blobUrl;
  const adapter: any = (app as any).vault?.adapter;
  if (adapter?.getResourcePath) {
    try { return adapter.getResourcePath(p); } catch {}
  }
  try { return (app.vault as any).adapter.getResourcePath(p); } catch { return null; }
}

export async function getOfflineAudioUrlForAyah(reciterId: string, surahId: number, ayahId: number, appOverride?: any): Promise<string | null> {
  const app = getApp(appOverride);
  if (!app) return null;
  const p1 = getOfflineAyahAudioPath(reciterId, surahId, ayahId);
  const p2 = getOfflineAyahAudioPathLegacy(reciterId, surahId, ayahId);
  for (const p of [p1, p2]) {
    if (await adapterExists(app, p)) {
      const blobUrl = await getOfflineBlobUrl(app, p);
      if (blobUrl) return blobUrl;
      const adapter: any = (app as any).vault?.adapter;
      if (adapter?.getResourcePath) {
        try { return adapter.getResourcePath(p); } catch {}
      }
      try { return (app.vault as any).adapter.getResourcePath(p); } catch {}
    }
  }
  return null;
}

export async function getOfflineAudioUrlIfAvailable(reciter: Reciter, surahId: number, ayahId: number, appOverride?: any): Promise<string | null> {
  if (reciter.type === "surah-based") {
    return getOfflineAudioUrlForSurah(reciter.id, surahId, appOverride);
  } else {
    return getOfflineAudioUrlForAyah(reciter.id, surahId, ayahId, appOverride);
  }
}

// Helper to check existence without generating URL (for UI status)
export async function isOfflineAvailable(reciter: Reciter, surahId: number, ayahId: number, appOverride?: any): Promise<boolean> {
  const url = await getOfflineAudioUrlIfAvailable(reciter, surahId, ayahId, appOverride);
  return !!url;
}
