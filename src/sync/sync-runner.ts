/**
 * Runs syncs one at a time, owns the cancellation token, and keeps the last
 * report around for the status bar and the report command.
 */

import type { App } from 'obsidian';
import { ConfluenceClient } from '../confluence/api/confluence-client';
import { obsidianRequest } from '../confluence/api/obsidian-request';
import { RequestQueue } from '../confluence/api/request-queue';
import { CancellationToken, CancelledError } from '../confluence/api/cancellation';
import { ConfluenceApiError } from '../confluence/api/api-error';
import { readCredentials } from '../settings/credentials';
import type { Credentials } from '../settings/credentials';
import { SpaceSync } from './space-sync';
import { SyncReport, mergeReports } from './report/sync-report';
import { errorMessage } from '../shared/error-message';
import { notify, notifyError } from '../ui/notices';
import type { ConfluenceSyncSettings } from '../settings/plugin-settings';
import type { ProgressReporter } from '../shared/progress';
import type { SyncStatusBar } from '../ui/status-bar';
import type { SpaceScope } from '../vault/marker-notes';
import type { KeepEditsAnswer, SyncOptions } from './sync-options';

export interface SyncRunnerDeps {
  app: App;
  pluginId: string;
  settings: () => ConfluenceSyncSettings;
  statusBar: () => SyncStatusBar | null;
  confirmTrash: (count: number) => Promise<boolean>;
  confirmKeepEdits: (count: number) => Promise<KeepEditsAnswer>;
  onFinished: (report: SyncReport) => void;
  /** True while a single note is being sent or pulled, which a sync must not interrupt. */
  otherWorkRunning: () => boolean;
}

export interface RunOptions {
  dryRun: boolean;
  force: boolean;
}

export class SyncRunner {
  private token: CancellationToken | null = null;
  public lastReport: SyncReport | null = null;

  public constructor(private readonly deps: SyncRunnerDeps) {}

  public get isRunning(): boolean {
    return this.token !== null;
  }

  public cancel(): void {
    if (!this.token) {
      return;
    }
    this.token.cancel();
    this.deps.statusBar()?.showProgress('cancelling');
  }

  /** A client with the current credentials, for the space picker and connection test. */
  public createClient(token: CancellationToken = new CancellationToken()): ConfluenceClient {
    const credentials: Credentials = readCredentials(this.deps.app, this.deps.settings());
    return new ConfluenceClient(
      credentials.siteUrl,
      credentials.authorization,
      obsidianRequest,
      new RequestQueue(this.deps.settings().concurrency, token)
    );
  }

  public async run(scopes: ReadonlyArray<SpaceScope>, options: RunOptions): Promise<SyncReport | null> {
    if (this.isRunning) {
      notify('A Confluence sync is already running.');
      return null;
    }
    if (this.deps.otherWorkRunning()) {
      notify('A note is being sent to or pulled from Confluence. Try again when it is done.');
      return null;
    }
    if (scopes.length === 0) {
      return null;
    }
    const token: CancellationToken = new CancellationToken();
    this.token = token;
    try {
      const client: ConfluenceClient = this.createClient(token);
      const reports: Array<SyncReport> = new Array<SyncReport>();
      for (const scope of scopes) {
        if (token.isCancelled) {
          break;
        }
        reports.push(await this.runOne(client, scope, options, token));
      }
      const report: SyncReport = this.combine(reports);
      this.lastReport = report;
      this.deps.statusBar()?.showIdle(idleLabel(report), report.summaryLine());
      this.deps.onFinished(report);
      return report;
    } catch (err) {
      this.deps.statusBar()?.clear();
      notifyError(this.deps.app, err, this.deps.pluginId);
      return null;
    } finally {
      this.token = null;
    }
  }

  private async runOne(
    client: ConfluenceClient,
    scope: SpaceScope,
    options: RunOptions,
    token: CancellationToken
  ): Promise<SyncReport> {
    const settings: ConfluenceSyncSettings = this.deps.settings();
    const sync: SpaceSync = new SpaceSync({
      app: this.deps.app,
      client,
      scope,
      options: {
        dryRun: options.dryRun,
        force: options.force,
        downloadAttachments: settings.downloadAttachments,
        unpushedEdits: settings.unpushedEditsOnSync
      },
      progress: this.progressFor(scope.spaceKey),
      token,
      confirmTrash: this.deps.confirmTrash,
      confirmKeepEdits: this.deps.confirmKeepEdits,
      trashConfirmThreshold: settings.confirmTrashAbove
    });
    try {
      return await sync.run();
    } catch (err) {
      if (err instanceof CancelledError) {
        const cancelled: SyncReport = new SyncReport(scope.spaceKey);
        cancelled.cancelled = true;
        return cancelled;
      }
      if (err instanceof ConfluenceApiError && err.isAuth()) {
        throw err;
      }
      const failed: SyncReport = new SyncReport(scope.spaceKey);
      failed.failed.push({ title: `Space ${scope.spaceKey}`, path: scope.markerFile.path, detail: errorMessage(err) });
      return failed;
    }
  }

  private combine(reports: ReadonlyArray<SyncReport>): SyncReport {
    if (reports.length === 1) {
      return reports[0];
    }
    return mergeReports(reports);
  }

  private progressFor(spaceKey: string): ProgressReporter {
    return {
      phase: (text: string): void => {
        this.deps.statusBar()?.showProgress(`${spaceKey}: ${text}`);
      },
      step: (done: number, total: number): void => {
        this.deps.statusBar()?.showProgress(`${spaceKey} ${done}/${total}`);
      }
    };
  }
}

function idleLabel(report: SyncReport): string {
  if (report.cancelled) {
    return `${report.spaceKey} cancelled`;
  }
  if (report.failed.length > 0) {
    return `${report.spaceKey} finished with errors`;
  }
  if (report.dryRun) {
    return `${report.spaceKey} preview`;
  }
  return `${report.spaceKey} synced`;
}
