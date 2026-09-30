import { Notice, Plugin, TFile, normalizePath, requestUrl } from "obsidian";
import { VaultStore, LEGACY_DATA_ROOT, LEGACY_PATHS, VAULT_PATHS, DebouncedVaultWriter, ensureFolder, getDefaultDataRoot, isHiddenPath, asRecord } from "./storage/vaultAdapter";
import { QuranLifeSettingTab, DEFAULT_SETTINGS, QuranLifePluginSettings } from "./settings";
import { DailyPortionView, VIEW_TYPE_DAILY } from "./views/DailyPortionView";
import { AnkiDeckView, VIEW_TYPE_ANKI } from "./views/AnkiDeckView";
import { registerVaultRecitationCache } from "./recitationCache";
import { setObsidianApp } from "@/lib/obsidianApp";
import "./sqlWasmBundle"; // inlines sql-wasm.wasm into main.js for offline Anki export
export const VIEW_TYPE_MINDMAP = "quran-life-mindmap"; // deprecated alias, now merged into Anki Deck

/** Human-readable message for a caught value of unknown type. */
function errorText(e: unknown): string {
  return e instanceof Error ? e.message : typeof e === "string" ? e : "unknown error";
}

/**
 * Quran Life — Obsidian plugin
 * - No iframe: uses native ItemView leaves (DailyPortionView, AnkiDeckView, etc.)
 * - Storage: VaultStore (vault files) instead of localStorage/InstantDB
 * - Autosave: vault files *are* the backup; every change is written straight away
 */

export default class QuranLifePlugin extends Plugin {
  settings: QuranLifePluginSettings = { ...DEFAULT_SETTINGS };
  vaultStore!: VaultStore;
  debouncedWriter!: DebouncedVaultWriter;

  /** Folder inside the vault config dir where the plugin's own files live (bundled JSON, wasm). */
  private get pluginFolder(): string {
    return normalizePath(`${this.app.vault.configDir}/plugins/quran-life`);
  }

  /**
   * The plugin's one and only data root: `<configDir>/plugins/quran-life/data`.
   * Not configurable on purpose — one predictable folder per vault.
   */
  dataRootPath(): string {
    return getDefaultDataRoot(this.app);
  }

  async onload(): Promise<void> {
    await this.loadSettings();
    const dataRoot = this.dataRootPath();
    this.vaultStore = new VaultStore(this.app, dataRoot);
    this.debouncedWriter = new DebouncedVaultWriter(this.app);
    // Obsidian Mobile does not expose `window.app`; register the app so
    // recitation metadata / Quran JSON / offline audio resolve on mobile exactly
    // like on desktop (requestUrl without CORS, vault adapter reads).
    setObsidianApp(this.app);
    registerVaultRecitationCache(this.app, dataRoot);

    // Ensure data root exists on layout ready (expensive init deferred) — wrap to avoid mobile crash blocking enable
    this.app.workspace.onLayoutReady(() => {
      void (async () => {
        try {
          await this.ensureDataRoot();
        } catch (e) {
          console.warn("Quran Life: ensureDataRoot failed (mobile fallback, will retry on demand)", e);
          new Notice("Quran Life: data folder will be created on first use (mobile)");
        }
        this.registerVaultWatchers();
      })();
    });

    // Register native views — no iframe, containerEl only
    // Like web app: Daily Portion + Anki Deck (mindmaps + splits merged). No separate Review view.
    this.registerView(VIEW_TYPE_DAILY, (leaf) => new DailyPortionView(leaf, this));
    this.registerView(VIEW_TYPE_ANKI, (leaf) => new AnkiDeckView(leaf, this));
    // Deprecated mindmap type — keep alias for old workspaces, but no command (merged into Anki Deck)
    this.registerView(VIEW_TYPE_MINDMAP, (leaf) => new AnkiDeckView(leaf, this));

    // Commands to reveal views (mobile + desktop) — only 2 views like web app
    this.addCommand({ id: "open-daily-portion", name: "Open Daily Portion", callback: () => { void this.activateView(VIEW_TYPE_DAILY); } });
    this.addCommand({ id: "open-anki-deck", name: "Open Anki Deck", callback: () => { void this.activateView(VIEW_TYPE_ANKI); } });

    // Ribbon icons (native, not React) — Anki icon now opens merged Mindmap+Anki view
    this.addRibbonIcon("book-open", "Quran Life — Daily Portion", () => { void this.activateView(VIEW_TYPE_DAILY); });
    this.addRibbonIcon("layers", "Quran Life — Anki Deck (Mindmaps + Splits)", () => { void this.activateView(VIEW_TYPE_ANKI); });

    // Settings tab
    this.addSettingTab(new QuranLifeSettingTab(this.app, this));

    // Migration command: legacy JSON → split files (one-time)
    this.addCommand({
      id: "migrate-legacy-backup",
      name: "Migrate legacy backup (localStorage JSON) to vault files",
      callback: () => { void this.promptLegacyMigration(); },
    });

    this.addCommand({
      id: "create-backup",
      name: "Create backup (export vault data to JSON)",
      callback: () => {
        void (async () => {
          try {
            const { path } = await this.createBackup();
            new Notice(`Backup saved: ${path}`);
          } catch (e) { new Notice(`Backup failed: ${errorText(e)}`); }
        })();
      },
    });

    // Status bar — mobile has no status bar, guard to avoid crash on isDesktopOnly:false
    const statusEl = this.addStatusBarItem();
    statusEl.setText("Quran Life ✓");
    statusEl.title = "Quran Life: all changes save automatically";
  }

