/**
 * Parsed storage tree to Obsidian-flavored markdown.
 *
 * The rule: nothing is ever dropped silently. A macro this file does not know
 * still renders its own body, and a macro with no body at all still leaves a
 * named marker behind, so a reader can tell that something was there. Losing
 * markup is acceptable; losing text is not.
 *
 * Two link forms cannot be resolved while rendering, because a page does not
 * know where its neighbours ended up in the vault. They are emitted as
 * placeholders that link-resolver.ts rewrites once every path is known.
 */

import {
  adfAttribute,
  childNamed,
  descendants,
  macroName,
  macroParameter,
  rawText
} from './storage-parser';
import { calloutForPanel, isPanelMacro, ObsidianCalloutType } from './callout-mapping';
import { obsidianHeadingAnchor } from './heading-anchor';
import type { StorageNode, UserDirectory } from './storage-types';

/** Placeholder for a link to another Confluence page, resolved after placement. */
export const PAGE_LINK_PREFIX: string = 'confluence-page';
/** Placeholder for an attachment reference, resolved once downloads are known. */
export const ATTACHMENT_PREFIX: string = 'confluence-attachment';
/** Replaced by a generated heading list once the whole body is rendered. */
export const TOC_PLACEHOLDER: string = '<!--confluence-toc-->';
/** Replaced by a generated list of the page's children, once they are known. */
export const CHILDREN_PLACEHOLDER: string = '<!--confluence-children-->';

/** Everything a render pass needs that is not in the tree itself. */
export interface RenderContext {
  users: UserDirectory;
  /** Nesting of enclosing lists, outermost first. */
  listStack: ReadonlyArray<string>;
  inTable: boolean;
  /** Atlassian site, for Jira issue links. Empty when unknown. */
  siteUrl: string;
}

/** Elements whose content is markup bookkeeping, not page text. */
const DROPPED: ReadonlySet<string> = new Set<string>([
  'style', 'script', 'colgroup', 'col', 'ac:parameter', 'ac:adf-attribute',
  'ac:adf-parameter', 'ac:adf-parameter-value', 'ac:task-status', 'ac:task-id',
  'ac:task-uuid', 'ac:placeholder', 'ac:emoticon', 'ri:page', 'ri:attachment',
  'ri:user', 'ri:url', 'ri:space'
]);

/**
 * Macros that describe the page tree rather than the page. A note already sits
 * in a folder that says the same thing, so these carry nothing across.
 */
const NAVIGATION_MACROS: ReadonlySet<string> = new Set<string>([
  'recently-updated', 'contributors', 'labels-list',
  'listlabels', 'detailssummary', 'livesearch', 'sitemap', 'navitabs', 'roadmap',
  'content-report-table', 'create-from-template', 'gallery', 'space-details',
  'blog-posts', 'popular-labels', 'related-labels'
]);

const INLINE_WRAPPERS: ReadonlyMap<string, string> = new Map<string, string>([
  ['strong', '**'], ['b', '**'], ['em', '*'], ['i', '*'],
  ['del', '~~'], ['s', '~~'], ['strike', '~~']
]);

const HORIZONTAL_WHITESPACE: RegExp = /[ \t\r\f\v]+/g;
const NON_BREAKING_SPACE: RegExp = new RegExp(String.fromCharCode(0xa0), 'g');
const BLANK_RUNS: RegExp = /\n{3,}/g;
const TRAILING_BREAKS: RegExp = /(?:<br>\s*)+$/;
const CELL_INDENT: string = '&nbsp;&nbsp;';

/** Renders a parsed body to markdown. Placeholders are left for the link resolver. */
export function renderStorage(root: StorageNode, users: UserDirectory, siteUrl: string): string {
  const context: RenderContext = { users, listStack: [], inTable: false, siteUrl };
  return tidy(renderChildren(root, context));
}

