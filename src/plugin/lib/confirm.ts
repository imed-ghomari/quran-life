import { App, Modal, Setting } from "obsidian";

/** Modal replacement for `window.confirm`, which Obsidian asks plugins not to use. */
class ConfirmModal extends Modal {
  private answered = false;
  private resolveFn: (value: boolean) => void;

  constructor(
    app: App,
    private readonly message: string,
    private readonly confirmText: string,
    private readonly destructive: boolean,
    resolve: (value: boolean) => void,
  ) {
    super(app);
    this.resolveFn = resolve;
  }

  onOpen(): void {
    this.contentEl.createEl("p", { text: this.message });
    new Setting(this.contentEl)
      .addButton((btn) => btn.setButtonText("Cancel").onClick(() => this.finish(false)))
      .addButton((btn) => {
        btn.setButtonText(this.confirmText).onClick(() => this.finish(true));
        if (this.destructive) btn.buttonEl.addClass("mod-warning");
      });
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.answered) this.finish(false);
  }

  private finish(value: boolean): void {
    if (this.answered) return;
    this.answered = true;
    this.resolveFn(value);
    this.close();
  }
}

/** Ask the user to confirm an action. Resolves false when the modal is dismissed. */
export function confirmAction(app: App, message: string, confirmText = "Confirm", destructive = false): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    new ConfirmModal(app, message, confirmText, destructive, resolve).open();
  });
}
