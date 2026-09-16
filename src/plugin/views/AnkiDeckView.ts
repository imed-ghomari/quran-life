import { ItemView, WorkspaceLeaf } from "obsidian";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import QuranLifePlugin from "../main";
import { ThemeProvider } from "@/components/ThemeProvider";
import { PluginErrorBoundary } from "../components/PluginErrorBoundary";

export const VIEW_TYPE_ANKI = "quran-life-anki";

export class AnkiDeckView extends ItemView {
  private plugin: QuranLifePlugin;
  private root: Root | null = null;
  private openGeneration = 0;
  constructor(leaf: WorkspaceLeaf, plugin: QuranLifePlugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType(): string { return VIEW_TYPE_ANKI; }
  getDisplayText(): string { return "Anki Deck"; }
  getIcon(): string { return "layers"; }

  async onOpen(): Promise<void> {
    const generation = ++this.openGeneration;
    const container = this.contentEl;
    container.empty();
    container.addClass("quran-life-anki");
    container.style.height = "100%";
    container.style.overflow = "auto";
    container.style.position = "relative";
    container.style.display = "flex";
    container.style.flexDirection = "column";
    const mountEl = container.createDiv({ cls: "quran-life-react-root" });
    mountEl.style.height = "100%";
    mountEl.style.minHeight = "100%";
    mountEl.style.position = "relative";
    mountEl.style.display = "flex";
    mountEl.style.flexDirection = "column";
    mountEl.style.flex = "1";
    this.root = createRoot(mountEl);
    this.root.render(
      React.createElement(ThemeProvider, null,
        React.createElement(PluginErrorBoundary, null,
          React.createElement("div", { style: { padding: 16 } }, "Loading Quran Life…")
        )
      )
    );

    // AnkiDeckObsidian includes tldraw and sql.js. Lazy-loading it prevents
    // those large browser/wasm dependencies from being evaluated during plugin
    // startup, which is especially important in Obsidian Mobile's WebView.
    try {
      const { default: AnkiDeckObsidian } = await import("../components/AnkiDeckObsidian");
      if (generation !== this.openGeneration || !this.root) return;
      this.root.render(
        React.createElement(ThemeProvider, null,
          React.createElement(PluginErrorBoundary, null,
            React.createElement(AnkiDeckObsidian, { vaultStore: this.plugin.vaultStore })
          )
        )
      );
    } catch (error) {
      if (generation !== this.openGeneration || !this.root) return;
      this.root.render(
        React.createElement("div", { style: { padding: 16, color: "var(--text-error)" } },
          `Quran Life could not open Anki Deck: ${String((error as Error)?.message || error)}`
        )
      );
      console.error("[QuranLife] Failed to load Anki Deck view", error);
    }
  }

  async onClose(): Promise<void> {
    this.openGeneration++;
    if (this.root) { try { this.root.unmount(); } catch {} this.root = null; }
    this.contentEl.empty();
  }
}
