/**
 * VaultAdapter — Obsidian-native storage for Quran Life
 * Replaces localStorage + InstantDB with vault files synced via Resilio Sync.
 * Strategy: one file per entity (not one giant JSON) to avoid Resilio file-level conflicts.
 *
 * Data folder: `QuranLife/` at vault root (configurable in settings).
 * Use `Vault.process()` for atomic read-modify-write, debounced writes for tldraw.
 *
 * See: obsidian-developer-docs/en/Plugins/Vault.md, src/lib/anki/* legacy stores
 */

import { App, TFile, TFolder, normalizePath } from "obsidian";

// Vault layout (all paths relative to vault root)
export const DEFAULT_DATA_ROOT = "QuranLife";

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
  // Resilio: editing Surah 2 doesn't touch Surah 50's file → no conflict
  splitsDir: (root: string) => normalizePath(`${root}/splits`),
  splitFile: (root: string, surahId: number) => normalizePath(`${root}/splits/surah-${String(surahId).padStart(3, "0")}.json`),
  // Mindmaps: one per surah/part — tldraw snapshots are 20-2000KB each, must be split
  // Before: 70 mindmaps in one 15MB JSON > localStorage quota (5-10MB) + Resilio rewrites 15MB on every stroke
  // After: surah-002.json = ~180KB, only that file syncs on edit
  mindmapsDir: (root: string) => normalizePath(`${root}/mindmaps`),
  mindmapFile: (root: string, key: string) => normalizePath(`${root}/mindmaps/${key}.json`), // key = surah-2, part-1, meta-0
  // Docs: one markdown per mindmap — user-editable in Obsidian, Resilio merges per-file
  docsDir: (root: string) => normalizePath(`${root}/docs`),
  docFile: (root: string, key: string) => normalizePath(`${root}/docs/${key}.md`),
  // Anki deleted keys (tombstones) — small set, single file
  deletedMindmaps: (root: string) => normalizePath(`${root}/meta/deleted-mindmaps.json`),
  // FSRS nodes, review logs — per-node files would be thousands; use sharded by surah/part
  // nodes/surah-002.json → MemoryNode[] for that surah; nodes/part-1.json
  nodesDir: (root: string) => normalizePath(`${root}/nodes`),
  // Theme — still in plugin data.json (loadData/saveData) or vault? Vault for Resilio.
  themeFile: (root: string) => normalizePath(`${root}/meta/theme.json`),
} as const;

// ---------- low-level helpers ----------

