/**
 * The note as the sync wrote it, one piece per storage segment.
 *
 * A segment is rendered on its own, but links, the table of contents and the
 * list of child pages can only be resolved over the whole body, so the pieces
 * are joined with a sentinel line, resolved together the way the sync does
 * it, and split again. Joined back with blank lines, the pieces equal the
 * body the sync wrote, which is what lets an unchanged block be recognised.
 */

import { inertBody } from '../convert/inert-markdown';
import { parseStorage } from '../convert/storage-parser';
import { renderSegments } from '../convert/storage-segments';
import { resolveLinks } from '../sync/links/link-resolver';
import type { IncludedBodies, RenderedSegment } from '../convert/storage-segments';
import type { UserDirectory } from '../convert/storage-types';
import type { LinkResolveOptions } from '../sync/links/link-resolver';

const SENTINEL: string = '<!--confluence-segment-->';

export interface BaseSegment extends RenderedSegment {
  /** The segment's text as it stands in the note: links resolved, made inert. */
  text: string;
}

export interface BaseMarkdown {
  segments: Array<BaseSegment>;
  /** The whole body, as the sync would have written it. */
  body: string;
}

export function baseMarkdown(
  storage: string,
  users: UserDirectory,
  links: LinkResolveOptions,
  includes: IncludedBodies = new Map<number, string>()
): BaseMarkdown {
  const rendered: Array<RenderedSegment> = renderSegments(parseStorage(storage), users, links.siteUrl, includes);
  const joined: string = rendered.map((segment: RenderedSegment): string => segment.markdown).join(`\n\n${SENTINEL}\n\n`);
  const pieces: Array<string> = inertBody(resolveLinks(joined, links))
    .split(SENTINEL)
    .map((piece: string): string => piece.trim());
  const segments: Array<BaseSegment> = rendered.map((segment: RenderedSegment, index: number): BaseSegment => ({
    ...segment,
    text: pieces[index] ?? ''
  }));
  return { segments, body: joinBlocks(segments.map((segment: BaseSegment): string => segment.text)) };
}

/** Blocks as a body: blank-line separated, empty ones left out. */
export function joinBlocks(blocks: ReadonlyArray<string>): string {
  return blocks.filter((block: string): boolean => block.length > 0).join('\n\n');
}
