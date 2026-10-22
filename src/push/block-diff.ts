/**
 * Which blocks of a note changed since the sync wrote it, decided by jsdiff
 * over the two block lists. Blocks are compared after a normalisation that
 * forgives what Obsidian and the renderer write differently for the same
 * thing: list numbering, bullet characters, emphasis markers, padding.
 */

import { diffArrays } from 'diff';
import type { ArrayChange } from 'diff';

export type ChangeKind = 'equal' | 'changed' | 'added' | 'removed';

/** One run of the diff; `base` and `local` are index ranges, end exclusive, empty where the side has nothing. */
export interface BlockChange {
  kind: ChangeKind;
  base: [number, number];
  local: [number, number];
}

const ZERO_WIDTH_SPACE: RegExp = /\u200b/g;

export function diffBlocks(base: ReadonlyArray<string>, local: ReadonlyArray<string>): Array<BlockChange> {
  const parts: Array<ArrayChange<string>> = diffArrays(base.map(normaliseBlock), local.map(normaliseBlock));
  const changes: Array<BlockChange> = new Array<BlockChange>();
  let baseIndex: number = 0;
  let localIndex: number = 0;
  let pendingRemoved: number = 0;
  const flushRemoved = (): void => {
    if (pendingRemoved > 0) {
      changes.push({ kind: 'removed', base: [baseIndex - pendingRemoved, baseIndex], local: [localIndex, localIndex] });
      pendingRemoved = 0;
    }
  };
  for (const part of parts) {
    const count: number = part.value.length;
    if (part.removed) {
      baseIndex += count;
      pendingRemoved += count;
      continue;
    }
    if (part.added) {
      // A removal right before an addition is a change, block for block.
      const paired: number = Math.min(pendingRemoved, count);
      if (paired > 0) {
        const removedStart: number = baseIndex - pendingRemoved;
        changes.push({ kind: 'changed', base: [removedStart, removedStart + paired], local: [localIndex, localIndex + paired] });
        pendingRemoved -= paired;
        if (pendingRemoved > 0) {
          changes.push({ kind: 'removed', base: [removedStart + paired, baseIndex], local: [localIndex + paired, localIndex + paired] });
          pendingRemoved = 0;
        }
      }
      if (count > paired) {
        changes.push({ kind: 'added', base: [baseIndex, baseIndex], local: [localIndex + paired, localIndex + count] });
      }
      localIndex += count;
      continue;
    }
    flushRemoved();
    changes.push({ kind: 'equal', base: [baseIndex, baseIndex + count], local: [localIndex, localIndex + count] });
    baseIndex += count;
    localIndex += count;
  }
  flushRemoved();
  return changes;
}

/** The form two blocks are compared in. Not what is written anywhere. */
export function normaliseBlock(text: string): string {
  return text
    .replace(ZERO_WIDTH_SPACE, '')
    .split('\n')
    .map((line: string): string => line
      .replace(/\s+$/, '')
      .replace(/^(\s*)\d+\.\s/, '$11. ')
      .replace(/^(\s*)[*+]\s/, '$1- ')
      .replace(/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/, '| --- |')
      .replace(/\s*\|\s*/g, ' | ')
      .trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/__([^_\n]+)__/g, '**$1**')
    .replace(/(^|[^\w*_])_([^_\n]+)_(?=[^\w*_]|$)/g, '$1*$2*')
    .trim();
}
