/**
 * Markdown blocks from a note body. Line based, like CommonMark's first pass:
 * every line is classified, runs of lines become blocks, and container blocks
 * (quotes, list items) hand their inner lines back to the same parser.
 *
 * It reads the dialect the sync writes and what people type in Obsidian.
 * Where CommonMark and Obsidian differ, Obsidian wins: a single newline inside
 * a paragraph is a line break. Leading tabs count as four spaces everywhere,
 * which is what Obsidian's default list indentation produces.
 */

import { parseInlines } from './inline-parser';
import type { MdBlock, MdInline, MdListItem, MdTask } from './markdown-ast';

const FENCE_OPEN: RegExp = /^( {0,3})(`{3,}|~{3,})[ \t]*(.*)$/;
const FENCE_CLOSE: RegExp = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
const HEADING: RegExp = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const EMPTY_HEADING: RegExp = /^ {0,3}(#{1,6})[ \t]*$/;
const RULE: RegExp = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE: RegExp = /^ {0,3}>/;
const QUOTE_PREFIX: RegExp = /^ {0,3}> ?/;
const LIST_MARKER: RegExp = /^( {0,3})([-*+]|\d{1,9}[.)])(?:( +)(.*)|[ \t]*)$/;
const TASK: RegExp = /^\[([ xX])\][ \t]+/;
const TABLE_SEPARATOR: RegExp = /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
const SETEXT_H1: RegExp = /^ {0,3}=+[ \t]*$/;
const SETEXT_H2: RegExp = /^ {0,3}-+[ \t]*$/;
const CALLOUT: RegExp = /^\[!([A-Za-z0-9_-]+)\]([+-]?)(?:[ \t]+(.*))?$/;
const COMMENT_OPEN: RegExp = /^[ \t]*<!--/;
const COMMENT_CLOSE: string = '-->';
const LEADING_TABS: RegExp = /^\t+/;
const TAB_WIDTH: number = 4;

interface ListMarker {
  indent: number;
  ordered: boolean;
  /** Only `1.` and bullets may interrupt a paragraph; `2024.` in running text is a year. */
  interrupts: boolean;
  /** Column where the item's content starts; nested lines are indented at least this far. */
  contentIndent: number;
  content: string;
}

export function parseBlocks(body: string): Array<MdBlock> {
  const lines: Array<string> = body
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line: string): string => line.replace(LEADING_TABS, (tabs: string): string => ' '.repeat(tabs.length * TAB_WIDTH)));
  return parseLines(lines, 0);
}

/** `offset` is the body line index of `lines[0]`, so nested blocks keep real line numbers. */
function parseLines(lines: ReadonlyArray<string>, offset: number): Array<MdBlock> {
  const blocks: Array<MdBlock> = new Array<MdBlock>();
  let i: number = 0;
  while (i < lines.length) {
    const line: string = lines[i];
    if (isBlank(line)) {
      i++;
      continue;
    }
    if (FENCE_OPEN.test(line)) {
      i = readFence(lines, i, offset, blocks);
      continue;
    }
    if (COMMENT_OPEN.test(line)) {
      i = readComment(lines, i, offset, blocks);
      continue;
    }
    const heading: RegExpExecArray | null = HEADING.exec(line);
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length, inlines: parseInlines(heading[2]), from: offset + i, to: offset + i });
      i++;
      continue;
    }
    const emptyHeading: RegExpExecArray | null = EMPTY_HEADING.exec(line);
    if (emptyHeading) {
      blocks.push({ kind: 'heading', level: emptyHeading[1].length, inlines: [], from: offset + i, to: offset + i });
      i++;
      continue;
    }
    if (RULE.test(line)) {
      blocks.push({ kind: 'rule', from: offset + i, to: offset + i });
      i++;
      continue;
    }
    if (QUOTE.test(line)) {
      i = readQuote(lines, i, offset, blocks);
      continue;
    }
    if (listMarkerOf(line)) {
      i = readList(lines, i, offset, blocks);
      continue;
    }
    if (isTableStart(lines, i)) {
      i = readTable(lines, i, offset, blocks);
      continue;
    }
    i = readParagraph(lines, i, offset, blocks);
  }
  return blocks;
}

function isBlank(line: string): boolean {
  return line.trim() === '';
}

/** True when the line would start a new block in the middle of a paragraph. */
function interrupts(line: string): boolean {
  if (FENCE_OPEN.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line) || COMMENT_OPEN.test(line)) {
    return true;
  }
  const marker: ListMarker | null = listMarkerOf(line);
  return marker !== null && marker.interrupts;
}

function readParagraph(lines: ReadonlyArray<string>, start: number, offset: number, blocks: Array<MdBlock>): number {
  const collected: Array<string> = new Array<string>();
  let i: number = start;
  while (i < lines.length) {
    const line: string = lines[i];
    if (isBlank(line)) {
      break;
    }
    if (collected.length > 0) {
      if (SETEXT_H1.test(line) || SETEXT_H2.test(line)) {
        let level: number = 2;
        if (SETEXT_H1.test(line)) {
          level = 1;
        }
        blocks.push({ kind: 'heading', level, inlines: parseInlines(collected.join('\n')), from: offset + start, to: offset + i });
        return i + 1;
      }
      if (interrupts(line) || isTableStart(lines, i)) {
        break;
      }
    }
    collected.push(line.trim());
    i++;
  }
  blocks.push({ kind: 'paragraph', inlines: parseInlines(collected.join('\n')), from: offset + start, to: offset + i - 1 });
  return i;
}

function readFence(lines: ReadonlyArray<string>, start: number, offset: number, blocks: Array<MdBlock>): number {
  const open: RegExpExecArray = FENCE_OPEN.exec(lines[start]) as RegExpExecArray;
  const indent: number = open[1].length;
  const marker: string = open[2];
  const language: string = open[3].trim().split(/\s+/)[0] ?? '';
  const content: Array<string> = new Array<string>();
  let i: number = start + 1;
  while (i < lines.length) {
    const close: RegExpExecArray | null = FENCE_CLOSE.exec(lines[i]);
    if (close && close[1][0] === marker[0] && close[1].length >= marker.length) {
      i++;
      break;
    }
    content.push(stripIndent(lines[i], indent));
    i++;
  }
  blocks.push({ kind: 'fence', language, text: content.join('\n'), from: offset + start, to: offset + i - 1 });
  return i;
}

function stripIndent(line: string, indent: number): string {
  let removed: number = 0;
  while (removed < indent && line[removed] === ' ') {
    removed++;
  }
  return line.slice(removed);
}

function readComment(lines: ReadonlyArray<string>, start: number, offset: number, blocks: Array<MdBlock>): number {
  let i: number = start;
  while (i < lines.length && !lines[i].includes(COMMENT_CLOSE)) {
    i++;
  }
  const end: number = Math.min(i, lines.length - 1);
  blocks.push({ kind: 'comment', text: lines.slice(start, end + 1).join('\n'), from: offset + start, to: offset + end });
  return end + 1;
}

/**
 * A quote runs over `>` lines, plus lazy lines that continue a paragraph in
 * it. A blank line without `>` ends it. One whose first line is `[!type]` is a
 * callout; the rest of that line is the title.
 */
function readQuote(lines: ReadonlyArray<string>, start: number, offset: number, blocks: Array<MdBlock>): number {
  const inner: Array<string> = new Array<string>();
  let i: number = start;
  while (i < lines.length) {
    const line: string = lines[i];
    if (QUOTE.test(line)) {
      inner.push(line.replace(QUOTE_PREFIX, ''));
      i++;
      continue;
    }
    if (isBlank(line) || interrupts(line) || inner.length === 0 || isBlank(inner[inner.length - 1])) {
      break;
    }
    inner.push(line);
    i++;
  }
  const callout: RegExpExecArray | null = CALLOUT.exec(inner[0].trim());
  if (callout) {
    blocks.push({
      kind: 'callout',
      type: callout[1],
      folded: callout[2] === '-',
      title: parseInlines((callout[3] ?? '').trim()),
      blocks: parseLines(inner.slice(1), offset + start + 1),
      from: offset + start,
      to: offset + i - 1
    });
    return i;
  }
  blocks.push({ kind: 'quote', blocks: parseLines(inner, offset + start), from: offset + start, to: offset + i - 1 });
  return i;
}

function listMarkerOf(line: string): ListMarker | null {
  if (RULE.test(line)) {
    return null;
  }
  const match: RegExpExecArray | null = LIST_MARKER.exec(line);
  if (!match) {
    return null;
  }
  const indent: number = match[1].length;
  const marker: string = match[2];
  const spaces: number = (match[3] ?? '').length;
  let content: string = match[4] ?? '';
  let after: number = spaces;
  if (spaces === 0 || spaces > 4) {
    after = 1;
  }
  if (spaces > 4) {
    content = ' '.repeat(spaces - 1) + content;
  }
  const ordered: boolean = /\d/.test(marker[0]);
  return {
    indent,
    ordered,
    interrupts: !ordered || marker === '1.' || marker === '1)',
    contentIndent: indent + marker.length + after,
    content
  };
}

function leadingSpaces(line: string): number {
  let count: number = 0;
  while (line[count] === ' ') {
    count++;
  }
  return count;
}

/**
 * Items of one list share the marker type and indentation. An item owns every
 * following line that is indented to its content column, blank, or a lazy
 * continuation of its paragraph.
 */
function readList(lines: ReadonlyArray<string>, start: number, offset: number, blocks: Array<MdBlock>): number {
  const first: ListMarker = listMarkerOf(lines[start]) as ListMarker;
  const items: Array<MdListItem> = new Array<MdListItem>();
  let i: number = start;
  let last: number = start;
  while (i < lines.length) {
    const marker: ListMarker | null = listMarkerOf(lines[i]);
    if (!marker || marker.ordered !== first.ordered || marker.indent !== first.indent) {
      break;
    }
    const itemStart: number = i;
    const content: Array<string> = [marker.content];
    i++;
    while (i < lines.length) {
      const line: string = lines[i];
      if (isBlank(line)) {
        content.push('');
        i++;
        continue;
      }
      if (leadingSpaces(line) >= marker.contentIndent) {
        content.push(line.slice(marker.contentIndent));
        i++;
        continue;
      }
      const previous: string = content[content.length - 1];
      if (listMarkerOf(line) || interrupts(line) || isBlank(previous)) {
        break;
      }
      content.push(line.trim());
      i++;
    }
    while (content.length > 1 && isBlank(content[content.length - 1])) {
      content.pop();
    }
    last = itemStart + content.length - 1;
    let task: MdTask = 'none';
    const taskMatch: RegExpExecArray | null = TASK.exec(content[0]);
    if (taskMatch) {
      task = 'open';
      if (taskMatch[1] !== ' ') {
        task = 'done';
      }
      content[0] = content[0].slice(taskMatch[0].length);
    }
    items.push({ task, blocks: parseLines(content, offset + itemStart) });
  }
  blocks.push({ kind: 'list', ordered: first.ordered, items, from: offset + start, to: offset + last });
  return i;
}

/** A header row with a pipe, and a separator row of dashes under it. */
function isTableStart(lines: ReadonlyArray<string>, i: number): boolean {
  const next: string | undefined = lines[i + 1];
  return lines[i].includes('|') && next !== undefined && next.includes('-') && TABLE_SEPARATOR.test(next);
}

function readTable(lines: ReadonlyArray<string>, start: number, offset: number, blocks: Array<MdBlock>): number {
  const header: Array<string> = splitRow(lines[start]);
  const rows: Array<Array<string>> = new Array<Array<string>>();
  let i: number = start + 2;
  while (i < lines.length && !isBlank(lines[i]) && !interrupts(lines[i])) {
    rows.push(splitRow(lines[i]));
    i++;
  }
  blocks.push({
    kind: 'table',
    header: header.map(parseInlines),
    rows: rows.map((row: Array<string>): Array<Array<MdInline>> => row.map(parseInlines)),
    from: offset + start,
    to: offset + i - 1
  });
  return i;
}

/** Cells split on unescaped pipes; `\|` stays as written for the inline parser to unescape. */
function splitRow(line: string): Array<string> {
  let text: string = line.trim();
  if (text.startsWith('|')) {
    text = text.slice(1);
  }
  if (text.endsWith('|') && !text.endsWith('\\|')) {
    text = text.slice(0, -1);
  }
  const cells: Array<string> = new Array<string>();
  let cell: string = '';
  for (let i: number = 0; i < text.length; i++) {
    if (text[i] === '\\' && text[i + 1] === '|') {
      cell += '\\|';
      i++;
      continue;
    }
    if (text[i] === '|') {
      cells.push(cell.trim());
      cell = '';
      continue;
    }
    cell += text[i];
  }
  cells.push(cell.trim());
  return cells;
}
