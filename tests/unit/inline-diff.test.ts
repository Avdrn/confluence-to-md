import { describe, expect, it } from 'vitest';
import { mergeChange } from '../../src/push/inline-diff';
import type { MergedBlock } from '../../src/push/inline-diff';

describe('mergeChange', (): void => {
  it('strikes removed words and highlights new ones in one block', (): void => {
    const merged: MergedBlock = mergeChange('The quick brown fox jumps.', 'The quick red fox leaps over it.');
    expect(merged.merged).toBe(true);
    expect(merged.markdown).toBe('The quick ~~brown~~==red== fox ~~jumps~~==leaps over it==.');
  });

  it('keeps list and heading markers outside the marks', (): void => {
    expect(mergeChange('- first item\n- second item', '- first item\n- second entry').markdown).toBe('- first item\n- second ~~item~~==entry==');
    expect(mergeChange('## Old title', '## New title').markdown).toBe('## ~~Old~~==New== title');
    expect(mergeChange('> [!INFO]\n> old text', '> [!INFO]\n> new text').markdown).toBe('> [!INFO]\n> ~~old~~==new== text');
  });

  it('falls back to the plain new text when a mark would break a link', (): void => {
    const merged: MergedBlock = mergeChange('See [[DOCS/Guide|the guide]].', 'See [[DOCS/Setup|the guide]].');
    expect(merged.merged).toBe(false);
    expect(merged.markdown).toBe('See [[DOCS/Setup|the guide]].');
  });

  it('does not merge code blocks, tables, or blocks of different kinds', (): void => {
    expect(mergeChange('```\na\n```', '```\nb\n```').merged).toBe(false);
    expect(mergeChange('| a |\n| --- |\n| b |', '| a |\n| --- |\n| c |').merged).toBe(false);
    expect(mergeChange('# Heading', 'Paragraph').merged).toBe(false);
    expect(mergeChange('', 'New paragraph')).toEqual({ markdown: 'New paragraph', merged: false });
  });
});
