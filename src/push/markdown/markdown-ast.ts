/**
 * The markdown a note can hold, as the push side reads it.
 *
 * Only the dialect the sync writes plus what people type by hand in Obsidian:
 * CommonMark blocks and inlines, tables, task items, callouts, wikilinks and
 * embeds. Anything else stays text, so nothing is guessed at.
 */

export interface MdText {
  kind: 'text';
  text: string;
}

export interface MdCode {
  kind: 'code';
  text: string;
}

export type MdSpanKind = 'strong' | 'em' | 'strike' | 'highlight';

export interface MdSpan {
  kind: MdSpanKind;
  inlines: Array<MdInline>;
}

export interface MdLink {
  kind: 'link';
  href: string;
  inlines: Array<MdInline>;
}

export interface MdAutolink {
  kind: 'autolink';
  href: string;
}

export interface MdImage {
  kind: 'image';
  alt: string;
  src: string;
}

/** `[[target#anchor|alias]]`; `target` is '' for a link to a heading of the same note. */
export interface MdWikilink {
  kind: 'wikilink';
  target: string;
  anchor: string;
  alias: string;
}

/** `![[target|alias]]`. */
export interface MdEmbed {
  kind: 'embed';
  target: string;
  alias: string;
}

/** A line break inside a paragraph or a table cell. */
export interface MdBreak {
  kind: 'break';
}

export type MdInline = MdText | MdCode | MdSpan | MdLink | MdAutolink | MdImage | MdWikilink | MdEmbed | MdBreak;

/** Where a block sits in the body, as zero-based line indexes, first and last. */
export interface MdLines {
  from: number;
  to: number;
}

export interface MdHeading extends MdLines {
  kind: 'heading';
  level: number;
  inlines: Array<MdInline>;
}

export interface MdParagraph extends MdLines {
  kind: 'paragraph';
  inlines: Array<MdInline>;
}

export interface MdFence extends MdLines {
  kind: 'fence';
  language: string;
  text: string;
}

export interface MdRule extends MdLines {
  kind: 'rule';
}

export interface MdQuote extends MdLines {
  kind: 'quote';
  blocks: Array<MdBlock>;
}

/** `> [!type]- Title`, Obsidian's callout; `folded` for the `-` form. */
export interface MdCallout extends MdLines {
  kind: 'callout';
  type: string;
  folded: boolean;
  title: Array<MdInline>;
  blocks: Array<MdBlock>;
}

export type MdTask = 'none' | 'open' | 'done';

export interface MdListItem {
  task: MdTask;
  blocks: Array<MdBlock>;
}

export interface MdList extends MdLines {
  kind: 'list';
  ordered: boolean;
  items: Array<MdListItem>;
}

export interface MdTable extends MdLines {
  kind: 'table';
  header: Array<Array<MdInline>>;
  rows: Array<Array<Array<MdInline>>>;
}

/** An HTML comment on lines of its own. Kept for line accounting, written nowhere. */
export interface MdComment extends MdLines {
  kind: 'comment';
  text: string;
}

export type MdBlock = MdHeading | MdParagraph | MdFence | MdRule | MdQuote | MdCallout | MdList | MdTable | MdComment;
