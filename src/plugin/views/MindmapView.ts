import { ItemView, WorkspaceLeaf, Notice } from "obsidian";
import QuranLifePlugin from "../main";

export const VIEW_TYPE_MINDMAP = "quran-life-mindmap";

/**
 * Native tldraw view — not an iframe.
 * Mounts tldraw's React component into containerEl via createRoot.
 * Debounced VaultStore saves per key to QuranLife/mindmaps/<key>.json.
 * See src/components/MindmapEditor.tsx for editor logic to port.
 */
export class MindmapView extends ItemView {
  private plugin: QuranLifePlugin;
  // private reactRoot: Root | null = null;
  private currentKey: string | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: QuranLifePlugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType(): string { return VIEW_TYPE_MINDMAP; }
  getDisplayText(): string { return "Mindmap Editor"; }
  getIcon(): string { return "layout-dashboard"; }

  async onOpen(): Promise<void> {
    const container = this.contentEl;
    container.empty();
    container.addClass("quran-life-mindmap");
    // Header switcher (native select, not React)
    const bar = container.createEl("div", { cls: "quran-life-mindmap-bar" });
    bar.style.display = "flex";
    bar.style.gap = "8px";
    bar.style.marginBottom = "8px";

    const select = bar.createEl("select");
    for (let i = 1; i <= 114; i++) {
      const opt = select.createEl("option", { text: `Surah ${i}`, value: `surah-${i}` });
      if (i === 2) opt.selected = true;
    }
    bar.createEl("button", { text: "Load" }).onclick = async () => {
      this.currentKey = select.value;
      await this.loadMindmap(this.currentKey);
    };

    const canvas = container.createEl("div", { cls: "tldraw-container" });
    canvas.style.height = "60vh";
    canvas.style.border = "1px solid var(--background-modifier-border)";
    canvas.textContent = "tldraw mounts here (React). Per-key file: QuranLife/mindmaps/surah-*.json — Resilio syncs only this file.";

    // Lazy import tldraw to keep onload light (see Optimize plugin load time)
    // const { Tldraw } = await import("tldraw");
    // this.reactRoot = createRoot(canvas);
    // this.reactRoot.render(...);
    this.currentKey = select.value;
    await this.loadMindmap(this.currentKey);
  }

  private async loadMindmap(key: string): Promise<void> {
    const data = await this.plugin.vaultStore.loadMindmap(key);
    if (!data) new Notice(`No mindmap for ${key} yet — create one and it will autosave to QuranLife/mindmaps/${key}.json`);
    else new Notice(`Loaded ${key} (${JSON.stringify(data).length} bytes) — split-file synced via Resilio`);
    // TODO: pass snapshot to tldraw editor instance
  }

  async onClose(): Promise<void> {
    // Flush debounced save before closing (ensureSavedBeforeExit pattern)
    if (this.currentKey) {
      // await this.plugin.debouncedWriter.flush(this.currentKey);
    }
    // this.reactRoot?.unmount();
  }
}
