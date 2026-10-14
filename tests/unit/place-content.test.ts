import { describe, expect, it } from 'vitest';
import { placeContent } from '../../src/sync/placement/place-content';
import type { ContentNode, ContentType } from '../../src/confluence/types/content-node.type';
import type { ContentPlacement, PlacedContent, PlacementOptions } from '../../src/sync/placement/placement.type';

function node(id: string, title: string, parentId: string, type: ContentType = 'page'): ContentNode {
  return { id, title, parentId, type, parentType: '', version: 1, webUrl: '' };
}

const NODES: Array<ContentNode> = [
  node('h', 'Home', ''),
  node('p', 'Policies', 'h'),
  node('p1', 'POL-01', 'p'),
  node('l', 'Legal', 'h'),
  node('a', 'Archive', 'h', 'folder'),
  node('o', 'Old', 'a'),
  node('d', 'DB', 'h', 'database'),
  node('x', 'Lost', 'missing')
];

function options(overrides: Partial<PlacementOptions> = {}): PlacementOptions {
  return {
    rootFolder: 'ISO',
    spaceKey: 'ISO',
    homepageId: 'h',
    reservedNames: new Map<string, ReadonlySet<string>>(),
    maxPathLength: 0,
    ...overrides
  };
}

function pathOf(placement: ContentPlacement, id: string): string {
  const placed: PlacedContent | undefined = placement.byId.get(id);
  if (!placed) {
    throw new Error(`not placed: ${id}`);
  }
  return placed.notePath;
}

describe('placeContent', (): void => {
  it('lays the tree out by title, with folder notes for parents', (): void => {
    const placement: ContentPlacement = placeContent(NODES, options());
    expect(pathOf(placement, 'h')).toBe('ISO/Home.md');
    expect(pathOf(placement, 'p')).toBe('ISO/Policies/Policies.md');
    expect(placement.byId.get('p')?.isFolderNote).toBe(true);
    expect(pathOf(placement, 'p1')).toBe('ISO/Policies/POL-01.md');
    expect(pathOf(placement, 'l')).toBe('ISO/Legal.md');
    expect(placement.byId.get('a')?.notePath).toBe('');
    expect(placement.byId.get('a')?.folderPath).toBe('ISO/Archive');
    expect(pathOf(placement, 'o')).toBe('ISO/Archive/Old.md');
    expect(pathOf(placement, 'd')).toBe('ISO/DB.md');
  });

  it('puts content with an unknown parent at the root', (): void => {
    const placement: ContentPlacement = placeContent(NODES, options());
    expect(pathOf(placement, 'x')).toBe('ISO/Lost.md');
  });

  it('records every folder the placement needs', (): void => {
    const placement: ContentPlacement = placeContent(NODES, options());
    expect([...placement.folders].sort()).toEqual(['ISO', 'ISO/Archive', 'ISO/Policies']);
  });

  it('lists children by the nearest ancestor that has a note', (): void => {
    const placement: ContentPlacement = placeContent(NODES, options());
    const home: ReadonlyArray<string> = (placement.childrenById.get('h') ?? []).map((child): string => child.title);
    expect(home).toEqual(['DB', 'Legal', 'Old', 'Policies']);
    expect((placement.childrenById.get('p') ?? []).map((child): string => child.notePath)).toEqual(['ISO/Policies/POL-01.md']);
  });

  it('maps titles to note paths for link resolution', (): void => {
    const placement: ContentPlacement = placeContent(NODES, options());
    expect(placement.byTitle.get('iso\npol-01')).toBe('ISO/Policies/POL-01.md');
  });

  it('never takes a name the user already uses', (): void => {
    const reserved: Map<string, ReadonlySet<string>> = new Map<string, ReadonlySet<string>>([['ISO', new Set<string>(['legal'])]]);
    const placement: ContentPlacement = placeContent(NODES, options({ reservedNames: reserved }));
    expect(pathOf(placement, 'l')).toBe('ISO/Legal (2).md');
  });

  it('never names a page after the attachments folder', (): void => {
    const clash: Array<ContentNode> = [node('h', 'Home', ''), node('z', '_attachments', 'h')];
    expect(pathOf(placeContent(clash, options()), 'z')).toBe('ISO/_attachments (2).md');
  });

  it('gives duplicate titles a stable suffix in id order', (): void => {
    const twins: Array<ContentNode> = [node('h', 'Home', ''), node('b', 'Same', 'h'), node('a', 'Same', 'h')];
    const placement: ContentPlacement = placeContent(twins, options());
    expect(pathOf(placement, 'a')).toBe('ISO/Same.md');
    expect(pathOf(placement, 'b')).toBe('ISO/Same (2).md');
  });

  it('sanitizes titles and falls back when nothing is left', (): void => {
    const odd: Array<ContentNode> = [node('h', 'Home', ''), node('q', 'A: B/C?', 'h'), node('e', '???', 'h')];
    const placement: ContentPlacement = placeContent(odd, options());
    expect(pathOf(placement, 'q')).toBe('ISO/A BC.md');
    expect(pathOf(placement, 'e')).toBe('ISO/Page e.md');
  });

  it('shortens names that would exceed the path budget', (): void => {
    const deep: Array<ContentNode> = [node('h', 'Home', ''), node('t', 'A very long title that goes on and on and on for a while', 'h')];
    const placement: ContentPlacement = placeContent(deep, options({ maxPathLength: 40 }));
    expect(pathOf(placement, 't').length).toBeLessThanOrEqual(40);
    expect(placement.warnings).toEqual([]);
  });

  it('warns when even the shortest name does not fit', (): void => {
    const deep: Array<ContentNode> = [node('h', 'Home', ''), node('t', 'A very long title that goes on and on and on for a while', 'h')];
    const placement: ContentPlacement = placeContent(deep, options({ maxPathLength: 20 }));
    expect(placement.warnings.length).toBe(1);
  });
});
