/**
 * The one HTTP shape the client needs. Obsidian's `requestUrl` implements it
 * in the plugin; tests pass a fake.
 */

export type HttpMethod = 'GET' | 'PUT' | 'POST';

export interface HttpHeaders {
  Authorization: string;
  Accept: string;
}

export interface HttpRequest {
  url: string;
  method: HttpMethod;
  headers: HttpHeaders;
  /** Request body, for PUT and POST. */
  body?: string;
  /** Media type of the body, for PUT and POST. */
  contentType?: string;
}

export interface HttpResponse {
  status: number;
  /** Seconds the server asked us to wait before retrying, 0 when it did not say. */
  retryAfterSeconds: number;
  text(): string;
  arrayBuffer(): ArrayBuffer;
}

export type RequestFn = (request: HttpRequest) => Promise<HttpResponse>;