  onunload(): void {
    // Views auto-detached; writer timers cleared on unload
  }

  async loadSettings(): Promise<void> {
    const data: unknown = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, asRecord(data) || {});
  }

  async saveSettings(): Promise<void> {
    // The data root is fixed, so nothing but data.json needs writing here.
    await this.saveData(this.settings);
  }

  private async ensureDataRoot(): Promise<void> {
    const root = this.dataRootPath();
    // Create root and subfolders using hidden-aware ensureFolder.
    // No `nodes/` (review state lives in Anki) and no `meta/` (tombstones and
    // Anki export prefs sit at the data root, next to docs/ and mindmaps/).
    await ensureFolder(this.app, root);
    for (const sub of ["splits", "mindmaps", "docs", "daily/progress", "assets"]) {
      await ensureFolder(this.app, normalizePath(`${root}/${sub}`));
    }
    // Migrate from legacy QuranLife folder if new root is empty and legacy exists
    if (isHiddenPath(this.app, root) && root !== normalizePath(LEGACY_DATA_ROOT)) {
      const legacyRoot = normalizePath(LEGACY_DATA_ROOT);
      const legacyExists = await this.pathExists(legacyRoot);
      // If legacy has files and new is empty (only just created), offer migration via notice
      if (legacyExists) {
        try {
          const legacyList = await this.app.vault.adapter.list(legacyRoot);
          const newList = await this.app.vault.adapter.list(root);
          const legacyFiles = legacyList.files.length;
          const newFiles = newList.files.length;
          if (legacyFiles > 0 && newFiles <= 1) { // only settings.json
            new Notice(`Migrating existing QuranLife data to the plugin folder...`);
            // Copy splits, mindmaps, docs via adapter
            const copyDir = async (src: string, dest: string): Promise<void> => {
              try {
                const listed = await this.app.vault.adapter.list(src);
                for (const file of listed.files) {
                  try {
                    const rel = file.startsWith(src) ? file.slice(src.length + 1) : file.slice(file.lastIndexOf("/") + 1) || "";
                    const destPath = normalizePath(`${dest}/${rel}`);
                    const data = await this.app.vault.adapter.read(file);
                    await ensureFolder(this.app, dest);
                    await this.app.vault.adapter.write(destPath, data);
                  } catch { /* skip unreadable legacy file */ }
                }
                for (const folder of listed.folders) {
                  const rel = folder.startsWith(src) ? folder.slice(src.length + 1) : folder.slice(folder.lastIndexOf("/") + 1) || "";
                  await copyDir(folder, normalizePath(`${dest}/${rel}`));
                }
              } catch { /* nothing to copy */ }
            };
            await copyDir(legacyRoot, root);
            new Notice(`Migration complete: legacy data moved to the plugin folder.`);
          }
        } catch { /* migration is best effort */ }
      }
    }
    await this.pruneRemovedFolders(root);
    // Ensure settings.json exists (hidden-aware)
    const settingsPath = normalizePath(`${root}/settings.json`);
    if (!(await this.pathExists(settingsPath))) {
      try {
        const initial = JSON.stringify({ updatedAt: new Date().toISOString() }, null, 2);
        if (isHiddenPath(this.app, settingsPath)) {
          await this.app.vault.adapter.write(settingsPath, initial);
        } else {
          await this.app.vault.create(settingsPath, initial);
        }
      } catch { /* settings.json is created lazily on first save */ }
    }
    // Ensure Quran JSON is available in vault for offline/Daily portion (plugin has no /public server)
    // Copy from the plugin folder to vault assets if missing
    const vaultQuranPath = normalizePath(`${root}/assets/qpc-hafs-word-by-word.json`);
    if (!(await this.pathExists(vaultQuranPath))) {
      const pluginCandidates = [
        `${this.pluginFolder}/qpc-hafs-word-by-word.json`,
        `${this.pluginFolder}/public/qpc-hafs-word-by-word.json`,
        "qpc-hafs-word-by-word.json",
        "public/qpc-hafs-word-by-word.json",
        `${LEGACY_DATA_ROOT}/qpc-hafs-word-by-word.json`,
        `${LEGACY_DATA_ROOT}/assets/qpc-hafs-word-by-word.json`,
      ];
      for (const cand of pluginCandidates) {
        try {
          const raw = await this.app.vault.adapter.read(cand);
          if (raw && raw.trim().startsWith("{")) {
            await this.writeVaultText(vaultQuranPath, raw);
            // Move, don't copy: the corpus is 8.8MB and older builds dropped it
            // into `QuranLife/` at the vault root, which is exactly the stray
            // copy this migration exists to remove.
            if (cand.startsWith(`${LEGACY_DATA_ROOT}/`)) {
              try { await this.app.vault.adapter.remove(cand); } catch { /* keep the old copy rather than lose the corpus */ }
            }
            new Notice(`Quran data stored in ${vaultQuranPath} for offline use`);
            break;
          }
        } catch { /* candidate not present */ }
      }
      // Fallback: load via the plugin's resource URL (bundled asset)
      if (!(await this.pathExists(vaultQuranPath))) {
        const candidates = [
          `${this.pluginFolder}/qpc-hafs-word-by-word.json`,
          `${this.pluginFolder}/public/qpc-hafs-word-by-word.json`,
          "qpc-hafs-word-by-word.json",
          "public/qpc-hafs-word-by-word.json",
        ];
        for (const cand of candidates) {
          const resourceUrl = this.app.vault.adapter.getResourcePath(cand);
          if (!resourceUrl) continue;
          try {
            const res = await requestUrl({ url: resourceUrl });
            const text = res.text;
            if (text.trim().startsWith("{")) {
              await this.writeVaultText(vaultQuranPath, text);
              new Notice(`Quran data initialized from plugin resources`);
              break;
            }
          } catch { /* resource path unavailable on this platform */ }
        }
      }
    }
  }

  /**
   * Clean the two folders older builds created inside the data root:
   * - `nodes/` — FSRS review state. Anki owns scheduling now, so the whole
   *   folder is removed (nothing in the codebase reads it).
   * - `meta/` — move its two known files (mindmap tombstones, Anki export
   *   prefs) up to the data root, next to `docs/` and `mindmaps/`, then remove
   *   the folder. Anything else found in there is left untouched (and the
   *   folder kept) rather than deleted.
   * Both folders live under the hidden config dir, so the adapter does the work.
   */
  private async pruneRemovedFolders(root: string): Promise<void> {
    const moves: Array<[string, string]> = [
      [LEGACY_PATHS.deletedMindmaps(root), VAULT_PATHS.deletedMindmaps(root)],
      [LEGACY_PATHS.ankiExport(root), VAULT_PATHS.ankiExport(root)],
    ];
    for (const [from, to] of moves) {
      try {
        if (await this.pathExists(to)) continue;
        if (!(await this.pathExists(from))) continue;
        const raw = await this.app.vault.adapter.read(from);
        await this.writeVaultText(to, raw);
        // Move, don't copy: the old file must leave `meta/` so the folder can go.
        try { await this.app.vault.adapter.remove(from); } catch { /* read is already served from the root copy */ }
      } catch { /* keep the legacy file when it cannot be copied */ }
    }
    // `nodes/` held FSRS review state that nothing reads anymore (and nothing
    // else in the plugin ever wrote there), so it goes wholesale.
    try {
      await this.app.vault.adapter.rmdir(normalizePath(`${root}/nodes`), true);
    } catch { /* absent or sandboxed — nothing to prune */ }
    // `meta/` only goes once it is empty, so anything we did not recognise
    // (an ancient theme.json, a file you dropped in by hand) is never deleted.
    try {
      const metaDir = normalizePath(`${root}/meta`);
      const listed = await this.app.vault.adapter.list(metaDir);
      if (listed.files.length === 0 && listed.folders.length === 0) {
        await this.app.vault.adapter.rmdir(metaDir, false);
      }
    } catch { /* folder absent or sandboxed — nothing to prune */ }
  }

  /** Write text to a vault path, going through the adapter when the path is hidden. */
  private async writeVaultText(path: string, text: string): Promise<void> {
    if (isHiddenPath(this.app, path)) {
      await this.app.vault.adapter.write(path, text);
      return;
    }
    await this.app.vault.create(path, text);
  }

  /** Existence check that also works for folders hidden from the vault API. */
  private async pathExists(path: string): Promise<boolean> {
    const normalized = normalizePath(path);
    if (isHiddenPath(this.app, normalized)) {
      try { return await this.app.vault.adapter.exists(normalized); } catch { return false; }
    }
    return !!this.app.vault.getAbstractFileByPath(normalized);
  }

  /**
   * Manual backup: snapshot all vault data. A copy is saved to a visible JSON
   * file at the vault root (so mobile keeps one too); callers that run in a
   * browser context should also trigger a download so the user gets a native
   * save picker instead of a silent write somewhere.
   */
  async createBackup(): Promise<{ path: string; fileName: string; text: string }> {
    const backup = await this.vaultStore.exportBackup();
    const text = JSON.stringify(backup, null, 2);
    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `quran-life-backup-${stamp}.json`;
    const normalized = normalizePath(fileName);
    const existing = this.app.vault.getAbstractFileByPath(normalized);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, text);
    } else {
      await this.app.vault.create(normalized, text);
    }
    return { path: normalized, fileName, text };
  }

  /** Manual restore: import a backup JSON object (own format or legacy). */
  async restoreBackup(json: unknown): Promise<{ splits: number; mindmaps: number; docs: number }> {
    return this.vaultStore.importBackup(json);
  }

  private registerVaultWatchers(): void {
    // React to external sync changes — vault 'modify' fires for both local and synced edits
    this.registerEvent(this.app.vault.on("modify", (file) => {
      if (!(file instanceof TFile)) return;
      if (!file.path.startsWith(this.dataRootPath())) return;
      // Notify open leaves to reload — each view listens via store callbacks, not here directly
      // Defer to avoid startup perf hit (see obsidian-developer-docs Guides/Optimize plugin load time)
    }));
  }

  async activateView(type: string): Promise<void> {
    const { workspace } = this.app;
    // Reuse existing leaf if visible (DeferredView handling)
    const leaves = workspace.getLeavesOfType(type);
    if (leaves.length) {
      await workspace.revealLeaf(leaves[0]);
      return;
    }
    const leaf = workspace.getLeaf("tab");
    await leaf.setViewState({ type, active: true });
    await workspace.revealLeaf(leaf);
  }

  async promptLegacyMigration(): Promise<void> {
    // Try multiple candidate filenames at vault root and in plugin data folder.
    // Supports: web backup (quran-life-backup-*.json), InstantDB export (quran-app-backup-*.json), restore file (quran-mindmaps-restore.json)
    const dataRoot = this.dataRootPath();
    const candidates = [
      "quran-life-backup.json",
      "quran-life-backup (test).json",
      `${dataRoot}/legacy-backup.json`,
      "quran-app-backup-2026-01-22.json",
      "quran-mindmaps-restore.json",
      "quran-life-anki-backup.json",
      `${LEGACY_DATA_ROOT}/legacy-backup.json`,
      `${LEGACY_DATA_ROOT}/quran-life-backup.json`,
    ];
    // 1) Direct candidates via vault API (visible files)
    for (const path of candidates) {
      const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
      if (file instanceof TFile) {
        const raw = await this.app.vault.read(file);
        try {
          const json: unknown = JSON.parse(raw);
          const res = await this.vaultStore.migrateFromLegacyJson(json);
          new Notice(`Migrated ${res.splits} splits, ${res.mindmaps} mindmaps, ${res.docs} docs from ${path}`);
          return;
        } catch (e) { new Notice(`Migration failed for ${path}: ${errorText(e)}`); return; }
      }
    }
    // 2) Hidden plugin folder via adapter (for users who place the backup inside the plugin folder)
    const hiddenCandidates = [
      `${this.pluginFolder}/quran-life-backup.json`,
      `${this.pluginFolder}/quran-life-backup (test).json`,
      `${this.pluginFolder}/data/quran-life-backup.json`,
      `${this.pluginFolder}/data/quran-life-backup (test).json`,
      `${this.pluginFolder}/quran-app-backup-2026-01-22.json`,
      `${this.pluginFolder}/quran-mindmaps-restore.json`,
    ];
    for (const path of hiddenCandidates) {
      try {
        if (await this.app.vault.adapter.exists(path)) {
          const raw = await this.app.vault.adapter.read(path);
          const json: unknown = JSON.parse(raw);
          const res = await this.vaultStore.migrateFromLegacyJson(json);
          new Notice(`Migrated ${res.splits} splits, ${res.mindmaps} mindmaps, ${res.docs} docs from ${path}`);
          return;
        }
      } catch { /* candidate not readable */ }
    }
    // 3) Scan vault root for any *.json that looks like a backup (has mindmaps or splits)
    try {
      const rootFiles: string[] = [];
      const listed = await this.app.vault.adapter.list("");
      for (const f of listed.files) {
        if (f.toLowerCase().endsWith(".json") && /quran|backup|mindmap/i.test(f)) rootFiles.push(f);
      }
      // try each candidate root file
      for (const path of rootFiles) {
        try {
          const file = this.app.vault.getAbstractFileByPath(path);
          let raw: string | null = null;
          if (file instanceof TFile) raw = await this.app.vault.read(file);
          else raw = await this.app.vault.adapter.read(path);
          if (!raw) continue;
          const json: unknown = JSON.parse(raw);
          // heuristic: contains mindmaps or splits
          const record = asRecord(json);
          if (record && (record.mindmaps || record.splits || asRecord(record.anki)?.mindmaps || record.partMindmaps)) {
            const res = await this.vaultStore.migrateFromLegacyJson(json);
            if (res.mindmaps > 0 || res.splits > 0) {
              new Notice(`Migrated ${res.splits} splits, ${res.mindmaps} mindmaps, ${res.docs} docs from ${path}`);
              return;
            }
          }
        } catch { /* not a usable backup */ }
      }
    } catch { /* vault root listing unavailable */ }

    new Notice("No legacy backup found. Place your backup JSON (e.g., quran-life-backup.json, quran-app-backup-2026-01-22.json, or quran-mindmaps-restore.json) at vault root and retry. Also supports a copy inside the plugin folder.");
  }
}
