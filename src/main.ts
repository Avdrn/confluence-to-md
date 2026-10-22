import { Plugin, TFile, TFolder } from 'obsidian';
import type { Menu, TAbstractFile, WorkspaceLeaf } from 'obsidian';
import { DEFAULT_SETTINGS } from './settings/plugin-settings';
import type { ConfluenceSyncSettings } from './settings/plugin-settings';
import { ConfluenceSyncSettingTab } from './settings/settings-tab';
import { SyncRunner } from './sync/sync-runner';
import type { RunOptions } from './sync/sync-runner';
import { findAllMarkers, findMarkerForFile, folderPath } from './vault/marker-notes';
import type { MarkerSearch, SpaceScope } from './vault/marker-notes';
import { SyncStatusBar } from './ui/status-bar';
import { ReportModal } from './ui/report-modal';
import { confirm } from './ui/confirm-modal';
import { askAboutUnpushedEdits } from './ui/keep-edits-modal';
import { notify, notifyError } from './ui/notices';
import { registerCommands } from './ui/commands';
import { registerRibbon } from './ui/ribbon';
import { addSpaceHere } from './ui/add-space';
import { NoteActions } from './ui/note-actions';
import type { NoteActionHandlers } from './ui/note-actions';
import { REVIEW_VIEW_TYPE, ReviewView } from './ui/review/review-view';
import type { ReviewDeps } from './ui/review/review-view';
import type { ReviewMode } from './ui/review/change-card';
import { UserDirectory } from './confluence/user-directory';
import { preparePush } from './push/prepare-push';
import { pushNote } from './push/push-page';
import { pullNote } from './push/pull-page';
import type { PullOutcome } from './push/pull-page';
import type { PreparedPush } from './push/prepare-push';
import type { PushOutcome, PushRequest } from './push/push-page';
import { PROPERTY, readManagedFrontMatter } from './sync/front-matter/managed-front-matter';
import type { ManagedFrontMatterFields } from './sync/front-matter/managed-front-matter';
import { REVIEWABLE_TYPES } from './confluence/types/content-node.type';
import { hashBody } from './sync/plan/body-hash';
import { bodyOf } from './vault/note-body';
import type { SyncReport } from './sync/report/sync-report';
import type { KeepEditsAnswer } from './sync/sync-options';
import type { ConfluenceClient } from './confluence/api/confluence-client';

export default class ConfluenceSyncPlugin extends Plugin {
  public override settings: ConfluenceSyncSettings = { ...DEFAULT_SETTINGS };
  private statusBar: SyncStatusBar | null = null;
  /** True while one note is being sent or pulled. */
  private noteWorkBusy: boolean = false;

  public readonly runner: SyncRunner = new SyncRunner({
    app: this.app,
    pluginId: this.manifest.id,
    settings: (): ConfluenceSyncSettings => this.settings,
    statusBar: (): SyncStatusBar | null => this.statusBar,
    confirmTrash: (count: number): Promise<boolean> => confirm(
      this.app,
      'Trash notes?',
      `${count} pages were deleted in Confluence. Move their notes to the trash?`,
      'Trash them'
    ),
    confirmKeepEdits: (count: number): Promise<KeepEditsAnswer> => askAboutUnpushedEdits(this.app, count),
    onFinished: (report: SyncReport): void => {
      this.showReportIfWanted(report);
    },
    otherWorkRunning: (): boolean => this.noteWorkBusy
  });

