/**
 * Folders, databases, whiteboards and embeds. A space is not only pages, and a
 * page can hang off a folder, so an importer that lists only pages reads a tree
 * with holes in it. CQL is the only listing that returns these types; each one
 * is then asked for its own record, because CQL does not say who its parent is.
 */

import { decodeEntities } from '../convert/storage-parser';
import { logWarning } from '../shared/log';
import { errorMessage } from '../shared/error-message';
import { webUrlOf } from './page-url';
import type { ConfluenceClient } from './api/confluence-client';
import type { ProgressReporter } from '../shared/progress';
import type { CqlSearchResponse, CqlSearchResult, V2Content } from './types/confluence-api.type';
import type { ContentNode, ContentType } from './types/content-node.type';

const SEARCHED_TYPES: ReadonlyArray<ContentType> = ['folder', 'database', 'whiteboard', 'embed'];
const SEARCH_BATCH: number = 100;

export async function listOtherContent(
  client: ConfluenceClient,
  spaceKey: string,
  progress: ProgressReporter
): Promise<Array<ContentNode>> {
  const found: Array<ContentNode> = new Array<ContentNode>();
  const seen: Set<string> = new Set<string>();
  for (const type of SEARCHED_TYPES) {
    progress.phase(`Reading ${type}s`);
    const cql: string = encodeURIComponent(`space="${spaceKey}" and type=${type}`);
    let next: string = `/wiki/rest/api/search?cql=${cql}&limit=${SEARCH_BATCH}`;
    while (next) {
      const batch: CqlSearchResponse = await client.getJson<CqlSearchResponse>(next);
      for (const result of batch.results ?? []) {
        const node: ContentNode | null = nodeOf(result, type, client.site);
        if (!node || seen.has(node.id)) {
          continue;
        }
        seen.add(node.id);
        found.push(node);
      }
      next = restNext(batch._links?.next);
    }
  }
  await attachParents(client, found);
  return found;
}

function nodeOf(result: CqlSearchResult, type: ContentType, siteUrl: string): ContentNode | null {
  const id: string = result.content?.id ?? '';
  if (!id) {
    return null;
  }
  return {
    id,
    type,
    title: decodeEntities(result.title || result.content?.title || ''),
    parentId: '',
    parentType: '',
    version: 0,
    webUrl: webUrlOf(siteUrl, result.url)
  };
}

/** The v1 search API returns `next` relative to `/wiki`. */
function restNext(next: string | undefined): string {
  if (!next) {
    return '';
  }
  if (/^https?:\/\//i.test(next) || next.startsWith('/wiki/')) {
    return next;
  }
  return `/wiki${next}`;
}

async function attachParents(client: ConfluenceClient, nodes: Array<ContentNode>): Promise<void> {
  await Promise.all(nodes.map(async (node: ContentNode): Promise<void> => {
    try {
      const record: V2Content = await client.getJson<V2Content>(`/wiki/api/v2/${node.type}s/${node.id}`);
      node.parentId = record.parentId ?? '';
      node.parentType = record.parentType ?? '';
      node.version = record.version?.number ?? 0;
      if (record.title) {
        node.title = record.title;
      }
    } catch (err) {
      logWarning(`Could not read the parent of ${node.type} "${node.title}": ${errorMessage(err)}`);
    }
  }));
}
