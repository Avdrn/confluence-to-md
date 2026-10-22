/**
 * Everything the review pane and the executor need to know before a push,
 * from facts already fetched. Pure: no Obsidian, no network, so it can run
 * again after every change to the note.
 *
 * The base is the page as Confluence holds it now. While that is the version
 * the note was rendered from, every block the note did not change reads
 * exactly like its segment, and the diff finds the rest.
 */

import { baseMarkdown, joinBlocks } from './base-markdown';
import { diffBlocks } from './block-diff';
import { generatedBlockWords, lostInNodes } from './lost-content';
import { noteBlocks } from './note-blocks';
import { patchStorage } from './patch';
import { roundTrip } from './round-trip';
import { largestTaskId, writeStorageBlocks } from './storage-writer';
import { removeInertMarkers } from './un-inert';
import { macroName } from '../convert/storage-parser';
import { isPanelMacro } from '../convert/callout-mapping';
import { hashBody } from '../sync/plan/body-hash';
import type { BaseMarkdown, BaseSegment } from './base-markdown';
import type { BlockChange } from './block-diff';
import type { MdBlock } from './markdown/markdown-ast';
import type { NoteBlock } from './note-blocks';
import type { RoundTrip } from './round-trip';
import type { StorageResult, StorageTargets } from './storage-writer';
import type { IncludedBodies } from '../convert/storage-segments';
import type { StorageNode, UserDirectory } from '../convert/storage-types';
import type { PageBody } from '../confluence/page-body';
import type { PageDraft } from '../confluence/page-draft';
import type { ManagedFrontMatterFields } from '../sync/front-matter/managed-front-matter';
import type { LinkResolveOptions } from '../sync/links/link-resolver';

export interface PreflightInput {
  /** The note body as it is now, front-matter removed. */
  body: string;
  fields: ManagedFrontMatterFields;
  remote: PageBody;
  draft: PageDraft | null;
  users: UserDirectory;
  links: LinkResolveOptions;
  targets: StorageTargets;
  /** Bodies of the pages the remote's include macros pull in, by macro offset. */
  includes: IncludedBodies;
  /**
   * For content the note can only read, a database: the body a sync would
   * write now, which stands in for a storage body. Null for a page.
   */
  readOnlyBody: string | null;
}

/** Why a database note cannot be sent, as the assessment's `blocked`. */
export const READ_ONLY_REASON: string = 'This note mirrors a Confluence database. Confluence has no API that writes database rows, so changes made in Obsidian cannot be sent.';

export type ReviewChangeKind = 'changed' | 'added' | 'removed';

export interface ReviewChange {
  /** Index into the diff; what a switch in the review pane refers to. */
  index: number;
  kind: ReviewChangeKind;
  /** "paragraph", "table", "task list", or "3 blocks"; for the card label. */
  what: string;
  /** The text as Confluence has it, '' for an addition. */
  before: string;
  /** The text as the note has it, '' for a removal. */
  after: string;
  /** Lines of the note the change covers, for "Show in note"; null for a removal. */
  lines: [number, number] | null;
  /** Note blocks the change covers, end exclusive; empty for a removal. */
  localBlocks: [number, number];
  /** One sentence per thing the send would lose or replace. */
  headsUp: Array<string>;
}

/** The page in order: a stretch of unchanged blocks, or one change. */
export interface ReviewRun {
  kind: 'unchanged' | 'change';
  /** Blocks in an unchanged stretch; 1 for a change. */
  count: number;
  /** The unchanged blocks' text; '' for a change. */
  text: string;
  change: ReviewChange | null;
}

export interface PushAssessment {
  noteVersion: number;
  remoteVersion: number;
  remoteBy: string;
  remoteWhen: string;
  /** Confluence is not at the version the note was rendered from. */
  remoteMoved: boolean;
  /** The note's body no longer hashes to what the sync recorded. */
  localChanged: boolean;
  draft: PageDraft | null;
  /** Why no push is possible at all, in plain words; '' when one is. */
  blocked: string;
  changes: Array<ReviewChange>;
  unchanged: number;
  runs: Array<ReviewRun>;
  /** How the note will read after every change is sent, where that differs from the note. */
  roundTrip: RoundTrip;
  /** The storage to send when exactly these changes, by index, are sent. */
  storageFor(sending: ReadonlySet<number>): string;
  /** The body a sync would write from that storage: what the note becomes, and what is hashed. */
  renderedFor(storage: string): string;
}

