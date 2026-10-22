/**
 * Markdown from the block tree, in the style the renderer writes: `-`
 * bullets, `1.` numbers, two-space continuation, `**bold**`, fenced code.
 *
 * Two uses: the merged block a review card renders, and the proof that the
 * parser reads what the renderer wrote (parse then write is the identity on
 * the renderer's output).
 */

import type { MdBlock, MdCallout, MdInline, MdList, MdListItem, MdTable } from './markdown-ast';

/** `<` that could open a tag, as inert-markdown.ts escapes it. */
const TAG_OPENER: RegExp = /<(?=[A-Za-z/!?%])/g;

export function writeMarkdown(blocks: ReadonlyArray<MdBlock>): string {
  return blocks
    .map(writeBlock)
    .filter((text: string): boolean => text.length > 0)
    .join('\n\n');
}

export function writeBlock(block: MdBlock): string {
  switch (block.kind) {
    case 'heading':
      return `${'#'.repeat(block.level)} ${writeInlines(block.inlines, false)}`.trimEnd();
    case 'paragraph':
      return writeInlines(block.inlines, false);
    case 'fence':
      return fence(block.text, block.language);
    case 'rule':
      return '---';
    case 'quote':
      return prefixQuote(writeMarkdown(block.blocks).split('\n'));
    case 'callout':
      return callout(block);
    case 'list':
      return list(block);
    case 'table':
      return table(block);
    case 'comment':
      return block.text;
  }
}

export function writeInlines(inlines: ReadonlyArray<MdInline>, inCell: boolean): string {
  return inlines.map((node: MdInline): string => writeInline(node, inCell)).join('');
}

function writeInline(node: MdInline, inCell: boolean): string {
  switch (node.kind) {
    case 'text':
      return escapeText(node.text, inCell);
    case 'code':
      return wrapCode(node.text);
    case 'strong':
      return `**${writeInlines(node.inlines, inCell)}**`;
    case 'em':
      return `*${writeInlines(node.inlines, inCell)}*`;
    case 'strike':
      return `~~${writeInlines(node.inlines, inCell)}~~`;
    case 'highlight':
      return `==${writeInlines(node.inlines, inCell)}==`;
    case 'link':
      return `[${writeInlines(node.inlines, inCell)}](${node.href})`;
    case 'autolink':
      return `<${node.href}>`;
    case 'image':
      return `![${node.alt}](${node.src})`;
    case 'wikilink':
      return wikilink(node.target, node.anchor, node.alias, inCell);
    case 'embed':
      return wikilink(node.target, '', node.alias, inCell).replace(/^\[\[/, '![[');
    case 'break':
      if (inCell) {
        return '<br>';
      }
      return '\n';
  }
}

/** The same escaping as inert-markdown.ts, so the renderer's output reads back unchanged. */
function escapeText(text: string, inCell: boolean): string {
  let escaped: string = text
    .replace(/`/g, '\\`')
    .replace(/~/g, '\\~')
    .replace(TAG_OPENER, '&lt;');
  if (inCell) {
    escaped = escaped.replace(/\|/g, '\\|');
  }
  return escaped;
}

function wrapCode(inner: string): string {
  let ticks: string = '`';
  while (inner.includes(ticks)) {
    ticks += '`';
  }
  let pad: string = '';
  if (inner.startsWith('`') || inner.endsWith('`')) {
    pad = ' ';
  }
  return `${ticks}${pad}${inner}${pad}${ticks}`;
}

function wikilink(target: string, anchor: string, alias: string, inCell: boolean): string {
  let inner: string = target;
  if (anchor) {
    inner = `${inner}#${anchor}`;
  }
  if (alias) {
    inner = `${inner}|${alias}`;
  }
  if (inCell) {
    inner = inner.replace(/\|/g, '\\|');
  }
  return `[[${inner}]]`;
}

function fence(text: string, language: string): string {
  let bars: string = '```';
  while (text.includes(bars)) {
    bars += '`';
  }
  return `${bars}${language}\n${text}\n${bars}`;
}

function prefixQuote(lines: ReadonlyArray<string>): string {
  return lines.map((line: string): string => {
    if (!line) {
      return '>';
    }
    return `> ${line}`;
  }).join('\n');
}

function callout(block: MdCallout): string {
  let heading: string = `[!${block.type}]`;
  if (block.folded) {
    heading = `${heading}-`;
  }
  const title: string = writeInlines(block.title, false);
  if (title) {
    heading = `${heading} ${title}`;
  }
  const body: string = writeMarkdown(block.blocks);
  const lines: Array<string> = [heading];
  if (body) {
    lines.push(...body.split('\n'));
  }
  return prefixQuote(lines);
}

function list(block: MdList): string {
  let bullet: string = '-';
  if (block.ordered) {
    bullet = '1.';
  }
  const continuation: string = ' '.repeat(bullet.length + 1);
  return block.items.map((item: MdListItem): string => listItem(item, bullet, continuation)).join('\n');
}

function listItem(item: MdListItem, bullet: string, continuation: string): string {
  let mark: string = '';
  if (item.task === 'open') {
    mark = '[ ] ';
  } else if (item.task === 'done') {
    mark = '[x] ';
  }
  const lines: Array<string> = writeMarkdown(item.blocks).split('\n');
  const head: string = `${bullet} ${mark}${lines[0]}`.trimEnd();
  const rest: Array<string> = lines.slice(1).map((line: string): string => {
    if (!line) {
      return line;
    }
    return `${continuation}${line}`;
  });
  return [head, ...rest].join('\n');
}

function table(block: MdTable): string {
  const width: number = Math.max(block.header.length, ...block.rows.map((row: Array<Array<MdInline>>): number => row.length));
  const lines: Array<string> = [
    row(block.header, width),
    `|${new Array<string>(width).fill(' --- ').join('|')}|`,
    ...block.rows.map((cells: Array<Array<MdInline>>): string => row(cells, width))
  ];
  return lines.join('\n');
}

function row(cells: ReadonlyArray<Array<MdInline>>, width: number): string {
  const written: Array<string> = cells.map((cell: Array<MdInline>): string => writeInlines(cell, true).trim() || ' ');
  while (written.length < width) {
    written.push(' ');
  }
  return `| ${written.join(' | ')} |`;
}