  public override async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new ConfluenceSyncSettingTab(this.app, this));
    this.statusBar = new SyncStatusBar(this.addStatusBarItem(), (): void => {
      this.onStatusBarClick();
    });
    this.registerView(REVIEW_VIEW_TYPE, (leaf: WorkspaceLeaf): ReviewView => new ReviewView(leaf, this.reviewDeps()));
    registerCommands(this);
    registerRibbon(this);
    new NoteActions(this, this.noteHandlers()).register();
    this.registerEvent(this.app.workspace.on('file-menu', (menu: Menu, file: TAbstractFile): void => {
      if (!(file instanceof TFolder)) {
        return;
      }
      menu.addItem((item): void => {
        item.setTitle('Add Confluence space here')
          .setIcon('cloud-download')
          .onClick((): void => {
            void this.addSpaceHere(folderPath(file));
          });
      });
    }));
  }

  public override onunload(): void {
    this.runner.cancel();
  }

  public async loadSettings(): Promise<void> {
    const stored: Partial<ConfluenceSyncSettings> | null = (await this.loadData()) as Partial<ConfluenceSyncSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
  }

  public async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /** The space whose folder holds the active note. */
  public activeScope(): SpaceScope | null {
    const file: TFile | null = this.app.workspace.getActiveFile();
    if (!file) {
      return null;
    }
    return findMarkerForFile(this.app, file);
  }

  /** The folder of the active note, or the vault root. */
  public activeFolder(): string {
    const file: TFile | null = this.app.workspace.getActiveFile();
    return folderPath(file?.parent ?? null);
  }

  /** The active note when it mirrors a Confluence page or database, for the note commands. */
  public activeSyncedFile(): TFile | null {
    const file: TFile | null = this.app.workspace.getActiveFile();
    if (!file || !this.syncedFields(file)) {
      return null;
    }
    return file;
  }

  /** The active note when it mirrors a Confluence page, for the send command: a database cannot be sent. */
  public activePageFile(): TFile | null {
    const file: TFile | null = this.activeSyncedFile();
    if (!file || this.syncedFields(file)?.type !== 'page') {
      return null;
    }
    return file;
  }

  public async syncActiveSpace(options: RunOptions): Promise<void> {
    const scope: SpaceScope | null = this.activeScope();
    if (!scope) {
      notify('This note is not inside a Confluence space folder. Use "Add Confluence space here" first.', 8000);
      return;
    }
    await this.runner.run([scope], options);
  }

  public async syncAllSpaces(options: RunOptions): Promise<void> {
    const search: MarkerSearch = findAllMarkers(this.app);
    for (const warning of search.warnings) {
      notify(warning, 10000);
    }
    if (search.scopes.length === 0) {
      notify('No Confluence space is set up yet. Use "Add Confluence space here" in a folder.', 8000);
      return;
    }
    await this.runner.run(search.scopes, options);
  }

  /** The ribbon: the active note's space when there is one, otherwise every space. */
  public async syncActiveSpaceOrAll(): Promise<void> {
    const scope: SpaceScope | null = this.activeScope();
    if (scope) {
      await this.runner.run([scope], { dryRun: false, force: false });
      return;
    }
    await this.syncAllSpaces({ dryRun: false, force: false });
  }

  public async addSpaceHere(targetFolder: string): Promise<void> {
    await addSpaceHere({
      app: this.app,
      pluginId: this.manifest.id,
      createClient: () => this.runner.createClient(),
      syncScope: async (scope: SpaceScope): Promise<void> => {
        await this.runner.run([scope], { dryRun: false, force: false });
      }
    }, targetFolder);
  }

  /** The review pane for a note: to send changes, to compare, or to take the Confluence version. */
  public async openReview(file: TFile, mode: ReviewMode): Promise<void> {
    if (mode === 'push' && !this.settings.enablePush) {
      notify('Turn on "Allow sending changes to Confluence" in the settings first.', 8000);
      return;
    }
    if (mode === 'push' && this.syncedFields(file)?.type === 'database') {
      notify('This note mirrors a Confluence database. Its rows can be read from Confluence but not sent.', 8000);
      return;
    }
    if (!findMarkerForFile(this.app, file)) {
      notify('This note is not inside a Confluence space folder.', 8000);
      return;
    }
    await ReviewView.open(this.app, { notePath: file.path, mode });
  }

  /** Pulls straight away, or through the review pane when the note holds changes of its own. */
  public async pullNoteFlow(file: TFile): Promise<void> {
    const scope: SpaceScope | null = findMarkerForFile(this.app, file);
    const fields: ManagedFrontMatterFields | null = this.syncedFields(file);
    if (!scope || !fields) {
      notify('This note is not a synced Confluence page.', 8000);
      return;
    }
    if (fields.hash && hashBody(await bodyOf(this.app, file)) !== fields.hash) {
      await this.openReview(file, 'pull');
      return;
    }
    try {
      const outcome: PullOutcome = await this.reviewDeps().pull(file, scope);
      let text: string = `Already up to date with Confluence version ${outcome.version}.`;
      if (outcome.changed) {
        text = `Updated to Confluence version ${outcome.version}.`;
      }
      if (outcome.titleChanged) {
        text = `${text} The page was renamed in Confluence; run "Sync this space" to rename the note.`;
      }
      notify(text, 8000);
      for (const warning of outcome.warnings) {
        notify(warning, 10000);
      }
    } catch (err) {
      notifyError(this.app, err, this.manifest.id);
    }
  }

  public openInConfluence(file: TFile): void {
    const url: unknown = (this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined)?.[PROPERTY.url];
    if (typeof url === 'string' && url) {
      window.open(url);
    }
  }

  public showReport(report: SyncReport): void {
    new ReportModal(this.app, report).open();
  }

  /** The managed fields of a note that mirrors a page or a database; null for the marker note and for stubs. */
  private syncedFields(file: TFile): ManagedFrontMatterFields | null {
    const fields: ManagedFrontMatterFields | null = readManagedFrontMatter(this.app.metadataCache.getFileCache(file)?.frontmatter);
    if (!fields || !REVIEWABLE_TYPES.has(fields.type)) {
      return null;
    }
    return fields;
  }

  private noteHandlers(): NoteActionHandlers {
    return {
      pull: (file: TFile): void => {
        void this.pullNoteFlow(file);
      },
      push: (file: TFile): void => {
        void this.openReview(file, 'push');
      },
      compare: (file: TFile): void => {
        void this.openReview(file, 'compare');
      },
      openInConfluence: (file: TFile): void => {
        this.openInConfluence(file);
      },
      pushEnabled: (): boolean => this.settings.enablePush
    };
  }

  private reviewDeps(): ReviewDeps {
    return {
      prepare: (file: TFile, scope: SpaceScope): Promise<PreparedPush> => {
        const client: ConfluenceClient = this.runner.createClient();
        return preparePush({ app: this.app, client, users: new UserDirectory(client) }, file, scope);
      },
      send: (request: PushRequest): Promise<PushOutcome> => this.withNoteWork((): Promise<PushOutcome> => {
        const client: ConfluenceClient = this.runner.createClient();
        return pushNote({ app: this.app, client, users: new UserDirectory(client) }, request);
      }),
      pull: (file: TFile, scope: SpaceScope): Promise<PullOutcome> => this.withNoteWork((): Promise<PullOutcome> => {
        const client: ConfluenceClient = this.runner.createClient();
        return pullNote(
          { app: this.app, client, users: new UserDirectory(client), downloadAttachments: this.settings.downloadAttachments },
          file,
          scope
        );
      }),
      scopeOf: (file: TFile): SpaceScope | null => findMarkerForFile(this.app, file),
      openInConfluence: (file: TFile): void => {
        this.openInConfluence(file);
      },
      settings: (): ConfluenceSyncSettings => this.settings,
      onError: (err: unknown): void => {
        notifyError(this.app, err, this.manifest.id);
      }
    };
  }

  /** One note at a time, and never while a sync runs: a sync would rewrite the note under the send. */
  private async withNoteWork<T>(work: () => Promise<T>): Promise<T> {
    if (this.runner.isRunning || this.noteWorkBusy) {
      throw new Error('A Confluence sync is running. Try again when it is done.');
    }
    this.noteWorkBusy = true;
    try {
      return await work();
    } finally {
      this.noteWorkBusy = false;
    }
  }

  private showReportIfWanted(report: SyncReport): void {
    notify(report.summaryLine(), 8000);
    if (report.dryRun || this.settings.showReportAfterSync || report.hasProblems()) {
      this.showReport(report);
    }
  }

  private onStatusBarClick(): void {
    if (this.runner.isRunning) {
      this.runner.cancel();
      return;
    }
    if (this.runner.lastReport) {
      this.showReport(this.runner.lastReport);
    }
  }
}
