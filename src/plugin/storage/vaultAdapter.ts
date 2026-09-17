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

import { App, TFile, TFolder, normalizePath, Platform } from "obsidian";

// Vault layout (all paths relative to vault root)
// User requested: store everything in plugin folder so only one folder needs Resilio Sync
// This is hidden but accessible via adapter (vault API hides .obsidian, but adapter can read hidden)
// On mobile, hidden .obsidian paths use adapter and may be sandboxed — keep API but guard gracefully and allow fallback to visible folder
export const DEFAULT_DATA_ROOT = ".obsidian/plugins/quran-life/data";
export const LEGACY_DATA_ROOT = "QuranLife"; // previous location, for migration + mobile fallback
export function getMobileAwareDefaultRoot(): string {
  try { if ((Platform as any)?.isMobile) return LEGACY_DATA_ROOT; } catch {}
  try { if ((Platform as any)?.isMobileOS) return LEGACY_DATA_ROOT; } catch {}
  return DEFAULT_DATA_ROOT;
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
  // Anki export prefs (per-part asc/desc for new-card due) — vault-synced
  ankiExport: (root: string) => normalizePath(`${root}/meta/anki-export.json`),
} as const;

// ---------- low-level helpers ----------

export function isHiddenPath(path: string): boolean {
  return normalizePath(path).startsWith(".obsidian");
}

export async function ensureFolder(app: App, folderPath: string): Promise<void> {
  try {
    const normalized = normalizePath(folderPath);
    if (isHiddenPath(normalized)) {
      // Hidden .obsidian paths need adapter (vault API hides them)
      // On mobile (Platform.isMobile) adapter may be Capacitor FS — guard and do not throw
      const adapter: any = (app as any).vault?.adapter;
      if (adapter?.exists && adapter?.mkdir) {
        const parts = normalized.split("/");
        let cur = "";
        for (const part of parts) {
          cur = cur ? `${cur}/${part}` : part;
          try {
            const exists = await adapter.exists(cur);
            if (!exists) await adapter.mkdir(cur);
          } catch {}
        }
        return;
      }
      // Fallback: if hidden and no adapter support (mobile sandbox), try vault API as best-effort but don't throw
      try {
        if (app.vault.getAbstractFileByPath(normalized) instanceof TFolder) return;
      } catch {}
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
        } catch (e: any) {
          if (!String(e?.message || "").includes("already exists")) throw e;
        }
      }
    }
  } catch {
    // Never throw from ensureFolder — mobile may sandbox hidden paths, plugin should still enable
  }
}

