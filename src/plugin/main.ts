import { Plugin, WorkspaceLeaf, Notice, TFile, normalizePath, Platform } from "obsidian";
import { VaultStore, DEFAULT_DATA_ROOT, LEGACY_DATA_ROOT, DebouncedVaultWriter, ensureFolder, isHiddenPath, getMobileAwareDefaultRoot } from "./storage/vaultAdapter";
import { QuranLifeSettingTab, DEFAULT_SETTINGS, QuranLifePluginSettings } from "./settings";
import { DailyPortionView, VIEW_TYPE_DAILY } from "./views/DailyPortionView";
import { AnkiDeckView, VIEW_TYPE_ANKI } from "./views/AnkiDeckView";
export const VIEW_TYPE_MINDMAP = "quran-life-mindmap"; // deprecated alias, now merged into Anki Deck

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

  async onload(): Promise<void> {
    await this.loadSettings();
    // Mobile: prefer visible folder if hidden not supported — getMobileAwareDefaultRoot handles Platform.isMobile
    const effectiveDefault = getMobileAwareDefaultRoot();
    // Migrate hidden default to visible on mobile if user hasn't customized
    if ((Platform as any)?.isMobile && this.settings.dataRoot === DEFAULT_DATA_ROOT) {
      this.settings.dataRoot = effectiveDefault;
      await this.saveData(this.settings);
    }
    this.vaultStore = new VaultStore(this.app, this.settings.dataRoot || effectiveDefault);
    this.debouncedWriter = new DebouncedVaultWriter(this.app);

    // Ensure data root exists on layout ready (expensive init deferred) — wrap to avoid mobile crash blocking enable
    this.app.workspace.onLayoutReady(async () => {
      try {
        await this.ensureDataRoot();
      } catch (e) {
        console.warn("Quran Life: ensureDataRoot failed (mobile fallback, will retry on demand)", e);
        new Notice("Quran Life: data folder will be created on first use (mobile)");
      }
      this.registerVaultWatchers();
    });

    // Register native views — no iframe, containerEl only
    // Like web app: Daily Portion + Anki Deck (mindmaps + splits merged). No separate Review view.
    this.registerView(VIEW_TYPE_DAILY, (leaf) => new DailyPortionView(leaf, this));
    this.registerView(VIEW_TYPE_ANKI, (leaf) => new AnkiDeckView(leaf, this));
    // Deprecated mindmap type — keep alias for old workspaces, but no command (merged into Anki Deck)
    this.registerView(VIEW_TYPE_MINDMAP, (leaf) => new AnkiDeckView(leaf, this));

    // Commands to reveal views (mobile + desktop) — only 2 views like web app
    this.addCommand({ id: "open-daily-portion", name: "Open Daily Portion", callback: () => this.activateView(VIEW_TYPE_DAILY) });
    this.addCommand({ id: "open-anki-deck", name: "Open Anki Deck", callback: () => this.activateView(VIEW_TYPE_ANKI) });

    // Ribbon icons (native, not React) — Anki icon now opens merged Mindmap+Anki view
    this.addRibbonIcon("book-open", "Quran Life — Daily Portion", () => this.activateView(VIEW_TYPE_DAILY));
    this.addRibbonIcon("layers", "Quran Life — Anki Deck (Mindmaps + Splits)", () => this.activateView(VIEW_TYPE_ANKI));

    // Settings tab
    this.addSettingTab(new QuranLifeSettingTab(this.app, this));

    // Migration command: legacy JSON → split files (one-time)
    this.addCommand({
      id: "migrate-legacy-backup",
      name: "Migrate legacy backup (localStorage JSON) to vault files",
      callback: () => this.promptLegacyMigration(),
    });

    // Status bar for sync feedback (Resilio is external, show last write time) — mobile has no status bar, guard to avoid crash on isDesktopOnly:false
    try {
      const statusEl: HTMLElement | null = (this as any).addStatusBarItem?.();
      if (statusEl) {
        statusEl.setText("Quran Life ✓");
        (statusEl as any).title = `Data root: ${this.settings.dataRoot} (Resilio Sync)`;
      }
    } catch { /* mobile: no status bar */ }
  }

  onunload(): void {
    // Views auto-detached; writer timers cleared on unload
  }

  async loadSettings(): Promise<void> {
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data || {});
    // Mobile fallback: if no dataRoot customized and on mobile, use visible folder
    try { if ((Platform as any)?.isMobile && (!this.settings.dataRoot || this.settings.dataRoot === DEFAULT_DATA_ROOT)) {
      // keep hidden as default for desktop, but ensure mobile can still read if hidden folder already exists
      // do not auto-overwrite if hidden folder already has data — checked in ensureDataRoot
    }} catch {}
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    // recreate store if dataRoot changed
    const effectiveDefault = getMobileAwareDefaultRoot();
    this.vaultStore = new VaultStore(this.app, this.settings.dataRoot || effectiveDefault);
  }

  private async ensureDataRoot(): Promise<void> {
    const root = normalizePath(this.settings.dataRoot || DEFAULT_DATA_ROOT);
    // Create root and subfolders using hidden-aware ensureFolder
    await ensureFolder(this.app, root);
    for (const sub of ["splits", "mindmaps", "docs", "daily/progress", "meta", "nodes", "assets"]) {
      await ensureFolder(this.app, normalizePath(`${root}/${sub}`));
    }
    // Migrate from legacy QuranLife folder if new hidden root is empty and legacy exists
    if (isHiddenPath(root) && root !== normalizePath(LEGACY_DATA_ROOT)) {
      const legacyRoot = normalizePath(LEGACY_DATA_ROOT);
      const legacyExists = isHiddenPath(legacyRoot)
        ? await (this.app.vault.adapter as any).exists?.(legacyRoot)
        : !!this.app.vault.getAbstractFileByPath(legacyRoot);
      const newExists = await (async () => {
        if (isHiddenPath(root)) {
          try { return await (this.app.vault.adapter as any).exists(root); } catch { return false; }
        }
        return !!this.app.vault.getAbstractFileByPath(root);
      })();
      // If legacy has files and new is empty (only just created), offer migration via notice
      if (legacyExists) {
        try {
          const adapter: any = this.app.vault.adapter;
          const legacyList = adapter.list ? await adapter.list(legacyRoot) : null;
          const newList = adapter.list ? await adapter.list(root) : null;
          const legacyFiles = legacyList?.files?.length || 0;
          const newFiles = newList?.files?.length || 0;
          if (legacyFiles > 0 && newFiles <= 1) { // only settings.json
            new Notice(`Migrating existing QuranLife data to new plugin folder for single-folder Resilio sync...`);
            // Copy splits, mindmaps, docs via adapter
            const copyDir = async (src: string, dest: string) => {
              try {
                const listed = await adapter.list(src);
                const files: string[] = listed?.files || [];
                for (const f of files) {
                  try {
                    const rel = f.startsWith(src) ? f.slice(src.length + 1) : f.split("/").pop()!;
                    const srcPath = f;
                    const destPath = normalizePath(`${dest}/${rel}`);
                    const data = await adapter.read(srcPath);
                    await ensureFolder(this.app, dest);
                    await adapter.write(destPath, data);
                  } catch {}
                }
                const folders: string[] = listed?.folders || [];
                for (const fld of folders) {
                  const rel = fld.startsWith(src) ? fld.slice(src.length + 1) : fld.split("/").pop()!;
                  await copyDir(fld, normalizePath(`${dest}/${rel}`));
                }
              } catch {}
            };
            await copyDir(legacyRoot, root);
            new Notice(`Migration complete: legacy ${legacyRoot} → ${root}. You can now sync only ${root} via Resilio.`);
          }
        } catch {}
      }
    }
    // Ensure settings.json exists (hidden-aware)
    const settingsPath = normalizePath(`${root}/settings.json`);
    const settingsExists = isHiddenPath(settingsPath)
      ? await (this.app.vault.adapter as any).exists?.(settingsPath)
      : !!this.app.vault.getAbstractFileByPath(settingsPath);
    if (!settingsExists) {
      try {
        if (isHiddenPath(settingsPath)) {
          await (this.app.vault.adapter as any).write(settingsPath, JSON.stringify({ updatedAt: new Date().toISOString() }, null, 2));
        } else {
          await this.app.vault.create(settingsPath, JSON.stringify({ updatedAt: new Date().toISOString() }, null, 2));
        }
      } catch {}
    }
    // Ensure Quran JSON is available in vault for offline/Daily portion (plugin has no /public server)
    // Copy from plugin folder (.obsidian/plugins/quran-life/qpc-hafs-word-by-word.json) to vault assets if missing
    const vaultQuranPath = normalizePath(`${root}/assets/qpc-hafs-word-by-word.json`);
    const vaultQuranExists = isHiddenPath(vaultQuranPath)
      ? await (this.app.vault.adapter as any).exists?.(vaultQuranPath)
      : !!this.app.vault.getAbstractFileByPath(vaultQuranPath);
    if (!vaultQuranExists) {
      const pluginCandidates = [
        ".obsidian/plugins/quran-life/qpc-hafs-word-by-word.json",
        ".obsidian/plugins/quran-life/public/qpc-hafs-word-by-word.json",
        "qpc-hafs-word-by-word.json",
        "public/qpc-hafs-word-by-word.json",
        "QuranLife/qpc-hafs-word-by-word.json",
        "QuranLife/assets/qpc-hafs-word-by-word.json",
      ];
      for (const cand of pluginCandidates) {
        try {
          const raw = await this.app.vault.adapter.read(cand);
          if (raw && raw.trim().startsWith("{")) {
            if (isHiddenPath(vaultQuranPath)) {
              await (this.app.vault.adapter as any).write(vaultQuranPath, raw);
            } else {
              await this.app.vault.create(vaultQuranPath, raw);
            }
            new Notice(`Quran data copied to ${vaultQuranPath} for offline use`);
            break;
          }
        } catch {}
      }
      // Fallback: try fetch via resource path (plugin bundled asset)
      const vaultQuranExists2 = isHiddenPath(vaultQuranPath)
        ? await (this.app.vault.adapter as any).exists?.(vaultQuranPath)
        : this.app.vault.getAbstractFileByPath(vaultQuranPath) instanceof TFile;
      if (!vaultQuranExists2) {
        try {
          const candidates = [
            ".obsidian/plugins/quran-life/qpc-hafs-word-by-word.json",
            ".obsidian/plugins/quran-life/public/qpc-hafs-word-by-word.json",
            "qpc-hafs-word-by-word.json",
            "public/qpc-hafs-word-by-word.json",
          ];
          for (const cand of candidates) {
            const adapter: any = this.app.vault.adapter;
            const resourceUrl = adapter.getResourcePath ? adapter.getResourcePath(cand) : "";
            if (!resourceUrl) continue;
            try {
              const res = await fetch(resourceUrl);
              if (res.ok) {
                const text = await res.text();
                if (text.trim().startsWith("{")) {
                  if (isHiddenPath(vaultQuranPath)) {
                    await (this.app.vault.adapter as any).write(vaultQuranPath, text);
                  } else {
                    await this.app.vault.create(vaultQuranPath, text);
                  }
                  new Notice(`Quran data initialized from plugin resources`);
                  break;
                }
              }
            } catch {}
          }
        } catch {}
      }
    }
  }

  private registerVaultWatchers(): void {
    // React to external Resilio changes — vault 'modify' fires for both local and Resilio edits
    this.registerEvent(this.app.vault.on("modify", (file) => {
      if (!(file instanceof TFile)) return;
      if (!file.path.startsWith(this.settings.dataRoot)) return;
      // Notify open leaves to reload — each view listens via store callbacks, not here directly
      // Defer to avoid startup perf hit (see obsidian-developer-docs Guides/Optimize plugin load time)
    }));
  }

  async activateView(type: string): Promise<void> {
    const { workspace } = this.app;
    // Reuse existing leaf if visible (DeferredView handling)
    const leaves = workspace.getLeavesOfType(type);
    if (leaves.length) {
      workspace.revealLeaf(leaves[0]);
      return;
    }
    const leaf = workspace.getLeaf("tab");
    await leaf.setViewState({ type, active: true });
    workspace.revealLeaf(leaf);
  }

  private async promptLegacyMigration(): Promise<void> {
    // Try multiple candidate filenames at vault root and in plugin data folder.
    // Supports: web backup (quran-life-backup-*.json), InstantDB export (quran-app-backup-*.json), restore file (quran-mindmaps-restore.json)
    const dataRoot = normalizePath(this.settings.dataRoot || DEFAULT_DATA_ROOT);
    const candidates = [
      "quran-life-backup.json",
      "quran-life-backup (test).json",
      `${dataRoot}/legacy-backup.json`,
      "quran-app-backup-2026-01-22.json",
      "quran-mindmaps-restore.json",
      "quran-life-anki-backup.json",
      "QuranLife/legacy-backup.json",
      "QuranLife/quran-life-backup.json",
    ];
    // 1) Direct candidates via vault API (visible files)
    for (const path of candidates) {
      const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
      if (file instanceof TFile) {
        const raw = await this.app.vault.read(file);
        try {
          const json = JSON.parse(raw);
          const res = await this.vaultStore.migrateFromLegacyJson(json);
          new Notice(`Migrated ${res.splits} splits, ${res.mindmaps} mindmaps, ${res.docs} docs from ${path}`);
          return;
        } catch (e: any) { new Notice(`Migration failed for ${path}: ${e?.message || e}`); return; }
      }
    }
    // 2) Hidden plugin folder via adapter (for users who place backup in .obsidian/plugins/quran-life/)
    const hiddenCandidates = [
      ".obsidian/plugins/quran-life/quran-life-backup.json",
      ".obsidian/plugins/quran-life/quran-life-backup (test).json",
      ".obsidian/plugins/quran-life/data/quran-life-backup.json",
      ".obsidian/plugins/quran-life/data/quran-life-backup (test).json",
      ".obsidian/plugins/quran-life/quran-app-backup-2026-01-22.json",
      ".obsidian/plugins/quran-life/quran-mindmaps-restore.json",
    ];
    for (const path of hiddenCandidates) {
      try {
        const adapter: any = this.app.vault.adapter;
        if (adapter?.exists && await adapter.exists(path)) {
          const raw = await adapter.read(path);
          const json = JSON.parse(raw);
          const res = await this.vaultStore.migrateFromLegacyJson(json);
          new Notice(`Migrated ${res.splits} splits, ${res.mindmaps} mindmaps, ${res.docs} docs from ${path}`);
          return;
        }
      } catch {}
    }
    // 3) Scan vault root for any *.json that looks like a backup (has mindmaps or splits)
    try {
      const rootFiles: string[] = [];
      const adapter: any = this.app.vault.adapter;
      if (adapter?.list) {
        const listed = await adapter.list("");
        const files: string[] = listed?.files || [];
        for (const f of files) if (f.toLowerCase().endsWith(".json") && /quran|backup|mindmap/i.test(f)) rootFiles.push(f);
      } else {
        // fallback via vault.getMarkdownFiles? but json not markdown, so use getFiles
        // @ts-ignore
        const allFiles = this.app.vault.getFiles();
        for (const f of allFiles) if (f.path.toLowerCase().endsWith(".json") && /quran|backup|mindmap/i.test(f.path)) rootFiles.push(f.path);
      }
      // try each candidate root file
      for (const path of rootFiles) {
        try {
          const file = this.app.vault.getAbstractFileByPath(path);
          let raw: string | null = null;
          if (file instanceof TFile) raw = await this.app.vault.read(file);
          else if ((this.app.vault.adapter as any)?.read) raw = await (this.app.vault.adapter as any).read(path);
          if (!raw) continue;
          const json = JSON.parse(raw);
          // heuristic: contains mindmaps or splits
          if (json?.mindmaps || json?.splits || json?.anki?.mindmaps || json?.partMindmaps) {
            const res = await this.vaultStore.migrateFromLegacyJson(json);
            if (res.mindmaps > 0 || res.splits > 0) {
              new Notice(`Migrated ${res.splits} splits, ${res.mindmaps} mindmaps, ${res.docs} docs from ${path}`);
              return;
            }
          }
        } catch {}
      }
    } catch {}

    new Notice("No legacy backup found. Place your backup JSON (e.g., quran-life-backup.json, quran-app-backup-2026-01-22.json, or quran-mindmaps-restore.json) at vault root and retry. Also supports .obsidian/plugins/quran-life/quran-life-backup.json");
  }
}
