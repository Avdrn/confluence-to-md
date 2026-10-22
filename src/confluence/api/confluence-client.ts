import { ConfluenceApiError } from './api-error';
import { DEFAULT_RETRY, WRITE_RETRY, withRetry } from './retry-policy';
import type { RetryOptions } from './retry-policy';
import type { RequestQueue } from './request-queue';
import type { HttpMethod, HttpResponse, RequestFn } from './request-fn.type';

/** Confluence returns both "subType" and "subtype", which breaks strict JSON parsers. */
const DUPLICATE_SUBTYPE: RegExp = /"subType"\s*:\s*"[^"]*",?\s*/g;
const ABSOLUTE_URL: RegExp = /^https?:\/\//i;
const DETAIL_LENGTH: number = 200;
/** A 400 explains what was wrong with the body, and that explanation is worth showing in full. */
const BAD_REQUEST_DETAIL_LENGTH: number = 800;

interface Outgoing {
  method: HttpMethod;
  url: string;
  body?: string;
  contentType?: string;
}

/**
 * Every Confluence request goes through here: one place for authentication,
 * concurrency, retries and error mapping.
 */
export class ConfluenceClient {
  public constructor(
    private readonly siteUrl: string,
    private readonly authorization: string,
    private readonly request: RequestFn,
    private readonly queue: RequestQueue,
    private readonly retry: RetryOptions = DEFAULT_RETRY,
    private readonly writeRetry: RetryOptions = WRITE_RETRY
  ) {}

  /** The Atlassian site, without a trailing slash. */
  public get site(): string {
    return this.siteUrl;
  }

  /** Site-relative paths such as `/wiki/api/v2/spaces` become absolute. */
  public absolute(pathOrUrl: string): string {
    if (ABSOLUTE_URL.test(pathOrUrl)) {
      return pathOrUrl;
    }
    return `${this.siteUrl}${pathOrUrl}`;
  }

  public async getJson<T>(pathOrUrl: string): Promise<T> {
    const response: HttpResponse = await this.send({ method: 'GET', url: this.absolute(pathOrUrl) }, this.retry);
    return parseJson<T>(response);
  }

  public async getBinary(pathOrUrl: string): Promise<ArrayBuffer> {
    const response: HttpResponse = await this.send({ method: 'GET', url: this.absolute(pathOrUrl) }, this.retry);
    return response.arrayBuffer();
  }

  /** A JSON PUT. Only a rate limit is retried: a write that may have landed is not sent twice. */
  public async putJson<T>(pathOrUrl: string, payload: unknown): Promise<T> {
    const response: HttpResponse = await this.send({
      method: 'PUT',
      url: this.absolute(pathOrUrl),
      body: JSON.stringify(payload),
      contentType: 'application/json'
    }, this.writeRetry);
    return parseJson<T>(response);
  }

  private async send(outgoing: Outgoing, retry: RetryOptions): Promise<HttpResponse> {
    const response: HttpResponse = await this.queue.run((): Promise<HttpResponse> =>
      withRetry((): Promise<HttpResponse> => this.request({
        url: outgoing.url,
        method: outgoing.method,
        body: outgoing.body,
        contentType: outgoing.contentType,
        headers: { Authorization: this.authorization, Accept: 'application/json' }
      }), retry)
    );
    if (response.status >= 400) {
      throw new ConfluenceApiError(response.status, outgoing.url, errorDetail(response));
    }
    return response;
  }
}

/** `Basic` authorization for an Atlassian account and API token. */
export function basicAuthorization(email: string, token: string): string {
  const bytes: Uint8Array = new TextEncoder().encode(`${email}:${token}`);
  let binary: string = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `Basic ${btoa(binary)}`;
}

function parseJson<T>(response: HttpResponse): T {
  return JSON.parse(response.text().replace(DUPLICATE_SUBTYPE, '')) as T;
}

function errorDetail(response: HttpResponse): string {
  let limit: number = DETAIL_LENGTH;
  if (response.status === 400) {
    limit = BAD_REQUEST_DETAIL_LENGTH;
  }
  try {
    return response.text().slice(0, limit).replace(/\s+/g, ' ').trim();
  } catch {
    return '';
  }
}
