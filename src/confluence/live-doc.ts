/**
 * Live docs are pages without publishing: readers see the live editing
 * session, not the latest version. A version written through the API never
 * reaches that session, so a send writes the live content as well.
 *
 * Confluence keeps the live content as the page's draft. Writing the draft
 * changes the live doc at once but creates no version, which is why the send
 * writes the version first (CONFCLOUD-83848).
 */

import { ConfluenceApiError } from './api/api-error';
import type { ConfluenceClient } from './api/confluence-client';
import type { ConfluencePage, V2Page } from './types/confluence-api.type';

export interface LiveContent {
  storage: string;
  /** Who edited last, and when (ISO 8601). '' when Confluence did not say. */
  by: string;
  when: string;
}

export interface LiveUpdate {
  id: string;
  title: string;
  storage: string;
}

/** Confluence marks a live doc with `subtype: live`; a page has none or `page`. */
export async function isLiveDoc(client: ConfluenceClient, pageId: string): Promise<boolean> {
  const page: V2Page = await client.getJson<V2Page>(`/wiki/api/v2/pages/${pageId}`);
  return page.subtype === 'live';
}

/** What the live doc shows right now, or null when Confluence holds nothing beyond the latest version. */
export async function fetchLiveContent(client: ConfluenceClient, pageId: string): Promise<LiveContent | null> {
  let page: ConfluencePage;
  try {
    page = await client.getJson<ConfluencePage>(`/wiki/rest/api/content/${pageId}?status=draft&expand=version,body.storage`);
  } catch (err) {
    if (err instanceof ConfluenceApiError && err.isNotFound()) {
      return null;
    }
    throw err;
  }
  if (page.status !== 'draft') {
    return null;
  }
  return {
    storage: page.body?.storage?.value ?? '',
    by: page.version.by?.displayName ?? '',
    when: page.version.when ?? ''
  };
}

/** Puts a body into the live doc itself. A draft is always version 1. */
export async function writeLiveContent(client: ConfluenceClient, update: LiveUpdate): Promise<void> {
  await client.putJson<V2Page>(`/wiki/api/v2/pages/${update.id}`, {
    id: update.id,
    status: 'draft',
    title: update.title,
    body: { representation: 'storage', value: update.storage },
    version: { number: 1 }
  });
}
