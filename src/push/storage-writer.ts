/**
 * The block tree as Confluence storage format, for the blocks of a note that
 * changed. Every mapping here is the inverse of one in storage-renderer.ts,
 * so the renderer reads back what is written, which is what the round-trip
 * check relies on.
 *
 * What markdown cannot say in Confluence terms is written as the nearest
 * thing and named in `lost`, in words meant for the review pane.
 */

import { calloutForPanel, panelForCallout } from '../convert/callout-mapping';
import { codeLanguage } from '../convert/inert-markdown';
import type { MdBlock, MdCallout, MdInline, MdList, MdListItem, MdTable } from './markdown/markdown-ast';

export interface PageRef {
  title: string;
  spaceKey: string;
}

export interface AttachmentRef {
  filename: string;
  /** Title of the page the file is attached to; '' for the page being pushed. */
  pageTitle: string;
  spaceKey: string;
}

/** How wikilinks and embeds are resolved to Confluence content. */
export interface StorageTargets {
  siteUrl: string;
  spaceKey: string;
  /** The Confluence page a link target names, or null when it is not a synced page. */
  page(target: string): PageRef | null;
  /** The Confluence attachment a target names, or null when the file is not one. */
  attachment(target: string): AttachmentRef | null;
}

export interface StorageResult {
  storage: string;
  /** What could not be carried back, one sentence each. */
  lost: Array<string>;
}

interface WriteContext {
  targets: StorageTargets;
  lost: Array<string>;
  /** Task ids are unique within a page. */
  nextTaskId: number;
}

const SCHEMA: string = ' ac:schema-version="1"';
const JIRA_KEY: RegExp = /^[A-Z][A-Z0-9_]+-\d+$/;
/** Obsidian's highlighting name back to the name the Confluence code macro uses, where they differ. */
const CONFLUENCE_LANGUAGE: ReadonlyMap<string, string> = new Map<string, string>([
  ['csharp', 'c#'], ['cpp', 'c++'], ['objectivec', 'objective-c']
]);
const CELL_INDENT: string = String.fromCharCode(0xa0, 0xa0);
const CELL_ITEM: RegExp = /^((?:\u00a0\u00a0)*)(?:(- \[([ xX])\] )|(- )|(1\. ))/;

export function writeStorage(blocks: ReadonlyArray<MdBlock>, targets: StorageTargets): StorageResult {
  const context: WriteContext = { targets, lost: new Array<string>(), nextTaskId: 1 };
  return { storage: writeBlocks(blocks, context), lost: context.lost };
}

/**
 * Each block on its own, with task ids counted on across all of them from
 * `firstTaskId`, so blocks sent next to kept ones never share an id.
 */
export function writeStorageBlocks(blocks: ReadonlyArray<MdBlock>, targets: StorageTargets, firstTaskId: number): Array<StorageResult> {
  const context: WriteContext = { targets, lost: new Array<string>(), nextTaskId: firstTaskId };
  return blocks.map((block: MdBlock): StorageResult => {
    context.lost = new Array<string>();
    const storage: string = writeBlock(block, context);
    return { storage, lost: context.lost };
  });
}

/** The highest task id a body uses, or 0. */
export function largestTaskId(storage: string): number {
  let largest: number = 0;
  for (const match of storage.matchAll(/<ac:task-id>(\d+)<\/ac:task-id>/g)) {
    largest = Math.max(largest, Number.parseInt(match[1], 10));
  }
  return largest;
}

function writeBlocks(blocks: ReadonlyArray<MdBlock>, context: WriteContext): string {
  return blocks.map((block: MdBlock): string => writeBlock(block, context)).join('');
}

function writeBlock(block: MdBlock, context: WriteContext): string {
  switch (block.kind) {
    case 'heading':
      return `<h${block.level}>${writeInlines(block.inlines, context)}</h${block.level}>`;
    case 'paragraph':
      return paragraph(block.inlines, context);
    case 'fence':
      return codeMacro(block.language, block.text);
    case 'rule':
      return '<hr/>';
    case 'quote':
      return `<blockquote>${writeBlocks(block.blocks, context)}</blockquote>`;
    case 'callout':
      return callout(block, context);
    case 'list':
      return list(block, context);
    case 'table':
      return table(block, context);
    case 'comment':
      return '';
  }
}

