import { App, PluginSettingTab, Setting } from "obsidian";
import QuranLifePlugin from "./main";

export interface QuranLifePluginSettings {
  dataRoot: string; // vault folder synced via Resilio
  autoSyncDebounceMs: number;
}

export const DEFAULT_SETTINGS: QuranLifePluginSettings = {
  dataRoot: "QuranLife",
  autoSyncDebounceMs: 700,
};

export class QuranLifeSettingTab extends PluginSettingTab {
  plugin: QuranLifePlugin;
  constructor(app: App, plugin: QuranLifePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Data folder")
      .setDesc("Vault folder where Quran Life stores splits, mindmaps and docs. Sync this folder with Resilio Sync across devices. Each surah/mindmap is a separate file to avoid sync conflicts.")
      .addText((text) =>
        text
          .setPlaceholder("QuranLife")
          .setValue(this.plugin.settings.dataRoot)
          .onChange(async (value) => {
            const normalized = value.trim().replace(/^\/+|\/+$/g, "") || "QuranLife";
            this.plugin.settings.dataRoot = normalized;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Autobackup")
      .setDesc("Vault files are the backup. Resilio Sync automatically syncs them. No manual export needed. Keep this on for instant saves during tldraw edits.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoSyncDebounceMs > 0)
          .onChange(async (value) => {
            this.plugin.settings.autoSyncDebounceMs = value ? 700 : 0;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Migrate legacy backup")
      .setDesc("One-time: import localStorage giant JSON backup into split vault files.")
      .addButton((btn) =>
        btn.setButtonText("Migrate now").onClick(async () => {
          // Trigger command programmatically
          const cmd = (this.app as any).commands?.commands?.["quran-life:migrate-legacy-backup"];
          if (cmd) {
            await (this as any).app.commands.executeCommandById("quran-life:migrate-legacy-backup");
          }
        })
      );

    containerEl.createEl("h3", { text: "Resilio Sync tips" });
    const info = containerEl.createEl("div", { cls: "setting-item-description" });
    info.createEl("p", { text: "• Split files = no conflicts: editing Surah 2 on phone and Surah 50 on desktop touches different files." });
    info.createEl("p", { text: "• One giant JSON (old) = last-writer-wins on whole app, 15MB rewrites per stroke." });
    info.createEl("p", { text: "• Keep .obsidian/plugins out of Resilio; only sync the vault folder (QuranLife/)." });
  }
}
