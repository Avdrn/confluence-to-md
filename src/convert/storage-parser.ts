/**
 * Confluence storage format (XHTML) to an immutable node tree.
 *
 * The storage format is XHTML carrying Confluence's own namespaces, so a page is
 * full of `ac:structured-macro`, `ac:plain-text-body` and `ri:attachment` elements
 * that no HTML parser knows about. Regular expressions cannot read it: a macro can
 * hold another macro, and a lazy `[\s\S]*?` stops at the inner closing tag.
 *
 * So the body is parsed once into a tree, and every decision is taken by walking
 * that tree. Nothing here converts anything; see storage-renderer.ts for that.
 */

import type { StorageAttributes, StorageNode } from './storage-types';

/** Elements that never have children, so an unclosed one must not swallow its siblings. */
const VOID_TAGS: ReadonlySet<string> = new Set<string>([
  'br', 'hr', 'img', 'col', 'meta', 'link', 'input', 'area', 'base', 'source', 'embed',
  'ri:page', 'ri:attachment', 'ri:url', 'ri:user', 'ri:space', 'ri:blog-post',
  'ri:content-entity', 'ac:emoticon', 'ac:placeholder'
]);

const TAG_OPEN: RegExp = /</g;

/**
 * The named entities Confluence actually emits. Anything not listed is left as
 * written, because printing the wrong character is worse than printing the entity.
 */
const NAMED_ENTITIES: ReadonlyMap<string, string> = new Map<string, string>([
  ['amp', '&'], ['lt', '<'], ['gt', '>'], ['quot', '"'], ['apos', '\''],
  ['nbsp', ' '], ['ensp', ' '], ['emsp', ' '], ['thinsp', ' '], ['shy', ''],
  ['ndash', '–'], ['mdash', '—'], ['hellip', '…'], ['middot', '·'], ['bull', '•'],
  ['rsquo', '’'], ['lsquo', '‘'], ['ldquo', '“'], ['rdquo', '”'],
  ['laquo', '«'], ['raquo', '»'], ['dagger', '†'], ['Dagger', '‡'],
  ['rarr', '→'], ['larr', '←'], ['uarr', '↑'], ['darr', '↓'], ['harr', '↔'],
  ['rArr', '⇒'], ['lArr', '⇐'], ['hArr', '⇔'],
  ['deg', '°'], ['plusmn', '±'], ['times', '×'], ['divide', '÷'], ['minus', '−'],
  ['ne', '≠'], ['le', '≤'], ['ge', '≥'], ['asymp', '≈'], ['infin', '∞'],
  ['sup2', '²'], ['sup3', '³'], ['frac12', '½'], ['frac14', '¼'], ['frac34', '¾'],
  ['micro', 'µ'], ['permil', '‰'], ['para', '¶'], ['sect', '§'],
  ['copy', '©'], ['reg', '®'], ['trade', '™'],
  ['euro', '€'], ['pound', '£'], ['yen', '¥'], ['cent', '¢'],
  ['auml', 'ä'], ['ouml', 'ö'], ['uuml', 'ü'], ['szlig', 'ß'],
  ['Auml', 'Ä'], ['Ouml', 'Ö'], ['Uuml', 'Ü'],
  ['eacute', 'é'], ['egrave', 'è'], ['agrave', 'à'], ['ccedil', 'ç']
]);

const ENTITY: RegExp = /&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g;

/** Decodes the XML entities Confluence emits. Unknown entities are left as written. */
export function decodeEntities(text: string): string {
  return text.replace(ENTITY, (whole: string, body: string): string => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      return codePointOr(parseInt(body.slice(2), 16), whole);
    }
    if (body.startsWith('#')) {
      return codePointOr(parseInt(body.slice(1), 10), whole);
    }
    return NAMED_ENTITIES.get(body) ?? whole;
  });
}

function codePointOr(code: number, fallback: string): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) {
    return fallback;
  }
  return String.fromCodePoint(code);
}

/** A node still being built. Frozen into a StorageNode when the parse finishes. */
interface NodeDraft {
  tag: string;
  attrs: Map<string, string>;
  text: string;
  children: Array<NodeDraft>;
  start: number;
  end: number;
}

function draft(tag: string, attrs: Map<string, string>, text: string, start: number, end: number): NodeDraft {
  return { tag, attrs, text, children: [], start, end };
}

/**
 * Storage XHTML to a node tree. Never throws: exported storage is not always well
 * formed, and a page that fails to parse is worse than one that parses loosely.
 */
export function parseStorage(xhtml: string): StorageNode {
  const source: string = xhtml ?? '';
  const root: NodeDraft = draft('root', new Map<string, string>(), '', 0, source.length);
  const stack: Array<NodeDraft> = [root];
  let cursor: number = 0;

  while (cursor < source.length) {
    TAG_OPEN.lastIndex = cursor;
    const opening: RegExpExecArray | null = TAG_OPEN.exec(source);
    if (!opening) {
      pushText(stack, source.slice(cursor), cursor);
      break;
    }
    if (opening.index > cursor) {
      pushText(stack, source.slice(cursor, opening.index), cursor);
    }
    cursor = consumeMarkup(source, opening.index, stack);
  }
  return freeze(root);
}

