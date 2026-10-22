import { describe, expect, it } from 'vitest';
import { diffBlocks, normaliseBlock } from '../../src/push/block-diff';
import type { BlockChange } from '../../src/push/block-diff';

function kinds(changes: ReadonlyArray<BlockChange>): Array<string> {
  return changes.map((change: BlockChange): string => change.kind);
}

describe('diffBlocks', (): void => {
  it('pairs a removed run with the addition that follows it as changes', (): void => {
    expect(diffBlocks(['a', 'b', 'c', 'd'], ['a', 'B', 'c', 'e', 'f'])).toEqual([
      { kind: 'equal', base: [0, 1], local: [0, 1] },
      { kind: 'changed', base: [1, 2], local: [1, 2] },
      { kind: 'equal', base: [2, 3], local: [2, 3] },
      { kind: 'changed', base: [3, 4], local: [3, 4] },
      { kind: 'added', base: [4, 4], local: [4, 5] }
    ]);
  });

  it('reports removals and additions on their own', (): void => {
    expect(diffBlocks(['a', 'b'], ['a'])).toEqual([
      { kind: 'equal', base: [0, 1], local: [0, 1] },
      { kind: 'removed', base: [1, 2], local: [1, 1] }
    ]);
    expect(diffBlocks(['a'], ['x', 'a'])).toEqual([
      { kind: 'added', base: [0, 0], local: [0, 1] },
      { kind: 'equal', base: [0, 1], local: [1, 2] }
    ]);
    expect(diffBlocks(['a', 'b', 'c'], ['a', 'X', 'Y', 'Z'])).toEqual([
      { kind: 'equal', base: [0, 1], local: [0, 1] },
      { kind: 'changed', base: [1, 3], local: [1, 3] },
      { kind: 'added', base: [3, 3], local: [3, 4] }
    ]);
  });

  it('forgives numbering, bullets, emphasis markers, padding and zero-width spaces', (): void => {
    const base: Array<string> = ['1. a\n2. b', '* x', '__b__ _i_', '| a | b |\n|---|---|\n|c|d|', 'see <\u200b% x'];
    const local: Array<string> = ['1. a\n1. b', '- x', '**b** *i*', '| a |  b |\n| --- | --- |\n| c | d |', 'see <% x'];
    expect(kinds(diffBlocks(base, local))).toEqual(['equal']);
  });

  it('does not forgive words', (): void => {
    expect(normaliseBlock('Hello world')).not.toBe(normaliseBlock('Hello there'));
  });
});
