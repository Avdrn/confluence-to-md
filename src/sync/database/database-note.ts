/**
 * The body of a database note: the rows through the Databases API, the people
 * in them named, and the pages and databases they point at linked to the notes
 * that mirror them.
 */

import { fetchDatabaseRows } from '../../confluence/database-rows';
import { collectDatabaseAccountIds, renderDatabase } from './render-database';
import type { ConfluenceClient } from '../../confluence/api/confluence-client';
import type { DatabaseRows } from '../../confluence/database-rows';
import type { UserDirectory } from '../../confluence/user-directory';
import type { ContentNode } from '../../confluence/types/content-node.type';
import type { ContentPlacement } from '../placement/placement.type';
import type { LinkedNote } from './render-database';

export async function renderDatabaseBody(
  client: ConfluenceClient,
  users: UserDirectory,
  node: ContentNode,
  placement: ContentPlacement
): Promise<string> {
  const rows: DatabaseRows = await fetchDatabaseRows(client, node.id);
  const names: ReadonlyMap<string, string> = await users.resolve(collectDatabaseAccountIds(rows.entries));
  return renderDatabase({
    databaseId: node.id,
    fields: rows.fields,
    entries: rows.entries,
    users: names,
    notesById: linkedNotesOf(placement),
    siteUrl: client.site
  });
}

/** Every placed note by the content id it mirrors; folders have no note and are left out. */
export function linkedNotesOf(placement: ContentPlacement): Map<string, LinkedNote> {
  const notes: Map<string, LinkedNote> = new Map<string, LinkedNote>();
  for (const [id, placed] of placement.byId) {
    if (placed.notePath) {
      notes.set(id, { notePath: placed.notePath, title: placed.node.title });
    }
  }
  return notes;
}
