import { ItemView, WorkspaceLeaf } from "obsidian";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import QuranLifePlugin from "../main";
import ReviewObsidian from "../components/ReviewObsidian";

export const VIEW_TYPE_REVIEW = "quran-life-review";

export class ReviewView extends ItemView {
  private plugin: QuranLifePlugin;
  private root: Root | null = null;
  constructor(leaf: WorkspaceLeaf, plugin: QuranLifePlugin) { super(leaf); this.plugin = plugin; }
  getViewType(): string { return VIEW_TYPE_REVIEW; }
  getDisplayText(): string { return "Reviews"; }
  getIcon(): string { return "brain"; }
  async onOpen(): Promise<void> {
    const container = this.contentEl;
    container.empty();
    container.style.height = "100%";
    container.style.overflow = "auto";
    const mountEl = container.createDiv({ cls: "quran-life-react-root" });
    mountEl.style.height = "100%";
    this.root = createRoot(mountEl);
    this.root.render(React.createElement(React.StrictMode, null, React.createElement(ReviewObsidian, { vaultStore: this.plugin.vaultStore })));
  }
  async onClose(): Promise<void> {
    if (this.root) { try { this.root.unmount(); } catch {} this.root = null; }
    this.contentEl.empty();
  }
}
