/**
 * What the note will read like after the push: the patched storage rendered
 * the way a sync renders it, compared block by block with the note itself.
 * Where the two differ, the writer could not say exactly what the note says,
 * and the review pane shows the difference before anything is sent.
 */

import { baseMarkdown, joinBlocks } from './base-markdown';
import { diffBlocks } from './block-diff';
import type { BaseMarkdown } from './base-markdown';
import type { BlockChange } from './block-diff';
import type { IncludedBodies } from '../convert/storage-segments';
import type { UserDirectory } from '../convert/storage-types';
import type { LinkResolveOptions } from '../sync/links/link-resolver';

export interface RoundTripDifference {
  /** Note block indexes, end exclusive, whose text reads differently after the push. */
  local: [number, number];
  /** What the note says. */
  expected: string;
  /** What Confluence will say. */
  actual: string;
}

export interface RoundTrip {
  /** The whole body as a sync would write it after the push. */
  body: string;
  differences: Array<RoundTripDifference>;
}

export function roundTrip(
  patchedStorage: string,
  localBlocks: ReadonlyArray<string>,
  users: UserDirectory,
  links: LinkResolveOptions,
  includes: IncludedBodies = new Map<number, string>()
): RoundTrip {
  const rendered: BaseMarkdown = baseMarkdown(patchedStorage, users, links, includes);
  const renderedBlocks: Array<string> = rendered.segments
    .map((segment): string => segment.text)
    .filter((text: string): boolean => text.length > 0);
  const differences: Array<RoundTripDifference> = new Array<RoundTripDifference>();
  for (const change of diffBlocks(localBlocks, renderedBlocks)) {
    if (change.kind === 'equal') {
      continue;
    }
    differences.push({
      local: change.base,
      expected: joinBlocks(localBlocks.slice(change.base[0], change.base[1])),
      actual: joinBlocks(renderedBlocks.slice(change.local[0], change.local[1]))
    });
  }
  return { body: rendered.body, differences };
}

/** True when a change touches any of these note blocks. */
export function touches(change: BlockChange, local: [number, number]): boolean {
  return change.local[0] < local[1] && local[0] < change.local[1];
}
