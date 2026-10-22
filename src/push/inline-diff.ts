/**
 * One block that reads as the change: removed words struck through, new
 * words highlighted, in Obsidian's own `~~` and `==` syntax, so a review
 * card renders it the way the note is rendered.
 *
 * The marks go around words of the markdown source, never across a line and
 * never over a line's own marker (`- `, `# `, `> `). Then the result is read
 * back: when the marks changed the block's structure, for example by landing
 * inside a link, the card shows the two versions side by side instead.
 */

import { diffWordsWithSpace } from 'diff';
import { parseBlocks } from './markdown/block-parser';
import type { MdBlock, MdInline } from './markdown/markdown-ast';

export interface MergedBlock {
  markdown: string;
  /** False when the versions could not be merged into one readable block. */
  merged: boolean;
}

/** Markers at the start of a line that must stay outside a `~~` or `==`. */
const LINE_PREFIX: RegExp = /^((?:\s*>\s?)*(?:\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)?(?:#{1,6}\s+)?)/;

export function mergeChange(before: string, after: string): MergedBlock {
  if (!before || !after) {
    return { markdown: after || before, merged: false };
  }
  const beforeBlocks: Array<MdBlock> = parseBlocks(before);
  const afterBlocks: Array<MdBlock> = parseBlocks(after);
  if (!sameShape(beforeBlocks, afterBlocks) || afterBlocks.some((block: MdBlock): boolean => block.kind === 'fence' || block.kind === 'table')) {
    return { markdown: after, merged: false };
  }
  let merged: string = '';
  for (const part of diffWordsWithSpace(before, after)) {
    if (part.added) {
      merged += mark(part.value, '==');
    } else if (part.removed) {
      merged += mark(part.value, '~~');
    } else {
      merged += part.value;
    }
  }
  if (structure(parseBlocks(merged)) !== structure(afterBlocks)) {
    return { markdown: after, merged: false };
  }
  return { markdown: merged, merged: true };
}

function sameShape(a: ReadonlyArray<MdBlock>, b: ReadonlyArray<MdBlock>): boolean {
  return a.length === b.length && a.every((block: MdBlock, index: number): boolean => block.kind === b[index].kind);
}

/** Wraps the words of each line, leaving whitespace and line markers bare. */
function mark(value: string, marker: string): string {
  return value.split('\n').map((line: string): string => {
    const prefix: string = (LINE_PREFIX.exec(line) ?? [''])[0];
    const rest: string = line.slice(prefix.length);
    const trimmed: string = rest.trim();
    if (!trimmed) {
      return line;
    }
    const leading: string = rest.slice(0, rest.indexOf(trimmed));
    const trailing: string = rest.slice(leading.length + trimmed.length);
    return `${prefix}${leading}${marker}${trimmed}${marker}${trailing}`;
  }).join('\n');
}

/**
 * Block kinds and the inline nodes that are not text or marks, with their
 * targets, as one comparable string. A mark that lands inside a link target
 * or a code span changes it, which is how such a merge is rejected.
 */
function structure(blocks: ReadonlyArray<MdBlock>): string {
  return blocks.map(blockStructure).join('|');
}

function blockStructure(block: MdBlock): string {
  switch (block.kind) {
    case 'heading':
    case 'paragraph':
      return `${block.kind}:${inlineStructure(block.inlines)}`;
    case 'quote':
      return `quote(${structure(block.blocks)})`;
    case 'callout':
      return `callout(${structure(block.blocks)})`;
    case 'list':
      return `list(${block.items.map((item): string => structure(item.blocks)).join(',')})`;
    default:
      return block.kind;
  }
}

function inlineStructure(inlines: ReadonlyArray<MdInline>): string {
  return inlines.map((node: MdInline): string => {
    switch (node.kind) {
      case 'text':
      case 'break':
        return '';
      case 'strike':
      case 'highlight':
        return inlineStructure(node.inlines);
      case 'strong':
      case 'em':
        return `${node.kind}(${inlineStructure(node.inlines)})`;
      case 'link':
        return `link[${node.href}](${inlineStructure(node.inlines)})`;
      case 'code':
        return `code(${node.text})`;
      case 'autolink':
        return `autolink(${node.href})`;
      case 'image':
        return `image(${node.src})`;
      case 'wikilink':
        return `wikilink(${node.target}#${node.anchor}|${node.alias})`;
      case 'embed':
        return `embed(${node.target}|${node.alias})`;
    }
  }).join('');
}
