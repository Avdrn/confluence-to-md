/**
 * One card of the review pane: what changed, shown as rendered text with the
 * removed words struck through and the new ones highlighted, a switch to send
 * it or hold it back, and the heads-ups that need a nod.
 */

import { MarkdownRenderer } from 'obsidian';
import type { App, Component } from 'obsidian';
import { mergeChange } from '../../push/inline-diff';
import { REVIEW } from './review-strings';
import type { MergedBlock } from '../../push/inline-diff';
import type { ReviewChange } from '../../push/preflight';

export type ReviewMode = 'push' | 'pull' | 'compare';

export interface CardOptions {
  app: App;
  component: Component;
  notePath: string;
  mode: ReviewMode;
  change: ReviewChange;
  sending: boolean;
  sideBySide: boolean;
  acknowledged: ReadonlySet<string>;
  /** What this part will read like after the send, when that differs from the note; '' otherwise. */
  readsDifferently: string;
  onSending(sending: boolean): void;
  onSideBySide(sideBySide: boolean): void;
  onAcknowledge(headsUp: string, ok: boolean): void;
  onShowInNote(): void;
}

export function renderChangeCard(parent: HTMLElement, options: CardOptions): HTMLElement {
  const { change } = options;
  const card: HTMLElement = parent.createDiv({ cls: `confluence-review-card is-${change.kind}` });
  if (options.mode === 'push' && !options.sending) {
    card.addClass('is-held');
  }
  const head: HTMLElement = card.createDiv({ cls: 'confluence-review-card-head' });
  head.createSpan({ cls: 'confluence-review-card-label', text: REVIEW.cardLabel(change.kind, change.what) });
  const tools: HTMLElement = head.createDiv({ cls: 'confluence-review-card-tools' });
  if (change.lines) {
    const show: HTMLButtonElement = tools.createEl('button', { text: REVIEW.showInNote, cls: 'confluence-review-small' });
    show.addEventListener('click', (): void => {
      options.onShowInNote();
    });
  }
  if (change.kind === 'changed') {
    let label: string = REVIEW.sideBySide;
    if (options.sideBySide) {
      label = REVIEW.oneView;
    }
    const toggle: HTMLButtonElement = tools.createEl('button', { text: label, cls: 'confluence-review-small' });
    toggle.addEventListener('click', (): void => {
      options.onSideBySide(!options.sideBySide);
    });
  }
  renderBody(card.createDiv({ cls: 'confluence-review-card-body' }), options);
  renderHeadsUp(card, options);
  if (options.mode === 'push') {
    const row: HTMLElement = card.createDiv({ cls: 'confluence-review-card-switch' });
    const label: HTMLLabelElement = row.createEl('label');
    const box: HTMLInputElement = label.createEl('input', { type: 'checkbox' });
    box.checked = options.sending;
    box.addEventListener('change', (): void => {
      options.onSending(box.checked);
    });
    label.appendText(` ${REVIEW.sendThisChange}`);
  }
  return card;
}

function renderBody(body: HTMLElement, options: CardOptions): void {
  const { change } = options;
  if (change.kind === 'added') {
    renderMarkdown(body.createDiv({ cls: 'confluence-review-rendered is-added' }), change.after, options);
    return;
  }
  if (change.kind === 'removed') {
    renderMarkdown(body.createDiv({ cls: 'confluence-review-rendered is-removed' }), change.before, options);
    return;
  }
  const merged: MergedBlock = mergeChange(change.before, change.after);
  if (merged.merged && !options.sideBySide) {
    renderMarkdown(body.createDiv({ cls: 'confluence-review-rendered is-merged' }), merged.markdown, options);
    return;
  }
  const columns: HTMLElement = body.createDiv({ cls: 'confluence-review-columns' });
  const left: HTMLElement = columns.createDiv({ cls: 'confluence-review-column' });
  left.createDiv({ cls: 'confluence-review-column-title', text: REVIEW.confluenceColumn });
  renderMarkdown(left.createDiv({ cls: 'confluence-review-rendered' }), change.before, options);
  const right: HTMLElement = columns.createDiv({ cls: 'confluence-review-column' });
  right.createDiv({ cls: 'confluence-review-column-title', text: REVIEW.noteColumn });
  renderMarkdown(right.createDiv({ cls: 'confluence-review-rendered' }), change.after, options);
}

function renderHeadsUp(card: HTMLElement, options: CardOptions): void {
  const notes: Array<string> = [...options.change.headsUp];
  for (const text of notes) {
    const bubble: HTMLElement = card.createDiv({ cls: 'confluence-review-headsup' });
    bubble.createSpan({ text });
    if (options.mode !== 'push') {
      continue;
    }
    const label: HTMLLabelElement = bubble.createEl('label', { cls: 'confluence-review-headsup-ok' });
    const box: HTMLInputElement = label.createEl('input', { type: 'checkbox' });
    box.checked = options.acknowledged.has(text);
    box.addEventListener('change', (): void => {
      options.onAcknowledge(text, box.checked);
    });
    label.appendText(` ${REVIEW.ok}`);
  }
  if (options.readsDifferently && options.mode === 'push') {
    const bubble: HTMLElement = card.createDiv({ cls: 'confluence-review-headsup is-reads' });
    bubble.createDiv({ text: REVIEW.readsDifferently });
    renderMarkdown(bubble.createDiv({ cls: 'confluence-review-rendered' }), options.readsDifferently, options);
  }
}

/** A collapsed stretch of blocks nothing changed in, opened on request. */
export function renderUnchanged(parent: HTMLElement, count: number, text: string, options: Pick<CardOptions, 'app' | 'component' | 'notePath'>): void {
  const row: HTMLElement = parent.createDiv({ cls: 'confluence-review-unchanged' });
  row.createSpan({ text: REVIEW.unchanged(count) });
  const show: HTMLButtonElement = row.createEl('button', { text: REVIEW.show, cls: 'confluence-review-small' });
  show.addEventListener('click', (): void => {
    show.remove();
    renderMarkdown(row.createDiv({ cls: 'confluence-review-rendered is-unchanged' }), text, options);
  });
}

export function renderMarkdown(
  target: HTMLElement,
  markdown: string,
  options: Pick<CardOptions, 'app' | 'component' | 'notePath'>
): void {
  void MarkdownRenderer.render(options.app, markdown, target, options.notePath, options.component);
}
