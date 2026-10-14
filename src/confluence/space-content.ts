import { lookupSpace } from './space-lookup';
import { listPages } from './space-pages';
import { listOtherContent } from './space-other-content';
import { spaceUrlOf, webUrlOf } from './page-url';
import type { ConfluenceClient } from './api/confluence-client';
import type { ProgressReporter } from '../shared/progress';
import type { V2Page, V2Space } from './types/confluence-api.type';
import type { ContentNode, SpaceContent } from './types/content-node.type';

/** Everything a space contains, of every content type, without bodies. */
export async function fetchSpace(
  client: ConfluenceClient,
  spaceKey: string,
  progress: ProgressReporter
): Promise<SpaceContent> {
  const space: V2Space = await lookupSpace(client, spaceKey);
  const pages: Array<V2Page> = await listPages(client, space.id, progress);
  const others: Array<ContentNode> = await listOtherContent(client, space.key, progress);

  const nodes: Array<ContentNode> = pages.map((page: V2Page): ContentNode => ({
    id: page.id,
    type: 'page',
    title: page.title,
    parentId: page.parentId ?? '',
    parentType: page.parentType ?? '',
    version: page.version?.number ?? 0,
    webUrl: webUrlOf(client.site, page._links?.webui)
  }));
  const known: Set<string> = new Set<string>(nodes.map((node: ContentNode): string => node.id));
  for (const node of others) {
    if (!known.has(node.id)) {
      nodes.push(node);
    }
  }

  return {
    spaceKey: space.key,
    spaceId: space.id,
    spaceName: space.name ?? space.key,
    spaceUrl: spaceUrlOf(client.site, space.key),
    homepageId: space.homepageId ?? '',
    nodes
  };
}
