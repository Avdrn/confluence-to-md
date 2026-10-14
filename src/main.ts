import { Plugin, TFolder } from 'obsidian';
import type { Menu, TAbstractFile, TFile } from 'obsidian';
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
import { notify } from './ui/notices';
import { registerCommands } from './ui/commands';
import { registerRibbon } from './ui/ribbon';
import { addSpaceHere } from './ui/add-space';
import type { SyncReport } from './sync/report/sync-report';

export default class ConfluenceSyncPlugin extends Plugin {
  public override settings: ConfluenceSyncSettings = { ...DEFAULT_SETTINGS };
  private statusBar: SyncStatusBar | null = null;

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
    onFinished: (report: SyncReport): void => {
      this.showReportIfWanted(report);
    }
  });

  public override async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new ConfluenceSyncSettingTab(this.app, this));
    this.statusBar = new SyncStatusBar(this.addStatusBarItem(), (): void => {
      this.onStatusBarClick();
    });
    registerCommands(this);
    registerRibbon(this);
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

  public showReport(report: SyncReport): void {
    new ReportModal(this.app, report).open();
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
