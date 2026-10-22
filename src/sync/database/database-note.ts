/**
 * The body of a database note: the rows through the Databases API, the people
 * in them named, and the pages and databases they point at linked to the notes
 * that mirror them. A sync renders the body alone, since the listing gave it
 * the version; a pull or a comparison fetches the database's record as well.
 */

import { fetchDatabaseRecord, fetchDatabaseRows } from '../../confluence/database-rows';
import { inertBody } from '../../convert/inert-markdown';
import { collectDatabaseAccountIds, renderDatabase } from './render-database';
import type { ConfluenceClient } from '../../confluence/api/confluence-client';
import type { DatabaseRecord, DatabaseRows } from '../../confluence/database-rows';
import type { UserDirectory } from '../../confluence/user-directory';
import type { ContentPlacement } from '../placement/placement.type';
import type { LinkedNote } from './render-database';

export interface DatabaseNote {
  record: DatabaseRecord;
  /** Who saved the current version, by display name; '' when Confluence did not say. */
  versionBy: string;
  /** The body as a sync writes it: rendered and made inert. */
  body: string;
}

export async function renderDatabaseBody(
  client: ConfluenceClient,
  users: UserDirectory,
  databaseId: string,
  notesById: ReadonlyMap<string, LinkedNote>
): Promise<string> {
  const rows: DatabaseRows = await fetchDatabaseRows(client, databaseId);
  const names: ReadonlyMap<string, string> = await users.resolve(collectDatabaseAccountIds(rows.entries));
  return renderDatabase({
    databaseId,
    fields: rows.fields,
    entries: rows.entries,
    users: names,
    notesById,
    siteUrl: client.site
  });
}

/** The database as a note would hold it now: record, body, and who last saved it. */
export async function fetchDatabaseNote(
  client: ConfluenceClient,
  users: UserDirectory,
  databaseId: string,
  notesById: ReadonlyMap<string, LinkedNote>
): Promise<DatabaseNote> {
  const record: DatabaseRecord = await fetchDatabaseRecord(client, databaseId);
  const body: string = inertBody(await renderDatabaseBody(client, users, databaseId, notesById));
  let versionBy: string = '';
  if (record.versionById) {
    const names: ReadonlyMap<string, string> = await users.resolve(new Set<string>([record.versionById]));
    versionBy = names.get(record.versionById) ?? '';
  }
  return { record, versionBy, body };
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
