import type { ContentType } from '../../confluence/types/content-node.type';

/**
 * In the order they take precedence:
 *
 *     create      nothing in the vault carries this content id
 *     keep-local  the note was changed in Obsidian; the change stays until it is sent to Confluence
 *     update      the Confluence version moved, the converter changed, or local edits are discarded
 *     move        same content, but the title or hierarchy changed the note's path
 *     trash       a managed note whose Confluence content is gone
 *     keep        nothing to do
 */
export type SyncVerb = 'create' | 'update' | 'move' | 'trash' | 'keep-local' | 'keep';

export const VERB_ORDER: ReadonlyArray<SyncVerb> = ['create', 'update', 'move', 'trash', 'keep-local', 'keep'];

/** One decision the planner made about one piece of content. */
export interface SyncAction {
  verb: SyncVerb;
  pageId: string;
  type: ContentType;
  title: string;
  /** Where the note will be, or is being left. */
  notePath: string;
  /** Where it is now, when a note already exists. '' for a create. */
  previousPath: string;
  version: number;
  reason: string;
  /** True when the note was changed by hand and the sync writes over it. */
  overwritesLocalEdit: boolean;
}