/**
 * Trailing space and blank-line runs, over the finished document.
 *
 * Deliberately does not touch interior whitespace: runs of spaces are already
 * collapsed in renderText, where it is safe. Here it would also reach inside a
 * fenced code block and flatten its indentation.
 */
function tidy(text: string): string {
  const lines: Array<string> = text.split('\n').map((line: string): string => line.replace(/\s+$/, ''));
  return lines.join('\n').replace(BLANK_RUNS, '\n\n').trim();
}

function renderChildren(node: StorageNode, context: RenderContext): string {
  return node.children.map((child: StorageNode): string => render(child, context)).join('');
}

function render(node: StorageNode, context: RenderContext): string {
  if (node.tag === '') {
    return renderText(node.text, context);
  }
  const macro: string = macroName(node);
  if (macro) {
    return renderMacro(node, macro, context);
  }
  const handler: NodeRenderer | undefined = HANDLERS.get(node.tag);
  if (handler) {
    return handler(node, context);
  }
  if (DROPPED.has(node.tag)) {
    return '';
  }
  // Transparent and unknown alike: keep the content, drop only the frame.
  return renderChildren(node, context);
}

type NodeRenderer = (node: StorageNode, context: RenderContext) => string;

/**
 * Source newlines and indentation are XHTML formatting, never content, so a
 * paragraph collapses to one line. Inside a cell a raw pipe would end the column.
 */
function renderText(text: string, context: RenderContext): string {
  const flat: string = text.replace(NON_BREAKING_SPACE, ' ').replace(/\n/g, ' ').replace(HORIZONTAL_WHITESPACE, ' ');
  if (context.inTable) {
    return flat.replace(/\|/g, '\\|');
  }
  return flat;
}

/** Separates a block from its neighbours without piling up blank lines. */
function block(text: string): string {
  const body: string = text.replace(/^\n+|\n+$/g, '');
  if (!body) {
    return '';
  }
  return `\n\n${body}\n\n`;
}

/**
 * Whitespace inside `<strong> text </strong>` is moved outside the markers,
 * because `** text **` is not emphasis in markdown and dropping it glues the
 * bold text to the word that follows.
 */
function inline(node: StorageNode, context: RenderContext, wrap: string): string {
  const raw: string = renderChildren(node, context);
  const inner: string = raw.trim();
  if (!inner) {
    return '';
  }
  let leading: string = '';
  if (/^\s/.test(raw)) {
    leading = ' ';
  }
  let trailing: string = '';
  if (/\s$/.test(raw)) {
    trailing = ' ';
  }
  return `${leading}${wrap}${inner}${wrap}${trailing}`;
}

/**
 * Inline code, fenced with enough backticks to hold its own. A fixed single
 * backtick emits broken markup for any page that documents shell quoting.
 */
function codeSpan(node: StorageNode, context: RenderContext): string {
  const inner: string = renderChildren(node, context).trim();
  if (!inner) {
    return '';
  }
  return wrapCode(inner, '`');
}

function wrapCode(inner: string, start: string): string {
  let ticks: string = start;
  while (inner.includes(ticks)) {
    ticks += '`';
  }
  let pad: string = '';
  if (inner.startsWith('`') || inner.endsWith('`')) {
    pad = ' ';
  }
  return `${ticks}${pad}${inner}${pad}${ticks}`;
}

/** A fenced block, with a fence long enough to survive a fence in the sample. */
function fence(body: string, language: string): string {
  const text: string = body.replace(/^\n+|\n+$/g, '');
  if (!text.trim()) {
    return '';
  }
  let bars: string = '```';
  while (text.includes(bars)) {
    bars += '`';
  }
  return `\n\n${bars}${language}\n${text}\n${bars}\n\n`;
}

function heading(node: StorageNode, context: RenderContext): string {
  const level: number = Number.parseInt(node.tag.slice(1), 10);
  const inner: string = renderChildren(node, context).trim();
  if (!inner) {
    return '';
  }
  if (context.inTable) {
    return `**${inner}**<br>`;
  }
  return block(`${'#'.repeat(level)} ${inner}`);
}

