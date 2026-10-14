import type { ConfluenceClient } from './api/confluence-client';
import type { ProgressReporter } from '../shared/progress';
import type { V2Page, V2PageList } from './types/confluence-api.type';

const PAGE_BATCH: number = 250;

/** Every current page of a space, without bodies. Archived pages are left out. */
export async function listPages(
  client: ConfluenceClient,
  spaceId: string,
  progress: ProgressReporter
): Promise<Array<V2Page>> {
  const pages: Array<V2Page> = new Array<V2Page>();
  let next: string = `/wiki/api/v2/spaces/${spaceId}/pages?limit=${PAGE_BATCH}&status=current`;
  while (next) {
    const batch: V2PageList = await client.getJson<V2PageList>(next);
    pages.push(...batch.results);
    progress.phase(`Reading space (${pages.length} pages)`);
    next = batch._links?.next ?? '';
  }
  return pages;
}
