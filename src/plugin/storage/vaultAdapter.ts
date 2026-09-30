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
import { asArray, asNonEmptyString, asNumber, asRecord } from "@/lib/json";

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

/** Result of {@link VaultStore.migrateFromLegacyJson}. */
export interface LegacyMigrationResult {
  splits: number;
  mindmaps: number;
  docs: number;
}

/** Key space the app writes: surah mindmaps/docs, part mindmaps, the meta board. */
function knownVaultKeys(): string[] {
  const keys: string[] = ["meta-0"];
  for (let s = 1; s <= 114; s++) keys.push(`surah-${s}`);
  for (let p = 1; p <= 8; p++) keys.push(`part-${p}`);
  return keys;
}

// Lazily loaded jszip (same pattern as apkgExport: dynamic import keeps startup fast).
type JSZipModule = typeof import("jszip");
let cachedJSZip: JSZipModule | null = null;
async function getJSZip(): Promise<JSZipModule> {
  if (cachedJSZip) return cachedJSZip;
  const mod: unknown = await import("jszip");
  const candidate: unknown =
    (typeof mod === "object" || typeof mod === "function") &&
    mod !== null &&
    "default" in mod &&
    (mod as { default?: unknown }).default
      ? (mod as { default: unknown }).default
      : mod;
  if (typeof candidate !== "function") throw new Error("JSZip is unavailable");
  cachedJSZip = candidate as JSZipModule;
  return cachedJSZip;
}

/** File counts for backup/restore result notices. */
export interface BackupCounts {
  splits: number;
  mindmaps: number;
  docs: number;
  progress: number;
}

function countBackupFiles(rels: string[]): BackupCounts {
  const counts: BackupCounts = { splits: 0, mindmaps: 0, docs: 0, progress: 0 };
  for (const rel of rels) {
    if (rel.startsWith("splits/")) counts.splits++;
    else if (rel.startsWith("mindmaps/")) counts.mindmaps++;
    else if (rel.startsWith("docs/")) counts.docs++;
    else if (rel.startsWith("daily/progress/")) counts.progress++;
  }
  return counts;
}

// Top-level data dirs that are re-downloadable caches — never backed up or restored.
const BACKUP_EXCLUDED_TOP_DIRS: ReadonlySet<string> = new Set(["assets", "recitation-cache"]);

function isExcludedBackupPath(rel: string): boolean {
  const top = rel.split("/")[0] ?? "";
  return BACKUP_EXCLUDED_TOP_DIRS.has(top);
}

/** Data-root-relative path, or null when it escapes the root. */
function relativeBackupPath(root: string, abs: string): string | null {
  const base = normalizePath(root);
  const full = normalizePath(abs);
  if (full === base) return null;
  if (!full.startsWith(`${base}/`)) return null;
  const rel = full.slice(base.length + 1);
  if (!rel || rel.split("/").some((seg) => seg === "" || seg === "." || seg === "..")) return null;
  return rel;
}

async function readBackupText(app: App, absPath: string): Promise<string | null> {
  const normalized = normalizePath(absPath);
  try {
    if (isHiddenPath(app, normalized)) {
      if (!(await app.vault.adapter.exists(normalized))) return null;
      return await app.vault.adapter.read(normalized);
    }
    const file = app.vault.getAbstractFileByPath(normalized);
    if (!(file instanceof TFile)) return null;
    return await app.vault.read(file);
  } catch {
    return null;
  }
}

