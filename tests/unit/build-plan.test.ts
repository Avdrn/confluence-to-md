import { describe, expect, it } from 'vitest';
import { buildPlan } from '../../src/sync/plan/build-plan';
import type { LocalNoteState, PlanInputs } from '../../src/sync/plan/build-plan';
import type { PlacedContent } from '../../src/sync/placement/placement.type';
import type { SyncAction } from '../../src/sync/plan/sync-action.type';

function placed(id: string, notePath: string, version: number = 3): PlacedContent {
  return {
    node: { id, title: id, parentId: '', parentType: '', type: 'page', version, webUrl: '' },
    notePath,
    folderPath: 'ISO',
    isFolderNote: false
  };
}

function local(path: string, overrides: Partial<LocalNoteState> = {}): LocalNoteState {
  return { path, title: 'x', version: 3, hash: 'h1', converter: 1, bodyHash: 'h1', ...overrides };
}

function plan(
  placements: Array<[string, PlacedContent]>,
  locals: Array<[string, LocalNoteState]>,
  force: boolean = false,
  keepLocalEdits: boolean = false
): Array<SyncAction> {
  const inputs: PlanInputs = {
    placements: new Map<string, PlacedContent>(placements),
    local: new Map<string, LocalNoteState>(locals),
    force,
    converterVersion: 1,
    keepLocalEdits
  };
  return buildPlan(inputs);
}

function only(actions: Array<SyncAction>): SyncAction {
  expect(actions.length).toBe(1);
  return actions[0];
}

describe('buildPlan', (): void => {
  it('creates what the vault does not have', (): void => {
    const action: SyncAction = only(plan([['1', placed('1', 'ISO/A.md')]], []));
    expect(action.verb).toBe('create');
    expect(action.previousPath).toBe('');
  });

  it('keeps a note whose version, converter, hash and path all match', (): void => {
    expect(only(plan([['1', placed('1', 'ISO/A.md')]], [['1', local('ISO/A.md')]])).verb).toBe('keep');
  });

  it('updates when the Confluence version moved', (): void => {
    const action: SyncAction = only(plan([['1', placed('1', 'ISO/A.md', 4)]], [['1', local('ISO/A.md')]]));
    expect(action.verb).toBe('update');
    expect(action.reason).toBe('version 3 to 4');
    expect(action.overwritesLocalEdit).toBe(false);
  });

  it('updates when the converter changed', (): void => {
    const action: SyncAction = only(plan([['1', placed('1', 'ISO/A.md')]], [['1', local('ISO/A.md', { converter: 0 })]]));
    expect(action.verb).toBe('update');
    expect(action.reason).toBe('converter changed');
  });

  it('overwrites a hand-edited note and says so', (): void => {
    const action: SyncAction = only(plan([['1', placed('1', 'ISO/A.md')]], [['1', local('ISO/A.md', { bodyHash: 'changed' })]]));
    expect(action.verb).toBe('update');
    expect(action.reason).toBe('local edits discarded');
    expect(action.overwritesLocalEdit).toBe(true);
  });

  it('keeps a hand-edited note when told to keep local changes', (): void => {
    const action: SyncAction = only(plan([['1', placed('1', 'ISO/A.md')]], [['1', local('ISO/A.md', { bodyHash: 'changed' })]], false, true));
    expect(action.verb).toBe('keep-local');
    expect(action.reason).toBe('changed in Obsidian, not sent');
    expect(action.overwritesLocalEdit).toBe(false);
    expect(action.previousPath).toBe('ISO/A.md');
  });

  it('keeps a hand-edited note when Confluence moved too, and says so', (): void => {
    const action: SyncAction = only(plan([['1', placed('1', 'ISO/A.md', 4)]], [['1', local('ISO/A.md', { bodyHash: 'changed' })]], false, true));
    expect(action.verb).toBe('keep-local');
    expect(action.reason).toBe('changed in Obsidian, not sent; Confluence moved to version 4');
  });

  it('keeps a hand-edited note even when a resync is forced', (): void => {
    expect(only(plan([['1', placed('1', 'ISO/A.md')]], [['1', local('ISO/A.md', { bodyHash: 'changed' })]], true, true)).verb).toBe('keep-local');
  });

  it('still updates an untouched note when told to keep local changes', (): void => {
    expect(only(plan([['1', placed('1', 'ISO/A.md', 4)]], [['1', local('ISO/A.md')]], false, true)).verb).toBe('update');
  });

  it('treats a note without a recorded hash as untouched', (): void => {
    expect(only(plan([['1', placed('1', 'ISO/A.md')]], [['1', local('ISO/A.md', { hash: '', bodyHash: 'anything' })]])).verb).toBe('keep');
  });

  it('moves when only the path changed', (): void => {
    const action: SyncAction = only(plan([['1', placed('1', 'ISO/New.md')]], [['1', local('ISO/Old.md')]]));
    expect(action.verb).toBe('move');
    expect(action.previousPath).toBe('ISO/Old.md');
    expect(action.notePath).toBe('ISO/New.md');
  });

  it('re-renders everything when forced', (): void => {
    const action: SyncAction = only(plan([['1', placed('1', 'ISO/A.md')]], [['1', local('ISO/A.md')]], true));
    expect(action.verb).toBe('update');
    expect(action.reason).toBe('resync requested');
  });

  it('trashes managed notes whose content is gone', (): void => {
    const action: SyncAction = only(plan([], [['9', local('ISO/Gone.md', { title: 'Gone' })]]));
    expect(action.verb).toBe('trash');
    expect(action.title).toBe('Gone');
    expect(action.notePath).toBe('ISO/Gone.md');
  });

  it('skips Confluence folders, which have no note', (): void => {
    const folder: PlacedContent = { ...placed('f', ''), notePath: '' };
    expect(plan([['f', folder]], [])).toEqual([]);
  });

  it('orders actions create, update, move, trash, keep-local, keep', (): void => {
    const actions: Array<SyncAction> = plan(
      [
        ['k', placed('k', 'ISO/K.md')],
        ['l', placed('l', 'ISO/L.md')],
        ['m', placed('m', 'ISO/M2.md')],
        ['u', placed('u', 'ISO/U.md', 5)],
        ['c', placed('c', 'ISO/C.md')]
      ],
      [
        ['k', local('ISO/K.md')],
        ['l', local('ISO/L.md', { bodyHash: 'changed' })],
        ['m', local('ISO/M.md')],
        ['u', local('ISO/U.md')],
        ['t', local('ISO/T.md')]
      ],
      false,
      true
    );
    expect(actions.map((action: SyncAction): string => action.verb)).toEqual(['create', 'update', 'move', 'trash', 'keep-local', 'keep']);
  });
});
