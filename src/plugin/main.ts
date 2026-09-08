import { Plugin, WorkspaceLeaf, Notice, TFile, normalizePath } from "obsidian";
import { VaultStore, DEFAULT_DATA_ROOT, DebouncedVaultWriter } from "./storage/vaultAdapter";
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
    this.vaultStore = new VaultStore(this.app, this.settings.dataRoot || DEFAULT_DATA_ROOT);
    this.debouncedWriter = new DebouncedVaultWriter(this.app);

    // Ensure data root exists on layout ready (expensive init deferred)
    this.app.workspace.onLayoutReady(async () => {
      await this.ensureDataRoot();
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

    // Status bar for sync feedback (Resilio is external, show last write time)
    const statusEl = this.addStatusBarItem();
    statusEl.setText("Quran Life ✓");
    statusEl.title = `Data root: ${this.settings.dataRoot} (Resilio Sync)`;
  }

  onunload(): void {
    // Views auto-detached; writer timers cleared on unload
  }

  async loadSettings(): Promise<void> {
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data || {});
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    // recreate store if dataRoot changed
    this.vaultStore = new VaultStore(this.app, this.settings.dataRoot || DEFAULT_DATA_ROOT);
  }

  private async ensureDataRoot(): Promise<void> {
    const root = normalizePath(this.settings.dataRoot || DEFAULT_DATA_ROOT);
    if (!this.app.vault.getAbstractFileByPath(root)) {
      try { await this.app.vault.createFolder(root); } catch {}
    }
    for (const sub of ["splits", "mindmaps", "docs", "daily/progress", "meta", "nodes", "assets"]) {
      const p = normalizePath(`${root}/${sub}`);
      if (!this.app.vault.getAbstractFileByPath(p)) {
        try { await this.app.vault.createFolder(p); } catch {}
      }
    }
    // Ensure settings.json exists
    const settingsPath = normalizePath(`${root}/settings.json`);
    if (!(this.app.vault.getAbstractFileByPath(settingsPath) instanceof TFile)) {
      try { await this.app.vault.create(settingsPath, JSON.stringify({ updatedAt: new Date().toISOString() }, null, 2)); } catch {}
    }
    // Ensure Quran JSON is available in vault for offline/Daily portion (plugin has no /public server)
    // Copy from plugin folder (.obsidian/plugins/quran-life/qpc-hafs-word-by-word.json) to vault assets if missing
    const vaultQuranPath = normalizePath(`${root}/assets/qpc-hafs-word-by-word.json`);
    if (!(this.app.vault.getAbstractFileByPath(vaultQuranPath) instanceof TFile)) {
      const pluginCandidates = [
        ".obsidian/plugins/quran-life/qpc-hafs-word-by-word.json",
        ".obsidian/plugins/quran-life/public/qpc-hafs-word-by-word.json",
        "qpc-hafs-word-by-word.json",
        "public/qpc-hafs-word-by-word.json",
        "QuranLife/qpc-hafs-word-by-word.json",
      ];
      for (const cand of pluginCandidates) {
        try {
          const raw = await this.app.vault.adapter.read(cand);
          if (raw && raw.trim().startsWith("{")) {
            await this.app.vault.create(vaultQuranPath, raw);
            new Notice(`Quran data copied to ${vaultQuranPath} for offline use`);
            break;
          }
        } catch {}
      }
      // Fallback: try fetch via resource path (plugin bundled asset)
      if (!(this.app.vault.getAbstractFileByPath(vaultQuranPath) instanceof TFile)) {
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
                  await this.app.vault.create(vaultQuranPath, text);
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
    // Simple: look for backup file at vault root or ask user to pick file
    // For now, check QuranLife/legacy-backup.json or prompt
    const candidates = ["quran-life-backup.json", `${this.settings.dataRoot}/legacy-backup.json`];
    for (const path of candidates) {
      const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
      if (file instanceof TFile) {
        const raw = await this.app.vault.read(file);
        try {
          const json = JSON.parse(raw);
          const res = await this.vaultStore.migrateFromLegacyJson(json);
          new Notice(`Migrated ${res.splits} splits, ${res.mindmaps} mindmaps, ${res.docs} docs`);
          return;
        } catch (e: any) { new Notice(`Migration failed: ${e?.message || e}`); return; }
      }
    }
    new Notice("No legacy backup found. Place quran-life-backup.json at vault root and retry.");
  }
}