async function listBackupDir(app: App, absDir: string): Promise<{ files: string[]; folders: string[] } | null> {
  const normalized = normalizePath(absDir);
  try {
    if (isHiddenPath(app, normalized)) return await app.vault.adapter.list(normalized);
    const dir = app.vault.getAbstractFileByPath(normalized);
    if (dir instanceof TFolder) {
      return {
        files: dir.children.filter((c): c is TFile => c instanceof TFile).map((c) => c.path),
        folders: dir.children.filter((c): c is TFolder => c instanceof TFolder).map((c) => c.path),
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Collect every backup-worthy file under `root` into `out` (data-root-relative
 * path → text). Recursive walk first; when `fillOnly` a path already present
 * is left untouched so the live data root always wins over legacy.
 */
async function collectBackupFiles(app: App, root: string, out: Map<string, string>, fillOnly = false): Promise<void> {
  const walk = async (relDir: string): Promise<void> => {
    const absDir = relDir ? normalizePath(`${root}/${relDir}`) : normalizePath(root);
    const listed = await listBackupDir(app, absDir);
    if (!listed) return;
    for (const f of listed.files ?? []) {
      const rel = relativeBackupPath(root, f);
      if (!rel || isExcludedBackupPath(rel)) continue;
      if (fillOnly && out.has(rel)) continue;
      const text = await readBackupText(app, f);
      if (typeof text === "string") out.set(rel, text);
    }
    for (const d of listed.folders ?? []) {
      const rel = relativeBackupPath(root, d);
      if (!rel || isExcludedBackupPath(rel)) continue;
      await walk(rel);
    }
  };
  await walk("");
}

/**
 * Direct reads of every known file, overlaid onto the walked files. Backup
 * coverage therefore never depends on folder listing alone.
 */
async function overlayKnownFiles(app: App, root: string, out: Map<string, string>): Promise<void> {
  const consider = async (rel: string, abs: string): Promise<void> => {
    if (out.has(rel)) return;
    const text = await readBackupText(app, abs);
    if (typeof text === "string" && text.trim()) out.set(rel, text);
  };
  const jobs: Array<Promise<void>> = [];
  jobs.push(consider("settings.json", VAULT_PATHS.settings(root)));
  jobs.push(consider("anki-export.json", VAULT_PATHS.ankiExport(root)));
  jobs.push(consider("deleted-mindmaps.json", VAULT_PATHS.deletedMindmaps(root)));
  jobs.push(consider("deleted-mindmaps.json", LEGACY_PATHS.deletedMindmaps(root)));
  jobs.push(consider("anki-export.json", LEGACY_PATHS.ankiExport(root)));
  for (let sid = 1; sid <= 114; sid++) {
    const rel = `splits/surah-${String(sid).padStart(3, "0")}.json`;
    jobs.push(consider(rel, VAULT_PATHS.splitFile(root, sid)));
  }
  for (const key of knownVaultKeys()) {
    jobs.push(consider(`mindmaps/${key}.json`, VAULT_PATHS.mindmapFile(root, key)));
    jobs.push(consider(`docs/${key}.md`, VAULT_PATHS.docFile(root, key)));
  }
  for (let pid = 1; pid <= 8; pid++) {
    jobs.push(consider(`daily/progress/part-${pid}.json`, normalizePath(`${VAULT_PATHS.listeningProgressDir(root)}/part-${pid}.json`)));
  }
  await Promise.all(jobs);
}

/** True for files that belong to a Quran Life backup (used to validate a zip). */
function isBackupFile(rel: string): boolean {
  return (
    rel === "settings.json" ||
    rel === "anki-export.json" ||
    rel === "deleted-mindmaps.json" ||
    rel.startsWith("splits/") ||
    rel.startsWith("mindmaps/") ||
    rel.startsWith("docs/") ||
    rel.startsWith("daily/")
  );
}

/** Zip entry name → safe data-root-relative path, or null when unsafe. */
function sanitizeZipPath(name: string): string | null {
  const cleaned = String(name).replace(/\\/g, "/").replace(/^\/+/, "");
  const segs = cleaned.split("/").filter((s) => s.length > 0 && s !== ".");
  if (segs.length === 0 || segs.some((s) => s === "..")) return null;
  return segs.join("/");
}

/** Human-readable one-liner for backup/restore result notices. */
export function describeBackupCounts(counts: { splits: number; mindmaps: number; docs: number; progress: number }): string {
  return `${counts.splits} splits, ${counts.mindmaps} mindmaps, ${counts.docs} docs, ${counts.progress} progress`;
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

  /** Every mindmap file on disk, keyed by basename (surah-2, part-1, meta-0, …). */
  async loadAllMindmaps(): Promise<Record<string, MindmapRecord>> {
    const out: Record<string, MindmapRecord> = {};
    const dirPath = VAULT_PATHS.mindmapsDir(this.dataRoot);
    let files: string[] = [];
    try {
      const listed = await this.app.vault.adapter.list(dirPath);
      files = listed.files;
    } catch { /* folder not created yet */ }
    if (files.length === 0) {
      const dir = this.app.vault.getAbstractFileByPath(dirPath);
      if (dir instanceof TFolder) {
        files = dir.children.filter((c): c is TFile => c instanceof TFile && c.extension === 'json').map(c => c.path);
      }
    }
    for (const filePath of files) {
      if (!filePath.endsWith('.json')) continue;
      const base = (filePath.slice(filePath.lastIndexOf('/') + 1) || '').replace(/\.json$/, '');
      if (!base) continue;
      const data = await this.loadMindmap(base);
      if (data) out[base] = data;
    }
    return out;
  }

  /**
   * Full vault backup — everything needed to restore on another device.
   * Saves are automatic (every change writes straight to the vault); this is
   * the manual snapshot used by Settings → Backup now.
   *
   * Listing-based reads are primary, but some environments fail to list hidden
   * folders while direct reads keep working. When a listing comes back empty
   * the known key space is probed directly (surah 1..114, part 1..8, meta-0)
   * so a backup never silently misses data that is actually on disk.
   */
  async exportBackup(): Promise<Record<string, unknown>> {
    const [settings, mindmaps, splits, docs, ankiExportPrefs, deletedArr] = await Promise.all([
      this.loadSettings<unknown>(null).catch(() => null),
      this.loadAllMindmaps().catch(() => ({})),
      this.loadAllSplits().catch(() => ({})),
      this.loadAllDocs().catch(() => ({})),
      this.loadAnkiExportPrefs().catch(() => null),
      this.loadDeletedKeys().then(s => [...s]).catch(() => [] as string[]),
    ]);
    // Fallbacks: direct probes, only when listing found nothing.
    if (Object.keys(splits).length === 0) {
      const probed = await Promise.all(
        Array.from({ length: 114 }, (_, i) => i + 1).map(async (sid) => {
          try {
            const anchors = await this.loadSplitsForSurah(sid);
            return (anchors.length ? [sid, anchors] : null) as [number, AnkiAnchor[]] | null;
          } catch { return null; }
        }),
      );
      for (const entry of probed) {
        if (entry) (splits as Record<number, AnkiAnchor[]>)[entry[0]] = entry[1];
      }
    }
    if (Object.keys(mindmaps).length === 0 || Object.keys(docs).length === 0) {
      const keys = knownVaultKeys();
      const needMindmaps = Object.keys(mindmaps).length === 0;
      const needDocs = Object.keys(docs).length === 0;
      await Promise.all(keys.map(async (key) => {
        if (needMindmaps) {
          try {
            const data = await this.loadMindmap(key);
            if (data) (mindmaps as Record<string, MindmapRecord>)[key] = data;
          } catch { /* no mindmap for this key */ }
        }
        if (needDocs) {
          try {
            const content = await this.loadDoc(key);
            if (typeof content === "string" && content.trim()) {
              (docs as Record<string, string>)[key] = content;
            }
          } catch { /* no doc for this key */ }
        }
      }));
    }
    const progress: unknown[] = [];
    for (let partId = 1; partId <= 8; partId++) {
      try {
        const entry = await this.loadProgress(partId);
        if (entry) progress.push(entry);
      } catch { /* missing part — skip */ }
    }
    const counts = {
      splits: Object.keys(splits).length,
      mindmaps: Object.keys(mindmaps).length,
      docs: Object.keys(docs).length,
      progress: progress.length,
    };
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      counts,
      settings,
      progress,
      splits,
      mindmaps,
      docs,
      ankiExportPrefs,
      deletedMindmaps: deletedArr,
    };
  }

  /**
   * Restore a backup created by {@link exportBackup} (or a legacy backup —
   * falls back to {@link migrateFromLegacyJson} for splits/mindmaps/docs).
   */
  async importBackup(backup: unknown): Promise<LegacyMigrationResult> {
    const root = asRecord(backup);
    if (!root) throw new Error('Backup is empty or invalid JSON');
    const isOwnBackup = root.version === 1 || root.exportedAt !== undefined
      || (root.mindmaps !== undefined && root.docs !== undefined && root.splits !== undefined)
      || root.settings !== undefined;
    if (!isOwnBackup) {
      return this.migrateFromLegacyJson(backup);
    }
    let splits = 0, mindmaps = 0, docs = 0;
    // Settings (daily target, mode, speed, …)
    if (root.settings !== undefined && root.settings !== null) {
      try { await this.saveSettings(root.settings); } catch { /* keep current settings */ }
    }
    // Splits
    const splitsRec = asRecord(root.splits);
    if (splitsRec) {
      for (const [k, v] of Object.entries(splitsRec)) {
        const sid = Number(k);
        if (Number.isFinite(sid) && Array.isArray(v) && v.length) {
          try { await this.saveSplitsForSurah(sid, v as AnkiAnchor[]); splits++; } catch { /* skip */ }
        }
      }
    }
    // Mindmaps
    const mindmapsRec = asRecord(root.mindmaps);
    if (mindmapsRec) {
      for (const [k, v] of Object.entries(mindmapsRec)) {
        const rec = asRecord(v);
        if (!rec) continue;
        try { await this.saveMindmap(k, v as MindmapRecord); mindmaps++; } catch { /* skip */ }
      }
    }
    // Docs
    const docsRec = asRecord(root.docs);
    if (docsRec) {
      for (const [k, v] of Object.entries(docsRec)) {
        if (typeof v === 'string' && v.trim()) {
          try { await this.saveDoc(k, v); docs++; } catch { /* skip */ }
        }
      }
    }
    // Anki export prefs
    if (root.ankiExportPrefs) {
      try { await this.saveAnkiExportPrefs(root.ankiExportPrefs as import('@/lib/anki/ankiExportPrefs').AnkiExportPrefs); } catch { /* keep current */ }
    }
    // Deleted keys
    if (Array.isArray(root.deletedMindmaps)) {
      try { await this.saveDeletedKeys(new Set(root.deletedMindmaps.filter((k): k is string => typeof k === 'string'))); } catch { /* keep current */ }
    }
    // Progress
    const prog = root.progress ?? (asRecord(root.daily) as Record<string, unknown> | null)?.progress;
    if (Array.isArray(prog)) {
      for (const rawEntry of prog) {
        const entry = asRecord(rawEntry);
        if (!entry) continue;
        const pid = Number((entry as Record<string, unknown>).partId);
        if (!Number.isFinite(pid)) continue;
        try { await this.saveProgress(pid, entry); } catch { /* skip */ }
      }
    }
    // Legacy extras inside our own backup (anchors nested in mindmaps, etc.)
    // still go through the legacy importer without overwriting what we just wrote.
    if (splits === 0 && mindmaps === 0) {
      return this.migrateFromLegacyJson(backup);
    }
    return { splits, mindmaps, docs };
  }

  /**
   * Zip backup: snapshot the actual data files (not an assembled JSON) so a
   * backup can never silently miss data that is on disk. Walks the data root
   * recursively, then overlays direct reads of every known file so coverage
   * does not depend on folder listing alone. Re-downloadable caches
   * (`assets/`, `recitation-cache/`) are excluded — they come back on their own.
   */
  async exportBackupZip(): Promise<{ blob: Blob; fileName: string; counts: BackupCounts }> {
    const files = new Map<string, string>();
    await collectBackupFiles(this.app, this.dataRoot, files);
    // Lower precedence: legacy root, if it still holds unmigrated files.
    try {
      if (normalizePath(LEGACY_DATA_ROOT) !== normalizePath(this.dataRoot)) {
        await collectBackupFiles(this.app, LEGACY_DATA_ROOT, files, true);
      }
    } catch { /* legacy root unreadable — skip */ }
    await overlayKnownFiles(this.app, this.dataRoot, files);

    const ZipWriter = (await getJSZip()) as unknown as new () => {
      file: (name: string, data: string) => void;
      generateAsync: (opts: { type: "blob"; compression: string }) => Promise<Blob>;
    };
    const zip = new ZipWriter();
    const sorted = [...files.keys()].sort();
    for (const rel of sorted) {
      const text = files.get(rel);
      if (typeof text === "string") zip.file(rel, text);
    }
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    const stamp = new Date().toISOString().slice(0, 10);
    return { blob, fileName: `quran-life-backup-${stamp}.zip`, counts: countBackupFiles(sorted) };
  }

  /**
   * Restore a zip created by {@link exportBackupZip}: unzip and put every file
   * back in its place under the data root. Paths are sanitized (no `..`, no
   * absolute paths) and cache dirs are never restored.
   */
  async importBackupZip(data: ArrayBuffer | Uint8Array | Blob): Promise<BackupCounts> {
    const ZipLoader = (await getJSZip()) as unknown as {
      loadAsync: (input: ArrayBuffer | Uint8Array | Blob) => Promise<{
        files: Record<string, { dir: boolean; name: string; async: (kind: "string") => Promise<string> }>;
      }>;
    };
    const zip = await ZipLoader.loadAsync(data);
    const entries = Object.values(zip.files).filter((f) => !f.dir);
    if (entries.length === 0) throw new Error("Backup zip is empty");
    const rels = entries
      .map((e) => ({ entry: e, rel: sanitizeZipPath(e.name) }))
      .filter((x): x is { entry: typeof entries[number]; rel: string } => x.rel !== null);
    const looksLikeBackup = rels.some(({ rel }) => isBackupFile(rel));
    if (!looksLikeBackup) throw new Error("This zip is not a Quran Life backup");
    const written: string[] = [];
    for (const { entry, rel } of rels) {
      if (isExcludedBackupPath(rel)) continue;
      const text = await entry.async("string");
      const abs = normalizePath(`${this.dataRoot}/${rel}`);
      const parent = abs.slice(0, abs.lastIndexOf("/"));
      if (parent) await ensureFolder(this.app, parent);
      if (isHiddenPath(this.app, abs)) {
        await this.app.vault.adapter.write(abs, text);
      } else {
        const file = this.app.vault.getAbstractFileByPath(abs);
        if (file instanceof TFile) await this.app.vault.modify(file, text);
        else await this.app.vault.create(abs, text);
      }
      written.push(rel);
    }
    if (written.length === 0) throw new Error("Backup zip contained no restorable files");
    return countBackupFiles(written);
  }

  // Migration helper: import legacy giant JSON (backup) into split files
  // Handles multiple backup formats:
  // - Web backup: { splits, mindmaps: { "surah-50": { snapshot } }, mindmapDocs, anki: { splits, mindmaps, ... } }
  // - InstantDB export: { mindmaps: { "50": { tldrawSnapshot, anchors, surahId } }, partMindmaps: { "1": { tldrawSnapshot } } }
  // - quran-mindmaps-restore.json: { mindmaps: { "50": { tldrawSnapshot } }, partMindmaps: {...} }
  // Keys are normalized to vault format: surah-##, part-#, meta-0
  async migrateFromLegacyJson(legacy: unknown): Promise<LegacyMigrationResult> {
    let splits = 0, mindmaps = 0, docs = 0;

    const legacyRoot = asRecord(legacy);

    const isValidSnapshot = (snap: unknown): snap is MindmapRecord["snapshot"] => {
      const record = asRecord(snap);
      return !!record && !!asRecord(record.store);
    };

    const normalizeMindmapKey = (rawKey: string, val: Record<string, unknown>, kindHint?: string): string => {
      const k = String(rawKey).trim();
      if (k.startsWith('surah-') || k.startsWith('part-') || k.startsWith('meta-') || k.startsWith('cluster-')) return k;
      if (k === 'timestamp' || k === '_isLargeData' || k === 'settings') return '';
      // partHint overrides
      if (kindHint === 'part') {
        const num = Number(k);
        if (Number.isFinite(num)) return num === 0 ? 'meta-0' : `part-${num}`;
        return `part-${k}`;
      }
      if (kindHint === 'meta') return 'meta-0';
      // numeric surah id
      if (/^\d+$/.test(k)) {
        const num = Number(k);
        // If val indicates part (has partId or kind part/meta), treat as part
        const kind = asNonEmptyString(val.kind);
        if (kind === 'part' || kind === 'meta') return kind === 'meta' ? 'meta-0' : `part-${num}`;
        const partId = asNumber(val.partId);
        if (partId !== null) return partId === 0 ? 'meta-0' : `part-${partId}`;
        const surahId = asNumber(val.surahId);
        if (surahId !== null) return `surah-${surahId}`;
        if (num >= 1 && num <= 114) return `surah-${num}`;
        // fallback part
        if (num >= 1 && num <= 7) return `part-${num}`;
        return `surah-${num}`;
      }
      return k;
    };

    const parseMaybeJson = (value: unknown): unknown => {
      if (typeof value !== 'string') return null;
      try { return JSON.parse(value) as unknown; } catch { return null; }
    };

    const extractSnapshot = (val: Record<string, unknown>): MindmapRecord["snapshot"] | null => {
      // Direct snapshot field
      if (isValidSnapshot(val.snapshot)) return val.snapshot;
      if (isValidSnapshot(val.tldrawSnapshot)) return val.tldrawSnapshot;
      // val itself is a snapshot (has store)
      if (isValidSnapshot(val)) return val;
      // nested snapshot inside data?
      if (isValidSnapshot(val.data)) return val.data;
      // some backups store under 'snapshot' but as stringified?
      const fromSnapshotString = parseMaybeJson(val.snapshot);
      if (isValidSnapshot(fromSnapshotString)) return fromSnapshotString;
      const fromTldrawString = parseMaybeJson(val.tldrawSnapshot);
      if (isValidSnapshot(fromTldrawString)) return fromTldrawString;
      return null;
    };

    const saveMindmapEntry = async (rawKey: string, val: Record<string, unknown>, kindHint?: string): Promise<boolean> => {
      // skip deleted entries
      if (val.deletedAt) return false;
      const snapshot = extractSnapshot(val);
      if (!snapshot) return false;
      const vaultKey = normalizeMindmapKey(rawKey, val, kindHint);
      if (!vaultKey) return false;
      const kind: MindmapRecord["kind"] = vaultKey.startsWith('part-') ? 'part' : vaultKey.startsWith('meta-') ? 'meta' : vaultKey.startsWith('cluster-') ? 'cluster' : 'surah';
      let surahId: number | undefined;
      let partId: number | undefined;
      if (kind === 'surah') {
        const m = vaultKey.match(/surah-(\d+)/);
        surahId = m ? Number(m[1]) : asNumber(val.surahId) ?? undefined;
      } else if (kind === 'part') {
        const m = vaultKey.match(/part-(\d+)/);
        partId = m ? Number(m[1]) : asNumber(val.partId) ?? undefined;
      } else if (kind === 'meta') {
        partId = 0;
      }
      const toSave: MindmapRecord = {
        key: vaultKey,
        kind,
        snapshot,
        isComplete: typeof val.isComplete === 'boolean' ? val.isComplete : true,
        updatedAt: asNonEmptyString(val.updatedAt) ?? new Date().toISOString(),
      };
      if (surahId !== undefined && Number.isFinite(surahId)) toSave.surahId = surahId;
      if (partId !== undefined && Number.isFinite(partId)) toSave.partId = partId;
      // Also handle description field for parts
      const description = asNonEmptyString(val.description);
      if (description) toSave.description = description;
      try {
        await this.saveMindmap(vaultKey, toSave);
        return true;
      } catch { return false; }
    };

    // 1. Splits directly from splits maps (web backup)
    const legacyAnki = asRecord(legacyRoot?.anki);
    const srcSplits = asRecord(legacyRoot?.splits) ?? asRecord(legacyAnki?.splits) ?? {};
    for (const [k, v] of Object.entries(srcSplits)) {
      const sid = Number(k);
      if (Number.isFinite(sid) && Array.isArray(v) && v.length) {
        try { await this.saveSplitsForSurah(sid, v as AnkiAnchor[]); splits++; } catch { /* skip unreadable split */ }
      }
    }

    // 2. Mindmaps from various sources — collect all candidates
    const mindmapSources: Array<{ src: Record<string, unknown>; hint?: string }> = [];
    const topMindmaps = asRecord(legacyRoot?.mindmaps);
    if (topMindmaps) mindmapSources.push({ src: topMindmaps, hint: 'surah' });
    const ankiMindmaps = asRecord(legacyAnki?.mindmaps);
    if (ankiMindmaps) mindmapSources.push({ src: ankiMindmaps, hint: 'surah' });
    const partMindmaps = asRecord(legacyRoot?.partMindmaps);
    if (partMindmaps) mindmapSources.push({ src: partMindmaps, hint: 'part' });
    const ankiPartMindmaps = asRecord(legacyAnki?.partMindmaps);
    if (ankiPartMindmaps) mindmapSources.push({ src: ankiPartMindmaps, hint: 'part' });
    // Some backups nest under 'mindmaps' with numeric keys plus partMindmaps separate — already handled
    // Also handle case where the backup itself is a mindmaps dict (user pasted a raw mindmaps object)
    if (!mindmapSources.length && legacyRoot) {
      // heuristic: if top-level keys look like "50","51" with tldrawSnapshot, treat the root as a mindmaps map
      const keys = Object.keys(legacyRoot);
      const looksLikeMindmapDict = keys.length > 0 && keys.every(k => /^\d+$/.test(k))
        && typeof asRecord(asRecord(legacyRoot[keys[0]])?.tldrawSnapshot) === 'object';
      if (looksLikeMindmapDict) mindmapSources.push({ src: legacyRoot, hint: 'surah' });
    }

    const seenMindmapKeys = new Set<string>();
    for (const { src, hint } of mindmapSources) {
      for (const [k, rawValue] of Object.entries(src)) {
        if (k === 'timestamp' || k === '_isLargeData' || k === 'settings' || k === 'exportedAt' || k === 'version' || k === 'deckName') continue;
        const v = asRecord(rawValue);
        if (!v) continue;
        // Deduplicate: same vaultKey from top-level and anki (they are duplicates in v2 backups)
        const vaultKeyPreview = normalizeMindmapKey(k, v, hint);
        if (vaultKeyPreview && seenMindmapKeys.has(vaultKeyPreview)) continue;
        const saved = await saveMindmapEntry(k, v, hint);
        if (saved) {
          mindmaps++;
          if (vaultKeyPreview) seenMindmapKeys.add(vaultKeyPreview);
        }
        // 2b. Also extract anchors as splits (InstantDB backups store splits inside mindmap.anchors)
        const anchors = asArray(v.anchors);
        if (anchors.length) {
          // Determine surahId for splits
          let sid: number | undefined = asNumber(v.surahId) ?? undefined;
          if (sid === undefined) {
            const maybe = Number(k);
            if (Number.isFinite(maybe) && maybe >= 1 && maybe <= 114) sid = maybe;
            else {
              const m = String(k).match(/surah-(\d+)/);
              if (m) sid = Number(m[1]);
            }
          }
          if (sid && sid >= 1 && sid <= 114) {
            try {
              const existing = await this.loadSplitsForSurah(sid);
              if (!existing || existing.length === 0) {
                await this.saveSplitsForSurah(sid, anchors as AnkiAnchor[]);
                // Count only if not already counted from srcSplits
                const alreadyCounted = srcSplits[String(sid)] !== undefined;
                if (!alreadyCounted) splits++;
              }
            } catch { /* skip unreadable anchors */ }
          }
        }
      }
    }

    // 3. Docs — dedupe keys (top-level and anki are duplicates in v2)
    const docSources: Array<Record<string, unknown>> = [];
    const topDocs = asRecord(legacyRoot?.mindmapDocs);
    if (topDocs) docSources.push(topDocs);
    const ankiDocs = asRecord(legacyAnki?.mindmapDocs);
    if (ankiDocs) docSources.push(ankiDocs);
    const plainDocs = asRecord(legacyRoot?.docs);
    if (plainDocs) docSources.push(plainDocs);
    const seenDocKeys = new Set<string>();
    for (const srcDocs of docSources) {
      for (const [k, v] of Object.entries(srcDocs)) {
        if (seenDocKeys.has(k)) continue;
        const content = asNonEmptyString(v);
        if (content && content.trim()) {
          try { await this.saveDoc(k, content); docs++; seenDocKeys.add(k); } catch { /* skip unwritable doc */ }
        }
      }
    }

    // 4. Listening progress (optional) — migrate listeningProgress array to per-part files if present
    // Backup may have listeningProgress: [{ partId, lastVerseIndex, nextStartVerseKey, cycles, updatedAt }]
    const lp = legacyRoot?.listeningProgress ?? asRecord(legacyRoot?.daily)?.progress ?? legacyRoot?.progress;
    if (Array.isArray(lp)) {
      for (const rawEntry of asArray(lp)) {
        const entry = asRecord(rawEntry);
        if (!entry) continue;
        const pid = asNumber(entry.partId);
        if (pid === null) continue;
        try { await this.saveProgress(pid, entry); } catch { /* skip unwritable progress */ }
      }
    } else {
      const lpMap = asRecord(lp);
      if (lpMap) {
        // sometimes stored as { "1": {...}, "2": {...} }
        for (const [k, v] of Object.entries(lpMap)) {
          const pid = Number(k);
          if (!Number.isFinite(pid)) continue;
          const entry = asRecord(v);
          if (!entry) continue;
          try { await this.saveProgress(pid, { partId: pid, ...entry }); } catch { /* skip unwritable progress */ }
        }
      }
    }

    return { splits, mindmaps, docs };
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