async function writeJsonAtomic(app: App, filePath: string, data: unknown): Promise<void> {
  const normalized = normalizePath(filePath);
  const text = JSON.stringify(data, null, 2);
  await ensureFolder(app, normalized.split("/").slice(0, -1).join("/") || "/");
  if (isHiddenPath(normalized)) {
    const adapter: any = (app as any).vault?.adapter;
    if (adapter?.write) {
      try {
        await adapter.write(normalized, text);
        return;
      } catch {}
    }
  }
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
  const normalized = normalizePath(filePath);
  if (isHiddenPath(normalized)) {
    const adapter: any = (app as any).vault?.adapter;
    if (adapter?.exists && adapter?.read) {
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
  if (isHiddenPath(normalized)) {
    const adapter: any = (app as any).vault?.adapter;
    if (adapter?.exists && adapter?.read) {
      try {
        const exists = await adapter.exists(normalized);
        if (!exists) return fallback;
        return await adapter.read(normalized);
      } catch {
        return fallback;
      }
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

async function adapterExists(app: App, path: string): Promise<boolean> {
  const normalized = normalizePath(path);
  if (isHiddenPath(normalized)) {
    const adapter: any = (app as any).vault?.adapter;
    if (adapter?.exists) {
      try { return await adapter.exists(normalized); } catch { return false; }
    }
  }
  return !!app.vault.getAbstractFileByPath(normalized);
}

async function adapterRead(app: App, path: string): Promise<string | null> {
  const normalized = normalizePath(path);
  if (isHiddenPath(normalized)) {
    const adapter: any = (app as any).vault?.adapter;
    try {
      if (adapter?.exists && !(await adapter.exists(normalized))) return null;
      return await adapter.read(normalized);
    } catch { return null; }
  }
  const file = app.vault.getAbstractFileByPath(normalized);
  if (file instanceof TFile) {
    try { return await app.vault.read(file); } catch { return null; }
  }
  return null;
}

async function adapterListFiles(app: App, dirPath: string): Promise<string[]> {
  const normalized = normalizePath(dirPath);
  if (isHiddenPath(normalized)) {
    const adapter: any = (app as any).vault?.adapter;
    if (adapter?.list) {
      try {
        const listed = await adapter.list(normalized);
        // adapter.list returns { files: string[], folders: string[] }
        if (Array.isArray(listed?.files)) return listed.files;
        if (Array.isArray(listed)) return listed;
      } catch {}
    }
  }
  const folder = app.vault.getAbstractFileByPath(normalized);
  if (folder instanceof TFolder) {
    return folder.children.filter(c => c instanceof TFile).map(c => c.path);
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
      const path = VAULT_PATHS.splitFile(this.dataRoot, surahId);
      if (isHiddenPath(path)) {
        const adapter: any = (this.app as any).vault?.adapter;
        try {
          if (adapter?.exists && (await adapter.exists(path))) await adapter.remove(path);
        } catch {}
      } else {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) await this.app.vault.delete(file);
      }
      return;
    }
    await writeJsonAtomic(this.app, VAULT_PATHS.splitFile(this.dataRoot, surahId), anchors);
  }
  async loadAllSplits(): Promise<Record<number, any[]>> {
    const out: Record<number, any[]> = {};
    const files = await adapterListFiles(this.app, VAULT_PATHS.splitsDir(this.dataRoot));
    for (const filePath of files) {
      if (!filePath.endsWith(".json")) continue;
      const base = filePath.split("/").pop() || "";
      const m = base.match(/surah-(\d+)\.json/);
      if (!m) continue;
      const sid = Number(m[1]);
      out[sid] = await readJson(this.app, filePath, [] as any[]);
    }
    // Fallback for non-hidden legacy vault API (if adapterListFiles returned empty but vault folder exists)
    if (Object.keys(out).length === 0 && !isHiddenPath(VAULT_PATHS.splitsDir(this.dataRoot))) {
      const dir = this.app.vault.getAbstractFileByPath(VAULT_PATHS.splitsDir(this.dataRoot));
      if (dir instanceof TFolder) {
        for (const child of dir.children) {
          if (!(child instanceof TFile) || !child.name.endsWith(".json")) continue;
          const m = child.name.match(/surah-(\d+)\.json/);
          if (!m) continue;
          const sid = Number(m[1]);
          out[sid] = await readJson(this.app, child.path, [] as any[]);
        }
      }
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
    const path = VAULT_PATHS.mindmapFile(this.dataRoot, key);
    if (isHiddenPath(path)) {
      const adapter: any = (this.app as any).vault?.adapter;
      try {
        if (adapter?.exists && (await adapter.exists(path))) await adapter.remove(path);
      } catch {}
    } else {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) await this.app.vault.delete(file);
    }
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
    if (isHiddenPath(path)) {
      const adapter: any = (this.app as any).vault?.adapter;
      try {
        await adapter.write(path, content);
        return;
      } catch {}
    }
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) await this.app.vault.modify(file, content);
    else await this.app.vault.create(path, content);
  }

  // Anki export prefs — per-part asc/desc
  async loadAnkiExportPrefs(): Promise<import('@/lib/anki/ankiExportPrefs').AnkiExportPrefs> {
    const { normalizeAnkiExportPrefs, DEFAULT_ANKI_EXPORT_PREFS } = await import('@/lib/anki/ankiExportPrefs');
    const raw = await readJson(this.app, VAULT_PATHS.ankiExport(this.dataRoot), null as any);
    if (!raw) return { partSurahOrder: { ...DEFAULT_ANKI_EXPORT_PREFS.partSurahOrder } };
    return normalizeAnkiExportPrefs(raw);
  }
  async saveAnkiExportPrefs(prefs: import('@/lib/anki/ankiExportPrefs').AnkiExportPrefs): Promise<void> {
    const { normalizeAnkiExportPrefs } = await import('@/lib/anki/ankiExportPrefs');
    await writeJsonAtomic(this.app, VAULT_PATHS.ankiExport(this.dataRoot), normalizeAnkiExportPrefs(prefs));
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
  // Handles multiple backup formats:
  // - Web backup: { splits, mindmaps: { "surah-50": { snapshot } }, mindmapDocs, anki: { splits, mindmaps, ... } }
  // - InstantDB export: { mindmaps: { "50": { tldrawSnapshot, anchors, surahId } }, partMindmaps: { "1": { tldrawSnapshot } } }
  // - quran-mindmaps-restore.json: { mindmaps: { "50": { tldrawSnapshot } }, partMindmaps: {...} }
  // Keys are normalized to vault format: surah-##, part-#, meta-0
  async migrateFromLegacyJson(legacy: any): Promise<{ splits: number; mindmaps: number; docs: number }> {
    let splits = 0, mindmaps = 0, docs = 0;

    const isValidSnapshot = (snap: any) => snap && typeof snap === 'object' && snap.store && typeof snap.store === 'object';

    const normalizeMindmapKey = (rawKey: string, val: any, kindHint?: string): string => {
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
        if (val && typeof val === 'object') {
          if (val.kind === 'part' || val.kind === 'meta') return val.kind === 'meta' ? 'meta-0' : `part-${num}`;
          if (typeof val.partId === 'number' && Number.isFinite(val.partId)) return val.partId === 0 ? 'meta-0' : `part-${val.partId}`;
          if (typeof val.surahId === 'number' && Number.isFinite(val.surahId)) return `surah-${val.surahId}`;
        }
        if (num >= 1 && num <= 114) return `surah-${num}`;
        // fallback part
        if (num >= 1 && num <= 7) return `part-${num}`;
        return `surah-${num}`;
      }
      return k;
    };

    const extractSnapshot = (val: any): any | null => {
      if (!val || typeof val !== 'object') return null;
      // Direct snapshot field
      if (isValidSnapshot(val.snapshot)) return val.snapshot;
      if (isValidSnapshot(val.tldrawSnapshot)) return val.tldrawSnapshot;
      // val itself is a snapshot (has store)
      if (isValidSnapshot(val)) return val;
      // nested snapshot inside data?
      if (isValidSnapshot(val.data)) return val.data;
      // some backups store under 'snapshot' but as stringified?
      if (typeof val.snapshot === 'string') {
        try { const parsed = JSON.parse(val.snapshot); if (isValidSnapshot(parsed)) return parsed; } catch {}
      }
      if (typeof val.tldrawSnapshot === 'string') {
        try { const parsed = JSON.parse(val.tldrawSnapshot); if (isValidSnapshot(parsed)) return parsed; } catch {}
      }
      return null;
    };

    const saveMindmapEntry = async (rawKey: string, val: any, kindHint?: string): Promise<boolean> => {
      if (!val || typeof val !== 'object') return false;
      // skip deleted entries
      if (val.deletedAt) return false;
      const snapshot = extractSnapshot(val);
      if (!snapshot) return false;
      const vaultKey = normalizeMindmapKey(rawKey, val, kindHint);
      if (!vaultKey) return false;
      const kind = vaultKey.startsWith('part-') ? 'part' : vaultKey.startsWith('meta-') ? 'meta' : vaultKey.startsWith('cluster-') ? 'cluster' : 'surah';
      let surahId: number | undefined;
      let partId: number | undefined;
      if (kind === 'surah') {
        const m = vaultKey.match(/surah-(\d+)/);
        surahId = m ? Number(m[1]) : (typeof val.surahId === 'number' ? val.surahId : undefined);
      } else if (kind === 'part') {
        const m = vaultKey.match(/part-(\d+)/);
        partId = m ? Number(m[1]) : (typeof val.partId === 'number' ? val.partId : undefined);
      } else if (kind === 'meta') {
        partId = 0;
      }
      const toSave: any = {
        key: vaultKey,
        kind,
        snapshot,
        isComplete: val.isComplete ?? true,
        updatedAt: val.updatedAt ?? new Date().toISOString(),
      };
      if (Number.isFinite(surahId as number)) toSave.surahId = surahId;
      if (Number.isFinite(partId as number)) toSave.partId = partId;
      // Also handle description field for parts
      if (typeof val.description === 'string') toSave.description = val.description;
      try {
        await this.saveMindmap(vaultKey, toSave);
        return true;
      } catch { return false; }
    };

    // 1. Splits directly from splits maps (web backup)
    const srcSplits = legacy?.splits || legacy?.anki?.splits || {};
    if (srcSplits && typeof srcSplits === 'object' && !Array.isArray(srcSplits)) {
      for (const [k, v] of Object.entries(srcSplits as Record<string, any>)) {
        const sid = Number(k);
        if (Number.isFinite(sid) && Array.isArray(v) && v.length) {
          try { await this.saveSplitsForSurah(sid, v as any[]); splits++; } catch {}
        }
      }
    }

    // 2. Mindmaps from various sources — collect all candidates
    const mindmapSources: Array<{ src: Record<string, any>; hint?: string }> = [];
    if (legacy?.mindmaps && typeof legacy.mindmaps === 'object' && !Array.isArray(legacy.mindmaps)) mindmapSources.push({ src: legacy.mindmaps, hint: 'surah' });
    if (legacy?.anki?.mindmaps && typeof legacy.anki.mindmaps === 'object' && !Array.isArray(legacy.anki.mindmaps)) mindmapSources.push({ src: legacy.anki.mindmaps, hint: 'surah' });
    if (legacy?.partMindmaps && typeof legacy.partMindmaps === 'object' && !Array.isArray(legacy.partMindmaps)) mindmapSources.push({ src: legacy.partMindmaps, hint: 'part' });
    if (legacy?.anki?.partMindmaps && typeof legacy.anki.partMindmaps === 'object') mindmapSources.push({ src: legacy.anki.partMindmaps, hint: 'part' });
    // Some InstantDB backups nest under 'mindmaps' with numeric keys plus partMindmaps separate — already handled
    // Also handle case where legacy itself is a mindmaps dict (user pasted raw mindmaps object)
    if (!mindmapSources.length && legacy && typeof legacy === 'object' && !Array.isArray(legacy)) {
      // heuristic: if top-level keys look like "50","51" with tldrawSnapshot, treat legacy itself as mindmaps map
      const keys = Object.keys(legacy);
      const looksLikeMindmapDict = keys.every(k => /^\d+$/.test(k)) && keys.length > 0 && typeof (legacy as any)[keys[0]]?.tldrawSnapshot === 'object';
      if (looksLikeMindmapDict) mindmapSources.push({ src: legacy as Record<string, any>, hint: 'surah' });
    }

    const seenMindmapKeys = new Set<string>();
    for (const { src, hint } of mindmapSources) {
      for (const [k, v] of Object.entries(src as Record<string, any>)) {
        if (k === 'timestamp' || k === '_isLargeData' || k === 'settings' || k === 'exportedAt' || k === 'version' || k === 'deckName') continue;
        if (!v || typeof v !== 'object') continue;
        // Deduplicate: same vaultKey from top-level and anki (they are duplicates in v2 backups)
        const vaultKeyPreview = normalizeMindmapKey(k, v, hint);
        if (vaultKeyPreview && seenMindmapKeys.has(vaultKeyPreview)) continue;
        const saved = await saveMindmapEntry(k, v, hint);
        if (saved) {
          mindmaps++;
          if (vaultKeyPreview) seenMindmapKeys.add(vaultKeyPreview);
        }
        // 2b. Also extract anchors as splits (InstantDB backups store splits inside mindmap.anchors)
        if (Array.isArray((v as any).anchors) && (v as any).anchors.length) {
          const anchors = (v as any).anchors as any[];
          // Determine surahId for splits
          let sid: number | undefined;
          if (typeof (v as any).surahId === 'number' && Number.isFinite((v as any).surahId)) sid = (v as any).surahId;
          else {
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
                await this.saveSplitsForSurah(sid, anchors);
                // Count only if not already counted from srcSplits
                const srcKey = String(sid);
                const alreadyCounted = srcSplits && (srcSplits[srcKey] || srcSplits[sid as any]);
                if (!alreadyCounted) splits++;
              }
            } catch {}
          }
        }
      }
    }

    // 3. Docs — dedupe keys (top-level and anki are duplicates in v2)
    const docSources: Array<Record<string, any>> = [];
    if (legacy?.mindmapDocs && typeof legacy.mindmapDocs === 'object' && !Array.isArray(legacy.mindmapDocs)) docSources.push(legacy.mindmapDocs);
    if (legacy?.anki?.mindmapDocs && typeof legacy.anki.mindmapDocs === 'object') docSources.push(legacy.anki.mindmapDocs);
    if (legacy?.docs && typeof legacy.docs === 'object') docSources.push(legacy.docs);
    const seenDocKeys = new Set<string>();
    for (const srcDocs of docSources) {
      for (const [k, v] of Object.entries(srcDocs as Record<string, string>)) {
        if (seenDocKeys.has(k)) continue;
        if (typeof v === 'string' && v.trim()) {
          try { await this.saveDoc(k, v); docs++; seenDocKeys.add(k); } catch {}
        }
      }
    }

    // 4. Listening progress (optional) — migrate listeningProgress array to per-part files if present
    // Backup may have listeningProgress: [{ partId, lastVerseIndex, nextStartVerseKey, cycles, updatedAt }]
    const lp = legacy?.listeningProgress || legacy?.daily?.progress || legacy?.progress;
    if (Array.isArray(lp)) {
      for (const entry of lp as any[]) {
        if (!entry || typeof entry !== 'object') continue;
        const pid = Number(entry.partId);
        if (!Number.isFinite(pid)) continue;
        try { await this.saveProgress(pid, entry); } catch {}
      }
    } else if (lp && typeof lp === 'object' && !Array.isArray(lp)) {
      // sometimes stored as { "1": {...}, "2": {...} }
      for (const [k, v] of Object.entries(lp as Record<string, any>)) {
        const pid = Number(k);
        if (!Number.isFinite(pid)) continue;
        try { await this.saveProgress(pid, { partId: pid, ...(v as any) }); } catch {}
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