/** An image on a line of its own, with an italic caption under it, is a captioned block image. */
function paragraph(inlines: ReadonlyArray<MdInline>, context: WriteContext): string {
  const [first, second, third] = inlines;
  if (first && (first.kind === 'embed' || first.kind === 'image') && second?.kind === 'break' && third?.kind === 'em' && inlines.length === 3) {
    const caption: string = `<ac:caption><p>${writeInlines(third.inlines, context)}</p></ac:caption>`;
    const image: string = imageElement(first, caption, ' ac:align="center" ac:layout="center"', context);
    if (image) {
      return image;
    }
    return `<p>${writeInlines([third], context)}</p>`;
  }
  return `<p>${writeInlines(inlines, context)}</p>`;
}

function codeMacro(language: string, text: string): string {
  let parameters: string = '';
  const known: string = codeLanguage(language);
  if (known) {
    parameters = param('language', CONFLUENCE_LANGUAGE.get(known) ?? known);
  }
  return macro('code', `${parameters}<ac:plain-text-body>${cdata(text)}</ac:plain-text-body>`);
}

function callout(block: MdCallout, context: WriteContext): string {
  const title: string = writeInlines(block.title, context);
  let parameters: string = '';
  if (title) {
    parameters = param('title', title);
  }
  const body: string = `<ac:rich-text-body>${writeBlocks(block.blocks, context)}</ac:rich-text-body>`;
  if (block.folded) {
    return macro('expand', `${parameters}${body}`);
  }
  const panel: string = panelForCallout(block.type);
  if (calloutForPanel(panel) !== block.type.toUpperCase()) {
    context.lost.push(`a "${block.type.toUpperCase()}" callout has no Confluence panel of its own; it becomes a "${calloutForPanel(panel)}" panel`);
  }
  return macro(panel, `${parameters}${body}`);
}

/** Runs of task items become task lists; the other items a plain list of the same kind. */
function list(block: MdList, context: WriteContext): string {
  let output: string = '';
  let run: Array<MdListItem> = new Array<MdListItem>();
  let runIsTasks: boolean = false;
  const flush = (): void => {
    if (run.length === 0) {
      return;
    }
    if (runIsTasks) {
      output += taskList(run, context);
    } else {
      output += plainList(run, block.ordered, context);
    }
    run = new Array<MdListItem>();
  };
  for (const item of block.items) {
    const isTask: boolean = item.task !== 'none';
    if (run.length > 0 && isTask !== runIsTasks) {
      flush();
    }
    runIsTasks = isTask;
    run.push(item);
  }
  flush();
  return output;
}

function plainList(items: ReadonlyArray<MdListItem>, ordered: boolean, context: WriteContext): string {
  let tag: string = 'ul';
  if (ordered) {
    tag = 'ol';
  }
  const inner: string = items.map((item: MdListItem): string => `<li>${itemContent(item.blocks, context)}</li>`).join('');
  return `<${tag}>${inner}</${tag}>`;
}

/** A lone paragraph loses its wrapper, as Confluence writes it; anything more keeps block markup. */
function itemContent(blocks: ReadonlyArray<MdBlock>, context: WriteContext): string {
  const [first, ...rest] = blocks;
  if (first && first.kind === 'paragraph') {
    return `${writeInlines(first.inlines, context)}${writeBlocks(rest, context)}`;
  }
  return writeBlocks(blocks, context);
}

function taskList(items: ReadonlyArray<MdListItem>, context: WriteContext): string {
  const tasks: string = items.map((item: MdListItem): string => {
    let status: string = 'incomplete';
    if (item.task === 'done') {
      status = 'complete';
    }
    const id: number = context.nextTaskId;
    context.nextTaskId++;
    const body: string = itemContent(item.blocks, context);
    return `<ac:task><ac:task-id>${id}</ac:task-id><ac:task-status>${status}</ac:task-status><ac:task-body><span>${body}</span></ac:task-body></ac:task>`;
  }).join('');
  return `<ac:task-list>${tasks}</ac:task-list>`;
}

function table(block: MdTable, context: WriteContext): string {
  const rows: Array<string> = new Array<string>();
  const hasHeader: boolean = block.header.some((cell: Array<MdInline>): boolean => cell.length > 0);
  if (hasHeader) {
    rows.push(`<tr>${block.header.map((cell: Array<MdInline>): string => `<th>${cellContent(cell, context)}</th>`).join('')}</tr>`);
  }
  for (const row of block.rows) {
    rows.push(`<tr>${row.map((cell: Array<MdInline>): string => `<td>${cellContent(cell, context)}</td>`).join('')}</tr>`);
  }
  return `<table><tbody>${rows.join('')}</tbody></table>`;
}

/**
 * A cell is one line per `<br>`. Lines that all start with a list marker are
 * the list the renderer flattened, nesting shown by its non-breaking spaces;
 * any other lines are paragraphs.
 */