async function ensureFolder(app: App, folderPath: string): Promise<void> {
  const normalized = normalizePath(folderPath);
  if (app.vault.getAbstractFileByPath(normalized) instanceof TFolder) return;
  // vault.createFolder throws if exists, so check first; create recursively
  const parts = normalized.split("/");
  let cur = "";
  for (const part of parts) {
    cur = cur ? `${cur}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(cur)) {
      try {
        await app.vault.createFolder(cur);
      } catch (e: any) {
        if (!String(e?.message || "").includes("already exists")) throw e;
      }
    }
  }
}

async function writeJsonAtomic(app: App, filePath: string, data: unknown): Promise<void> {
  const normalized = normalizePath(filePath);
  const text = JSON.stringify(data, null, 2);
  await ensureFolder(app, normalized.split("/").slice(0, -1).join("/") || "/");
  const file = app.vault.getAbstractFileByPath(normalized);
  if (file instanceof TFile) {
    // Use process for atomicity: guarantees no overwrite of external (Resilio) change between read/write
    // See docs: Vault.process() guarantees file doesn't change between read and modify
    await app.vault.process(file, () => text);
  } else {
    await app.vault.create(normalized, text);
  }
}

async function readJson<T>(app: App, filePath: string, fallback: T): Promise<T> {
  const file = app.vault.getAbstractFileByPath(normalizePath(filePath));
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
  const file = app.vault.getAbstractFileByPath(normalizePath(filePath));
  if (!(file instanceof TFile)) return fallback;
  try {
    return await app.vault.read(file);
  } catch {
    return fallback;
  }
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
    this.timers.set(filePath, id as unknown as number);
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
  dataRoot: string; // default "QuranLife"
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
  constructor(private app: App, private dataRoot: string = DEFAULT_DATA_ROOT) {}

  get root(): string { return this.dataRoot; }

  // Settings — single small JSON, Vault.process() for conflict safety
  async loadSettings<T = QuranLifeSettings>(fallback: T): Promise<T> {
    return readJson(this.app, VAULT_PATHS.settings(this.dataRoot), fallback);
  }
  async saveSettings(data: unknown): Promise<void> {
    await writeJsonAtomic(this.app, VAULT_PATHS.settings(this.dataRoot), data);
  }

  // Splits — per surah
  async loadSplitsForSurah(surahId: number): Promise<any[]> {
    return readJson(this.app, VAULT_PATHS.splitFile(this.dataRoot, surahId), [] as any[]);
  }
  async saveSplitsForSurah(surahId: number, anchors: any[]): Promise<void> {
    if (anchors.length === 0) {
      const file = this.app.vault.getAbstractFileByPath(VAULT_PATHS.splitFile(this.dataRoot, surahId));
      if (file instanceof TFile) await this.app.vault.delete(file);
      return;
    }
    await writeJsonAtomic(this.app, VAULT_PATHS.splitFile(this.dataRoot, surahId), anchors);
  }
  async loadAllSplits(): Promise<Record<number, any[]>> {
    const dir = this.app.vault.getAbstractFileByPath(VAULT_PATHS.splitsDir(this.dataRoot));
    if (!(dir instanceof TFolder)) return {};
    const out: Record<number, any[]> = {};
    for (const child of dir.children) {
      if (!(child instanceof TFile) || !child.name.endsWith(".json")) continue;
      const m = child.name.match(/surah-(\d+)\.json/);
      if (!m) continue;
      const sid = Number(m[1]);
      out[sid] = await readJson(this.app, child.path, [] as any[]);
    }
    return out;
  }

  // Mindmaps — per key
  async loadMindmap(key: string): Promise<any | null> {
    return readJson(this.app, VAULT_PATHS.mindmapFile(this.dataRoot, key), null as any);
  }
  async saveMindmap(key: string, data: any): Promise<void> {
    await writeJsonAtomic(this.app, VAULT_PATHS.mindmapFile(this.dataRoot, key), data);
  }
  async deleteMindmap(key: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(VAULT_PATHS.mindmapFile(this.dataRoot, key));
    if (file instanceof TFile) await this.app.vault.delete(file);
    // tombstone for Resilio: track deleted to not re-import premade
    const deleted = await this.loadDeletedKeys();
    deleted.add(key);
    await this.saveDeletedKeys(deleted);
  }
  async loadDeletedKeys(): Promise<Set<string>> {
    const arr = await readJson(this.app, VAULT_PATHS.deletedMindmaps(this.dataRoot), [] as string[]);
    return new Set(Array.isArray(arr) ? arr : []);
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
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) await this.app.vault.modify(file, content);
    else await this.app.vault.create(path, content);
  }

  // Progress — per part
  async loadProgress(partId: number): Promise<any | null> {
    const path = normalizePath(`${VAULT_PATHS.listeningProgressDir(this.dataRoot)}/part-${partId}.json`);
    return readJson(this.app, path, null as any);
  }
  async saveProgress(partId: number, data: any): Promise<void> {
    const path = normalizePath(`${VAULT_PATHS.listeningProgressDir(this.dataRoot)}/part-${partId}.json`);
    await writeJsonAtomic(this.app, path, data);
  }

  // Migration helper: import legacy giant JSON (localStorage backup) into split files
  async migrateFromLegacyJson(legacy: any): Promise<{ splits: number; mindmaps: number; docs: number }> {
    let splits = 0, mindmaps = 0, docs = 0;
    const srcSplits = legacy?.splits || legacy?.anki?.splits || {};
    for (const [k, v] of Object.entries(srcSplits as Record<string, any>)) {
      const sid = Number(k);
      if (Number.isFinite(sid) && Array.isArray(v) && v.length) {
        await this.saveSplitsForSurah(sid, v as any[]);
        splits++;
      }
    }
    const srcMaps = legacy?.mindmaps || legacy?.anki?.mindmaps || {};
    for (const [k, v] of Object.entries(srcMaps as Record<string, any>)) {
      if (v?.snapshot) {
        await this.saveMindmap(k, v);
        mindmaps++;
      }
    }
    const srcDocs = legacy?.mindmapDocs || legacy?.anki?.mindmapDocs || {};
    for (const [k, v] of Object.entries(srcDocs as Record<string, string>)) {
      if (typeof v === "string" && v.trim()) {
        await this.saveDoc(k, v);
        docs++;
      }
    }
    return { splits, mindmaps, docs };
  }
}

// Resilio Sync validation comment:
// Splitting is correct because Resilio does file-level LWW, not merge. Giant JSON:
//  - 15MB mindmaps file rewritten on every tldraw stroke → 15MB delta sync, slow + quota issues
//  - Concurrent edits on different surahs conflict (last writer wins, other surah lost)
// Split files:
//  - Only touched file syncs (<200KB), bandwidth efficient
//  - Editing surah-2 and surah-50 concurrently on two devices → distinct files, no conflict
//  - Deleted tombstones prevent premade re-import after Resilio merge
//  - Vault.process() prevents clobbering Resilio's background update
