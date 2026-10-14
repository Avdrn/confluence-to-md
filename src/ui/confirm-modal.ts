import { Modal } from 'obsidian';
import type { App } from 'obsidian';

class ConfirmModal extends Modal {
  private answered: boolean = false;

  public constructor(
    app: App,
    private readonly heading: string,
    private readonly message: string,
    private readonly confirmLabel: string,
    private readonly answer: (confirmed: boolean) => void
  ) {
    super(app);
  }

  public override onOpen(): void {
    this.contentEl.addClass('confluence-sync-confirm');
    this.titleEl.setText(this.heading);
    this.contentEl.createEl('p', { text: this.message });
    const actions: HTMLElement = this.contentEl.createDiv({ cls: 'confluence-sync-actions' });
    const cancel: HTMLButtonElement = actions.createEl('button', { text: 'Cancel' });
    cancel.addEventListener('click', (): void => {
      this.close();
    });
    const confirm: HTMLButtonElement = actions.createEl('button', { text: this.confirmLabel, cls: 'mod-cta' });
    confirm.addEventListener('click', (): void => {
      this.answered = true;
      this.answer(true);
      this.close();
    });
  }

  public override onClose(): void {
    this.contentEl.empty();
    if (!this.answered) {
      this.answered = true;
      this.answer(false);
    }
  }
}

/** Resolves true when the user confirms, false when they cancel or close the dialog. */
export function confirm(app: App, heading: string, message: string, confirmLabel: string): Promise<boolean> {
  return new Promise<boolean>((resolve: (confirmed: boolean) => void): void => {
    new ConfirmModal(app, heading, message, confirmLabel, resolve).open();
  });
}
