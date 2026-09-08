import { ItemView, WorkspaceLeaf } from "obsidian";
import QuranLifePlugin from "../main";

export const VIEW_TYPE_DAILY = "quran-life-daily";

export class DailyPortionView extends ItemView {
  private plugin: QuranLifePlugin;
  constructor(leaf: WorkspaceLeaf, plugin: QuranLifePlugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType(): string { return VIEW_TYPE_DAILY; }
  getDisplayText(): string { return "Daily Portion"; }
  getIcon(): string { return "book-open"; }

  async onOpen(): Promise<void> {
    const container = this.contentEl;
    container.empty();
    container.addClass("quran-life-daily");

    // Native Obsidian view — no iframe. Mount React or vanilla.
    // For now skeleton; mount actual DailyPortion component via React root in next iteration.
    const header = container.createEl("h4", { text: "Daily Portion" });
    header.style.marginBottom = "8px";
    const desc = container.createEl("p", {
      text: "Resilio-synced daily reading/listening. Progress stored per part in QuranLife/daily/progress/part-*.json (split, not one giant JSON).",
    });
    desc.addClass("quran-life-hint");

    // Example: render vault data via VaultStore (async)
    const settings = await this.plugin.vaultStore.loadSettings<{ activePart?: number } | null>(null);
    const info = container.createEl("div");
    info.createEl("small", { text: `Data root: ${this.plugin.settings.dataRoot} · activePart: ${settings?.activePart ?? "—"}` });

    // TODO: mount React DailyPortion with vault adapter:
    // const root = createRoot(container);
    // root.render(React.createElement(DailyPortionObsidian, { vaultStore: this.plugin.vaultStore }));
    // Store root for onClose cleanup.
  }

  async onClose(): Promise<void> {
    // cleanup React root if mounted
  }
}
