import { ConfluenceApiError } from './api-error';
import { DEFAULT_RETRY, withRetry } from './retry-policy';
import type { RetryOptions } from './retry-policy';
import type { RequestQueue } from './request-queue';
import type { HttpResponse, RequestFn } from './request-fn.type';

/** Confluence returns both "subType" and "subtype", which breaks strict JSON parsers. */
const DUPLICATE_SUBTYPE: RegExp = /"subType"\s*:\s*"[^"]*",?\s*/g;
const ABSOLUTE_URL: RegExp = /^https?:\/\//i;

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
    private readonly retry: RetryOptions = DEFAULT_RETRY
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
    const response: HttpResponse = await this.send(this.absolute(pathOrUrl));
    return JSON.parse(response.text().replace(DUPLICATE_SUBTYPE, '')) as T;
  }

  public async getBinary(pathOrUrl: string): Promise<ArrayBuffer> {
    const response: HttpResponse = await this.send(this.absolute(pathOrUrl));
    return response.arrayBuffer();
  }

  private async send(url: string): Promise<HttpResponse> {
    const response: HttpResponse = await this.queue.run((): Promise<HttpResponse> =>
      withRetry((): Promise<HttpResponse> => this.request({
        url,
        headers: { Authorization: this.authorization, Accept: 'application/json' }
      }), this.retry)
    );
    if (response.status >= 400) {
      throw new ConfluenceApiError(response.status, url, errorDetail(response));
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

function errorDetail(response: HttpResponse): string {
  try {
    return response.text().slice(0, 200).replace(/\s+/g, ' ').trim();
  } catch {
    return '';
  }
}
