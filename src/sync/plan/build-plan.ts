/**
 * What a sync should do, decided before anything is fetched or written.
 *
 * Separating the decision from the doing is what makes "Preview changes"
 * honest: it runs this same function and shows the result instead of applying
 * it. It is also what makes a second sync cheap: a page whose Confluence
 * version has not moved is never downloaded and its note is never rewritten.
 */

import { VERB_ORDER } from './sync-action.type';
import type { SyncAction, SyncVerb } from './sync-action.type';
import type { PlacedContent } from '../placement/placement.type';

/** A managed note as the planner sees it. */
export interface LocalNoteState {
  path: string;
  title: string;
  version: number;
  /** Hash recorded in front-matter when the note was written. '' when missing. */
  hash: string;
  converter: number;
  /** Hash of the body as it is now. */
  bodyHash: string;
}

export interface PlanInputs {
  placements: ReadonlyMap<string, PlacedContent>;
  local: ReadonlyMap<string, LocalNoteState>;
  force: boolean;
  converterVersion: number;
  /** Leave hand-edited notes alone until their changes are sent, instead of overwriting them. */
  keepLocalEdits: boolean;
}

/** Verbs whose page body has to be downloaded. */
const NEEDS_BODY: ReadonlySet<SyncVerb> = new Set<SyncVerb>(['create', 'update']);

export function buildPlan(inputs: PlanInputs): Array<SyncAction> {
  const actions: Array<SyncAction> = new Array<SyncAction>();
  for (const [id, placed] of inputs.placements) {
    if (!placed.notePath) {
      continue; // a Confluence folder is a directory, never a note
    }
    actions.push(decide(placed, inputs.local.get(id), inputs));
  }
  for (const [id, local] of inputs.local) {
    if (!inputs.placements.has(id)) {
      actions.push({
        verb: 'trash',
        pageId: id,
        type: 'page',
        title: local.title,
        notePath: local.path,
        previousPath: local.path,
        version: local.version,
        reason: 'no longer in Confluence',
        overwritesLocalEdit: false
      });
    }
  }
  return actions.sort(byVerbThenPath);
}

function decide(placed: PlacedContent, local: LocalNoteState | undefined, inputs: PlanInputs): SyncAction {
  const base: Omit<SyncAction, 'verb' | 'previousPath' | 'reason' | 'overwritesLocalEdit'> = {
    pageId: placed.node.id,
    type: placed.node.type,
    title: placed.node.title,
    notePath: placed.notePath,
    version: placed.node.version
  };
  if (!local) {
    return { ...base, verb: 'create', previousPath: '', reason: 'new', overwritesLocalEdit: false };
  }
  const edited: boolean = wasEditedByHand(local);
  if (edited && inputs.keepLocalEdits) {
    return {
      ...base,
      verb: 'keep-local',
      previousPath: local.path,
      reason: keptReason(local, placed),
      overwritesLocalEdit: false
    };
  }
  const update: Omit<SyncAction, 'reason'> = {
    ...base,
    verb: 'update',
    previousPath: local.path,
    overwritesLocalEdit: edited
  };
  if (inputs.force) {
    return { ...update, reason: 'resync requested' };
  }
  if (local.converter !== inputs.converterVersion) {
    return { ...update, reason: 'converter changed' };
  }
  if (local.version !== placed.node.version) {
    return { ...update, reason: `version ${local.version} to ${placed.node.version}` };
  }
  if (edited) {
    return { ...update, reason: 'local edits discarded' };
  }
  if (local.path !== placed.notePath) {
    return {
      ...base,
      verb: 'move',
      previousPath: local.path,
      reason: `moved from ${local.path}`,
      overwritesLocalEdit: false
    };
  }
  return { ...base, verb: 'keep', previousPath: local.path, reason: 'unchanged', overwritesLocalEdit: false };
}

/**
 * True when the body no longer hashes to what the last sync recorded. A note
 * with no recorded hash counts as untouched.
 */
export function wasEditedByHand(local: LocalNoteState): boolean {
  return local.hash.length > 0 && local.bodyHash !== local.hash;
}

/** A kept note is behind as well when Confluence moved on; the report should say so. */
function keptReason(local: LocalNoteState, placed: PlacedContent): string {
  if (local.version !== placed.node.version) {
    return `changed in Obsidian, not sent; Confluence moved to version ${placed.node.version}`;
  }
  return 'changed in Obsidian, not sent';
}

export function needsBody(action: SyncAction): boolean {
  return NEEDS_BODY.has(action.verb);
}

function byVerbThenPath(a: SyncAction, b: SyncAction): number {
  const order: number = VERB_ORDER.indexOf(a.verb) - VERB_ORDER.indexOf(b.verb);
  if (order !== 0) {
    return order;
  }
  return a.notePath.localeCompare(b.notePath);
}
