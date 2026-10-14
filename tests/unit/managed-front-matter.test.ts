import { describe, expect, it } from 'vitest';
import { readManagedFrontMatter, readSpaceKey, serializeFrontMatter } from '../../src/sync/front-matter/managed-front-matter';
import type { ManagedFrontMatter, ManagedFrontMatterFields } from '../../src/sync/front-matter/managed-front-matter';

function fields(overrides: Partial<ManagedFrontMatter> = {}): ManagedFrontMatter {
  return {
    pageId: '123',
    spaceKey: 'ISO',
    title: 'POL-01: "Quoted" title',
    version: 4,
    hash: 'abc',
    converter: 1,
    url: 'https://site/wiki/spaces/ISO/pages/123',
    parentId: '9',
    type: 'page',
    fileStem: 'POL-01 Quoted title',
    ...overrides
  };
}

describe('serializeFrontMatter', (): void => {
  it('quotes ids and titles and writes numbers bare', (): void => {
    const text: string = serializeFrontMatter(fields());
    expect(text).toContain('confluence-page-id: "123"\n');
    expect(text).toContain('confluence-title: "POL-01: \\"Quoted\\" title"\n');
    expect(text).toContain('confluence-version: 4\n');
    expect(text).toContain('confluence-converter: 1\n');
    expect(text.startsWith('---\n')).toBe(true);
    expect(text.endsWith('---\n\n')).toBe(true);
  });

  it('adds an alias when the file name differs from the title', (): void => {
    expect(serializeFrontMatter(fields())).toContain('aliases:\n  - "POL-01: \\"Quoted\\" title"\n');
    expect(serializeFrontMatter(fields({ title: 'Same', fileStem: 'Same' }))).not.toContain('aliases');
  });

  it('records the content type only when it is not a page', (): void => {
    expect(serializeFrontMatter(fields())).not.toContain('confluence-type');
    expect(serializeFrontMatter(fields({ type: 'database' }))).toContain('confluence-type: "database"\n');
  });
});

describe('readManagedFrontMatter', (): void => {
  it('reads the managed fields and coerces types', (): void => {
    const read: ManagedFrontMatterFields | null = readManagedFrontMatter({
      'confluence-page-id': 123,
      'confluence-space': 'ISO',
      'confluence-title': 'T',
      'confluence-version': '4',
      'confluence-hash': 'abc',
      'confluence-converter': 1
    });
    expect(read).toEqual({ pageId: '123', spaceKey: 'ISO', title: 'T', version: 4, hash: 'abc', converter: 1 });
  });

  it('returns null for notes without a page id', (): void => {
    expect(readManagedFrontMatter({ tags: ['x'] })).toBeNull();
    expect(readManagedFrontMatter(undefined)).toBeNull();
  });
});

describe('readSpaceKey', (): void => {
  it('finds the key on a marker note and ignores synced notes', (): void => {
    expect(readSpaceKey({ 'confluence-space': ' ISO ' })).toBe('ISO');
    expect(readSpaceKey({ 'confluence-space': 'ISO', 'confluence-page-id': '1' })).toBe('');
    expect(readSpaceKey(null)).toBe('');
  });
});