function paragraph(node: StorageNode, context: RenderContext): string {
  const inner: string = renderChildren(node, context).trim();
  if (!inner) {
    return '';
  }
  if (context.inTable) {
    return `${inner}<br>`;
  }
  return block(inner);
}

function list(node: StorageNode, context: RenderContext): string {
  const nested: RenderContext = { ...context, listStack: [...context.listStack, node.tag] };
  const inner: string = renderChildren(node, nested);
  if (context.inTable) {
    if (context.listStack.length > 0) {
      return `<br>${inner}`;
    }
    return inner;
  }
  // A nested list opens on its own line, or its first bullet lands on the end of
  // the parent item's text.
  if (context.listStack.length > 0) {
    return `\n${inner}`;
  }
  return block(inner);
}

function listItem(node: StorageNode, context: RenderContext): string {
  const ordered: boolean = context.listStack[context.listStack.length - 1] === 'ol';
  let bullet: string = '-';
  let continuation: string = '  ';
  if (ordered) {
    bullet = '1.';
    continuation = '   ';
  }
  if (context.inTable) {
    return listItemInCell(node, context, bullet);
  }
  const indent: string = listIndent(context.listStack);
  const inner: string = renderChildren(node, context).replace(/^\n+|\n+$/g, '');
  if (!inner.trim()) {
    return '';
  }
  const lines: Array<string> = inner.split('\n');
  const head: string = `${indent}${bullet} ${lines[0].trim()}`;
  const rest: Array<string> = lines.slice(1).map((line: string): string => {
    if (line.startsWith(' ') || !line.trim()) {
      return line;
    }
    return `${indent}${continuation}${line}`;
  });
  return [head, ...rest].join('\n') + '\n';
}

/**
 * A list inside a table cell. Markdown tables have no multi-line cells, so each
 * item ends in `<br>` and nesting is shown with non-breaking spaces.
 */
function listItemInCell(node: StorageNode, context: RenderContext, bullet: string): string {
  const inner: string = renderChildren(node, context).replace(TRAILING_BREAKS, '').trim();
  if (!inner) {
    return '';
  }
  const indent: string = CELL_INDENT.repeat(Math.max(0, context.listStack.length - 1));
  return `${indent}${bullet} ${inner}<br>`;
}

/**
 * One marker width per enclosing list. A child of `1. ` needs three spaces, a
 * child of `- ` only two.
 */
function listIndent(stack: ReadonlyArray<string>): string {
  return stack.slice(0, -1).map((tag: string): string => {
    if (tag === 'ol') {
      return '   ';
    }
    return '  ';
  }).join('');
}

function definitionTerm(node: StorageNode, context: RenderContext): string {
  const inner: string = renderChildren(node, context).trim();
  if (!inner) {
    return '';
  }
  return block(`**${inner}**`);
}

function preformatted(node: StorageNode): string {
  return fence(rawText(node), '');
}

function blockquote(node: StorageNode, context: RenderContext): string {
  const inner: string = quotedBody(renderChildren(node, context));
  if (!inner) {
    return '';
  }
  return block(prefixQuote(inner.split('\n')));
}

function prefixQuote(lines: ReadonlyArray<string>): string {
  return lines.map((line: string): string => {
    if (!line) {
      return '>';
    }
    return `> ${line}`;
  }).join('\n');
}

/** Blank runs collapsed before the `> ` prefixes go on. */
function quotedBody(text: string): string {
  return text.trim().replace(BLANK_RUNS, '\n\n');
}

function anchorLink(node: StorageNode, context: RenderContext): string {
  const href: string = (node.attrs.get('href') ?? '').trim();
  const label: string = renderChildren(node, context).trim();
  if (!href) {
    return label;
  }
  return `[${label || href}](${href})`;
}

