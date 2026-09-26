import { Notice, Platform, Plugin, TFile, normalizePath, requestUrl } from "obsidian";
import { VaultStore, LEGACY_DATA_ROOT, DebouncedVaultWriter, ensureFolder, getDefaultDataRoot, getMobileAwareDefaultRoot, isHiddenPath, asRecord } from "./storage/vaultAdapter";
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
 * - Storage: VaultStore (Resilio-synced files under QuranLife/) instead of localStorage/InstantDB
 * - Autobackup: vault files *are* the backup; Resilio Sync handles cross-device
 */

export default class QuranLifePlugin extends Plugin {
  settings: QuranLifePluginSettings = { ...DEFAULT_SETTINGS };
  vaultStore!: VaultStore;
  debouncedWriter!: DebouncedVaultWriter;

  /** Folder inside the vault config dir where the plugin's own files live (bundled JSON, wasm). */
  private get pluginFolder(): string {
    return normalizePath(`${this.app.vault.configDir}/plugins/quran-life`);
  }

  /** Effective data root: the user's setting, or the platform default. */
  dataRootPath(): string {
    return normalizePath(this.settings.dataRoot || getMobileAwareDefaultRoot(this.app));
  }

  async onload(): Promise<void> {
    await this.loadSettings();
    // Mobile: prefer visible folder if hidden not supported — getMobileAwareDefaultRoot handles Platform.isMobile
    const effectiveDefault = getMobileAwareDefaultRoot(this.app);
    // Migrate hidden default to visible on mobile if user hasn't customized
    if (Platform.isMobile && this.settings.dataRoot === getDefaultDataRoot(this.app)) {
      this.settings.dataRoot = effectiveDefault;
      await this.saveData(this.settings);
    }
    this.vaultStore = new VaultStore(this.app, this.settings.dataRoot || effectiveDefault);
    this.debouncedWriter = new DebouncedVaultWriter(this.app);
    // Obsidian Mobile does not expose `window.app`; register the app so
    // recitation metadata / Quran JSON / offline audio resolve on mobile exactly
    // like on desktop (requestUrl without CORS, vault adapter reads).
    setObsidianApp(this.app);
    registerVaultRecitationCache(this.app, this.settings.dataRoot || effectiveDefault);

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

    // Status bar for sync feedback (Resilio is external, show last write time) — mobile has no status bar, guard to avoid crash on isDesktopOnly:false
    const statusEl = this.addStatusBarItem();
    statusEl.setText("Quran Life ✓");
    statusEl.title = `Data root: ${this.settings.dataRoot} (Resilio Sync)`;
  }

  onunload(): void {
    // Views auto-detached; writer timers cleared on unload
  }

  async loadSettings(): Promise<void> {
    const data: unknown = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, asRecord(data) || {});
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    // recreate store if dataRoot changed
    const effectiveDefault = getMobileAwareDefaultRoot(this.app);
    this.vaultStore = new VaultStore(this.app, this.settings.dataRoot || effectiveDefault);
    registerVaultRecitationCache(this.app, this.settings.dataRoot || effectiveDefault);
  }

  private async ensureDataRoot(): Promise<void> {
    const root = this.dataRootPath();
    // Create root and subfolders using hidden-aware ensureFolder
    await ensureFolder(this.app, root);
    for (const sub of ["splits", "mindmaps", "docs", "daily/progress", "meta", "nodes", "assets"]) {
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
            new Notice(`Migrating existing QuranLife data to new plugin folder for single-folder Resilio sync...`);
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
            new Notice(`Migration complete: legacy ${legacyRoot} → ${root}. You can now sync only ${root} via Resilio.`);
          }
        } catch { /* migration is best effort */ }
      }
    }
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
            new Notice(`Quran data copied to ${vaultQuranPath} for offline use`);
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

  private registerVaultWatchers(): void {
    // React to external Resilio changes — vault 'modify' fires for both local and Resilio edits
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
