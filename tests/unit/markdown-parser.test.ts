import { describe, expect, it } from 'vitest';
import samplePage from '../fixtures/sample-page.expected.md?raw';
import { parseBlocks } from '../../src/push/markdown/block-parser';
import { parseInlines, plainText } from '../../src/push/markdown/inline-parser';
import { writeMarkdown } from '../../src/push/markdown/markdown-writer';
import type { MdBlock, MdCallout, MdInline, MdList, MdTable } from '../../src/push/markdown/markdown-ast';

function kinds(blocks: ReadonlyArray<MdBlock>): Array<string> {
  return blocks.map((block: MdBlock): string => block.kind);
}

function text(value: string): MdInline {
  return { kind: 'text', text: value };
}

describe('parseInlines', (): void => {
  it('reads emphasis, code spans and escapes', (): void => {
    expect(parseInlines('a **b *c* d** `e\\f` ~~g~~ ==h== \\*i\\* j\\`k')).toEqual([
      text('a '),
      { kind: 'strong', inlines: [text('b '), { kind: 'em', inlines: [text('c')] }, text(' d')] },
      text(' '),
      { kind: 'code', text: 'e\\f' },
      text(' '),
      { kind: 'strike', inlines: [text('g')] },
      text(' '),
      { kind: 'highlight', inlines: [text('h')] },
      text(' *i* j`k')
    ]);
  });

  it('reads links, images, wikilinks, embeds, autolinks and breaks', (): void => {
    const source: string = '[t](https://x.y/a(b)) ![alt](img.png) [[DOCS/Guide#Setup|guide]] ![[DOCS/_attachments/1/p.png]] <https://z> a<br>b';
    expect(parseInlines(source)).toEqual([
      { kind: 'link', href: 'https://x.y/a(b)', inlines: [text('t')] },
      text(' '),
      { kind: 'image', alt: 'alt', src: 'img.png' },
      text(' '),
      { kind: 'wikilink', target: 'DOCS/Guide', anchor: 'Setup', alias: 'guide' },
      text(' '),
      { kind: 'embed', target: 'DOCS/_attachments/1/p.png', alias: '' },
      text(' '),
      { kind: 'autolink', href: 'https://z' },
      text(' a'),
      { kind: 'break' },
      text('b')
    ]);
  });

  it('decodes entities, drops comments and keeps a bare < as text', (): void => {
    expect(plainText(parseInlines('a &lt; b < c &amp; <!-- gone --> d'))).toBe('a < b < c &  d');
  });

  it('reads an escaped pipe inside a wikilink as the alias separator', (): void => {
    expect(parseInlines('[[DOCS/A\\|b]]')).toEqual([{ kind: 'wikilink', target: 'DOCS/A', anchor: '', alias: 'b' }]);
  });

  it('leaves unmatched delimiters as text', (): void => {
    expect(plainText(parseInlines('2 * 3 * 4 and snake_case_name'))).toBe('2 * 3 * 4 and snake_case_name');
  });
});

describe('parseBlocks', (): void => {
  const body: string = [
    '# Title', '', 'Para one', 'line two', '', '---', '', '> quoted', '', '> [!INFO]- Open me', '> inside', '',
    '- a', '\t- b', '- [x] done', '', '1. one', '2. two', '', '```bash', 'echo `x`', '```', '',
    '| h1 | h2 |', '| --- | --- |', '| a \\| b | [[X\\|y]] |', '', '<!-- note -->'
  ].join('\n');
  const blocks: Array<MdBlock> = parseBlocks(body);

  it('reads every block kind in order', (): void => {
    expect(kinds(blocks)).toEqual(['heading', 'paragraph', 'rule', 'quote', 'callout', 'list', 'list', 'fence', 'table', 'comment']);
  });

  it('reads a callout with its fold and title, and records the lines each block spans', (): void => {
    const callout: MdCallout = blocks[4] as MdCallout;
    expect(callout.type).toBe('INFO');
    expect(callout.folded).toBe(true);
    expect(plainText(callout.title)).toBe('Open me');
    expect(kinds(callout.blocks)).toEqual(['paragraph']);
    expect([callout.from, callout.to]).toEqual([9, 10]);
    expect([blocks[1].from, blocks[1].to]).toEqual([2, 3]);
  });

  it('nests a tab-indented item and reads task marks', (): void => {
    const list: MdList = blocks[5] as MdList;
    expect(list.ordered).toBe(false);
    expect(list.items.map((item): string => item.task)).toEqual(['none', 'done']);
    expect(kinds(list.items[0].blocks)).toEqual(['paragraph', 'list']);
    expect((blocks[6] as MdList).ordered).toBe(true);
  });

  it('splits table cells on unescaped pipes only', (): void => {
    const table: MdTable = blocks[8] as MdTable;
    expect(table.header.map(plainText)).toEqual(['h1', 'h2']);
    expect(plainText(table.rows[0][0])).toBe('a | b');
    expect(table.rows[0][1]).toEqual([{ kind: 'wikilink', target: 'X', anchor: '', alias: 'y' }]);
  });

  it('lets a bullet interrupt a paragraph but not a year', (): void => {
    expect(kinds(parseBlocks('text\n- item'))).toEqual(['paragraph', 'list']);
    expect(kinds(parseBlocks('text\n2024. was a year'))).toEqual(['paragraph']);
  });
});

describe('the fixture the renderer wrote', (): void => {
  const blocks: Array<MdBlock> = parseBlocks(samplePage);

  it('is read as the renderer meant it', (): void => {
    expect(kinds(blocks)).toEqual([
      'list', 'heading', 'callout', 'paragraph', 'heading', 'paragraph', 'paragraph', 'paragraph', 'list', 'paragraph',
      'heading', 'heading', 'list', 'heading', 'table', 'heading', 'list', 'callout', 'heading', 'paragraph', 'paragraph'
    ]);
    const tasks: MdList = blocks[16] as MdList;
    expect(tasks.items.map((item): string => item.task)).toEqual(['done', 'open']);
    const upgrade: MdCallout = blocks[17] as MdCallout;
    expect(upgrade.folded).toBe(true);
    expect(kinds(upgrade.blocks)).toEqual(['list', 'fence']);
    expect((blocks[14] as MdTable).rows.length).toBe(2);
  });

  it('writes back what it read, and reading that again changes nothing', (): void => {
    const once: string = writeMarkdown(blocks);
    expect(writeMarkdown(parseBlocks(once))).toBe(once);
    expect(once).toContain('- [x] Update the [[DOCS/User guide|user guide]]');
    expect(once).toContain('| Import \\| export | Empty rows are skipped<br>Dates in `YYYY-MM-DD` form are accepted |');
    expect(once).toContain('> [!NOTE]- Upgrade steps');
  });
});
