import { describe, expect, it } from 'vitest';
import { collectDatabaseAccountIds, renderDatabase } from '../../src/sync/database/render-database';
import type { DatabaseRenderInput, LinkedNote } from '../../src/sync/database/render-database';
import type {
  V2DatabaseEntry,
  V2DatabaseField,
  V2DatabaseFieldSettings,
  V2DatabaseFieldValue
} from '../../src/confluence/types/confluence-api.type';

const SITE: string = 'https://site.atlassian.net';
const DATABASE_ID: string = '42';

function field(id: string, name: string, type: string, settings: V2DatabaseFieldSettings = {}): V2DatabaseField {
  return { id, name, type, settings };
}

function entry(id: string, values: Record<string, V2DatabaseFieldValue>): V2DatabaseEntry {
  return { id, databaseId: DATABASE_ID, values };
}

function text(plain: string | null): V2DatabaseFieldValue {
  return { type: 'text', plain };
}

function render(
  fields: Array<V2DatabaseField>,
  entries: Array<V2DatabaseEntry>,
  extra: Partial<DatabaseRenderInput> = {}
): string {
  return renderDatabase({
    databaseId: DATABASE_ID,
    fields,
    entries,
    users: new Map<string, string>(),
    notesById: new Map<string, LinkedNote>(),
    siteUrl: SITE,
    ...extra
  });
}

