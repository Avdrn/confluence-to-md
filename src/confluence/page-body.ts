import { webUrlOf } from './page-url';
import type { ConfluenceClient } from './api/confluence-client';
import type { ConfluencePage } from './types/confluence-api.type';

export interface PageBody {
  id: string;
  title: string;
  version: number;
  storage: string;
  webUrl: string;
}

/** One page with its storage body, fetched only when the plan says it is needed. */
export async function fetchPageBody(client: ConfluenceClient, pageId: string): Promise<PageBody> {
  const page: ConfluencePage = await client.getJson<ConfluencePage>(
    `/wiki/rest/api/content/${pageId}?expand=body.storage,version`
  );
  return {
    id: page.id,
    title: page.title,
    version: page.version.number,
    storage: page.body?.storage?.value ?? '',
    webUrl: webUrlOf(client.site, page._links?.webui)
  };
}
