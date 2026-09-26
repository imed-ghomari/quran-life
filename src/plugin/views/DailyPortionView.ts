import { ItemView, WorkspaceLeaf } from "obsidian";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import QuranLifePlugin from "../main";
import { ThemeProvider } from "@/components/ThemeProvider";
import { PluginErrorBoundary } from "../components/PluginErrorBoundary";

export const VIEW_TYPE_DAILY = "quran-life-daily";

export class DailyPortionView extends ItemView {
  private plugin: QuranLifePlugin;
  private root: Root | null = null;
  private openGeneration = 0;
  constructor(leaf: WorkspaceLeaf, plugin: QuranLifePlugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType(): string { return VIEW_TYPE_DAILY; }
  getDisplayText(): string { return "Daily Portion"; }
  getIcon(): string { return "book-open"; }

  async onOpen(): Promise<void> {
    const generation = ++this.openGeneration;
    const container = this.contentEl;
    container.empty();
    container.addClass("quran-life-daily");
    container.setCssStyles({ height: "100%", overflow: "auto" });

    // Native mount — no iframe, React root in containerEl with ThemeProvider + error boundary
    // ThemeProvider fallback now handles Obsidian's body theme (theme-light/theme-dark) if not wrapped, but we wrap explicitly
    const mountEl = container.createDiv({ cls: "quran-life-react-root" });
    mountEl.setCssStyles({ height: "100%" });
    this.root = createRoot(mountEl);
    this.root.render(
      React.createElement(ThemeProvider, null,
        React.createElement(PluginErrorBoundary, null,
          React.createElement("div", { style: { padding: 16 } }, "Loading Quran Life…")
        )
      )
    );

    // Keep the plugin activation path small on mobile. DailyPortionObsidian pulls
    // in audio, Quran data, and the rest of the React screen; none of that is
    // needed just to enable the plugin or register its views.
    try {
      const { default: DailyPortionObsidian } = await import("../components/DailyPortionObsidian");
      if (generation !== this.openGeneration || !this.root) return;
      this.root.render(
        React.createElement(ThemeProvider, null,
          React.createElement(PluginErrorBoundary, null,
            React.createElement(DailyPortionObsidian, { vaultStore: this.plugin.vaultStore })
          )
        )
      );
    } catch (error) {
      if (generation !== this.openGeneration || !this.root) return;
      this.root.render(
        React.createElement("div", { style: { padding: 16, color: "var(--text-error)" } },
          `Quran Life could not open Daily Portion: ${String((error as Error)?.message || error)}`
        )
      );
      console.error("[QuranLife] Failed to load Daily Portion view", error);
    }
  }

  async onClose(): Promise<void> {
    this.openGeneration++;
    if (this.root) {
      try { this.root.unmount(); } catch { /* best-effort only; ignore */ }
      this.root = null;
    }
    this.contentEl.empty();
  }
}
