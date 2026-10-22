import type { ConfluenceClient } from './api/confluence-client';
import type { V2Page } from './types/confluence-api.type';

export interface PageUpdate {
  id: string;
  /** The page's current title: a push never renames. */
  title: string;
  storage: string;
  /** The number the new version must get: the current one plus one. Confluence answers 409 otherwise. */
  version: number;
  /** Shown in the page history. */
  message: string;
}

/** Publishes a new version of a page and returns the number Confluence gave it. */
export async function updatePage(client: ConfluenceClient, update: PageUpdate): Promise<number> {
  const page: V2Page = await client.putJson<V2Page>(`/wiki/api/v2/pages/${update.id}`, {
    id: update.id,
    status: 'current',
    title: update.title,
    body: { representation: 'storage', value: update.storage },
    version: { number: update.version, message: update.message }
  });
  return page.version?.number ?? update.version;
}
