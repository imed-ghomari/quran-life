/**
 * VaultAdapter — Obsidian-native storage for Quran Life
 * Replaces localStorage + InstantDB with vault files that sync with the vault.
 * Strategy: one file per entity (not one giant JSON) to avoid file-level sync conflicts.
 *
 * Data folder: the plugin's own data folder (`<configDir>/plugins/quran-life/data`),
 * always — there is no user-facing data path setting, so every vault keeps one
 * predictable folder. `QuranLife/` at vault root is only read for legacy migration.
 * Use `Vault.process()` for atomic read-modify-write, debounced writes for tldraw.
 *
 * See: obsidian-developer-docs/en/Plugins/Vault.md, src/lib/anki/* legacy stores
 */

import { App, TFile, TFolder, normalizePath } from "obsidian";
import type { AnkiAnchor, MindmapRecord } from "@/lib/anki/types";
import type { ListeningProgressEntry } from "@/lib/types";
import { asArray } from "@/lib/json";

// Vault layout — every path lives under the data root, which is always the
// plugin's data folder so only one folder ever needs to sync.
// This is hidden but accessible via adapter (vault API hides the config folder, the adapter can read it)
// On mobile, hidden config paths use the adapter and may be sandboxed — guard gracefully, never throw

/** Data folder inside the vault's configuration folder (i.e. `<configDir>/plugins/quran-life/data`). */
const PLUGIN_DATA_SUBPATH = "plugins/quran-life/data";

export const LEGACY_DATA_ROOT = "QuranLife"; // previous location, read only (migration)

/** The one and only data root for the current vault (`<configDir>/plugins/quran-life/data`). */
export function getDefaultDataRoot(app: App): string {
  return normalizePath(`${app.vault.configDir}/${PLUGIN_DATA_SUBPATH}`);
}

export const VAULT_PATHS = {
  // Global settings (small, rarely conflicted)
  settings: (root: string) => normalizePath(`${root}/settings.json`),
  // Daily portion
  dailySettings: (root: string) => normalizePath(`${root}/daily/settings.json`),
  dailyProgress: (root: string) => normalizePath(`${root}/daily/progress.json`),
  // Listening progress per part — split to avoid giant array
  // daily/progress/part-1.json, part-2.json...
  listeningProgressDir: (root: string) => normalizePath(`${root}/daily/progress`),
  // Splits: one per surah — 114 files @ ~200B each = ~23KB total, not 12MB
  // Editing Surah 2 doesn't touch Surah 50's file → no sync conflict
  splitsDir: (root: string) => normalizePath(`${root}/splits`),
  splitFile: (root: string, surahId: number) => normalizePath(`${root}/splits/surah-${String(surahId).padStart(3, "0")}.json`),
  // Mindmaps: one per surah/part — tldraw snapshots are 20-2000KB each, must be split
  // Before: 70 mindmaps in one 15MB JSON > the browser storage quota + 15MB rewritten on every stroke
  // After: surah-002.json = ~180KB, only that file syncs on edit
  mindmapsDir: (root: string) => normalizePath(`${root}/mindmaps`),
  mindmapFile: (root: string, key: string) => normalizePath(`${root}/mindmaps/${key}.json`), // key = surah-2, part-1, meta-0
  // Docs: one markdown per mindmap — user-editable in Obsidian, synced per-file
  docsDir: (root: string) => normalizePath(`${root}/docs`),
  docFile: (root: string, key: string) => normalizePath(`${root}/docs/${key}.md`),
  // Anki deleted keys (tombstones) — small set, single file at the data root
  deletedMindmaps: (root: string) => normalizePath(`${root}/deleted-mindmaps.json`),
  // Anki export prefs (partOrder + surahOrder) — vault-synced
  ankiExport: (root: string) => normalizePath(`${root}/anki-export.json`),
} as const;

/**
 * Paths older builds wrote. They are read (and folded into {@link VAULT_PATHS})
 * on load so existing installs keep their tombstones and export prefs; nothing
 * writes here anymore. Review state (`nodes/`) is gone for good — Anki owns it.
 */