function cellContent(inlines: ReadonlyArray<MdInline>, context: WriteContext): string {
  const lines: Array<Array<MdInline>> = splitOnBreaks(inlines);
  if (lines.length === 0) {
    return '';
  }
  const items: Array<CellItem | null> = lines.map(cellItem);
  if (items.every((item: CellItem | null): boolean => item !== null)) {
    return cellList(items as Array<CellItem>, 0, context);
  }
  return lines.map((line: Array<MdInline>): string => `<p>${writeInlines(line, context)}</p>`).join('');
}

function splitOnBreaks(inlines: ReadonlyArray<MdInline>): Array<Array<MdInline>> {
  const lines: Array<Array<MdInline>> = [[]];
  for (const node of inlines) {
    if (node.kind === 'break') {
      lines.push([]);
      continue;
    }
    lines[lines.length - 1].push(node);
  }
  return lines.filter((line: Array<MdInline>): boolean => line.length > 0);
}

interface CellItem {
  depth: number;
  ordered: boolean;
  task: string;
  inlines: Array<MdInline>;
}

function cellItem(line: Array<MdInline>): CellItem | null {
  const [first, ...rest] = line;
  if (!first || first.kind !== 'text') {
    return null;
  }
  const match: RegExpExecArray | null = CELL_ITEM.exec(first.text);
  if (!match) {
    return null;
  }
  let task: string = '';
  if (match[2]) {
    task = match[3];
  }
  const text: string = first.text.slice(match[0].length);
  const inlines: Array<MdInline> = rest.slice();
  if (text) {
    inlines.unshift({ kind: 'text', text });
  }
  return { depth: match[1].length / CELL_INDENT.length, ordered: match[5] !== undefined, task, inlines };
}

/** Items at `depth` and the deeper ones under each of them, as nested lists. */
function cellList(items: ReadonlyArray<CellItem>, depth: number, context: WriteContext): string {
  let output: string = '';
  let i: number = 0;
  while (i < items.length) {
    const item: CellItem = items[i];
    let end: number = i + 1;
    while (end < items.length && items[end].depth > depth) {
      end++;
    }
    const nested: string = cellList(items.slice(i + 1, end), depth + 1, context);
    const body: string = `${writeInlines(item.inlines, context)}${nested}`;
    if (item.task) {
      let status: string = 'incomplete';
      if (item.task !== ' ') {
        status = 'complete';
      }
      const id: number = context.nextTaskId;
      context.nextTaskId++;
      output += `<ac:task-list><ac:task><ac:task-id>${id}</ac:task-id><ac:task-status>${status}</ac:task-status><ac:task-body><span>${body}</span></ac:task-body></ac:task></ac:task-list>`;
    } else if (item.ordered) {
      output += `<ol><li>${body}</li></ol>`;
    } else {
      output += `<ul><li>${body}</li></ul>`;
    }
    i = end;
  }
  return output.replace(/<\/ul><ul>/g, '').replace(/<\/ol><ol>/g, '').replace(/<\/ac:task-list><ac:task-list>/g, '');
}

export function writeInlines(inlines: ReadonlyArray<MdInline>, context: WriteContext): string {
  return inlines.map((node: MdInline): string => writeInline(node, context)).join('');
}

function writeInline(node: MdInline, context: WriteContext): string {
  switch (node.kind) {
    case 'text':
      return escapeXml(node.text);
    case 'code':
      return `<code>${escapeXml(node.text)}</code>`;
    case 'strong':
      return `<strong>${writeInlines(node.inlines, context)}</strong>`;
    case 'em':
      return `<em>${writeInlines(node.inlines, context)}</em>`;
    case 'strike':
      return `<s>${writeInlines(node.inlines, context)}</s>`;
    case 'highlight':
      context.lost.push('highlighted text (==like this==) has no Confluence equivalent and becomes plain text');
      return writeInlines(node.inlines, context);
    case 'link':
      return link(node.href, writeInlines(node.inlines, context), context);
    case 'autolink':
      return `<a href="${escapeAttribute(node.href)}">${escapeXml(node.href)}</a>`;
    case 'image':
      return imageElement(node, '', '', context);
    case 'wikilink':
      return wikilink(node.target, node.anchor, node.alias, context);
    case 'embed':
      return imageElement(node, '', '', context);
    case 'break':
      return '<br/>';
  }
}

