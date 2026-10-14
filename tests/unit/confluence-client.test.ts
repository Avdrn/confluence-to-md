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
