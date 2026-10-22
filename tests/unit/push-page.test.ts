import { describe, expect, it } from 'vitest';
import type { App, TFile } from 'obsidian';
import { ConfluenceClient } from '../../src/confluence/api/confluence-client';
import { CancellationToken } from '../../src/confluence/api/cancellation';
import { RequestQueue } from '../../src/confluence/api/request-queue';
import { UserDirectory } from '../../src/confluence/user-directory';
import { pushNote } from '../../src/push/push-page';
import { hashBody } from '../../src/sync/plan/body-hash';
import type { HttpRequest, HttpResponse, RequestFn } from '../../src/confluence/api/request-fn.type';
import type { PushAssessment } from '../../src/push/preflight';
import type { PreparedPush } from '../../src/push/prepare-push';
import type { PushOutcome, PushRequest } from '../../src/push/push-page';

const BODY: string = 'Hello from the note';

interface Fake {
  app: App;
  frontmatter: Record<string, unknown>;
  requests: Array<HttpRequest>;
  client: ConfluenceClient;
}

/** `livePutStatus` answers every PUT after the first: the write into a live doc. */
function fake(putStatus: number, livePutStatus: number = putStatus): Fake {
  const frontmatter: Record<string, unknown> = { 'confluence-version': 12, 'confluence-hash': 'old', 'confluence-unpushed': '2026-10-22' };
  const requests: Array<HttpRequest> = [];
  let puts: number = 0;
  const request: RequestFn = async (sent: HttpRequest): Promise<HttpResponse> => {
    requests.push(sent);
    let status: number = 200;
    if (sent.method === 'PUT') {
      puts++;
      status = livePutStatus;
      if (puts === 1) {
        status = putStatus;
      }
    }
    return { status, retryAfterSeconds: 0, text: (): string => '{"version":{"number":13}}', arrayBuffer: (): ArrayBuffer => new ArrayBuffer(0) };
  };
  const app: App = {
    workspace: { getLeavesOfType: (): Array<unknown> => [] },
    vault: { cachedRead: async (): Promise<string> => `---\nx: 1\n---\n\n${BODY}` },
    metadataCache: { getFileCache: (): unknown => ({ frontmatter, frontmatterPosition: { end: { offset: 12, line: 2 } } }) },
    fileManager: {
      processFrontMatter: async (_file: TFile, change: (fm: Record<string, unknown>) => void): Promise<void> => {
        change(frontmatter);
      }
    }
  } as unknown as App;
  const client: ConfluenceClient = new ConfluenceClient('https://site.atlassian.net', 'Basic x', request, new RequestQueue(1, new CancellationToken()));
  return { app, frontmatter, requests, client };
}

function requestFor(sending: Array<number>, bodyHash: string = hashBody(BODY), live: boolean = false): PushRequest {
  const prepared: PreparedPush = {
    file: { path: 'DOCS/Page.md' } as TFile,
    fields: { pageId: '42', spaceKey: 'DOCS', title: 'Page', version: 12, hash: 'old', converter: 2, parentId: '' },
    remote: { title: 'Page in Confluence' },
    live
  } as unknown as PreparedPush;
  const assessment: PushAssessment = {
    noteVersion: 12,
    changes: [{ index: 0 }, { index: 1 }],
    storageFor: (): string => '<p>patched</p>',
    renderedFor: (): string => 'rendered body'
  } as unknown as PushAssessment;
  return { prepared, assessment, sending: new Set<number>(sending), message: 'From a test', bodyHash, downloadAttachments: false };
}

describe('pushNote', (): void => {
  it('sends the next version with the current title and records what Confluence now holds', async (): Promise<void> => {
    const { app, frontmatter, requests, client } = fake(200);
    const outcome: PushOutcome = await pushNote({ app, client, users: new UserDirectory(client) }, requestFor([0]));
    expect(outcome).toEqual({ kind: 'sent', version: 13, rerendered: false, liveFailed: false });
    expect(requests.length).toBe(1);
    expect(requests[0].method).toBe('PUT');
    expect(requests[0].url).toBe('https://site.atlassian.net/wiki/api/v2/pages/42');
    const payload: { title: string; version: { number: number; message: string }; body: { value: string } } = JSON.parse(requests[0].body ?? '');
    expect(payload.title).toBe('Page in Confluence');
    expect(payload.version).toEqual({ number: 13, message: 'From a test' });
    expect(payload.body.value).toBe('<p>patched</p>');
    expect(frontmatter['confluence-version']).toBe(13);
    expect(frontmatter['confluence-hash']).toBe(hashBody('rendered body'));
    // One change was held back, so the note still carries changes of its own.
    expect(frontmatter['confluence-unpushed']).toBe('2026-10-22');
  });

  it('writes the same body into a live doc once the version is saved', async (): Promise<void> => {
    const { app, requests, client } = fake(200);
    const outcome: PushOutcome = await pushNote({ app, client, users: new UserDirectory(client) }, requestFor([0], hashBody(BODY), true));
    expect(outcome).toEqual({ kind: 'sent', version: 13, rerendered: false, liveFailed: false });
    expect(requests.map((sent: HttpRequest): string => sent.method ?? '')).toEqual(['PUT', 'PUT']);
    const version: { status: string } = JSON.parse(requests[0].body ?? '');
    const live: { status: string; title: string; version: { number: number }; body: { value: string } } = JSON.parse(requests[1].body ?? '');
    expect(version.status).toBe('current');
    expect(requests[1].url).toBe('https://site.atlassian.net/wiki/api/v2/pages/42');
    expect(live.status).toBe('draft');
    expect(live.version).toEqual({ number: 1 });
    expect(live.title).toBe('Page in Confluence');
    expect(live.body.value).toBe('<p>patched</p>');
  });

  it('keeps the saved version and says so when the live doc refuses the body', async (): Promise<void> => {
    const { app, frontmatter, client } = fake(200, 500);
    const outcome: PushOutcome = await pushNote({ app, client, users: new UserDirectory(client) }, requestFor([0], hashBody(BODY), true));
    expect(outcome).toEqual({ kind: 'sent', version: 13, rerendered: false, liveFailed: true });
    expect(frontmatter['confluence-version']).toBe(13);
  });

  it('leaves a live doc untouched when the version is refused', async (): Promise<void> => {
    const { app, requests, client } = fake(409);
    const outcome: PushOutcome = await pushNote({ app, client, users: new UserDirectory(client) }, requestFor([0], hashBody(BODY), true));
    expect(outcome).toEqual({ kind: 'conflict' });
    expect(requests.length).toBe(1);
  });

  it('reports a conflict when Confluence refused the version, and changes nothing', async (): Promise<void> => {
    const { app, frontmatter, client } = fake(409);
    const outcome: PushOutcome = await pushNote({ app, client, users: new UserDirectory(client) }, requestFor([0, 1]));
    expect(outcome).toEqual({ kind: 'conflict' });
    expect(frontmatter['confluence-version']).toBe(12);
  });

  it('stops when the note changed since the review, before any request', async (): Promise<void> => {
    const { app, requests, client } = fake(200);
    const outcome: PushOutcome = await pushNote({ app, client, users: new UserDirectory(client) }, requestFor([0], 'another hash'));
    expect(outcome).toEqual({ kind: 'stale' });
    expect(requests).toEqual([]);
  });

  it('sends nothing when no change is switched on', async (): Promise<void> => {
    const { app, requests, client } = fake(200);
    expect(await pushNote({ app, client, users: new UserDirectory(client) }, requestFor([]))).toEqual({ kind: 'nothing' });
    expect(requests).toEqual([]);
  });
});
