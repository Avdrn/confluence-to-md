import { Modal } from 'obsidian';
import type { App } from 'obsidian';
import type { KeepEditsAnswer } from '../sync/sync-options';

/** The question a sync asks when notes hold changes that are not in Confluence. */
class KeepEditsModal extends Modal {
  private answered: boolean = false;

  public constructor(
    app: App,
    private readonly count: number,
    private readonly answer: (choice: KeepEditsAnswer) => void
  ) {
    super(app);
  }

  public override onOpen(): void {
    this.contentEl.addClass('confluence-sync-confirm');
    this.titleEl.setText('Changes not in Confluence yet');
    this.contentEl.createEl('p', { text: this.message() });
    this.contentEl.createEl('p', {
      cls: 'confluence-sync-muted',
      text: 'Kept notes carry "confluence-unpushed" in their properties until you send the changes to Confluence or take its version.'
    });
    const actions: HTMLElement = this.contentEl.createDiv({ cls: 'confluence-sync-actions' });
    const cancel: HTMLButtonElement = actions.createEl('button', { text: 'Cancel' });
    cancel.addEventListener('click', (): void => {
      this.close();
    });
    const overwrite: HTMLButtonElement = actions.createEl('button', { text: 'Replace them with the Confluence version' });
    overwrite.addEventListener('click', (): void => {
      this.choose('overwrite');
    });
    const keep: HTMLButtonElement = actions.createEl('button', { text: 'Keep my changes', cls: 'mod-cta' });
    keep.addEventListener('click', (): void => {
      this.choose('keep');
    });
  }

  public override onClose(): void {
    this.contentEl.empty();
    if (!this.answered) {
      this.answered = true;
      this.answer('cancel');
    }
  }

  private message(): string {
    if (this.count === 1) {
      return 'You changed 1 note in Obsidian that is not in Confluence yet.';
    }
    return `You changed ${this.count} notes in Obsidian that are not in Confluence yet.`;
  }

  private choose(choice: KeepEditsAnswer): void {
    this.answered = true;
    this.answer(choice);
    this.close();
  }
}

/** Resolves with the user's choice; closing the dialog counts as cancel. */
export function askAboutUnpushedEdits(app: App, count: number): Promise<KeepEditsAnswer> {
  return new Promise<KeepEditsAnswer>((resolve: (choice: KeepEditsAnswer) => void): void => {
    new KeepEditsModal(app, count, resolve).open();
  });
}
