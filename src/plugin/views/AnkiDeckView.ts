import { ItemView, WorkspaceLeaf } from "obsidian";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import QuranLifePlugin from "../main";
import AnkiDeckObsidian from "../components/AnkiDeckObsidian";
import { ThemeProvider } from "@/components/ThemeProvider";
import { PluginErrorBoundary } from "../components/PluginErrorBoundary";

export const VIEW_TYPE_ANKI = "quran-life-anki";

export class AnkiDeckView extends ItemView {
  private plugin: QuranLifePlugin;
  private root: Root | null = null;
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
    container.style.height = "100%";
    container.style.overflow = "auto";
    const mountEl = container.createDiv({ cls: "quran-life-react-root" });
    mountEl.style.height = "100%";
    this.root = createRoot(mountEl);
    this.root.render(
      React.createElement(ThemeProvider, null,
        React.createElement(PluginErrorBoundary, null,
          React.createElement(AnkiDeckObsidian, { vaultStore: this.plugin.vaultStore })
        )
      )
    );
  }

  async onClose(): Promise<void> {
    if (this.root) { try { this.root.unmount(); } catch {} this.root = null; }
    this.contentEl.empty();
  }
}
