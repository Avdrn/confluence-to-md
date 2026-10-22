/**
 * What a Confluence block holds that a block written from markdown cannot
 * carry, in words for someone who has never seen storage format.
 *
 * Only blocks the user changed are written anew, so this is asked only of
 * those. Each answer is one sentence, and the same sentence is given once.
 */

import { descendants, macroName } from '../convert/storage-parser';
import type { StorageNode } from '../convert/storage-types';
import type { SegmentKind } from '../convert/storage-segments';

/** Macros the storage writer produces itself. An edit to one of these loses nothing. */
const WRITABLE: ReadonlySet<string> = new Set<string>(['code', 'info', 'note', 'tip', 'warning', 'expand', 'panel', 'noformat', 'jira']);

const MACRO_WORDS: ReadonlyMap<string, string> = new Map<string, string>([
  ['status', 'a status label'],
  ['drawio', 'a diagram'],
  ['gliffy', 'a diagram'],
  ['view-file', 'an attached file card'],
  ['viewfile', 'an attached file card'],
  ['multimedia', 'an attached file card'],
  ['jiraissues', 'a Jira issue list'],
  ['excerpt', 'an excerpt marker'],
  ['anchor', 'an anchor']
]);

const ADF_WORDS: ReadonlyMap<string, string> = new Map<string, string>([
  ['decision-list', 'a decision'],
  ['decision-item', 'a decision'],
  ['date', 'a date field'],
  ['status', 'a status label'],
  ['mention', 'a person mention'],
  ['inline-card', 'a smart link card'],
  ['block-card', 'a smart link card'],
  ['embed-card', 'a smart link card'],
  ['emoji', 'an emoji']
]);

/** What a generated block is, for the sentence that warns against editing it. */
export function generatedBlockWords(kind: SegmentKind): string {
  if (kind === 'toc') {
    return 'the table of contents';
  }
  if (kind === 'children') {
    return 'the list of child pages';
  }
  if (kind === 'include') {
    return 'text pulled in from another page';
  }
  return '';
}

export function lostInNodes(nodes: ReadonlyArray<StorageNode>): Array<string> {
  const found: Set<string> = new Set<string>();
  for (const node of nodes) {
    inspect(node, found);
  }
  return [...found];
}

function inspect(node: StorageNode, found: Set<string>): void {
  const macro: string = macroName(node);
  if (macro && !WRITABLE.has(macro)) {
    found.add(MACRO_WORDS.get(macro) ?? `an element from a Confluence app ("${macro}")`);
  }
  if (macro === 'jira' && !node.children.some((child: StorageNode): boolean => child.tag === 'ac:parameter' && child.attrs.get('ac:name') === 'key')) {
    found.add('a Jira issue list');
  }
  if (node.tag === 'ac:adf-node') {
    const type: string = (node.attrs.get('type') ?? '').toLowerCase();
    const words: string | undefined = ADF_WORDS.get(type);
    if (words) {
      found.add(words);
    }
  }
  if (node.tag === 'ri:user') {
    found.add('a person mention');
  }
  if (node.tag === 'ac:emoticon') {
    found.add('an emoji');
  }
  if (node.tag === 'time') {
    found.add('a date field');
  }
  if (node.tag === 'ac:image' && (node.attrs.has('ac:width') || node.attrs.has('ac:height') || node.attrs.has('ac:align') || node.attrs.has('ac:layout'))) {
    found.add('the size and position of an image');
  }
  if (node.tag === 'ac:task-list') {
    found.add('the assignees and due dates of tasks');
  }
  if (node.tag === 'u' || node.tag === 'sup' || node.tag === 'sub') {
    found.add('underlined, superscript or subscript text');
  }
  if (node.tag === 'span' && node.attrs.has('style')) {
    found.add('coloured or styled text');
  }
  if (node.tag === 'table') {
    if (descendants(node, 'colgroup').length > 0 || node.attrs.has('data-layout')) {
      found.add('the column widths of a table');
    }
    const cells: Array<StorageNode> = [...descendants(node, 'td'), ...descendants(node, 'th')];
    if (cells.some((cell: StorageNode): boolean => cell.attrs.has('rowspan') || cell.attrs.has('colspan'))) {
      found.add('merged table cells');
    }
  }
  for (const child of node.children) {
    inspect(child, found);
  }
}