/** `<ac:link>` wraps a resource reference: another page, a user, an attachment. */
function confluenceLink(node: StorageNode, context: RenderContext): string {
  const label: string = linkLabel(node, context);
  const anchor: string = (node.attrs.get('ac:anchor') ?? '').trim();

  const page: StorageNode | undefined = childNamed(node, 'ri:page');
  if (page) {
    const title: string = (page.attrs.get('ri:content-title') ?? '').trim();
    const space: string = (page.attrs.get('ri:space-key') ?? '').trim();
    if (title) {
      // Always four fields, empty or not: the resolver splits on '|' by position.
      return `[[${PAGE_LINK_PREFIX}:${title}|${space}|${label}|${anchor}]]`;
    }
  }
  const url: StorageNode | undefined = childNamed(node, 'ri:url');
  if (url && url.attrs.get('ri:value')) {
    const target: string = url.attrs.get('ri:value') ?? '';
    return `[${label || target}](${target})`;
  }
  const attachment: StorageNode | undefined = childNamed(node, 'ri:attachment');
  if (attachment && attachment.attrs.get('ri:filename')) {
    return `[[${ATTACHMENT_PREFIX}:${attachment.attrs.get('ri:filename') ?? ''}|${label}|link]]`;
  }
  const user: StorageNode | undefined = childNamed(node, 'ri:user');
  if (user) {
    return mentionFor(user.attrs.get('ri:account-id') ?? '', context, label);
  }
  if (anchor) {
    const target: string = obsidianHeadingAnchor(anchor);
    return `[[#${target}|${label || anchor}]]`;
  }
  return label;
}

function linkLabel(node: StorageNode, context: RenderContext): string {
  const rich: StorageNode | undefined = childNamed(node, 'ac:link-body');
  const plain: StorageNode | undefined = childNamed(node, 'ac:plain-text-link-body');
  const body: StorageNode | undefined = rich ?? plain;
  if (!body) {
    return '';
  }
  return renderChildren(body, context).trim();
}

function mentionFor(accountId: string, context: RenderContext, fallback: string): string {
  const name: string | undefined = context.users.get(accountId);
  if (name) {
    return `@${name}`;
  }
  if (fallback) {
    return fallback;
  }
  if (accountId) {
    return `@${accountId}`;
  }
  return '@user';
}

function confluenceImage(node: StorageNode, context: RenderContext): string {
  const alt: string = (node.attrs.get('ac:alt') ?? '').trim();
  const caption: StorageNode | undefined = childNamed(node, 'ac:caption');
  let captionText: string = '';
  if (caption) {
    captionText = renderChildren(caption, context).trim();
  }
  const label: string = alt || captionText;
  const markup: string = withCaption(imageMarkup(node, label), captionText, context);
  if (context.inTable || !isBlockImage(node)) {
    return markup;
  }
  return block(markup);
}

/** Confluence gives an image of its own a layout or alignment; an inline image has neither. */
function isBlockImage(node: StorageNode): boolean {
  return node.attrs.has('ac:layout') || node.attrs.has('ac:align');
}

function imageMarkup(node: StorageNode, label: string): string {
  const attachment: StorageNode | undefined = childNamed(node, 'ri:attachment');
  if (attachment && attachment.attrs.get('ri:filename')) {
    return `[[${ATTACHMENT_PREFIX}:${attachment.attrs.get('ri:filename') ?? ''}|${label}|image]]`;
  }
  const url: StorageNode | undefined = childNamed(node, 'ri:url');
  if (url && url.attrs.get('ri:value')) {
    return `![${label}](${url.attrs.get('ri:value') ?? ''})`;
  }
  if (label) {
    return `![${label}]()`;
  }
  return '';
}

/**
 * A caption is prose, not a label. It routinely holds a source link or a note
 * that appears nowhere else on the page, so it is kept as its own line.
 */
