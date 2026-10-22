import { describe, expect, it } from 'vitest';
import samplePage from '../fixtures/sample-page.storage.xml?raw';
import { inertBody } from '../../src/convert/inert-markdown';
import { renderPage } from '../../src/convert/render-page';
import { parseStorage } from '../../src/convert/storage-parser';
import { segmentStorage } from '../../src/convert/storage-segments';
import { baseMarkdown } from '../../src/push/base-markdown';
import { noteBlocks } from '../../src/push/note-blocks';
import { resolveLinks } from '../../src/sync/links/link-resolver';
import type { StorageSegment } from '../../src/convert/storage-segments';
import type { LinkResolveOptions } from '../../src/sync/links/link-resolver';

const SITE: string = 'https://site.atlassian.net';
const USERS: Map<string, string> = new Map<string, string>([['5b10ac8d82e05b22cc7d4ef5', 'Ada Lovelace']]);
const LINKS: LinkResolveOptions = {
  spaceKey: 'DOCS',
  siteUrl: SITE,
  pagesByTitle: new Map<string, string>([['docs\nuser guide', 'DOCS/User guide.md']]),
  attachments: new Map<string, string>([['import-wizard.png', 'DOCS/_attachments/42/import-wizard.png']]),
  children: []
};

function slices(storage: string, segments: ReadonlyArray<StorageSegment>): Array<string> {
  return segments.map((segment: StorageSegment): string => storage.slice(segment.start, segment.end));
}

describe('segmentStorage', (): void => {
  it('records offsets that slice the source back to each block, through layouts', (): void => {
    const storage: string = '<p>one</p>\n<ac:layout><ac:layout-section ac:type="two_equal"><ac:layout-cell><h2>left</h2></ac:layout-cell>'
      + '<ac:layout-cell><p>right</p></ac:layout-cell></ac:layout-section></ac:layout><ac:structured-macro ac:name="toc"/>';
    const segments: Array<StorageSegment> = segmentStorage(parseStorage(storage));
    expect(slices(storage, segments)).toEqual(['<p>one</p>', '<h2>left</h2>', '<p>right</p>', '<ac:structured-macro ac:name="toc"/>']);
    expect(segments.map((segment: StorageSegment): string => segment.kind)).toEqual(['block', 'block', 'block', 'toc']);
  });

  it('groups inline nodes outside a paragraph, and tells writable macros from the rest', (): void => {
    const storage: string = 'loose <strong>text</strong><ac:structured-macro ac:name="jira"><ac:parameter ac:name="key">A-1</ac:parameter></ac:structured-macro>'
      + '<ac:structured-macro ac:name="code"><ac:plain-text-body><![CDATA[x]]></ac:plain-text-body></ac:structured-macro>';
    const segments: Array<StorageSegment> = segmentStorage(parseStorage(storage));
    expect(segments.map((segment: StorageSegment): string => segment.kind)).toEqual(['inline', 'macro', 'block']);
    expect(segments[1].macro).toBe('jira');
    expect(slices(storage, segments)[0]).toBe('loose <strong>text</strong>');
    expect(slices(storage, segments)[2]).toContain('<![CDATA[x]]>');
  });

  it('covers the whole sample page with segments in order', (): void => {
    const segments: Array<StorageSegment> = segmentStorage(parseStorage(samplePage));
    expect(segments.length).toBeGreaterThan(10);
    for (let i: number = 1; i < segments.length; i++) {
      expect(segments[i].start).toBeGreaterThanOrEqual(segments[i - 1].end);
    }
  });
});

describe('baseMarkdown', (): void => {
  it('joins back to exactly what the sync wrote for the sample page', (): void => {
    const expected: string = inertBody(resolveLinks(renderPage(samplePage, USERS, SITE), LINKS));
    const base = baseMarkdown(samplePage, USERS, LINKS);
    expect(base.body).toBe(expected);
  });

  it('aligns its non-empty segments one to one with the blocks of the note', (): void => {
    const expected: string = inertBody(resolveLinks(renderPage(samplePage, USERS, SITE), LINKS));
    const texts: Array<string> = baseMarkdown(samplePage, USERS, LINKS).segments
      .map((segment): string => segment.text)
      .filter((text: string): boolean => text.length > 0);
    expect(texts).toEqual(noteBlocks(expected).map((block): string => block.text));
  });
});