/** Handles whatever starts at `<`, and returns where the scan continues. */
function consumeMarkup(source: string, start: number, stack: Array<NodeDraft>): number {
  if (source.startsWith('<![CDATA[', start)) {
    const end: number = source.indexOf(']]>', start);
    // CDATA is raw text by definition, so it is not entity-decoded.
    const after: number = continueAfter(source, end, 3);
    stack[stack.length - 1].children.push(draft('', new Map<string, string>(), sliceUntil(source, start + 9, end), start, after));
    return after;
  }
  if (source.startsWith('<!--', start)) {
    return continueAfter(source, source.indexOf('-->', start), 3);
  }
  if (source.startsWith('<!', start) || source.startsWith('<?', start)) {
    return continueAfter(source, source.indexOf('>', start), 1);
  }

  const tagEnd: number = findTagEnd(source, start);
  if (tagEnd === -1) {
    pushText(stack, source.slice(start), start);
    return source.length;
  }
  const inner: string = source.slice(start + 1, tagEnd);
  if (!inner) {
    pushText(stack, '<', start);
    return start + 1;
  }
  if (inner.startsWith('/')) {
    closeTag(stack, inner.slice(1).trim().toLowerCase(), tagEnd + 1);
    return tagEnd + 1;
  }
  openTag(stack, inner, start, tagEnd + 1);
  return tagEnd + 1;
}

function sliceUntil(source: string, from: number, end: number): string {
  if (end === -1) {
    return source.slice(from);
  }
  return source.slice(from, end);
}

function continueAfter(source: string, end: number, closerLength: number): number {
  if (end === -1) {
    return source.length;
  }
  return end + closerLength;
}

/** The index of the `>` closing this tag, skipping any inside a quoted attribute. */
function findTagEnd(source: string, start: number): number {
  let quote: string = '';
  for (let i: number = start + 1; i < source.length; i++) {
    const char: string = source[i];
    if (quote) {
      if (char === quote) {
        quote = '';
      }
      continue;
    }
    if (char === '"' || char === '\'') {
      quote = char;
      continue;
    }
    if (char === '>') {
      return i;
    }
  }
  return -1;
}

function pushText(stack: Array<NodeDraft>, raw: string, start: number): void {
  if (!raw) {
    return;
  }
  stack[stack.length - 1].children.push(draft('', new Map<string, string>(), decodeEntities(raw), start, start + raw.length));
}

function openTag(stack: Array<NodeDraft>, inner: string, start: number, end: number): void {
  const selfClosing: boolean = inner.endsWith('/');
  let body: string = inner;
  if (selfClosing) {
    body = inner.slice(0, -1);
  }
  const nameMatch: RegExpMatchArray | null = body.match(/^([a-zA-Z][\w:.-]*)/);
  if (!nameMatch) {
    return;
  }
  const tag: string = nameMatch[1].toLowerCase();
  const node: NodeDraft = draft(tag, parseAttributes(body.slice(nameMatch[1].length)), '', start, end);
  stack[stack.length - 1].children.push(node);
  if (!selfClosing && !VOID_TAGS.has(tag)) {
    stack.push(node);
  }
}

/**
 * Unwinds to the nearest matching open tag. A stray end tag with no match is
 * ignored rather than closing something it did not open.
 */
function closeTag(stack: Array<NodeDraft>, tag: string, end: number): void {
  for (let depth: number = stack.length - 1; depth > 0; depth--) {
    if (stack[depth].tag === tag) {
      stack[depth].end = end;
      stack.length = depth;
      return;
    }
  }
}

const ATTRIBUTE: RegExp = /([a-zA-Z_][\w:.-]*)\s*(?:=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

function parseAttributes(source: string): Map<string, string> {
  const attrs: Map<string, string> = new Map<string, string>();
  ATTRIBUTE.lastIndex = 0;
  let match: RegExpExecArray | null = ATTRIBUTE.exec(source);
  while (match) {
    const value: string = match[3] ?? match[4] ?? match[5] ?? '';
    attrs.set(match[1].toLowerCase(), decodeEntities(value));
    match = ATTRIBUTE.exec(source);
  }
  return attrs;
}

function freeze(node: NodeDraft): StorageNode {
  const attrs: StorageAttributes = node.attrs;
  return {
    tag: node.tag,
    attrs,
    text: node.text,
    children: node.children.map(freeze),
    start: node.start,
    end: node.end
  };
}

// --- tree helpers, shared with the renderer ----------------------------------

/** The lowercased `ac:name` of a structured macro, or '' for anything else. */
export function macroName(node: StorageNode): string {
  if (node.tag !== 'ac:structured-macro' && node.tag !== 'ac:macro') {
    return '';
  }
  return (node.attrs.get('ac:name') ?? '').toLowerCase();
}

/** The first direct child with this tag, or undefined. */
export function childNamed(node: StorageNode, tag: string): StorageNode | undefined {
  return node.children.find((child: StorageNode): boolean => child.tag === tag);
}

/** Every descendant with this tag, without descending into a match. */
export function descendants(node: StorageNode, tag: string): Array<StorageNode> {
  const found: Array<StorageNode> = new Array<StorageNode>();
  for (const child of node.children) {
    if (child.tag === tag) {
      found.push(child);
      continue;
    }
    found.push(...descendants(child, tag));
  }
  return found;
}

/** The value of an `<ac:parameter ac:name="...">`, or ''. */
export function macroParameter(node: StorageNode, name: string): string {
  const found: StorageNode | undefined = node.children.find(
    (child: StorageNode): boolean => child.tag === 'ac:parameter' && child.attrs.get('ac:name') === name
  );
  if (!found) {
    return '';
  }
  return rawText(found);
}

/** The value of an `<ac:adf-attribute key="...">`, or ''. */
export function adfAttribute(node: StorageNode, key: string): string {
  const found: StorageNode | undefined = node.children.find(
    (child: StorageNode): boolean => child.tag === 'ac:adf-attribute' && child.attrs.get('key') === key
  );
  if (!found) {
    return '';
  }
  return rawText(found);
}

/** Every character of text below this node, markup ignored. */
export function rawText(node: StorageNode): string {
  if (node.tag === '') {
    return node.text;
  }
  return node.children.map(rawText).join('');
}