export function assess(input: PreflightInput): PushAssessment {
  if (input.readOnlyBody !== null) {
    return assessReadOnly(input, input.readOnlyBody);
  }
  const body: string = removeInertMarkers(input.body);
  const blocks: Array<NoteBlock> = noteBlocks(body);
  const localTexts: Array<string> = blocks.map((block: NoteBlock): string => block.text);
  const base: BaseMarkdown = baseMarkdown(input.remote.storage, input.users, input.links, input.includes);
  const segments: Array<BaseSegment> = base.segments.filter((segment: BaseSegment): boolean => segment.text.length > 0);
  const baseTexts: Array<string> = segments.map((segment: BaseSegment): string => segment.text);
  const diff: Array<BlockChange> = diffBlocks(baseTexts, localTexts);
  const written: Array<StorageResult> = writeStorageBlocks(
    blocks.map((block: NoteBlock): MdBlock => block.block),
    input.targets,
    largestTaskId(input.remote.storage) + 1
  );
  const storageFor = (sending: ReadonlySet<number>): string => patchStorage({
    storage: input.remote.storage,
    segments,
    changes: diff,
    localStorage: (index: number): string => written[index].storage,
    sends: (_change: BlockChange, index: number): boolean => sending.has(index)
  });
  const changes: Array<ReviewChange> = new Array<ReviewChange>();
  const runs: Array<ReviewRun> = new Array<ReviewRun>();
  diff.forEach((change: BlockChange, index: number): void => {
    if (change.kind === 'equal') {
      runs.push({ kind: 'unchanged', count: change.base[1] - change.base[0], text: joinBlocks(baseTexts.slice(change.base[0], change.base[1])), change: null });
      return;
    }
    const reviewed: ReviewChange = reviewChange(change, index, segments, blocks, baseTexts, localTexts, written);
    changes.push(reviewed);
    runs.push({ kind: 'change', count: 1, text: '', change: reviewed });
  });
  const remoteMoved: boolean = input.remote.version !== input.fields.version;
  const all: Set<number> = new Set<number>(changes.map((change: ReviewChange): number => change.index));
  return {
    noteVersion: input.fields.version,
    remoteVersion: input.remote.version,
    remoteBy: input.remote.versionBy,
    remoteWhen: input.remote.versionWhen,
    remoteMoved,
    localChanged: input.fields.hash.length > 0 && hashBody(input.body) !== input.fields.hash,
    draft: input.draft,
    blocked: blockedReason(input, remoteMoved),
    changes,
    unchanged: diff.filter((change: BlockChange): boolean => change.kind === 'equal')
      .reduce((count: number, change: BlockChange): number => count + change.base[1] - change.base[0], 0),
    runs,
    roundTrip: roundTrip(storageFor(all), localTexts, input.users, input.links, input.includes),
    storageFor,
    renderedFor: (storage: string): string => baseMarkdown(storage, input.users, input.links, input.includes).body
  };
}

/**
 * The assessment of a database note: the note against the table a sync would
 * write now. Nothing can be sent, so there is no storage to patch and nothing
 * to warn about; the cards show what differs, which is what a comparison and
 * a pull need.
 */
function assessReadOnly(input: PreflightInput, remoteBody: string): PushAssessment {
  const body: string = removeInertMarkers(input.body);
  const blocks: Array<NoteBlock> = noteBlocks(body);
  const baseBlocks: Array<NoteBlock> = noteBlocks(remoteBody);
  const localTexts: Array<string> = blocks.map((block: NoteBlock): string => block.text);
  const baseTexts: Array<string> = baseBlocks.map((block: NoteBlock): string => block.text);
  const diff: Array<BlockChange> = diffBlocks(baseTexts, localTexts);
  const changes: Array<ReviewChange> = new Array<ReviewChange>();
  const runs: Array<ReviewRun> = new Array<ReviewRun>();
  diff.forEach((change: BlockChange, index: number): void => {
    if (change.kind === 'equal') {
      runs.push({ kind: 'unchanged', count: change.base[1] - change.base[0], text: joinBlocks(baseTexts.slice(change.base[0], change.base[1])), change: null });
      return;
    }
    const localRange: Array<NoteBlock> = blocks.slice(change.local[0], change.local[1]);
    let lines: [number, number] | null = null;
    if (localRange.length > 0) {
      lines = [localRange[0].block.from, localRange[localRange.length - 1].block.to];
    }
    let what: string = wordsForBlocks(localRange.map((block: NoteBlock): MdBlock => block.block));
    if (change.kind === 'removed') {
      what = wordsForBlocks(baseBlocks.slice(change.base[0], change.base[1]).map((block: NoteBlock): MdBlock => block.block));
    }
    const reviewed: ReviewChange = {
      index,
      kind: change.kind as ReviewChangeKind,
      what,
      before: joinBlocks(baseTexts.slice(change.base[0], change.base[1])),
      after: joinBlocks(localTexts.slice(change.local[0], change.local[1])),
      lines,
      localBlocks: change.local,
      headsUp: []
    };
    changes.push(reviewed);
    runs.push({ kind: 'change', count: 1, text: '', change: reviewed });
  });
  return {
    noteVersion: input.fields.version,
    remoteVersion: input.remote.version,
    remoteBy: input.remote.versionBy,
    remoteWhen: input.remote.versionWhen,
    remoteMoved: input.remote.version !== input.fields.version,
    localChanged: input.fields.hash.length > 0 && hashBody(input.body) !== input.fields.hash,
    draft: null,
    blocked: READ_ONLY_REASON,
    changes,
    unchanged: diff.filter((change: BlockChange): boolean => change.kind === 'equal')
      .reduce((count: number, change: BlockChange): number => count + change.base[1] - change.base[0], 0),
    runs,
    roundTrip: { body: remoteBody, differences: [] },
    storageFor: (): string => '',
    renderedFor: (): string => remoteBody
  };
}

