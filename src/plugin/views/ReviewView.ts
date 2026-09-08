import { ItemView, WorkspaceLeaf } from "obsidian";
import QuranLifePlugin from "../main";

export const VIEW_TYPE_REVIEW = "quran-life-review";

export class ReviewView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private plugin: QuranLifePlugin) { super(leaf); }
  getViewType(): string { return VIEW_TYPE_REVIEW; }
  getDisplayText(): string { return "Reviews"; }
  getIcon(): string { return "brain"; }
  async onOpen(): Promise<void> {
    const c = this.contentEl;
    c.empty();
    c.createEl("h4", { text: "Reviews (FSRS)" });
    c.createEl("p", { text: "Due cards derived from QuranLife/nodes/*.json and QuranLife/daily/*. Review state split per surah/part, not one JSON — Resilio-safe." });
  }
  async onClose(): Promise<void> {}
}
