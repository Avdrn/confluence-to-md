import { Modal } from 'obsidian';
import type { App } from 'obsidian';
import { notify } from './notices';
import type { ReportEntry, SyncReport } from '../sync/report/sync-report';
import type { SyncAction } from '../sync/plan/sync-action.type';

export class ReportModal extends Modal {
  public constructor(app: App, private readonly report: SyncReport) {
    super(app);
  }

  public override onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('confluence-sync-report');
    this.titleEl.setText(this.heading());
    contentEl.createDiv({ cls: 'confluence-sync-summary', text: this.report.summaryLine() });

    if (this.report.dryRun) {
      this.renderPlan(this.report.planned);
    } else {
      this.renderSection('Created', this.report.created);
      this.renderSection('Updated', this.report.updated);
      this.renderSection('Moved', this.report.moved);
      this.renderSection('Trashed', this.report.trashed);
      this.renderSection('Local edits overwritten', this.report.overwrittenLocalEdits);
      this.renderSection('Changes kept, not in Confluence yet', this.report.keptLocal);
      this.renderSection('Failed', this.report.failed);
    }
    this.renderWarnings();

    const actions: HTMLElement = contentEl.createDiv({ cls: 'confluence-sync-actions' });
    const copy: HTMLButtonElement = actions.createEl('button', { text: 'Copy as markdown' });
    copy.addEventListener('click', async (): Promise<void> => {
      await navigator.clipboard.writeText(this.report.toMarkdown());
      notify('Report copied.');
    });
    const close: HTMLButtonElement = actions.createEl('button', { text: 'Close', cls: 'mod-cta' });
    close.addEventListener('click', (): void => {
      this.close();
    });
  }

  public override onClose(): void {
    this.contentEl.empty();
  }

  private heading(): string {
    if (this.report.dryRun) {
      return `Preview: ${this.report.spaceKey}`;
    }
    return `Confluence sync: ${this.report.spaceKey}`;
  }

  private renderSection(title: string, entries: ReadonlyArray<ReportEntry>): void {
    if (entries.length === 0) {
      return;
    }
    this.contentEl.createEl('h3', { text: `${title} (${entries.length})` });
    const list: HTMLElement = this.contentEl.createEl('ul');
    for (const entry of entries) {
      const item: HTMLElement = list.createEl('li');
      this.renderTitle(item, entry.title, entry.path);
      if (entry.detail) {
        item.createSpan({ cls: 'confluence-sync-detail', text: entry.detail });
      }
    }
  }

  private renderPlan(actions: ReadonlyArray<SyncAction>): void {
    if (actions.length === 0) {
      this.contentEl.createEl('p', { text: 'Everything is up to date.' });
      return;
    }
    const list: HTMLElement = this.contentEl.createEl('ul');
    for (const action of actions) {
      const item: HTMLElement = list.createEl('li');
      item.createEl('strong', { text: `${action.verb} ` });
      this.renderTitle(item, action.title, action.previousPath);
      item.createSpan({ cls: 'confluence-sync-detail', text: action.reason });
    }
  }

  private renderTitle(item: HTMLElement, title: string, path: string): void {
    if (!path || !this.app.vault.getFileByPath(path)) {
      item.createSpan({ text: title });
      return;
    }
    const link: HTMLElement = item.createSpan({ cls: 'confluence-sync-link', text: title });
    link.addEventListener('click', async (): Promise<void> => {
      this.close();
      await this.app.workspace.openLinkText(path, '', false);
    });
  }

  private renderWarnings(): void {
    if (this.report.warnings.length === 0) {
      return;
    }
    this.contentEl.createEl('h3', { text: `Warnings (${this.report.warnings.length})` });
    const list: HTMLElement = this.contentEl.createEl('ul');
    for (const warning of this.report.warnings) {
      list.createEl('li', { text: warning });
    }
  }
}
