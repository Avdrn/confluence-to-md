/**
 * The review pane: a tab beside the note that shows what a send would change
 * in Confluence, one card per change, and sends it. It follows the note as
 * it is typed, so what it shows is never stale.
 */

import { ItemView, MarkdownView, Notice } from 'obsidian';
import type { App, TFile, WorkspaceLeaf } from 'obsidian';
import { hashBody } from '../../sync/plan/body-hash';
import { assessPrepared, bodyNow } from '../../push/prepare-push';
import { renderChangeCard, renderUnchanged } from './change-card';
import { REVIEW } from './review-strings';
import type { ConfluenceSyncSettings } from '../../settings/plugin-settings';
import type { PushAssessment, ReviewChange, ReviewRun } from '../../push/preflight';
import type { PreparedPush } from '../../push/prepare-push';
import type { PushOutcome, PushRequest } from '../../push/push-page';
import type { PullOutcome } from '../../push/pull-page';
import type { SpaceScope } from '../../vault/marker-notes';
import type { ReviewMode } from './change-card';

export const REVIEW_VIEW_TYPE: string = 'confluence-review';
const REFRESH_DELAY_MS: number = 400;

export interface ReviewState {
  notePath: string;
  mode: ReviewMode;
}

export interface ReviewDeps {
  prepare(file: TFile, scope: SpaceScope): Promise<PreparedPush>;
  send(request: PushRequest): Promise<PushOutcome>;
  pull(file: TFile, scope: SpaceScope): Promise<PullOutcome>;
  scopeOf(file: TFile): SpaceScope | null;
  openInConfluence(file: TFile): void;
  settings(): ConfluenceSyncSettings;
  onError(err: unknown): void;
}

export class ReviewView extends ItemView {
  private state: ReviewState = { notePath: '', mode: 'compare' };
  private prepared: PreparedPush | null = null;
  private assessment: PushAssessment | null = null;
  private bodyHash: string = '';
  private sending: Set<number> = new Set<number>();
  private sideBySide: Set<number> = new Set<number>();
  private acknowledged: Set<string> = new Set<string>();
  private draftAcknowledged: boolean = false;
  private message: string = '';
  private busy: boolean = false;
  private done: string = '';
  private refreshTimer: number | null = null;

  public constructor(leaf: WorkspaceLeaf, private readonly deps: ReviewDeps) {
    super(leaf);
  }

  public override getViewType(): string {
    return REVIEW_VIEW_TYPE;
  }

  public override getDisplayText(): string {
    if (this.prepared) {
      return REVIEW.title(this.prepared.remote.title);
    }
    return 'Review';
  }

  public override getIcon(): string {
    return 'cloud';
  }

  public override getState(): Record<string, unknown> {
    const state: Record<string, unknown> = { notePath: this.state.notePath, mode: this.state.mode };
    return state;
  }

  public override async setState(state: unknown, result: { history: boolean }): Promise<void> {
    const next: Partial<ReviewState> = (state ?? {}) as Partial<ReviewState>;
    this.state = { notePath: next.notePath ?? '', mode: next.mode ?? 'compare' };
    await super.setState(state, result);
    await this.loadNote();
  }

  public override async onOpen(): Promise<void> {
    this.registerEvent(this.app.workspace.on('editor-change', (_editor, info): void => {
      if (info.file?.path === this.state.notePath) {
        this.scheduleRefresh();
      }
    }));
    this.render();
  }

