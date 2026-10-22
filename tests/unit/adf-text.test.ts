import { describe, expect, it } from 'vitest';
import { adfLines } from '../../src/convert/adf-text';

function paragraph(...inline: Array<unknown>): unknown {
  return { type: 'paragraph', content: inline };
}

function text(value: string, marks: Array<unknown> = []): unknown {
  return { type: 'text', text: value, marks };
}

function doc(...content: Array<unknown>): unknown {
  return { version: 1, type: 'doc', content };
}

describe('adfLines', (): void => {
  it('makes one line per block and per hard break, keeping the text of marked runs', (): void => {
    const lines: Array<string> = adfLines(doc(
      paragraph(text('First ', [{ type: 'strong' }]), text('paragraph', [{ type: 'link', attrs: { href: 'https://x.y' } }])),
      paragraph(text('line one'), { type: 'hardBreak' }, text('line two')),
      paragraph(),
      { type: 'heading', attrs: { level: 2 }, content: [text('Heading')] },
      { type: 'rule' },
      { type: 'codeBlock', content: [text('a = 1')] }
    ));
    expect(lines).toEqual(['First paragraph', 'line one', 'line two', 'Heading', 'a = 1']);
  });

  it('marks list items and indents nested ones', (): void => {
    const lines: Array<string> = adfLines(doc(
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              paragraph(text('5 teams:')),
              paragraph(text('a second paragraph')),
              { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph(text('biocides'))] }] }
            ]
          },
          { type: 'listItem', content: [paragraph(text('reach'))] }
        ]
      },
      {
        type: 'orderedList',
        attrs: { order: 3 },
        content: [
          { type: 'listItem', content: [paragraph(text('third'))] },
          { type: 'listItem', content: [paragraph(text('fourth'))] }
        ]
      },
      {
        type: 'taskList',
        content: [
          { type: 'taskItem', attrs: { state: 'DONE' }, content: [text('done')] },
          { type: 'taskItem', attrs: { state: 'TODO' }, content: [text('open')] }
        ]
      }
    ));
    expect(lines).toEqual([
      '• 5 teams:',
      '  a second paragraph',
      '  • biocides',
      '• reach',
      '3. third',
      '4. fourth',
      '☑ done',
      '☐ open'
    ]);
  });

  it('shows what inline nodes stand for', (): void => {
    const lines: Array<string> = adfLines(doc(paragraph(
      { type: 'emoji', attrs: { shortName: ':question_mark:', text: '❓' } },
      text(' '),
      { type: 'emoji', attrs: { shortName: ':custom:' } },
      text(' '),
      { type: 'mention', attrs: { id: 'acc', text: '@Ada' } },
      text(' '),
      { type: 'inlineCard', attrs: { url: 'https://x.y/page' } },
      text(' '),
      { type: 'date', attrs: { timestamp: '1792454400000' } },
      text(' '),
      { type: 'status', attrs: { text: 'DONE', color: 'green' } },
      text(' '),
      { type: 'unknownInline', content: [text('kept')] }
    )));
    expect(lines).toEqual(['❓ :custom: @Ada https://x.y/page 2026-10-20 DONE kept']);
  });

  it('reads through containers and gives nothing for what is not a document', (): void => {
    expect(adfLines(doc({ type: 'panel', attrs: { panelType: 'info' }, content: [paragraph(text('inside'))] }))).toEqual(['inside']);
    expect(adfLines(doc({ type: 'mediaSingle', content: [{ type: 'media', attrs: { id: 'm', type: 'file', alt: 'diagram.png' } }] }))).toEqual(['diagram.png']);
    expect(adfLines(null)).toEqual([]);
    expect(adfLines('text')).toEqual([]);
    expect(adfLines({ type: 'doc' })).toEqual([]);
  });
});
