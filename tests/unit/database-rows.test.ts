import { describe, expect, it } from 'vitest';
import { fetchDatabaseRecord, fetchDatabaseRows } from '../../src/confluence/database-rows';
import { ConfluenceClient } from '../../src/confluence/api/confluence-client';
import { ConfluenceApiError } from '../../src/confluence/api/api-error';
import { RequestQueue } from '../../src/confluence/api/request-queue';
import { CancellationToken } from '../../src/confluence/api/cancellation';
import type { HttpRequest, HttpResponse } from '../../src/confluence/api/request-fn.type';
import type { DatabaseRows } from '../../src/confluence/database-rows';
import type { V2DatabaseEntry, V2DatabaseField } from '../../src/confluence/types/confluence-api.type';

const SITE: string = 'https://site.atlassian.net';
const FIELDS: string = `${SITE}/wiki/api/v2/databases/42/fields?limit=250`;
const ENTRIES: string = `${SITE}/wiki/api/v2/databases/42/entries?limit=250`;

function row(id: string): V2DatabaseEntry {
  return { id, databaseId: '42', values: {} };
}

function route(url: string): { status: number; body: unknown } {
  if (url === `${SITE}/wiki/api/v2/databases/42`) {
    return {
      status: 200,
      body: {
        id: '42',
        title: 'Leads',
        parentId: '9',
        parentType: 'page',
        version: { number: 44, authorId: 'a1', createdAt: '2026-10-21T09:09:34.101Z' },
        _links: { webui: '/spaces/SM/database/42', base: `${SITE}/wiki` }
      }
    };
  }
  if (url === FIELDS) {
    return {
      status: 200,
      body: {
        results: [{ id: 'f1', name: 'A', type: 'text' }],
        _links: { next: '/wiki/api/v2/databases/42/fields?limit=250&cursor=f2' }
      }
    };
  }
  if (url === `${FIELDS}&cursor=f2`) {
    return { status: 200, body: { results: [{ id: 'f2', name: 'B', type: 'number' }] } };
  }
  if (url === ENTRIES) {
    return {
      status: 200,
      body: { results: [row('e1'), row('e2')], _links: { next: '/wiki/api/v2/databases/42/entries?limit=250&cursor=e3' } }
    };
  }
  if (url === `${ENTRIES}&cursor=e3`) {
    // The same link again: a server that never advances must not loop the sync forever.
    return {
      status: 200,
      body: { results: [row('e3')], _links: { next: '/wiki/api/v2/databases/42/entries?limit=250&cursor=e3' } }
    };
  }
  if (url.includes('/databases/7/')) {
    return { status: 404, body: { errors: [{ status: 404, code: 'DATABASE_NOT_FOUND' }] } };
  }
  throw new Error(`unexpected url ${url}`);
}

function client(calls: Array<string>): ConfluenceClient {
  const request = async (req: HttpRequest): Promise<HttpResponse> => {
    calls.push(req.url);
    const { status, body } = route(req.url);
    const text: string = JSON.stringify(body);
    return { status, retryAfterSeconds: 0, text: (): string => text, arrayBuffer: (): ArrayBuffer => new ArrayBuffer(0) };
  };
  return new ConfluenceClient(SITE, 'Basic x', request, new RequestQueue(2, new CancellationToken()));
}

describe('fetchDatabaseRows', (): void => {
  it('reads every page of fields and entries by following next links', async (): Promise<void> => {
    const calls: Array<string> = new Array<string>();
    const rows: DatabaseRows = await fetchDatabaseRows(client(calls), '42');
    expect(rows.fields.map((field: V2DatabaseField): string => field.id)).toEqual(['f1', 'f2']);
    expect(rows.entries.map((entry: V2DatabaseEntry): string => entry.id)).toEqual(['e1', 'e2', 'e3']);
    expect(calls).toEqual([FIELDS, `${FIELDS}&cursor=f2`, ENTRIES, `${ENTRIES}&cursor=e3`]);
  });

  it('reads the record a pull needs: title, parent, version and link', async (): Promise<void> => {
    await expect(fetchDatabaseRecord(client([]), '42')).resolves.toEqual({
      id: '42',
      title: 'Leads',
      parentId: '9',
      version: 44,
      versionById: 'a1',
      versionWhen: '2026-10-21T09:09:34.101Z',
      webUrl: `${SITE}/wiki/spaces/SM/database/42`
    });
  });

  it('lets a site without the Databases API fail the fetch, not the sync', async (): Promise<void> => {
    await expect(fetchDatabaseRows(client([]), '7')).rejects.toBeInstanceOf(ConfluenceApiError);
  });
});
