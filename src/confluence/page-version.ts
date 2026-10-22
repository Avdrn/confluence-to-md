import type { ConfluenceClient } from './api/confluence-client';
import type { V2Page } from './types/confluence-api.type';

/** The storage body of one earlier version of a page, as the base of a three-way comparison. */
export async function fetchPageVersion(client: ConfluenceClient, pageId: string, version: number): Promise<string> {
  const page: V2Page = await client.getJson<V2Page>(
    `/wiki/api/v2/pages/${pageId}?version=${version}&body-format=storage`
  );
  return page.body?.storage?.value ?? '';
}
