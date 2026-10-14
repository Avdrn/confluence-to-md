import type { SyncAction } from '../plan/sync-action.type';

export interface ReportEntry {
  title: string;
  /** Vault path of the note, '' when there is none to open. */
  path: string;
  detail: string;
}

/** What one sync run did, for the notice and the report modal. */
export class SyncReport {
  public readonly created: Array<ReportEntry> = new Array<ReportEntry>();
  public readonly updated: Array<ReportEntry> = new Array<ReportEntry>();
  public readonly moved: Array<ReportEntry> = new Array<ReportEntry>();
  public readonly trashed: Array<ReportEntry> = new Array<ReportEntry>();
  public readonly overwrittenLocalEdits: Array<ReportEntry> = new Array<ReportEntry>();
  public readonly failed: Array<ReportEntry> = new Array<ReportEntry>();
  public readonly warnings: Array<string> = new Array<string>();
  /** The plan, kept for a preview. */
  public planned: Array<SyncAction> = new Array<SyncAction>();
  public kept: number = 0;
  public cancelled: boolean = false;
  public dryRun: boolean = false;
  public finishedAt: Date = new Date();

  public constructor(public readonly spaceKey: string) {}

  public addWarning(text: string): void {
    this.warnings.push(text);
  }

  public hasProblems(): boolean {
    return this.failed.length > 0 || this.overwrittenLocalEdits.length > 0 || this.warnings.length > 0;
  }

  public changedNothing(): boolean {
    return this.created.length === 0 && this.updated.length === 0 && this.moved.length === 0
      && this.trashed.length === 0 && this.failed.length === 0;
  }

  public summaryLine(): string {
    if (this.dryRun) {
      return `${this.spaceKey}: preview, ${this.planned.length} change(s) planned`;
    }
    const parts: Array<string> = new Array<string>();
    pushCount(parts, this.created.length, 'created');
    pushCount(parts, this.updated.length, 'updated');
    pushCount(parts, this.moved.length, 'moved');
    pushCount(parts, this.trashed.length, 'trashed');
    pushCount(parts, this.failed.length, 'failed');
    if (this.overwrittenLocalEdits.length > 0) {
      parts.push(`${this.overwrittenLocalEdits.length} local edit(s) overwritten`);
    }
    let summary: string = `${this.spaceKey}: nothing changed, ${this.kept} note(s) up to date`;
    if (parts.length > 0) {
      summary = `${this.spaceKey}: ${parts.join(', ')}`;
    }
    if (this.cancelled) {
      return `${summary} (cancelled)`;
    }
    return summary;
  }

  public toMarkdown(): string {
    const lines: Array<string> = [`# Confluence sync: ${this.spaceKey}`, '', this.summaryLine(), ''];
    appendSection(lines, 'Created', this.created);
    appendSection(lines, 'Updated', this.updated);
    appendSection(lines, 'Moved', this.moved);
    appendSection(lines, 'Trashed', this.trashed);
    appendSection(lines, 'Local edits overwritten', this.overwrittenLocalEdits);
    appendSection(lines, 'Failed', this.failed);
    if (this.warnings.length > 0) {
      lines.push('## Warnings', '', ...this.warnings.map((warning: string): string => `- ${warning}`), '');
    }
    return lines.join('\n');
  }
}

function pushCount(parts: Array<string>, count: number, label: string): void {
  if (count > 0) {
    parts.push(`${count} ${label}`);
  }
}

function appendSection(lines: Array<string>, heading: string, entries: ReadonlyArray<ReportEntry>): void {
  if (entries.length === 0) {
    return;
  }
  lines.push(`## ${heading}`, '');
  for (const entry of entries) {
    let line: string = `- ${entry.title}`;
    if (entry.detail) {
      line = `${line} (${entry.detail})`;
    }
    lines.push(line);
  }
  lines.push('');
}

/** One report for "Sync all spaces". */
export function mergeReports(reports: ReadonlyArray<SyncReport>): SyncReport {
  const merged: SyncReport = new SyncReport(reports.map((report: SyncReport): string => report.spaceKey).join(', '));
  for (const report of reports) {
    merged.created.push(...report.created);
    merged.updated.push(...report.updated);
    merged.moved.push(...report.moved);
    merged.trashed.push(...report.trashed);
    merged.overwrittenLocalEdits.push(...report.overwrittenLocalEdits);
    merged.failed.push(...report.failed);
    merged.warnings.push(...report.warnings.map((warning: string): string => `${report.spaceKey}: ${warning}`));
    merged.planned.push(...report.planned);
    merged.kept += report.kept;
    merged.cancelled = merged.cancelled || report.cancelled;
    merged.dryRun = merged.dryRun || report.dryRun;
  }
  return merged;
}
