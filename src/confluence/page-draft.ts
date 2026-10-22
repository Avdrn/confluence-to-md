import { ConfluenceApiError } from './api/api-error';
import type { ConfluenceClient } from './api/confluence-client';
import type { ConfluencePage } from './types/confluence-api.type';

export interface PageDraft {
  by: string;
  /** ISO 8601, '' when Confluence did not say. */
  when: string;
}

/**
 * Unpublished changes someone holds on the page, or null when there are none.
 * Confluence answers 404 when no draft exists. A draft that is not newer than
 * the published version is an empty one, left behind by the editor, and counts
 * as none as well.
 */
export async function fetchDraft(client: ConfluenceClient, pageId: string, publishedWhen: string): Promise<PageDraft | null> {
  let page: ConfluencePage;
  try {
    page = await client.getJson<ConfluencePage>(`/wiki/rest/api/content/${pageId}?status=draft&expand=version`);
  } catch (err) {
    if (err instanceof ConfluenceApiError && err.isNotFound()) {
      return null;
    }
    throw err;
  }
  if (page.status !== 'draft') {
    return null;
  }
  const when: string = page.version.when ?? '';
  if (publishedWhen && when && Date.parse(when) <= Date.parse(publishedWhen)) {
    return null;
  }
  return { by: page.version.by?.displayName ?? '', when };
}