function withCaption(image: string, captionText: string, context: RenderContext): string {
  if (!image || !captionText) {
    return image;
  }
  if (context.inTable) {
    return `${image}<br>_${captionText}_`;
  }
  return `${image}\n_${captionText}_`;
}

function htmlImage(node: StorageNode): string {
  const src: string = (node.attrs.get('src') ?? '').trim();
  const alt: string = (node.attrs.get('alt') ?? '').trim();
  if (!src) {
    return '';
  }
  return `![${alt}](${src})`;
}

function table(node: StorageNode, context: RenderContext): string {
  const rowNodes: Array<StorageNode> = descendants(node, 'tr');
  const cellContext: RenderContext = { ...context, inTable: true, listStack: [] };
  const rows: Array<Array<string>> = rowNodes
    .map((row: StorageNode): Array<string> =>
      cellsOf(row).map((cell: StorageNode): string => renderCell(cell, cellContext))
    )
    .filter((row: Array<string>): boolean => row.length > 0);
  if (rows.length === 0) {
    return '';
  }
  const width: number = Math.max(...rows.map((row: Array<string>): number => row.length));
  const padded: Array<Array<string>> = rows.map((row: Array<string>): Array<string> =>
    [...row, ...new Array<string>(width - row.length).fill(' ')]
  );
  const hasHeader: boolean = rowNodes.some((row: StorageNode): boolean =>
    cellsOf(row).some((cell: StorageNode): boolean => cell.tag === 'th')
  );
  let head: Array<string> = new Array<string>(width).fill(' ');
  let body: Array<Array<string>> = padded;
  if (hasHeader) {
    head = padded[0];
    body = padded.slice(1);
  }
  const lines: Array<string> = [
    `| ${head.join(' | ')} |`,
    `|${new Array<string>(width).fill(' --- ').join('|')}|`,
    ...body.map((row: Array<string>): string => `| ${row.join(' | ')} |`)
  ];
  return block(lines.join('\n'));
}

/**
 * One cell, flattened to a single line.
 *
 * Paragraphs inside a cell are separated by `<br>`, the only line break a
 * markdown table understands. Any newline that still slipped through (a quote,
 * a rule, a fence) becomes one too, because a newline would end the row.
 */
function renderCell(cell: StorageNode, context: RenderContext): string {
  const inner: string = renderChildren(cell, context)
    .replace(/\n+/g, '<br>')
    .replace(TRAILING_BREAKS, '')
    .replace(/^(?:<br>\s*)+/, '')
    .trim();
  return inner || ' ';
}

function cellsOf(row: StorageNode): Array<StorageNode> {
  return row.children.filter((cell: StorageNode): boolean => cell.tag === 'td' || cell.tag === 'th');
}

// --- tasks and decisions -----------------------------------------------------

function taskList(node: StorageNode, context: RenderContext): string {
  if (context.inTable) {
    return renderChildren(node, context);
  }
  return block(renderChildren(node, context));
}

function task(node: StorageNode, context: RenderContext): string {
  const status: StorageNode | undefined = childNamed(node, 'ac:task-status');
  const done: boolean = status !== undefined && rawText(status).trim().toLowerCase() === 'complete';
  const bodyNode: StorageNode | undefined = childNamed(node, 'ac:task-body');
  let body: string = '';
  if (bodyNode) {
    body = renderChildren(bodyNode, context).replace(TRAILING_BREAKS, '').trim();
  }
  if (!body) {
    return '';
  }
  let mark: string = ' ';
  if (done) {
    mark = 'x';
  }
  if (context.inTable) {
    return `- [${mark}] ${body}<br>`;
  }
  return `- [${mark}] ${body}\n`;
}

/**
 * An ADF extension carries the real node and a pre-rendered fallback of the same
 * content. Rendering both duplicates every panel on the page, so the fallback is
 * used only when there is no node to render instead.
 */