function blockedReason(input: PreflightInput, remoteMoved: boolean): string {
  if (input.fields.version === 0) {
    return 'This note has no Confluence version recorded. Run "Sync this space" first.';
  }
  if (remoteMoved) {
    return 'Confluence changed since this note was last synced. Get the Confluence version first, then make your changes again.';
  }
  return '';
}

function reviewChange(
  change: BlockChange,
  index: number,
  segments: ReadonlyArray<BaseSegment>,
  blocks: ReadonlyArray<NoteBlock>,
  baseTexts: ReadonlyArray<string>,
  localTexts: ReadonlyArray<string>,
  written: ReadonlyArray<StorageResult>
): ReviewChange {
  const baseRange: Array<BaseSegment> = segments.slice(change.base[0], change.base[1]);
  const localRange: Array<NoteBlock> = blocks.slice(change.local[0], change.local[1]);
  const headsUp: Array<string> = new Array<string>();
  for (const segment of baseRange) {
    const generated: string = generatedBlockWords(segment.kind);
    if (generated) {
      headsUp.push(`Confluence builds ${generated} automatically; your edit would replace it with fixed text.`);
    }
    for (const lost of lostInNodes(segment.nodes)) {
      headsUp.push(`This part of the page holds ${lost}, which a block written from the note cannot keep.`);
    }
  }
  for (let i: number = change.local[0]; i < change.local[1]; i++) {
    for (const lost of written[i].lost) {
      headsUp.push(`Heads-up: ${lost}.`);
    }
  }
  let lines: [number, number] | null = null;
  if (localRange.length > 0) {
    lines = [localRange[0].block.from, localRange[localRange.length - 1].block.to];
  }
  let what: string = wordsForBlocks(localRange.map((block: NoteBlock): MdBlock => block.block));
  if (change.kind === 'removed') {
    what = wordsForSegments(baseRange);
  }
  return {
    index,
    kind: change.kind as ReviewChangeKind,
    what,
    before: joinBlocks(baseTexts.slice(change.base[0], change.base[1])),
    after: joinBlocks(localTexts.slice(change.local[0], change.local[1])),
    lines,
    localBlocks: change.local,
    headsUp: [...new Set<string>(headsUp)]
  };
}

function wordsForBlocks(blocks: ReadonlyArray<MdBlock>): string {
  if (blocks.length !== 1) {
    return `${blocks.length} blocks`;
  }
  const block: MdBlock = blocks[0];
  switch (block.kind) {
    case 'heading':
      return 'heading';
    case 'paragraph':
      return 'paragraph';
    case 'fence':
      return 'code block';
    case 'rule':
      return 'divider';
    case 'quote':
      return 'quote';
    case 'callout':
      return 'callout';
    case 'list':
      if (block.items.some((item): boolean => item.task !== 'none')) {
        return 'task list';
      }
      return 'list';
    case 'table':
      return 'table';
    case 'comment':
      return 'comment';
  }
}

function wordsForSegments(segments: ReadonlyArray<BaseSegment>): string {
  if (segments.length !== 1) {
    return `${segments.length} blocks`;
  }
  const node: StorageNode = segments[0].nodes[0];
  const macro: string = macroName(node);
  if (macro === 'code' || macro === 'noformat') {
    return 'code block';
  }
  if (macro === 'expand' || isPanelMacro(macro)) {
    return 'callout';
  }
  if (macro) {
    return `"${macro}" element`;
  }
  switch (node.tag) {
    case 'p':
      return 'paragraph';
    case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
      return 'heading';
    case 'ul': case 'ol':
      return 'list';
    case 'ac:task-list':
      return 'task list';
    case 'table':
      return 'table';
    case 'blockquote':
      return 'quote';
    case 'hr':
      return 'divider';
    case 'ac:image':
      return 'image';
    default:
      return 'block';
  }
}
