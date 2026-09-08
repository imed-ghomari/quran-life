import { ItemView, WorkspaceLeaf } from "obsidian";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import QuranLifePlugin from "../main";
import DailyPortionObsidian from "../components/DailyPortionObsidian";
import { ThemeProvider } from "@/components/ThemeProvider";
import { PluginErrorBoundary } from "../components/PluginErrorBoundary";

export const VIEW_TYPE_DAILY = "quran-life-daily";

export class DailyPortionView extends ItemView {
  private plugin: QuranLifePlugin;
  private root: Root | null = null;
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
    container.style.height = "100%";
    container.style.overflow = "auto";

    // Native mount — no iframe, React root in containerEl with ThemeProvider + error boundary
    // ThemeProvider fallback now handles Obsidian's body theme (theme-light/theme-dark) if not wrapped, but we wrap explicitly
    const mountEl = container.createDiv({ cls: "quran-life-react-root" });
    mountEl.style.height = "100%";
    this.root = createRoot(mountEl);
    this.root.render(
      React.createElement(ThemeProvider, null,
        React.createElement(PluginErrorBoundary, null,
          React.createElement(DailyPortionObsidian, { vaultStore: this.plugin.vaultStore })
        )
      )
    );
  }

  async onClose(): Promise<void> {
    if (this.root) {
      try { this.root.unmount(); } catch {}
      this.root = null;
    }
    this.contentEl.empty();
  }
}
