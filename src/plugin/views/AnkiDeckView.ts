import { ItemView, WorkspaceLeaf } from "obsidian";
import QuranLifePlugin from "../main";

export const VIEW_TYPE_ANKI = "quran-life-anki";

export class AnkiDeckView extends ItemView {
  private plugin: QuranLifePlugin;
  constructor(leaf: WorkspaceLeaf, plugin: QuranLifePlugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType(): string { return VIEW_TYPE_ANKI; }
  getDisplayText(): string { return "Anki Deck"; }
  getIcon(): string { return "layers"; }

  async onOpen(): Promise<void> {
    const container = this.contentEl;
    container.empty();
    container.addClass("quran-life-anki");
    container.createEl("h4", { text: "Anki Deck" });
    container.createEl("p", {
      text: "Splits per surah: QuranLife/splits/surah-*.json · Mindmaps: QuranLife/mindmaps/*.json · Docs: QuranLife/docs/*.md — each file syncs independently via Resilio.",
    });

    const splits = await this.plugin.vaultStore.loadAllSplits();
    const count = Object.keys(splits).length;
    container.createEl("div", { text: `Loaded ${count} surahs with splits` });

    // TODO: mount React AnkiDeckTab but backed by VaultStore, not useLocalStorage:
    // adapter: { loadSplitsForSurah, saveSplitsForSurah, loadMindmap, saveMindmap, loadDoc, saveDoc }
  }

  async onClose(): Promise<void> {}
}