  public override async onClose(): Promise<void> {
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
    }
  }

  public get notePath(): string {
    return this.state.notePath;
  }

  /** Opens the pane for a note beside it, or brings the one already open for that note to the front. */
  public static async open(app: App, state: ReviewState): Promise<void> {
    const existing: WorkspaceLeaf | undefined = app.workspace.getLeavesOfType(REVIEW_VIEW_TYPE)
      .find((leaf: WorkspaceLeaf): boolean => leaf.view instanceof ReviewView && leaf.view.notePath === state.notePath);
    const leaf: WorkspaceLeaf = existing ?? app.workspace.getLeaf('split', 'vertical');
    const viewState: Record<string, unknown> = { notePath: state.notePath, mode: state.mode };
    await leaf.setViewState({ type: REVIEW_VIEW_TYPE, state: viewState, active: true });
    await app.workspace.revealLeaf(leaf);
  }

  private async loadNote(): Promise<void> {
    this.prepared = null;
    this.assessment = null;
    this.done = '';
    this.render();
    const file: TFile | null = this.app.vault.getFileByPath(this.state.notePath);
    if (!file) {
      return;
    }
    const scope: SpaceScope | null = this.deps.scopeOf(file);
    if (!scope) {
      return;
    }
    try {
      this.prepared = await this.deps.prepare(file, scope);
      this.message = this.deps.settings().pushVersionMessage;
      await this.refreshAssessment(true);
    } catch (err) {
      this.deps.onError(err);
      this.done = '';
      this.render();
    }
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = window.setTimeout((): void => {
      this.refreshTimer = null;
      void this.refreshAssessment(false);
    }, REFRESH_DELAY_MS);
  }

  /** The assessment for the note as it reads now. `fresh` resets the switches. */
  private async refreshAssessment(fresh: boolean): Promise<void> {
    if (!this.prepared || this.busy || this.done) {
      return;
    }
    const body: string = await bodyNow(this.app, this.prepared.file);
    const assessment: PushAssessment = assessPrepared(this.prepared, body);
    const all: Set<number> = new Set<number>(assessment.changes.map((change: ReviewChange): number => change.index));
    if (fresh || !this.assessment || this.assessment.changes.length !== assessment.changes.length) {
      this.sending = all;
    } else {
      this.sending = new Set<number>([...this.sending].filter((index: number): boolean => all.has(index)));
    }
    this.assessment = assessment;
    this.bodyHash = hashBody(body);
    this.render();
  }

  private render(): void {
    const root: HTMLElement = this.contentEl;
    root.empty();
    root.addClass('confluence-review');
    if (!this.state.notePath || !this.app.vault.getFileByPath(this.state.notePath)) {
      root.createEl('p', { cls: 'confluence-review-muted', text: REVIEW.noPage });
      return;
    }
    if (this.done) {
      this.renderDone(root);
      return;
    }
    if (!this.prepared || !this.assessment) {
      root.createEl('p', { cls: 'confluence-review-muted', text: REVIEW.loading });
      return;
    }
    const assessment: PushAssessment = this.assessment;
    this.renderHeader(root, assessment);
    const cards: HTMLElement = root.createDiv({ cls: 'confluence-review-cards' });
    if (assessment.changes.length === 0) {
      let text: string = REVIEW.nothingToSend;
      if (this.state.mode === 'compare') {
        text = REVIEW.compareSame;
      }
      cards.createEl('p', { cls: 'confluence-review-muted', text });
    }
    for (const run of assessment.runs) {
      this.renderRun(cards, run, assessment);
    }
    this.renderFooter(root, assessment);
  }

  private renderHeader(root: HTMLElement, assessment: PushAssessment): void {
    const header: HTMLElement = root.createDiv({ cls: 'confluence-review-header' });
    if (this.state.mode === 'pull') {
      header.createDiv({ cls: 'confluence-review-summary', text: REVIEW.pullSummary(assessment.changes.length) });
    } else if (assessment.changes.length > 0) {
      header.createDiv({ cls: 'confluence-review-summary', text: REVIEW.changedSummary(assessment.changes.length, shortDate(assessment.remoteWhen), assessment.noteVersion) });
    }
    if (assessment.remoteMoved) {
      const status: HTMLElement = header.createDiv({ cls: 'confluence-review-status is-warn', text: REVIEW.remoteMoved(assessment.remoteBy, shortDate(assessment.remoteWhen)) });
      const actions: HTMLElement = status.createDiv({ cls: 'confluence-review-status-actions' });
      const pull: HTMLButtonElement = actions.createEl('button', { text: REVIEW.getConfluenceVersion });
      pull.addEventListener('click', (): void => {
        void this.doPull();
      });
      const open: HTMLButtonElement = actions.createEl('button', { text: REVIEW.openInConfluence });
      open.addEventListener('click', (): void => {
        this.openInConfluence();
      });
    } else if (this.state.mode === 'push') {
      header.createDiv({ cls: 'confluence-review-status is-ok', text: REVIEW.remoteSame });
    }
    if (assessment.draft && this.state.mode === 'push') {
      const status: HTMLElement = header.createDiv({ cls: 'confluence-review-status is-warn', text: REVIEW.draft(assessment.draft.by, assessment.draft.live) });
      const label: HTMLLabelElement = status.createEl('label', { cls: 'confluence-review-headsup-ok' });
      const box: HTMLInputElement = label.createEl('input', { type: 'checkbox' });
      box.checked = this.draftAcknowledged;
      box.addEventListener('change', (): void => {
        this.draftAcknowledged = box.checked;
        this.render();
      });
      label.appendText(` ${REVIEW.sendAnyway}`);
    }
  }

  private renderRun(cards: HTMLElement, run: ReviewRun, assessment: PushAssessment): void {
    const notePath: string = this.state.notePath;
    if (run.kind === 'unchanged' || !run.change) {
      renderUnchanged(cards, run.count, run.text, { app: this.app, component: this, notePath });
      return;
    }
    const change: ReviewChange = run.change;
    let readsDifferently: string = '';
    const hit = assessment.roundTrip.differences.find((difference): boolean =>
      difference.local[0] < change.localBlocks[1] && change.localBlocks[0] < difference.local[1]
    );
    if (hit) {
      readsDifferently = hit.actual;
    }
    renderChangeCard(cards, {
      app: this.app,
      component: this,
      notePath,
      mode: this.state.mode,
      change,
      sending: this.sending.has(change.index),
      sideBySide: this.sideBySide.has(change.index),
      acknowledged: this.acknowledged,
      readsDifferently,
      onSending: (sending: boolean): void => {
        if (sending) {
          this.sending.add(change.index);
        } else {
          this.sending.delete(change.index);
        }
        this.render();
      },
      onSideBySide: (sideBySide: boolean): void => {
        if (sideBySide) {
          this.sideBySide.add(change.index);
        } else {
          this.sideBySide.delete(change.index);
        }
        this.render();
      },
      onAcknowledge: (headsUp: string, ok: boolean): void => {
        if (ok) {
          this.acknowledged.add(headsUp);
        } else {
          this.acknowledged.delete(headsUp);
        }
        this.render();
      },
      onShowInNote: (): void => {
        void this.showInNote(change);
      }
    });
  }

  private renderFooter(root: HTMLElement, assessment: PushAssessment): void {
    if (this.state.mode === 'compare') {
      return;
    }
    const footer: HTMLElement = root.createDiv({ cls: 'confluence-review-footer' });
    if (this.state.mode === 'pull') {
      const replace: HTMLButtonElement = footer.createEl('button', { text: REVIEW.replaceMyNote, cls: 'mod-cta' });
      replace.disabled = this.busy;
      replace.addEventListener('click', (): void => {
        void this.doPull();
      });
      return;
    }
    const message: HTMLInputElement = footer.createEl('input', { type: 'text', cls: 'confluence-review-message' });
    message.placeholder = REVIEW.historyNote;
    message.value = this.message;
    message.addEventListener('input', (): void => {
      this.message = message.value;
    });
    const count: number = this.sending.size;
    const send: HTMLButtonElement = footer.createEl('button', { text: REVIEW.sendButton(count), cls: 'mod-cta' });
    send.disabled = this.busy || count === 0 || assessment.blocked !== '' || !this.allAcknowledged(assessment);
    send.addEventListener('click', (): void => {
      void this.doSend();
    });
    const cancel: HTMLButtonElement = footer.createEl('button', { text: REVIEW.cancel });
    cancel.addEventListener('click', (): void => {
      this.leaf.detach();
    });
  }

  /** Every heads-up on a card that is being sent has its OK, and the draft warning its "send anyway". */
  private allAcknowledged(assessment: PushAssessment): boolean {
    if (assessment.draft && !this.draftAcknowledged) {
      return false;
    }
    return assessment.changes.every((change: ReviewChange): boolean =>
      !this.sending.has(change.index) || change.headsUp.every((text: string): boolean => this.acknowledged.has(text))
    );
  }

  private renderDone(root: HTMLElement): void {
    const panel: HTMLElement = root.createDiv({ cls: 'confluence-review-done' });
    panel.createEl('p', { text: this.done });
    const actions: HTMLElement = panel.createDiv({ cls: 'confluence-review-status-actions' });
    const open: HTMLButtonElement = actions.createEl('button', { text: REVIEW.openInConfluence });
    open.addEventListener('click', (): void => {
      this.openInConfluence();
    });
    const close: HTMLButtonElement = actions.createEl('button', { text: REVIEW.close, cls: 'mod-cta' });
    close.addEventListener('click', (): void => {
      this.leaf.detach();
    });
  }

  private async doSend(): Promise<void> {
    if (!this.prepared || !this.assessment || this.busy) {
      return;
    }
    this.busy = true;
    this.render();
    try {
      const outcome: PushOutcome = await this.deps.send({
        prepared: this.prepared,
        assessment: this.assessment,
        sending: this.sending,
        message: this.message || this.deps.settings().pushVersionMessage,
        bodyHash: this.bodyHash,
        downloadAttachments: this.deps.settings().downloadAttachments
      });
      this.busy = false;
      if (outcome.kind === 'sent') {
        const kept: number = this.assessment.changes.length - this.sending.size;
        this.done = REVIEW.sent(outcome.version);
        if (kept > 0) {
          this.done = REVIEW.sentSome(outcome.version, kept);
        }
        if (outcome.liveFailed) {
          this.done = `${this.done} ${REVIEW.liveNotUpdated}`;
          new Notice(REVIEW.liveNotUpdated);
        }
        this.render();
        return;
      }
      if (outcome.kind === 'stale') {
        new Notice(REVIEW.staleNotice);
        await this.refreshAssessment(true);
        return;
      }
      if (outcome.kind === 'conflict') {
        new Notice(REVIEW.conflictNotice);
      }
      await this.loadNote();
    } catch (err) {
      this.busy = false;
      this.deps.onError(err);
      this.render();
    }
  }

  private async doPull(): Promise<void> {
    if (!this.prepared || this.busy) {
      return;
    }
    this.busy = true;
    this.render();
    try {
      const outcome: PullOutcome = await this.deps.pull(this.prepared.file, this.prepared.scope);
      this.busy = false;
      this.done = `Your note now reads like Confluence version ${outcome.version}.`;
      this.render();
    } catch (err) {
      this.busy = false;
      this.deps.onError(err);
      this.render();
    }
  }

  private openInConfluence(): void {
    if (this.prepared) {
      this.deps.openInConfluence(this.prepared.file);
    }
  }

  /** Puts the cursor on the change in the note. Body lines sit below the front-matter. */
  private async showInNote(change: ReviewChange): Promise<void> {
    const file: TFile | null = this.app.vault.getFileByPath(this.state.notePath);
    if (!file || !change.lines) {
      return;
    }
    let leaf: WorkspaceLeaf | undefined = this.app.workspace.getLeavesOfType('markdown')
      .find((candidate: WorkspaceLeaf): boolean => (candidate.view as MarkdownView).file?.path === file.path);
    if (!leaf) {
      leaf = this.app.workspace.getLeaf('tab');
      await leaf.openFile(file);
    }
    const view: unknown = leaf.view;
    if (!(view instanceof MarkdownView)) {
      return;
    }
    const offset: number = (this.app.metadataCache.getFileCache(file)?.frontmatterPosition?.end.line ?? -1) + 1;
    const from: number = offset + change.lines[0];
    const to: number = offset + change.lines[1];
    await this.app.workspace.revealLeaf(leaf);
    view.editor.setCursor({ line: from, ch: 0 });
    view.editor.scrollIntoView({ from: { line: from, ch: 0 }, to: { line: to, ch: 0 } }, true);
  }
}

function shortDate(iso: string): string {
  if (!iso) {
    return '';
  }
  const date: Date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