describe('renderDatabase', (): void => {
  it('renders one column per field in Confluence order and one row per entry', (): void => {
    const fields: Array<V2DatabaseField> = [field('c', 'Customer', 'text'), field('s', 'Status', 'select', { options: [] })];
    const entries: Array<V2DatabaseEntry> = [
      entry('e1', { c: text('Roche'), s: { type: 'select', value: [{ id: 'o1', label: 'On hold' }] } }),
      entry('e2', { c: text('LANXESS'), s: { type: 'select', value: null } })
    ];
    expect(render(fields, entries)).toBe([
      '| Customer | Status |',
      '| --- | --- |',
      '| Roche | On hold |',
      '| LANXESS |   |'
    ].join('\n'));
  });

  it('keeps pipes, line breaks and tag openers from breaking the table', (): void => {
    const fields: Array<V2DatabaseField> = [field('t', 'Owner | Lead', 'text')];
    const entries: Array<V2DatabaseEntry> = [entry('e1', { t: text('a | b\r\nsecond <line>\n\n') })];
    expect(render(fields, entries)).toBe([
      '| Owner \\| Lead |',
      '| --- |',
      '| a \\| b<br>second &lt;line> |'
    ].join('\n'));
  });

  it('keeps the paragraphs and list items of rich text apart', (): void => {
    const rich: unknown = {
      version: 1,
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'BPR Scope', marks: [{ type: 'strong' }] }] },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: '5 teams:' }] },
                { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'biocides' }] }] }] }
              ]
            },
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'open for ' }, { type: 'emoji', attrs: { shortName: ':question_mark:', text: '❓' } }] }]
            }
          ]
        }
      ]
    };
    const fields: Array<V2DatabaseField> = [field('t', 'Notes', 'text', { richText: true }), field('l', 'Link', 'entryLink')];
    const entries: Array<V2DatabaseEntry> = [
      entry('e1', { t: { type: 'text', plain: 'BPR Scope5 teams:biocidesopen for ❓', rich }, l: { type: 'entryLink', value: null } }),
      entry('e2', { t: text('Second'), l: { type: 'entryLink', value: [{ entryId: 'e1' }] } })
    ];
    const lines: Array<string> = render(fields, entries).split('\n');
    expect(lines[2]).toBe('| BPR Scope<br>• 5 teams:<br>  • biocides<br>• open for ❓ |   |');
    expect(lines[3]).toBe('| Second | BPR Scope<br>• 5 teams:<br>  • biocides<br>• open for ❓ |');
  });

  it('shows every value type as the text a reader expects', (): void => {
    const fields: Array<V2DatabaseField> = [
      field('u', 'Owner', 'user'),
      field('s', 'Tags', 'select'),
      field('n', 'Budget', 'number', { format: { type: 'currency', prefix: '€' } }),
      field('p', 'Share', 'number', { format: { type: 'percent', suffix: '%' } }),
      field('d', 'Due', 'date', { includesTime: false }),
      field('dt', 'Saved', 'date', { includesTime: true }),
      field('dz', 'Met', 'date', { includesTime: true }),
      field('cb', 'Done', 'checkbox'),
      field('cb2', 'Signed', 'checkbox'),
      field('h', 'Deal', 'hyperlink'),
      field('h2', 'Doc', 'hyperlink'),
      field('j', 'Ticket', 'jiraIssue'),
      field('a', 'Files', 'attachment'),
      field('a1', 'Scan', 'attachment'),
      field('r', 'Rating', 'rating')
    ];
    const entries: Array<V2DatabaseEntry> = [entry('e1', {
      u: { type: 'user', value: [{ accountId: 'acc1' }, { accountId: 'acc2' }] },
      s: { type: 'select', value: [{ id: '1', label: 'A' }, { id: '2', label: 'B' }] },
      n: { type: 'number', value: '1500' },
      p: { type: 'number', value: '12' },
      d: { type: 'date', value: '2026-10-23' },
      dt: { type: 'date', value: '2026-10-13T14:12:17.374Z' },
      dz: { type: 'date', value: '2026-10-13T09:05+02:00' },
      cb: { type: 'checkbox', value: true },
      cb2: { type: 'checkbox', value: null },
      h: { type: 'hyperlink', value: [{ url: 'https://x.y/deal', label: 'Deal' }] },
      h2: { type: 'hyperlink', value: [{ url: 'https://x.y/a b(c)' }] },
      j: { type: 'jiraIssue', value: [{ key: 'ABC-1' }] },
      a: { type: 'attachment', value: [{ mediaId: 'm1' }, { mediaId: 'm2' }] },
      a1: { type: 'attachment', value: [{ mediaId: 'm3' }] },
      r: { type: 'rating', value: 4 }
    })];
    const users: Map<string, string> = new Map<string, string>([['acc1', 'Ada Lovelace']]);
    const lines: Array<string> = render(fields, entries, { users }).split('\n');
    expect(lines[2]).toBe([
      '| Ada Lovelace, acc2',
      'A, B',
      '€1500',
      '12%',
      '2026-10-23',
      '2026-10-13 14:12 UTC',
      '2026-10-13 09:05 +02:00',
      'Yes',
      'No',
      '[Deal](https://x.y/deal)',
      '<https://x.y/a%20b%28c%29>',
      `[ABC-1](${SITE}/browse/ABC-1)`,
      '_[2 attachments]_',
      '_[1 attachment]_',
      '4 |'
    ].join(' | '));
  });

  it('links pages and other databases to their notes, and anything unplaced to Confluence', (): void => {
    const notesById: Map<string, LinkedNote> = new Map<string, LinkedNote>([
      ['100', { notePath: 'ISO/Home.md', title: 'Home' }],
      ['555', { notePath: 'ISO/Leads.md', title: 'RM | Leads' }]
    ]);
    const fields: Array<V2DatabaseField> = [field('p', 'Page', 'pageLink'), field('x', 'Lead', 'entryLink')];
    const entries: Array<V2DatabaseEntry> = [entry('e1', {
      p: { type: 'pageLink', value: [{ contentId: '100' }, { contentId: '200' }] },
      x: { type: 'entryLink', value: [{ entryId: 'z', databaseContentId: '555' }, { entryId: 'q', databaseContentId: '777' }] }
    })];
    const lines: Array<string> = render(fields, entries, { notesById }).split('\n');
    expect(lines[2]).toBe(
      `| [[ISO/Home]], [page 200](${SITE}/wiki/pages/viewpage.action?pageId=200) | [[ISO/Leads\\|RM / Leads]], entry in database 777 |`
    );
  });

  it('names a linked row of the same database by its first text column', (): void => {
    const fields: Array<V2DatabaseField> = [field('n', 'Name', 'text'), field('l', 'Parent', 'entryLink')];
    const entries: Array<V2DatabaseEntry> = [
      entry('e1', { n: text('Roche'), l: { type: 'entryLink', value: [{ entryId: 'e2' }] } }),
      entry('e2', { n: text('LANXESS'), l: { type: 'entryLink', value: [{ entryId: 'nope', databaseContentId: DATABASE_ID }] } })
    ];
    const lines: Array<string> = render(fields, entries).split('\n');
    expect(lines[2]).toBe('| Roche | LANXESS |');
    expect(lines[3]).toBe('| LANXESS | entry nope |');
  });

  it('leaves out the columns the API never fills and says which', (): void => {
    const fields: Array<V2DatabaseField> = [
      field('n', 'Name', 'text'),
      field('b', 'Backlinks', 'backlink'),
      field('s', 'Page status', 'pageStatus')
    ];
    const entries: Array<V2DatabaseEntry> = [entry('e1', {
      n: text('Roche'),
      b: { type: 'backlink', value: null },
      s: { type: 'pageStatus', value: null }
    })];
    expect(render(fields, entries)).toBe([
      '| Name |',
      '| --- |',
      '| Roche |',
      '',
      '_Columns the Confluence API does not return: Backlinks, Page status._'
    ].join('\n'));
  });

  it('says when there are no entries or no fields', (): void => {
    expect(render([field('n', 'Name', 'text')], [])).toBe('| Name |\n| --- |\n\n_No entries._');
    expect(render([], [])).toBe('_This database has no fields._');
  });
});

describe('collectDatabaseAccountIds', (): void => {
  it('collects the ids of user fields only', (): void => {
    const entries: Array<V2DatabaseEntry> = [
      entry('e1', {
        u: { type: 'user', value: [{ accountId: 'a' }, { accountId: 'b' }] },
        t: text('not a user')
      }),
      entry('e2', { u: { type: 'user', value: null }, v: { type: 'user', value: [{ accountId: 'a' }] } })
    ];
    expect([...collectDatabaseAccountIds(entries)].sort()).toEqual(['a', 'b']);
  });
});
