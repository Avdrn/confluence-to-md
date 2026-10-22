/**
 * The new storage body: the original with only the changed blocks replaced.
 *
 * Everything between two kept segments is copied as it is, which carries the
 * whitespace and the layout tags that frame them. A changed segment is
 * replaced in place by what the writer made of the note's block; an added
 * block goes in right after the segment before it, inside the same frame; a
 * removed one simply is not copied. A change the user held back counts as
 * kept.
 */

import type { StorageSegment } from '../convert/storage-segments';
import type { BlockChange } from './block-diff';

export interface PatchInput {
  storage: string;
  segments: ReadonlyArray<StorageSegment>;
  changes: ReadonlyArray<BlockChange>;
  /** Storage for the note's block at this index. */
  localStorage: (localIndex: number) => string;
  /** Whether this change is sent; a change held back leaves Confluence as it is. */
  sends: (change: BlockChange, index: number) => boolean;
}

export function patchStorage(input: PatchInput): string {
  const { storage, segments } = input;
  let output: string = '';
  let cursor: number = 0;
  input.changes.forEach((change: BlockChange, index: number): void => {
    const [baseFrom, baseTo] = change.base;
    const [localFrom, localTo] = change.local;
    const kept: boolean = change.kind === 'equal' || !input.sends(change, index);
    if (kept) {
      if (baseTo > baseFrom) {
        output += storage.slice(cursor, segments[baseTo - 1].end);
        cursor = segments[baseTo - 1].end;
      }
      return;
    }
    if (baseTo > baseFrom) {
      output += storage.slice(cursor, segments[baseFrom].start);
      cursor = segments[baseTo - 1].end;
    }
    for (let local: number = localFrom; local < localTo; local++) {
      output += input.localStorage(local);
    }
  });
  return output + storage.slice(cursor);
}
