/**
 * The fields and rows of a database, through the v2 Databases API.
 *
 * Atlassian marks these endpoints experimental, and a site that does not have
 * them yet answers 404 for a database the listing just returned. The error is
 * left to the caller, which knows what the note should say instead.
 */

import type { ConfluenceClient } from './api/confluence-client';
import type { V2DatabaseEntry, V2DatabaseField, V2DatabaseList } from './types/confluence-api.type';

/** The largest page the API allows, so a database of a few hundred rows is one request. */
const PAGE_SIZE: number = 250;

export interface DatabaseRows {
  /** In the column order the database shows. */
  fields: Array<V2DatabaseField>;
  entries: Array<V2DatabaseEntry>;
}

export async function fetchDatabaseRows(client: ConfluenceClient, databaseId: string): Promise<DatabaseRows> {
  const fields: Array<V2DatabaseField> = await readAll<V2DatabaseField>(
    client, `/wiki/api/v2/databases/${databaseId}/fields?limit=${PAGE_SIZE}`
  );
  const entries: Array<V2DatabaseEntry> = await readAll<V2DatabaseEntry>(
    client, `/wiki/api/v2/databases/${databaseId}/entries?limit=${PAGE_SIZE}`
  );
  return { fields, entries };
}

/** Follows `_links.next` to the end. A link that repeats ends the walk rather than looping. */
async function readAll<T>(client: ConfluenceClient, first: string): Promise<Array<T>> {
  const all: Array<T> = new Array<T>();
  const seen: Set<string> = new Set<string>();
  let next: string = first;
  while (next && !seen.has(next)) {
    seen.add(next);
    const batch: V2DatabaseList<T> = await client.getJson<V2DatabaseList<T>>(next);
    all.push(...(batch.results ?? []));
    next = batch._links?.next ?? '';
  }
  return all;
}