function adfExtension(node: StorageNode, context: RenderContext): string {
  const nodes: Array<StorageNode> = node.children.filter(
    (child: StorageNode): boolean => child.tag === 'ac:adf-node'
  );
  if (nodes.length > 0) {
    return nodes.map((child: StorageNode): string => render(child, context)).join('');
  }
  const fallback: StorageNode | undefined = childNamed(node, 'ac:adf-fallback');
  if (!fallback) {
    return '';
  }
  return renderChildren(fallback, context);
}

function adfNode(node: StorageNode, context: RenderContext): string {
  const type: string = (node.attrs.get('type') ?? '').toLowerCase();
  if (type === 'panel') {
    const panelType: string = adfAttribute(node, 'panel-type') || 'info';
    return calloutBlock(panelType, '', renderChildren(node, context), context);
  }
  if (type === 'decision-list' || type === 'task-list') {
    return block(renderChildren(node, context));
  }
  if (type === 'decision-item') {
    const body: string = renderChildren(node, context).trim();
    if (!body) {
      return '';
    }
    return `- **Decision:** ${body}\n`;
  }
  if (type === 'expand') {
    const title: string = adfAttribute(node, 'title').trim() || 'Details';
    return expandBlock(title, renderChildren(node, context), context);
  }
  if (type === 'date') {
    const timestamp: string = adfAttribute(node, 'timestamp').trim();
    if (timestamp) {
      return isoDate(timestamp);
    }
    return renderChildren(node, context);
  }
  if (type === 'status') {
    const text: string = adfAttribute(node, 'text').trim() || renderChildren(node, context).trim();
    if (!text) {
      return '';
    }
    return `\`${text}\``;
  }
  if (type === 'inline-card' || type === 'block-card' || type === 'embed-card') {
    const href: string = adfAttribute(node, 'url').trim();
    if (href) {
      return `<${href}>`;
    }
    return renderChildren(node, context);
  }
  if (type === 'mention') {
    return mentionFor(adfAttribute(node, 'id').trim(), context, adfAttribute(node, 'text').trim());
  }
  return renderChildren(node, context);
}

/**
 * A Confluence date is an empty `<time datetime="...">`, so its only content is
 * the attribute. Treating the element as transparent renders nothing at all.
 */
function timeElement(node: StorageNode, context: RenderContext): string {
  const datetime: string = (node.attrs.get('datetime') ?? '').trim();
  if (datetime) {
    return datetime.slice(0, 10);
  }
  return renderChildren(node, context);
}

function isoDate(timestamp: string): string {
  const millis: number = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(millis)) {
    return timestamp;
  }
  return new Date(millis).toISOString().slice(0, 10);
}

// --- macros ------------------------------------------------------------------

function renderMacro(node: StorageNode, name: string, context: RenderContext): string {
  if (NAVIGATION_MACROS.has(name)) {
    return '';
  }
  const handler: NodeRenderer | undefined = MACROS.get(name);
  if (handler) {
    return handler(node, context);
  }
  if (isPanelMacro(name)) {
    return calloutBlock(name, macroParameter(node, 'title').trim(), renderChildren(node, context), context);
  }
  // A plain-text body is preformatted: a diagram, a query, a template. Rendered
  // as a paragraph its line structure would be flattened.
  const plain: StorageNode | undefined = childNamed(node, 'ac:plain-text-body');
  if (plain && rawText(plain).trim()) {
    return fence(rawText(plain), '');
  }
  // Unknown macro: emit its body, or name it so the reader knows it was there.
  const inner: string = renderChildren(node, context).trim();
  if (inner) {
    return block(inner);
  }
  return block(`_[Confluence macro: ${name}]_`);
}

