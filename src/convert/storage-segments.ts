/**
 * A storage body cut into the pieces a push can keep or replace one at a time.
 *
 * A segment is a block-level child of the body, or of a layout cell. Its
 * offsets point into the storage string, so an unchanged segment is copied
 * back byte for byte, macros and all, while a changed one is written anew
 * from the note. Inline nodes that sit directly in a container, which
 * Confluence rarely writes, are grouped into one segment.
 */

import { macroName, parseStorage } from './storage-parser';
import { renderNodes } from './storage-renderer';
import type { StorageNode, UserDirectory } from './storage-types';

/**
 * What a segment holds, for the review pane and the preflight:
 *
 *     block     ordinary content the note can express
 *     include   another page's text, pulled in by a macro
 *     toc       the table of contents Confluence builds
 *     children  the list of child pages Confluence builds
 *     macro     any other macro, kept only while it is not edited
 *     inline    a run of inline nodes outside a paragraph
 */
export type SegmentKind = 'block' | 'include' | 'toc' | 'children' | 'macro' | 'inline';

export interface StorageSegment {
  start: number;
  end: number;
  nodes: ReadonlyArray<StorageNode>;
  kind: SegmentKind;
  /** The macro name for `include`, `toc`, `children` and `macro`; '' otherwise. */
  macro: string;
}

export interface RenderedSegment extends StorageSegment {
  /** The segment as the renderer writes it, before links are resolved. */
  markdown: string;
}

/** Containers whose children are the body's own blocks, laid out side by side. */
const TRANSPARENT: ReadonlySet<string> = new Set<string>(['ac:layout', 'ac:layout-section', 'ac:layout-cell', 'div', 'section']);

const INCLUDE_MACROS: ReadonlySet<string> = new Set<string>(['include', 'excerpt-include']);
const TOC_MACROS: ReadonlySet<string> = new Set<string>(['toc', 'toc-zone']);
const CHILDREN_MACROS: ReadonlySet<string> = new Set<string>(['children', 'pagetree']);
/** Macros the writer produces itself, so an edited one can be written anew without loss. */
const WRITABLE_MACROS: ReadonlySet<string> = new Set<string>(['code', 'info', 'note', 'tip', 'warning', 'expand', 'panel', 'noformat']);

const INLINE_TAGS: ReadonlySet<string> = new Set<string>([
  '', 'strong', 'b', 'em', 'i', 'del', 's', 'strike', 'code', 'tt', 'kbd', 'samp', 'u', 'sup', 'sub',
  'small', 'big', 'a', 'span', 'br', 'img', 'time', 'ac:link', 'ac:image', 'ac:emoticon', 'ac:placeholder',
  'ac:inline-comment-marker'
]);

export function segmentStorage(root: StorageNode): Array<StorageSegment> {
  const segments: Array<StorageSegment> = new Array<StorageSegment>();
  collect(root, segments);
  return segments;
}

/** Storage bodies of included pages, by the offset of the include macro that pulls each in. */
export type IncludedBodies = ReadonlyMap<number, string>;

/**
 * Every segment with the markdown the renderer makes of it. An include macro
 * renders as the page it names, the way the sync inlines it, when that body
 * was fetched; its own offsets still cover only the macro.
 */
export function renderSegments(
  root: StorageNode,
  users: UserDirectory,
  siteUrl: string,
  includes: IncludedBodies = new Map<number, string>()
): Array<RenderedSegment> {
  return segmentStorage(root).map((segment: StorageSegment): RenderedSegment => {
    const included: string | undefined = includes.get(segment.start);
    if (segment.kind === 'include' && included) {
      return { ...segment, markdown: renderNodes(parseStorage(included).children, users, siteUrl) };
    }
    return { ...segment, markdown: renderNodes(segment.nodes, users, siteUrl) };
  });
}

function collect(container: StorageNode, segments: Array<StorageSegment>): void {
  let run: Array<StorageNode> = new Array<StorageNode>();
  const flush = (): void => {
    const nodes: Array<StorageNode> = trimWhitespace(run);
    if (nodes.length > 0) {
      segments.push({ start: nodes[0].start, end: nodes[nodes.length - 1].end, nodes, kind: 'inline', macro: '' });
    }
    run = new Array<StorageNode>();
  };
  for (const child of container.children) {
    if (INLINE_TAGS.has(child.tag)) {
      run.push(child);
      continue;
    }
    flush();
    if (TRANSPARENT.has(child.tag)) {
      collect(child, segments);
      continue;
    }
    segments.push(segmentOf(child));
  }
  flush();
}

/** The run without the whitespace-only text at its ends, which is layout, not content. */
function trimWhitespace(run: ReadonlyArray<StorageNode>): Array<StorageNode> {
  const isBlank = (node: StorageNode): boolean => node.tag === '' && node.text.trim() === '';
  let from: number = 0;
  let to: number = run.length;
  while (from < to && isBlank(run[from])) {
    from++;
  }
  while (to > from && isBlank(run[to - 1])) {
    to--;
  }
  return run.slice(from, to);
}

function segmentOf(node: StorageNode): StorageSegment {
  const macro: string = macroName(node);
  let kind: SegmentKind = 'block';
  if (INCLUDE_MACROS.has(macro)) {
    kind = 'include';
  } else if (TOC_MACROS.has(macro)) {
    kind = 'toc';
  } else if (CHILDREN_MACROS.has(macro)) {
    kind = 'children';
  } else if (macro && !WRITABLE_MACROS.has(macro)) {
    kind = 'macro';
  }
  return { start: node.start, end: node.end, nodes: [node], kind, macro };
}
