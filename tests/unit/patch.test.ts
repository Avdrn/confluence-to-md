import { describe, expect, it } from 'vitest';
import { parseStorage } from '../../src/convert/storage-parser';
import { segmentStorage } from '../../src/convert/storage-segments';
import { diffBlocks } from '../../src/push/block-diff';
import { patchStorage } from '../../src/push/patch';
import type { StorageSegment } from '../../src/convert/storage-segments';
import type { BlockChange } from '../../src/push/block-diff';

const JIRA: string = '<ac:structured-macro ac:name="jira" ac:macro-id="77"><ac:parameter ac:name="key">A-1</ac:parameter></ac:structured-macro>';
const STORAGE: string = `<p>one</p>${JIRA}\n<p>three</p>`;
const BASE: Array<string> = ['one', 'A-1', 'three'];

function patch(local: Array<string>, sends: (change: BlockChange) => boolean = (): boolean => true): string {
  const segments: Array<StorageSegment> = segmentStorage(parseStorage(STORAGE));
  return patchStorage({
    storage: STORAGE,
    segments,
    changes: diffBlocks(BASE, local),
    localStorage: (index: number): string => `<p>${local[index]}</p>`,
    sends
  });
}

describe('patchStorage', (): void => {
  it('keeps unchanged segments byte for byte and replaces a changed one in place', (): void => {
    expect(patch(['one', 'A-1', 'THREE'])).toBe(`<p>one</p>${JIRA}\n<p>THREE</p>`);
  });

  it('inserts an added block after the segment before it, and drops a removed one', (): void => {
    expect(patch(['one', 'new', 'A-1'])).toBe(`<p>one</p><p>new</p>${JIRA}\n`);
    expect(patch(['first', 'one', 'A-1', 'three'])).toBe(`<p>first</p><p>one</p>${JIRA}\n<p>three</p>`);
  });

  it('leaves a change that is held back as it was', (): void => {
    expect(patch(['ONE', 'A-1', 'THREE'], (change: BlockChange): boolean => change.local[0] === 0)).toBe(`<p>ONE</p>${JIRA}\n<p>three</p>`);
  });

  it('returns the original when nothing changed', (): void => {
    expect(patch(['one', 'A-1', 'three'])).toBe(STORAGE);
  });
});