/** The renderer's own link forms go back to what they came from; anything else is a plain link. */
function link(href: string, body: string, context: WriteContext): string {
  const site: string = context.targets.siteUrl;
  if (site && href.startsWith(`${site}/browse/`)) {
    const key: string = decodeURIComponent(href.slice(`${site}/browse/`.length));
    if (JIRA_KEY.test(key) && body === key) {
      return macro('jira', param('key', key));
    }
  }
  if (site && href.startsWith(site)) {
    const search: RegExpExecArray | null = /^\/wiki\/spaces\/([^/]+)\/pages\?title=(.*)$/.exec(href.slice(site.length));
    if (search) {
      const page: PageRef = { spaceKey: decodeURIComponent(search[1]), title: decodeURIComponent(search[2]) };
      return pageLink(page, '', body, context);
    }
  }
  return `<a href="${escapeAttribute(href)}">${body}</a>`;
}

function wikilink(target: string, anchor: string, alias: string, context: WriteContext): string {
  if (!target && anchor) {
    return `<ac:link ac:anchor="${escapeAttribute(anchor)}">${linkBody(alias || anchor)}</ac:link>`;
  }
  const page: PageRef | null = context.targets.page(target);
  if (page) {
    return pageLink(page, anchor, escapeXml(alias), context);
  }
  const attachment: AttachmentRef | null = context.targets.attachment(target);
  if (attachment) {
    return `<ac:link>${attachmentResource(attachment, context)}${linkBody(alias || attachment.filename)}</ac:link>`;
  }
  context.lost.push(`the link to "${target}" points at nothing in Confluence and becomes plain text`);
  return escapeXml(alias || target);
}

function pageLink(page: PageRef, anchor: string, body: string, context: WriteContext): string {
  let attributes: string = '';
  if (anchor) {
    attributes = ` ac:anchor="${escapeAttribute(anchor)}"`;
  }
  let linkText: string = '';
  if (body && body !== escapeXml(page.title)) {
    linkText = linkBody(unescapeXml(body));
  }
  return `<ac:link${attributes}>${pageResource(page, context)}${linkText}</ac:link>`;
}

function pageResource(page: PageRef, context: WriteContext): string {
  let space: string = '';
  if (page.spaceKey && page.spaceKey.toLowerCase() !== context.targets.spaceKey.toLowerCase()) {
    space = ` ri:space-key="${escapeAttribute(page.spaceKey)}"`;
  }
  return `<ri:page ri:content-title="${escapeAttribute(page.title)}"${space}/>`;
}

function attachmentResource(attachment: AttachmentRef, context: WriteContext): string {
  if (!attachment.pageTitle) {
    return `<ri:attachment ri:filename="${escapeAttribute(attachment.filename)}"/>`;
  }
  const page: string = pageResource({ title: attachment.pageTitle, spaceKey: attachment.spaceKey }, context);
  return `<ri:attachment ri:filename="${escapeAttribute(attachment.filename)}">${page}</ri:attachment>`;
}

/** An embed or image as `ac:image`, or '' with the loss recorded when the file is not on Confluence. */
function imageElement(node: MdInline, caption: string, attributes: string, context: WriteContext): string {
  if (node.kind === 'image') {
    if (/^https?:\/\//i.test(node.src)) {
      let alt: string = '';
      if (node.alt) {
        alt = ` ac:alt="${escapeAttribute(node.alt)}"`;
      }
      return `<ac:image${alt}${attributes}><ri:url ri:value="${escapeAttribute(node.src)}"/>${caption}</ac:image>`;
    }
    return imageFromVault(node.src, caption, attributes, context);
  }
  if (node.kind === 'embed') {
    return imageFromVault(node.target, caption, attributes, context);
  }
  return '';
}

function imageFromVault(target: string, caption: string, attributes: string, context: WriteContext): string {
  const attachment: AttachmentRef | null = context.targets.attachment(target);
  if (!attachment) {
    context.lost.push(`the image "${target}" is not on the Confluence page and is left out`);
    return '';
  }
  return `<ac:image${attributes}>${attachmentResource(attachment, context)}${caption}</ac:image>`;
}

function linkBody(text: string): string {
  return `<ac:plain-text-link-body>${cdata(text)}</ac:plain-text-link-body>`;
}

function macro(name: string, inner: string): string {
  return `<ac:structured-macro ac:name="${name}"${SCHEMA}>${inner}</ac:structured-macro>`;
}

function param(name: string, value: string): string {
  return `<ac:parameter ac:name="${name}">${escapeXml(value)}</ac:parameter>`;
}

function cdata(text: string): string {
  return `<![CDATA[${text.split(']]>').join(']]]]><![CDATA[>')}]]>`;
}

export function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(text: string): string {
  return escapeXml(text).replace(/"/g, '&quot;');
}

function unescapeXml(text: string): string {
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
