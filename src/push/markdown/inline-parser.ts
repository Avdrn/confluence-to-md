/**
 * Inline markdown to nodes: the dialect the sync writes plus what people type
 * in Obsidian.
 *
 * Backslash escapes and entities become the characters they stand for. That
 * is also how the renderer's inert escaping is undone: `\`` and `&lt;` in a
 * note mean a backtick and a `<`, whoever wrote them. Inside a code span
 * nothing is unescaped, because the renderer escaped nothing there.
 */

import { decodeEntities } from '../../convert/storage-parser';
import type { MdInline, MdSpan, MdSpanKind } from './markdown-ast';

const PUNCTUATION: RegExp = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;
const WHITESPACE: RegExp = /\s/;
const BREAK_TAG: RegExp = /^<br[ \t]*\/?>/i;
const AUTOLINK: RegExp = /^<((?:https?|mailto):[^\s<>]+)>/i;
const ENTITY: RegExp = /^&(?:#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/;
const LINK_TITLE: RegExp = /^(\S+)\s+(?:"[^"]*"|'[^']*')$/;
const COMMENT_OPEN: string = '<!--';
const COMMENT_CLOSE: string = '-->';

/** A run of `*`, `_`, `~` or `=` that may open or close a span. */
interface Delimiter {
  kind: 'delim';
  char: string;
  count: number;
  canOpen: boolean;
  canClose: boolean;
}

type WorkNode = MdInline | Delimiter;

export function parseInlines(text: string): Array<MdInline> {
  return resolveDelimiters(new Scanner(text).run());
}

/** The text of inline nodes with the markup removed, for an image's alt text. */
export function plainText(inlines: ReadonlyArray<MdInline>): string {
  return inlines.map((node: MdInline): string => {
    switch (node.kind) {
      case 'text':
      case 'code':
        return node.text;
      case 'strong':
      case 'em':
      case 'strike':
      case 'highlight':
      case 'link':
        return plainText(node.inlines);
      case 'autolink':
        return node.href;
      case 'image':
        return node.alt;
      case 'wikilink':
        return node.alias || node.target || node.anchor;
      case 'embed':
        return node.alias || node.target;
      case 'break':
        return ' ';
    }
  }).join('');
}

class Scanner {
  private readonly nodes: Array<WorkNode> = new Array<WorkNode>();
  private buffer: string = '';
  private index: number = 0;

  public constructor(private readonly text: string) {}

  public run(): Array<WorkNode> {
    while (this.index < this.text.length) {
      this.step();
    }
    this.flush();
    return this.nodes;
  }

  private step(): void {
    const ch: string = this.text[this.index];
    if (ch === '\\') {
      this.escape();
      return;
    }
    if (ch === '\n') {
      this.push({ kind: 'break' });
      this.index++;
      return;
    }
    if (ch === '`') {
      this.codeSpan();
      return;
    }
    if (ch === '<') {
      this.angle();
      return;
    }
    if (ch === '&') {
      this.entity();
      return;
    }
    if (this.text.startsWith('![[', this.index) && this.embed()) {
      return;
    }
    if (this.text.startsWith('![', this.index) && this.image()) {
      return;
    }
    if (this.text.startsWith('[[', this.index) && this.wikilink()) {
      return;
    }
    if (ch === '[' && this.link()) {
      return;
    }
    if (ch === '*' || ch === '_' || ch === '~' || ch === '=') {
      this.delimiter(ch);
      return;
    }
    this.buffer += ch;
    this.index++;
  }

  private push(node: WorkNode): void {
    this.flush();
    this.nodes.push(node);
  }

  private flush(): void {
    if (this.buffer) {
      this.nodes.push({ kind: 'text', text: this.buffer });
      this.buffer = '';
    }
  }

  /** `\` before punctuation is that character; before a newline it is a hard break; else literal. */
  private escape(): void {
    const next: string = this.text[this.index + 1] ?? '';
    if (next === '\n') {
      this.index++;
      return;
    }
    if (next && PUNCTUATION.test(next)) {
      this.buffer += next;
      this.index += 2;
      return;
    }
    this.buffer += '\\';
    this.index++;
  }

  private codeSpan(): void {
    const start: number = this.index;
    let end: number = start;
    while (this.text[end] === '`') {
      end++;
    }
    const ticks: number = end - start;
    let search: number = end;
    while (search < this.text.length) {
      if (this.text[search] !== '`') {
        search++;
        continue;
      }
      let runEnd: number = search;
      while (this.text[runEnd] === '`') {
        runEnd++;
      }
      if (runEnd - search === ticks) {
        this.push({ kind: 'code', text: codeContent(this.text.slice(end, search)) });
        this.index = runEnd;
        return;
      }
      search = runEnd;
    }
    this.buffer += this.text.slice(start, end);
    this.index = end;
  }

  /** A comment is dropped, `<br>` is a break, an autolink is a link, anything else is a literal `<`. */
  private angle(): void {
    const rest: string = this.text.slice(this.index);
    if (rest.startsWith(COMMENT_OPEN)) {
      const close: number = rest.indexOf(COMMENT_CLOSE, COMMENT_OPEN.length);
      if (close === -1) {
        this.index = this.text.length;
        return;
      }
      this.index += close + COMMENT_CLOSE.length;
      return;
    }
    const breakTag: RegExpExecArray | null = BREAK_TAG.exec(rest);
    if (breakTag) {
      this.push({ kind: 'break' });
      this.index += breakTag[0].length;
      return;
    }
    const autolink: RegExpExecArray | null = AUTOLINK.exec(rest);
    if (autolink) {
      this.push({ kind: 'autolink', href: autolink[1] });
      this.index += autolink[0].length;
      return;
    }
    this.buffer += '<';
    this.index++;
  }

  private entity(): void {
    const match: RegExpExecArray | null = ENTITY.exec(this.text.slice(this.index));
    if (!match) {
      this.buffer += '&';
      this.index++;
      return;
    }
    this.buffer += decodeEntities(match[0]);
    this.index += match[0].length;
  }

  private embed(): boolean {
    const close: number = this.text.indexOf(']]', this.index + 3);
    if (close === -1) {
      return false;
    }
    const [target, alias] = splitAlias(this.text.slice(this.index + 3, close));
    this.push({ kind: 'embed', target: target.trim(), alias: alias.trim() });
    this.index = close + 2;
    return true;
  }

  private wikilink(): boolean {
    const close: number = this.text.indexOf(']]', this.index + 2);
    if (close === -1) {
      return false;
    }
    const [reference, alias] = splitAlias(this.text.slice(this.index + 2, close));
    const hash: number = reference.indexOf('#');
    let target: string = reference;
    let anchor: string = '';
    if (hash !== -1) {
      target = reference.slice(0, hash);
      anchor = reference.slice(hash + 1);
    }
    this.push({ kind: 'wikilink', target: target.trim(), anchor: anchor.trim(), alias: alias.trim() });
    this.index = close + 2;
    return true;
  }

  private image(): boolean {
    const parts: LinkParts | null = linkParts(this.text, this.index + 1);
    if (!parts) {
      return false;
    }
    this.push({ kind: 'image', alt: plainText(parseInlines(parts.label)), src: parts.destination });
    this.index = parts.end;
    return true;
  }

  private link(): boolean {
    const parts: LinkParts | null = linkParts(this.text, this.index);
    if (!parts) {
      return false;
    }
    this.push({ kind: 'link', href: parts.destination, inlines: parseInlines(parts.label) });
    this.index = parts.end;
    return true;
  }

  /** CommonMark's flanking rules decide whether a run can open or close emphasis. */
  private delimiter(ch: string): void {
    const start: number = this.index;
    let end: number = start;
    while (this.text[end] === ch) {
      end++;
    }
    const run: string = this.text.slice(start, end);
    this.index = end;
    if ((ch === '~' || ch === '=') && run.length !== 2) {
      this.buffer += run;
      return;
    }
    const before: string = this.text[start - 1] ?? ' ';
    const after: string = this.text[end] ?? ' ';
    const beforeSpace: boolean = WHITESPACE.test(before);
    const afterSpace: boolean = WHITESPACE.test(after);
    const beforePunct: boolean = PUNCTUATION.test(before);
    const afterPunct: boolean = PUNCTUATION.test(after);
    const left: boolean = !afterSpace && (!afterPunct || beforeSpace || beforePunct);
    const right: boolean = !beforeSpace && (!beforePunct || afterSpace || afterPunct);
    let canOpen: boolean = left;
    let canClose: boolean = right;
    if (ch === '_') {
      canOpen = left && (!right || beforePunct);
      canClose = right && (!left || afterPunct);
    }
    if (!canOpen && !canClose) {
      this.buffer += run;
      return;
    }
    this.push({ kind: 'delim', char: ch, count: run.length, canOpen, canClose });
  }
}

interface LinkParts {
  label: string;
  destination: string;
  /** Index just past the closing parenthesis. */
  end: number;
}

/** `[label](destination "title")` starting at `open`, the index of the `[`. */
function linkParts(text: string, open: number): LinkParts | null {
  const close: number = matchingBracket(text, open, '[', ']');
  if (close === -1 || text[close + 1] !== '(') {
    return null;
  }
  const end: number = matchingBracket(text, close + 1, '(', ')');
  if (end === -1) {
    return null;
  }
  let destination: string = text.slice(close + 2, end).trim();
  const titled: RegExpExecArray | null = LINK_TITLE.exec(destination);
  if (titled) {
    destination = titled[1];
  }
  if (destination.startsWith('<') && destination.endsWith('>')) {
    destination = destination.slice(1, -1);
  }
  return { label: text.slice(open + 1, close), destination, end: end + 1 };
}

/** The index of the bracket closing the one at `open`, honouring nesting and escapes, or -1. */
function matchingBracket(text: string, open: number, opener: string, closer: string): number {
  let depth: number = 0;
  for (let i: number = open; i < text.length; i++) {
    const ch: string = text[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if (ch === opener) {
      depth++;
    } else if (ch === closer) {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

/** `target|alias`. Inside a table row the separator is written `\|`, and it means the same. */
function splitAlias(inner: string): [string, string] {
  for (let i: number = 0; i < inner.length; i++) {
    if (inner[i] === '|') {
      return [inner.slice(0, i), inner.slice(i + 1).replace(/\\\|/g, '|')];
    }
    if (inner[i] === '\\' && inner[i + 1] === '|') {
      return [inner.slice(0, i), inner.slice(i + 2).replace(/\\\|/g, '|')];
    }
  }
  return [inner, ''];
}

/** Newlines become spaces, and one padding space on each side is removed, as CommonMark says. */
function codeContent(raw: string): string {
  const flat: string = raw.replace(/\n/g, ' ');
  if (flat.length > 2 && flat.startsWith(' ') && flat.endsWith(' ') && flat.trim() !== '') {
    return flat.slice(1, -1);
  }
  return flat;
}

function isDelimiter(node: WorkNode): node is Delimiter {
  return node.kind === 'delim';
}

/** CommonMark's emphasis algorithm: each closer takes the nearest matching opener. */
function resolveDelimiters(nodes: Array<WorkNode>): Array<MdInline> {
  const work: Array<WorkNode> = nodes;
  let i: number = 0;
  while (i < work.length) {
    const node: WorkNode = work[i];
    if (!isDelimiter(node) || !node.canClose) {
      i++;
      continue;
    }
    const openerIndex: number = findOpener(work, i, node);
    if (openerIndex === -1) {
      if (!node.canOpen) {
        work[i] = { kind: 'text', text: node.char.repeat(node.count) };
      }
      i++;
      continue;
    }
    const opener: Delimiter = work[openerIndex] as Delimiter;
    const use: number = useCount(opener, node);
    const span: MdSpan = {
      kind: spanKind(node.char, use),
      inlines: mergeText(work.slice(openerIndex + 1, i).map(toInline))
    };
    opener.count -= use;
    node.count -= use;
    const replacement: Array<WorkNode> = new Array<WorkNode>();
    if (opener.count > 0) {
      replacement.push(opener);
    }
    replacement.push(span);
    if (node.count > 0) {
      replacement.push(node);
    }
    work.splice(openerIndex, i - openerIndex + 1, ...replacement);
    i = openerIndex + replacement.length;
    if (node.count > 0) {
      i--;
    }
  }
  return mergeText(work.map(toInline));
}

function findOpener(work: ReadonlyArray<WorkNode>, closerIndex: number, closer: Delimiter): number {
  for (let j: number = closerIndex - 1; j >= 0; j--) {
    const candidate: WorkNode = work[j];
    if (!isDelimiter(candidate) || candidate.char !== closer.char || !candidate.canOpen || candidate.count === 0) {
      continue;
    }
    // The rule of three keeps `*foo**bar*` from closing on the wrong run.
    const both: boolean = (candidate.canClose || closer.canOpen) && (candidate.char === '*' || candidate.char === '_');
    if (both && (candidate.count + closer.count) % 3 === 0 && (candidate.count % 3 !== 0 || closer.count % 3 !== 0)) {
      continue;
    }
    return j;
  }
  return -1;
}

function useCount(opener: Delimiter, closer: Delimiter): number {
  if (opener.char === '~' || opener.char === '=') {
    return 2;
  }
  if (opener.count >= 2 && closer.count >= 2) {
    return 2;
  }
  return 1;
}

function spanKind(char: string, use: number): MdSpanKind {
  if (char === '~') {
    return 'strike';
  }
  if (char === '=') {
    return 'highlight';
  }
  if (use === 2) {
    return 'strong';
  }
  return 'em';
}

function toInline(node: WorkNode): MdInline {
  if (isDelimiter(node)) {
    return { kind: 'text', text: node.char.repeat(node.count) };
  }
  return node;
}

/** Adjacent text runs become one node, and empty ones go. */
export function mergeText(inlines: ReadonlyArray<MdInline>): Array<MdInline> {
  const merged: Array<MdInline> = new Array<MdInline>();
  for (const node of inlines) {
    if (node.kind === 'text' && node.text === '') {
      continue;
    }
    const last: MdInline | undefined = merged[merged.length - 1];
    if (node.kind === 'text' && last && last.kind === 'text') {
      merged[merged.length - 1] = { kind: 'text', text: last.text + node.text };
      continue;
    }
    merged.push(node);
  }
  return merged;
}