export const LEGACY_PATHS = {
  deletedMindmaps: (root: string) => normalizePath(`${root}/meta/deleted-mindmaps.json`),
  ankiExport: (root: string) => normalizePath(`${root}/meta/anki-export.json`),
} as const;

// ---------- low-level helpers ----------

/** True when `path` lives inside the vault's configuration folder (invisible to the vault API). */
export function isHiddenPath(app: App, path: string): boolean {
  const configDir = normalizePath(app.vault.configDir);
  const normalized = normalizePath(path);
  return normalized === configDir || normalized.startsWith(`${configDir}/`);
}


export async function ensureFolder(app: App, folderPath: string): Promise<void> {
  try {
    const normalized = normalizePath(folderPath);
    const adapter = app.vault.adapter;
    if (isHiddenPath(app, normalized)) {
      // Hidden config paths need the adapter (the vault API hides them).
      // On mobile the adapter may be Capacitor FS — guard and do not throw.
      const parts = normalized.split("/");
      let cur = "";
      for (const part of parts) {
        cur = cur ? `${cur}/${part}` : part;
        try {
          const exists = await adapter.exists(cur);
          if (!exists) await adapter.mkdir(cur);
        } catch {
          /* best effort: hidden folder may be sandboxed on mobile */
        }
      }
      return;
    }
    if (app.vault.getAbstractFileByPath(normalized) instanceof TFolder) return;
    // vault.createFolder throws if exists, so check first; create recursively
    const parts = normalized.split("/");
    let cur = "";
    for (const part of parts) {
      cur = cur ? `${cur}/${part}` : part;
      if (!app.vault.getAbstractFileByPath(cur)) {
        try {
          await app.vault.createFolder(cur);
        } catch (e) {
          if (!String(e instanceof Error ? e.message : e).includes("already exists")) throw e;
        }
      }
    }
  } catch {
    /* never throw from ensureFolder — mobile may sandbox hidden paths, plugin should still enable */
  }
}

async function writeJsonAtomic(app: App, filePath: string, data: unknown): Promise<void> {
  const normalized = normalizePath(filePath);
  const text = JSON.stringify(data, null, 2);
  const parent = (() => { const i = normalized.lastIndexOf("/"); return i < 0 ? "" : normalized.slice(0, i); })();
  await ensureFolder(app, parent || "/");
  if (isHiddenPath(app, normalized)) {
    try {
      await app.vault.adapter.write(normalized, text);
      return;
    } catch {
      /* fall through to the vault API */
    }
  }
  const file = app.vault.getAbstractFileByPath(normalized);
  if (file instanceof TFile) {
    // Use process for atomicity: guarantees no overwrite of an external sync change between read/write
    // See docs: Vault.process() guarantees file doesn't change between read and modify
    await app.vault.process(file, () => text);
  } else {
    await app.vault.create(normalized, text);
  }
}

