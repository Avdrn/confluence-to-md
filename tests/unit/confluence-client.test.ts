import { describe, expect, it } from 'vitest';
import { basicAuthorization, ConfluenceClient } from '../../src/confluence/api/confluence-client';
import { ConfluenceApiError } from '../../src/confluence/api/api-error';
import { RequestQueue } from '../../src/confluence/api/request-queue';
import { CancellationToken } from '../../src/confluence/api/cancellation';
import type { HttpRequest, HttpResponse, RequestFn } from '../../src/confluence/api/request-fn.type';

interface Seen {
  requests: Array<HttpRequest>;
}

function fakeRequest(status: number, body: string, seen: Seen): RequestFn {
  return async (request: HttpRequest): Promise<HttpResponse> => {
    seen.requests.push(request);
    return { status, retryAfterSeconds: 0, text: (): string => body, arrayBuffer: (): ArrayBuffer => new TextEncoder().encode(body).buffer as ArrayBuffer };
  };
}

function client(request: RequestFn): ConfluenceClient {
  return new ConfluenceClient('https://site.atlassian.net', 'Basic abc', request, new RequestQueue(2, new CancellationToken()));
}

describe('ConfluenceClient', (): void => {
  it('sends the authorization header and makes site-relative paths absolute', async (): Promise<void> => {
    const seen: Seen = { requests: [] };
    await client(fakeRequest(200, '{"ok":true}', seen)).getJson('/wiki/api/v2/spaces');
    expect(seen.requests[0].url).toBe('https://site.atlassian.net/wiki/api/v2/spaces');
    expect(seen.requests[0].headers.Authorization).toBe('Basic abc');
    expect(seen.requests[0].headers.Accept).toBe('application/json');
  });

  it('leaves absolute URLs alone', async (): Promise<void> => {
    const seen: Seen = { requests: [] };
    await client(fakeRequest(200, '{}', seen)).getJson('https://elsewhere.example/x');
    expect(seen.requests[0].url).toBe('https://elsewhere.example/x');
  });

  it('strips the duplicate subType key Confluence emits', async (): Promise<void> => {
    const seen: Seen = { requests: [] };
    const body: string = '{"id":"1","subType":"live","subtype":"live"}';
    const parsed: { id: string; subtype: string } = await client(fakeRequest(200, body, seen)).getJson('/x');
    expect(parsed).toEqual({ id: '1', subtype: 'live' });
  });

  it('turns an error status into a ConfluenceApiError', async (): Promise<void> => {
    const seen: Seen = { requests: [] };
    const failing: Promise<unknown> = client(fakeRequest(404, 'nope', seen)).getJson('/missing');
    await expect(failing).rejects.toBeInstanceOf(ConfluenceApiError);
    await failing.catch((err: ConfluenceApiError): void => {
      expect(err.isNotFound()).toBe(true);
      expect(err.message).toContain('404');
    });
  });

  it('sends reads as GET and writes as PUT with a JSON body', async (): Promise<void> => {
    const seen: Seen = { requests: [] };
    const target: ConfluenceClient = client(fakeRequest(200, '{"ok":true}', seen));
    await target.getJson('/wiki/api/v2/spaces');
    const result: { ok: boolean } = await target.putJson('/wiki/api/v2/pages/1', { a: 1 });
    expect(result).toEqual({ ok: true });
    expect(seen.requests[0].method).toBe('GET');
    expect(seen.requests[0].body).toBeUndefined();
    expect(seen.requests[1].method).toBe('PUT');
    expect(seen.requests[1].body).toBe('{"a":1}');
    expect(seen.requests[1].contentType).toBe('application/json');
  });

  it('does not retry a PUT that the server failed', async (): Promise<void> => {
    const seen: Seen = { requests: [] };
    await expect(client(fakeRequest(500, 'boom', seen)).putJson('/x', {})).rejects.toBeInstanceOf(ConfluenceApiError);
    expect(seen.requests.length).toBe(1);
  });

  it('reports a version conflict and keeps the detail of a rejected body', async (): Promise<void> => {
    const seen: Seen = { requests: [] };
    await client(fakeRequest(409, 'stale', seen)).putJson('/x', {}).catch((err: ConfluenceApiError): void => {
      expect(err.isConflict()).toBe(true);
    });
    const long: string = 'x'.repeat(500);
    await client(fakeRequest(400, long, seen)).putJson('/x', {}).catch((err: ConfluenceApiError): void => {
      expect(err.isBadRequest()).toBe(true);
      expect(err.message).toContain(long);
    });
  });

  it('returns bytes for binary downloads', async (): Promise<void> => {
    const seen: Seen = { requests: [] };
    const bytes: ArrayBuffer = await client(fakeRequest(200, 'hi', seen)).getBinary('/file');
    expect(new TextDecoder().decode(bytes)).toBe('hi');
  });
});

describe('basicAuthorization', (): void => {
  it('encodes email and token the way Atlassian expects', (): void => {
    expect(basicAuthorization('a@b.c', 'tok')).toBe(`Basic ${btoa('a@b.c:tok')}`);
  });
});
