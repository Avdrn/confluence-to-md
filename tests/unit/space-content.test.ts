import { describe, expect, it } from 'vitest';
import { fetchSpace } from '../../src/confluence/space-content';
import { ConfluenceClient } from '../../src/confluence/api/confluence-client';
import { RequestQueue } from '../../src/confluence/api/request-queue';
import { CancellationToken } from '../../src/confluence/api/cancellation';
import { SILENT_PROGRESS } from '../../src/shared/progress';
import type { HttpRequest, HttpResponse } from '../../src/confluence/api/request-fn.type';
import type { ContentNode, SpaceContent } from '../../src/confluence/types/content-node.type';

const SITE: string = 'https://site.atlassian.net';

function route(rawUrl: string): unknown {
  const url: string = decodeURIComponent(rawUrl);
  if (url.includes('/wiki/api/v2/spaces?keys=ISO')) {
    return { results: [{ id: '10', key: 'ISO', name: 'ISO Certifications', homepageId: '100' }] };
  }
  if (url.includes('/wiki/api/v2/spaces/10/pages?limit=250')) {
    return {
      results: [{ id: '100', title: 'Home', version: { number: 2 }, _links: { webui: '/spaces/ISO/pages/100' } }],
      _links: { next: '/wiki/api/v2/spaces/10/pages?cursor=abc' }
    };
  }
  if (url.includes('cursor=abc')) {
    return { results: [{ id: '101', title: 'Child', parentId: '100', parentType: 'page', version: { number: 7 } }] };
  }
  if (url.includes('type=folder')) {
    if (url.includes('cursor=f2')) {
      return { results: [] };
    }
    return {
      results: [{ title: 'Archive &amp; more', url: '/spaces/ISO/folder/200', content: { id: '200', type: 'folder' } }],
      _links: { next: '/rest/api/search?cql=x&cursor=f2' }
    };
  }
  if (url.includes('/wiki/api/v2/folders/200')) {
    return { id: '200', parentId: '100', parentType: 'page', version: { number: 1 } };
  }
  if (url.includes('/wiki/rest/api/search')) {
    return { results: [] };
  }
  throw new Error(`unexpected url ${url}`);
}

async function request(req: HttpRequest): Promise<HttpResponse> {
  const body: string = JSON.stringify(route(req.url));
  return { status: 200, retryAfterSeconds: 0, text: (): string => body, arrayBuffer: (): ArrayBuffer => new ArrayBuffer(0) };
}

describe('fetchSpace', (): void => {
  it('follows cursors and merges pages with folders and their parents', async (): Promise<void> => {
    const client: ConfluenceClient = new ConfluenceClient(SITE, 'Basic x', request, new RequestQueue(2, new CancellationToken()));
    const space: SpaceContent = await fetchSpace(client, 'ISO', SILENT_PROGRESS);
    expect(space.spaceId).toBe('10');
    expect(space.spaceName).toBe('ISO Certifications');
    expect(space.homepageId).toBe('100');
    expect(space.spaceUrl).toBe(`${SITE}/wiki/spaces/ISO`);

    const byId: Map<string, ContentNode> = new Map<string, ContentNode>(space.nodes.map((node: ContentNode): [string, ContentNode] => [node.id, node]));
    expect(byId.get('100')?.webUrl).toBe(`${SITE}/wiki/spaces/ISO/pages/100`);
    expect(byId.get('101')?.parentId).toBe('100');
    expect(byId.get('101')?.version).toBe(7);
    const folder: ContentNode | undefined = byId.get('200');
    expect(folder?.type).toBe('folder');
    expect(folder?.title).toBe('Archive & more');
    expect(folder?.parentId).toBe('100');
    expect(folder?.webUrl).toBe(`${SITE}/wiki/spaces/ISO/folder/200`);
  });
});
