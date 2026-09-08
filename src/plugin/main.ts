import { Plugin, WorkspaceLeaf, Notice, TFile, normalizePath } from "obsidian";
import { VaultStore, DEFAULT_DATA_ROOT, DebouncedVaultWriter } from "./storage/vaultAdapter";
import { QuranLifeSettingTab, DEFAULT_SETTINGS, QuranLifePluginSettings } from "./settings";
import { DailyPortionView, VIEW_TYPE_DAILY } from "./views/DailyPortionView";
import { AnkiDeckView, VIEW_TYPE_ANKI } from "./views/AnkiDeckView";
import { MindmapView, VIEW_TYPE_MINDMAP } from "./views/MindmapView";
import { ReviewView, VIEW_TYPE_REVIEW } from "./views/ReviewView";

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
    this.registerView(VIEW_TYPE_DAILY, (leaf) => new DailyPortionView(leaf, this));
    this.registerView(VIEW_TYPE_ANKI, (leaf) => new AnkiDeckView(leaf, this));
    this.registerView(VIEW_TYPE_MINDMAP, (leaf) => new MindmapView(leaf, this));
    this.registerView(VIEW_TYPE_REVIEW, (leaf) => new ReviewView(leaf, this));

    // Commands to reveal views (mobile + desktop)
    this.addCommand({ id: "open-daily-portion", name: "Open Daily Portion", callback: () => this.activateView(VIEW_TYPE_DAILY) });
    this.addCommand({ id: "open-anki-deck", name: "Open Anki Deck", callback: () => this.activateView(VIEW_TYPE_ANKI) });
    this.addCommand({ id: "open-review", name: "Open Reviews", callback: () => this.activateView(VIEW_TYPE_REVIEW) });
    this.addCommand({ id: "open-mindmap", name: "Open Mindmap Editor", callback: () => this.activateView(VIEW_TYPE_MINDMAP) });

    // Ribbon icons (native, not React)
    this.addRibbonIcon("book-open", "Quran Life — Daily Portion", () => this.activateView(VIEW_TYPE_DAILY));
    this.addRibbonIcon("layers", "Quran Life — Anki Deck", () => this.activateView(VIEW_TYPE_ANKI));

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
    for (const sub of ["splits", "mindmaps", "docs", "daily/progress", "meta", "nodes"]) {
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
