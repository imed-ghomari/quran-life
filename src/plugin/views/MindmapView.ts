import { ItemView, WorkspaceLeaf } from "obsidian";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import QuranLifePlugin from "../main";
import MindmapViewObsidian from "../components/MindmapViewObsidian";

export const VIEW_TYPE_MINDMAP = "quran-life-mindmap";

export class MindmapView extends ItemView {
  private plugin: QuranLifePlugin;
  private root: Root | null = null;
  constructor(leaf: WorkspaceLeaf, plugin: QuranLifePlugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType(): string { return VIEW_TYPE_MINDMAP; }
  getDisplayText(): string { return "Mindmap"; }
  getIcon(): string { return "layout-dashboard"; }

  async onOpen(): Promise<void> {
    const container = this.contentEl;
    container.empty();
    container.addClass("quran-life-mindmap");
    container.style.height = "100%";
    container.style.overflow = "auto";
    const mountEl = container.createDiv({ cls: "quran-life-react-root" });
    mountEl.style.height = "100%";
    this.root = createRoot(mountEl);
    this.root.render(React.createElement(React.StrictMode, null, React.createElement(MindmapViewObsidian, { vaultStore: this.plugin.vaultStore })));
  }
  async onClose(): Promise<void> {
    if (this.root) { try { this.root.unmount(); } catch {} this.root = null; }
    this.contentEl.empty();
  }
}