async function readJson<T>(app: App, filePath: string, fallback: T): Promise<T> {
  const normalized = normalizePath(filePath);
  if (isHiddenPath(app, normalized)) {
    const { adapter } = app.vault;
    try {
      const exists = await adapter.exists(normalized);
      if (!exists) return fallback;
      const raw = await adapter.read(normalized);
      if (!raw || !raw.trim()) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
  const file = app.vault.getAbstractFileByPath(normalized);
  if (!(file instanceof TFile)) return fallback;
  try {
    const raw = await app.vault.read(file); // not cachedRead — we need fresh for external sync
    if (!raw.trim()) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function readText(app: App, filePath: string, fallback: string | null = null): Promise<string | null> {
  const normalized = normalizePath(filePath);
  if (isHiddenPath(app, normalized)) {
    const { adapter } = app.vault;
    try {
      const exists = await adapter.exists(normalized);
      if (!exists) return fallback;
      return await adapter.read(normalized);
    } catch {
      return fallback;
    }
  }
  const file = app.vault.getAbstractFileByPath(normalized);
  if (!(file instanceof TFile)) return fallback;
  try {
    return await app.vault.read(file);
  } catch {
    return fallback;
  }
}

async function adapterListFiles(app: App, dirPath: string): Promise<string[]> {
  const normalized = normalizePath(dirPath);
  if (isHiddenPath(app, normalized)) {
    try {
      const listed = await app.vault.adapter.list(normalized);
      return listed.files;
    } catch {
      /* folder may not exist yet */
    }
  }
  const folder = app.vault.getAbstractFileByPath(normalized);
  if (folder instanceof TFolder) {
    return folder.children.filter((c): c is TFile => c instanceof TFile).map(c => c.path);
  }
  return [];
}

// ---------- debounced writer (for tldraw high-frequency edits) ----------

export class DebouncedVaultWriter {
  private timers = new Map<string, number>();
  constructor(private app: App) {}
  schedule(filePath: string, data: unknown, delayMs = 700): void {
    const existing = this.timers.get(filePath);
    if (existing) window.clearTimeout(existing);
    const id = window.setTimeout(() => {
      this.timers.delete(filePath);
      void writeJsonAtomic(this.app, filePath, data);
    }, delayMs);
    this.timers.set(filePath, id);
  }
  async flush(filePath?: string): Promise<void> {
    if (filePath) {
      const id = this.timers.get(filePath);
      if (id) {
        window.clearTimeout(id);
        this.timers.delete(filePath);
      }
      return;
    }
    for (const [path, id] of this.timers) {
      window.clearTimeout(id);
      this.timers.delete(path);
      // caller should have buffered data; flush is for timer cleanup — actual write needs data
      // prefer explicit writeJsonAtomic on exit path (ensureSavedBeforeExit pattern from MindmapEditor)
    }
  }
}

// ---------- high-level API mirroring legacy stores ----------

export interface QuranLifeSettings {
  dailyTargetMinutes?: number;
  activePart?: number;
  dailyPortionMode?: "audio" | "reading";
  dailyReadingStyle?: "line_by_line" | "paragraph";
  skippedSurahs?: number[];
  theme?: string;
  accentTheme?: string;
  // ... extend as needed from AppSettings
}

export class VaultStore {
  constructor(readonly app: App, private dataRoot: string = getDefaultDataRoot(app)) {}

  get root(): string { return this.dataRoot; }

  // Settings — single small JSON, Vault.process() for conflict safety
  async loadSettings<T = QuranLifeSettings>(fallback: T): Promise<T> {
    return readJson(this.app, VAULT_PATHS.settings(this.dataRoot), fallback);
  }
  async saveSettings(data: unknown): Promise<void> {
    await writeJsonAtomic(this.app, VAULT_PATHS.settings(this.dataRoot), data);
  }

  // Splits — per surah
  async loadSplitsForSurah(surahId: number): Promise<AnkiAnchor[]> {
    return readJson<AnkiAnchor[]>(this.app, VAULT_PATHS.splitFile(this.dataRoot, surahId), []);
  }
  async saveSplitsForSurah(surahId: number, anchors: AnkiAnchor[]): Promise<void> {
    if (anchors.length === 0) {
      const path = VAULT_PATHS.splitFile(this.dataRoot, surahId);
      if (isHiddenPath(this.app, path)) {
        try {
          if (await this.app.vault.adapter.exists(path)) await this.app.vault.adapter.remove(path);
        } catch {
          /* already gone */
        }
      } else {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) await this.app.fileManager.trashFile(file);
      }
      return;
    }
    await writeJsonAtomic(this.app, VAULT_PATHS.splitFile(this.dataRoot, surahId), anchors);
  }
  async loadAllSplits(): Promise<Record<number, AnkiAnchor[]>> {
    const out: Record<number, AnkiAnchor[]> = {};
    const files = await adapterListFiles(this.app, VAULT_PATHS.splitsDir(this.dataRoot));
    for (const filePath of files) {
      if (!filePath.endsWith(".json")) continue;
      const base = filePath.slice(filePath.lastIndexOf("/") + 1) || "";
      const m = base.match(/surah-(\d+)\.json/);
      if (!m) continue;
      const sid = Number(m[1]);
      out[sid] = await readJson<AnkiAnchor[]>(this.app, filePath, []);
    }
    // Fallback for non-hidden legacy vault API (if adapterListFiles returned empty but vault folder exists)
    if (Object.keys(out).length === 0 && !isHiddenPath(this.app, VAULT_PATHS.splitsDir(this.dataRoot))) {
      const dir = this.app.vault.getAbstractFileByPath(VAULT_PATHS.splitsDir(this.dataRoot));
      if (dir instanceof TFolder) {
        for (const child of dir.children) {
          if (!(child instanceof TFile) || !child.name.endsWith(".json")) continue;
          const m = child.name.match(/surah-(\d+)\.json/);
          if (!m) continue;
          const sid = Number(m[1]);
          out[sid] = await readJson<AnkiAnchor[]>(this.app, child.path, []);
        }
      }
    }
    return out;
  }

  /**
   * Every doc file that exists in `docs/`, keyed by basename.
   * The Deck Statistics panel used to enumerate docs from the mindmap list, so
   * notes added directly to the data folder (or for a key without a mindmap)
   * were invisible. Listing the folder reports what is actually on disk.
   */
  async loadAllDocs(): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    const dir = VAULT_PATHS.docsDir(this.dataRoot);
    const files = await adapterListFiles(this.app, dir);
    for (const filePath of files) {
      if (!/\.(md|markdown)$/i.test(filePath)) continue;
      const base = (filePath.slice(filePath.lastIndexOf("/") + 1) || "").replace(/\.(md|markdown)$/i, "");
      if (!base) continue;
      const content = await readText(this.app, filePath, null);
      if (typeof content === "string") out[base] = content;
    }
    if (Object.keys(out).length === 0 && !isHiddenPath(this.app, dir)) {
      const folder = this.app.vault.getAbstractFileByPath(dir);
      if (folder instanceof TFolder) {
        for (const child of folder.children) {
          if (!(child instanceof TFile) || !/\.(md|markdown)$/i.test(child.name)) continue;
          const base = child.name.replace(/\.(md|markdown)$/i, "");
          try { out[base] = await this.app.vault.read(child); } catch { /* unreadable file — skip */ }
        }
      }
    }
    return out;
  }

  // Mindmaps — per key
  async loadMindmap(key: string): Promise<MindmapRecord | null> {
    return readJson<MindmapRecord | null>(this.app, VAULT_PATHS.mindmapFile(this.dataRoot, key), null);
  }
  async saveMindmap(key: string, data: MindmapRecord): Promise<void> {
    await writeJsonAtomic(this.app, VAULT_PATHS.mindmapFile(this.dataRoot, key), data);
  }
  async deleteMindmap(key: string): Promise<void> {
    const path = VAULT_PATHS.mindmapFile(this.dataRoot, key);
    if (isHiddenPath(this.app, path)) {
      try {
        if (await this.app.vault.adapter.exists(path)) await this.app.vault.adapter.remove(path);
      } catch {
        /* already gone */
      }
    } else {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) await this.app.fileManager.trashFile(file);
    }
    // Tombstone: track deleted keys so a delete syncs cleanly across devices
    const deleted = await this.loadDeletedKeys();
    deleted.add(key);
    await this.saveDeletedKeys(deleted);
  }
  async loadDeletedKeys(): Promise<Set<string>> {
    const filePath = VAULT_PATHS.deletedMindmaps(this.dataRoot);
    let arr = await readJson<unknown>(this.app, filePath, []);
    if (asArray(arr).length === 0) {
      // Pre-`meta/`-removal install: fold the old tombstones file into place.
      const legacy = await readJson<unknown>(this.app, LEGACY_PATHS.deletedMindmaps(this.dataRoot), []);
      if (asArray(legacy).length > 0) {
        arr = legacy;
        await writeJsonAtomic(this.app, filePath, legacy);
      }
    }
    return new Set(asArray(arr).filter((k): k is string => typeof k === "string"));
  }
  async saveDeletedKeys(set: Set<string>): Promise<void> {
    await writeJsonAtomic(this.app, VAULT_PATHS.deletedMindmaps(this.dataRoot), [...set]);
  }

  // Docs — markdown, one per key
  async loadDoc(key: string): Promise<string | null> {
    return readText(this.app, VAULT_PATHS.docFile(this.dataRoot, key), null);
  }
  async saveDoc(key: string, content: string): Promise<void> {
    const path = VAULT_PATHS.docFile(this.dataRoot, key);
    await ensureFolder(this.app, VAULT_PATHS.docsDir(this.dataRoot));
    if (isHiddenPath(this.app, path)) {
      try {
        await this.app.vault.adapter.write(path, content);
        return;
      } catch {
        /* fall through to the vault API */
      }
    }
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) await this.app.vault.modify(file, content);
    else await this.app.vault.create(path, content);
  }

  // Anki export prefs — partOrder + surahOrder
  async loadAnkiExportPrefs(): Promise<import('@/lib/anki/ankiExportPrefs').AnkiExportPrefs> {
    const { normalizeAnkiExportPrefs, DEFAULT_ANKI_EXPORT_PREFS } = await import('@/lib/anki/ankiExportPrefs');
    const filePath = VAULT_PATHS.ankiExport(this.dataRoot);
    let raw = await readJson<unknown>(this.app, filePath, null);
    if (!raw) {
      // Pre-`meta/`-removal install: fold the old prefs file into place.
      const legacy = await readJson<unknown>(this.app, LEGACY_PATHS.ankiExport(this.dataRoot), null);
      if (legacy) {
        raw = legacy;
        await writeJsonAtomic(this.app, filePath, normalizeAnkiExportPrefs(legacy));
      }
    }
    if (!raw) return { ...DEFAULT_ANKI_EXPORT_PREFS };
    return normalizeAnkiExportPrefs(raw);
  }
  async saveAnkiExportPrefs(prefs: import('@/lib/anki/ankiExportPrefs').AnkiExportPrefs): Promise<void> {
    const { normalizeAnkiExportPrefs } = await import('@/lib/anki/ankiExportPrefs');
    await writeJsonAtomic(this.app, VAULT_PATHS.ankiExport(this.dataRoot), normalizeAnkiExportPrefs(prefs));
  }

  // Anki export — persist the generated .apkg into the vault so the file is
  // never lost when the WebView blocks the browser download (Obsidian Mobile
  // has no downloads folder; the anchor-click download silently does nothing).
  // Saved at the vault root (visible) rather than the data root (often hidden).
  async saveApkgFile(fileName: string, blob: Blob): Promise<string> {
    const normalized = normalizePath(fileName);
    const dir = (() => { const i = normalized.lastIndexOf("/"); return i < 0 ? "" : normalized.slice(0, i); })();
    if (dir) await ensureFolder(this.app, dir);
    const ab = await blob.arrayBuffer();
    if (isHiddenPath(this.app, normalized)) {
      await this.app.vault.adapter.writeBinary(normalized, ab);
      return normalized;
    }
    const file = this.app.vault.getAbstractFileByPath(normalized);
    if (file instanceof TFile) {
      await this.app.vault.modifyBinary(file, ab);
    } else {
      await this.app.vault.createBinary(normalized, ab);
    }
    return normalized;
  }

  // Progress — per part
  async loadProgress(partId: number): Promise<ListeningProgressEntry | null> {
    const path = normalizePath(`${VAULT_PATHS.listeningProgressDir(this.dataRoot)}/part-${partId}.json`);
    return readJson<ListeningProgressEntry | null>(this.app, path, null);
  }
  async saveProgress(partId: number, data: unknown): Promise<void> {
    const path = normalizePath(`${VAULT_PATHS.listeningProgressDir(this.dataRoot)}/part-${partId}.json`);
    await writeJsonAtomic(this.app, path, data);
  }

}

// Sync validation comment:
// Splitting is correct because sync does file-level last-writer-wins, not merge. Giant JSON:
//  - 15MB mindmaps file rewritten on every tldraw stroke → 15MB delta sync, slow + quota issues
//  - Concurrent edits on different surahs conflict (last writer wins, other surah lost)
// Split files:
//  - Only touched file syncs (<200KB), bandwidth efficient
//  - Editing surah-2 and surah-50 concurrently on two devices → distinct files, no conflict
//  - Deleted tombstones keep deletes stable across sync merges
//  - Vault.process() prevents clobbering a background sync update

export { asArray, asNonEmptyString, asNumber, asRecord } from "@/lib/json";