function codeMacro(node: StorageNode): string {
  const language: string = macroParameter(node, 'language').trim().toLowerCase();
  const title: string = macroParameter(node, 'title').trim();
  const plain: StorageNode | undefined = childNamed(node, 'ac:plain-text-body');
  const body: string = rawText(plain ?? node);
  let usable: string = language;
  if (language === 'none' || language === 'text') {
    usable = '';
  }
  const fenced: string = fence(body, usable);
  if (title) {
    return block(`**${title}**`) + fenced;
  }
  return fenced;
}

function noformatMacro(node: StorageNode): string {
  const plain: StorageNode | undefined = childNamed(node, 'ac:plain-text-body');
  return fence(rawText(plain ?? node), '');
}

/** A Confluence panel as an Obsidian callout. Inside a table it is a bold title and text. */
function calloutBlock(panel: string, title: string, inner: string, context: RenderContext): string {
  const body: string = quotedBody(inner);
  if (!body && !title) {
    return '';
  }
  if (context.inTable) {
    return cellBlock(title, body);
  }
  const callout: ObsidianCalloutType = calloutForPanel(panel);
  let heading: string = `[!${callout}]`;
  if (title) {
    heading = `[!${callout}] ${title}`;
  }
  return block(prefixQuote(withBody(heading, body)));
}

/** An expand macro as a folded callout, so the title stays the summary it was. */
function expandBlock(title: string, inner: string, context: RenderContext): string {
  const body: string = quotedBody(inner);
  if (context.inTable) {
    return cellBlock(title, body);
  }
  return block(prefixQuote(withBody(`[!${ObsidianCalloutType.NOTE}]- ${title}`, body)));
}

function withBody(heading: string, body: string): Array<string> {
  if (!body) {
    return [heading];
  }
  return [heading, ...body.split('\n')];
}

function cellBlock(title: string, body: string): string {
  const parts: Array<string> = new Array<string>();
  if (title) {
    parts.push(`**${title}**`);
  }
  if (body) {
    parts.push(body);
  }
  return `${parts.join('<br>')}<br>`;
}

function expandMacro(node: StorageNode, context: RenderContext): string {
  const title: string = macroParameter(node, 'title').trim() || 'Details';
  const body: StorageNode | undefined = childNamed(node, 'ac:rich-text-body');
  return expandBlock(title, renderChildren(body ?? node, context), context);
}

function statusMacro(node: StorageNode): string {
  const title: string = macroParameter(node, 'title').trim();
  if (!title) {
    return '';
  }
  return `\`${title}\``;
}

function jiraMacro(node: StorageNode, context: RenderContext): string {
  const key: string = macroParameter(node, 'key').trim();
  if (key) {
    if (context.siteUrl) {
      return `[${key}](${context.siteUrl}/browse/${key})`;
    }
    return `\`${key}\``;
  }
  const query: string = macroParameter(node, 'jqlquery').trim() || macroParameter(node, 'jqlQuery').trim();
  if (!query) {
    return '';
  }
  return block(`_[Jira query: ${query}]_`);
}

function includeMacro(node: StorageNode): string {
  const page: StorageNode | undefined = descendants(node, 'ri:page')[0];
  let title: string = '';
  if (page) {
    title = (page.attrs.get('ri:content-title') ?? '').trim();
  }
  if (!title) {
    return '';
  }
  return block(`_[Includes page: ${title}]_`);
}

function drawioMacro(node: StorageNode): string {
  const name: string = macroParameter(node, 'diagramName').trim()
    || macroParameter(node, 'diagramname').trim()
    || macroParameter(node, 'diagramDisplayName').trim();
  if (name) {
    return block(`_[Diagram: ${name}]_`);
  }
  return block('_[Diagram]_');
}

function viewFileMacro(node: StorageNode): string {
  const attachment: StorageNode | undefined = descendants(node, 'ri:attachment')[0];
  let filename: string = '';
  if (attachment) {
    filename = (attachment.attrs.get('ri:filename') ?? '').trim();
  }
  if (!filename) {
    return block('_[Attached file]_');
  }
  return `[[${ATTACHMENT_PREFIX}:${filename}||link]]`;
}

