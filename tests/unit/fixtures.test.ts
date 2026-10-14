import { describe, expect, it } from 'vitest';
import samplePage from '../fixtures/sample-page.storage.xml?raw';
import { renderPage } from '../../src/convert/render-page';
import { resolveLinks } from '../../src/sync/links/link-resolver';

const SITE: string = 'https://site.atlassian.net';

function renderFixture(storage: string): string {
  const rendered: string = renderPage(storage, new Map<string, string>([['5b10ac8d82e05b22cc7d4ef5', 'Ada Lovelace']]), SITE);
  return resolveLinks(rendered, {
    spaceKey: 'DOCS',
    siteUrl: SITE,
    pagesByTitle: new Map<string, string>([['docs\nuser guide', 'DOCS/User guide.md']]),
    attachments: new Map<string, string>([['import-wizard.png', 'DOCS/_attachments/42/import-wizard.png']]),
    children: []
  });
}

describe('sample page fixture', (): void => {
  const markdown: string = renderFixture(samplePage);

  it('leaks no markup or placeholders', (): void => {
    expect(markdown).not.toMatch(/<\/?(ac|ri):/);
    expect(markdown).not.toContain('[[confluence-');
    expect(markdown).not.toContain('<!--confluence-');
  });

  it('keeps every table row on one line', (): void => {
    const rows: Array<string> = markdown.split('\n').filter((line: string): boolean => line.startsWith('|'));
    expect(rows.length).toBe(4);
    expect(rows[2]).toContain('- Search by first name works again<br>- Counter shows the right number');
    expect(rows[3]).toContain('Import \\| export');
    expect(rows[3]).toContain(`[WM-102](${SITE}/browse/WM-102)`);
  });

  it('resolves links, mentions and attachments', (): void => {
    expect(markdown).toContain('- [x] Update the [[DOCS/User guide|user guide]]');
    expect(markdown).toContain('- [ ] Record the demo video, owner @Ada Lovelace');
    expect(markdown).toContain('![[DOCS/_attachments/42/import-wizard.png]]\n_The new import wizard, step 2 of 3_');
    expect(markdown).toContain(`[Support](${SITE}/wiki/spaces/HELP/pages?title=Support)`);
    expect(markdown).toContain('[online documentation](https://example.com/widgets/docs)');
  });

  it('matches the committed rendering', async (): Promise<void> => {
    await expect(markdown).toMatchFileSnapshot('../fixtures/sample-page.expected.md');
  });
});