function tocMacro(): string {
  return `\n\n${TOC_PLACEHOLDER}\n\n`;
}

/**
 * A children macro is the entire body of many index pages. Dropping it as
 * navigation would leave those pages blank, so it becomes a real list of the
 * page's children instead, written once the whole tree is known.
 */
function childrenMacro(): string {
  return `\n\n${CHILDREN_PLACEHOLDER}\n\n`;
}

function unwrapMacro(node: StorageNode, context: RenderContext): string {
  return block(renderChildren(node, context).trim());
}

const MACROS: ReadonlyMap<string, NodeRenderer> = new Map<string, NodeRenderer>([
  ['code', codeMacro],
  ['noformat', noformatMacro],
  ['expand', expandMacro],
  ['status', statusMacro],
  ['jira', jiraMacro],
  ['jiraissues', jiraMacro],
  ['include', includeMacro],
  ['excerpt-include', includeMacro],
  ['drawio', drawioMacro],
  ['view-file', viewFileMacro],
  ['viewfile', viewFileMacro],
  ['multimedia', viewFileMacro],
  ['toc', tocMacro],
  ['toc-zone', tocMacro],
  ['children', childrenMacro],
  ['pagetree', childrenMacro],
  // Wrappers whose only job is layout: keep the body, drop the frame.
  ['excerpt', unwrapMacro],
  ['section', unwrapMacro],
  ['column', unwrapMacro],
  ['div', unwrapMacro],
  ['details', unwrapMacro],
  ['bookmark', unwrapMacro]
]);

function lineBreak(_node: StorageNode, context: RenderContext): string {
  if (context.inTable) {
    return ' ';
  }
  return '\n';
}

function unwrapInline(node: StorageNode, context: RenderContext): string {
  return renderChildren(node, context);
}

function wrapped(tag: string): NodeRenderer {
  const wrap: string = INLINE_WRAPPERS.get(tag) ?? '';
  return (node: StorageNode, context: RenderContext): string => inline(node, context, wrap);
}

function captionAlone(node: StorageNode, context: RenderContext): string {
  return block(`_${renderChildren(node, context).trim()}_`);
}

function listItemFallback(node: StorageNode, context: RenderContext): string {
  const inner: string = renderChildren(node, context).trim();
  if (!inner) {
    return '';
  }
  return block(inner);
}

const HANDLERS: ReadonlyMap<string, NodeRenderer> = new Map<string, NodeRenderer>([
  ['h1', heading], ['h2', heading], ['h3', heading],
  ['h4', heading], ['h5', heading], ['h6', heading],
  ['p', paragraph],
  ['br', lineBreak],
  ['hr', (): string => block('---')],
  ['strong', wrapped('strong')],
  ['b', wrapped('b')],
  ['em', wrapped('em')],
  ['i', wrapped('i')],
  ['del', wrapped('del')],
  ['s', wrapped('s')],
  ['strike', wrapped('strike')],
  ['code', codeSpan],
  ['tt', codeSpan],
  ['kbd', codeSpan],
  ['samp', codeSpan],
  ['u', unwrapInline],
  ['sup', unwrapInline],
  ['sub', unwrapInline],
  ['small', unwrapInline],
  ['big', unwrapInline],
  ['ul', list], ['ol', list], ['li', listItem],
  ['dt', definitionTerm],
  ['dd', listItemFallback],
  ['pre', preformatted],
  ['blockquote', blockquote],
  ['a', anchorLink],
  ['img', htmlImage],
  ['table', table],
  ['ac:link', confluenceLink],
  ['ac:image', confluenceImage],
  ['ac:task-list', taskList],
  ['ac:task', task],
  ['ac:adf-extension', adfExtension],
  ['ac:adf-node', adfNode],
  ['time', timeElement],
  // A caption reached on its own, rather than through the image that owns it.
  ['ac:caption', captionAlone]
]);
