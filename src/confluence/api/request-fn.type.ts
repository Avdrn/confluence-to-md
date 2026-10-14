/**
 * The one HTTP shape the client needs. Obsidian's `requestUrl` implements it
 * in the plugin; tests pass a fake.
 */

export interface HttpHeaders {
  Authorization: string;
  Accept: string;
}

export interface HttpRequest {
  url: string;
  headers: HttpHeaders;
}

export interface HttpResponse {
  status: number;
  /** Seconds the server asked us to wait before retrying, 0 when it did not say. */
  retryAfterSeconds: number;
  text(): string;
  arrayBuffer(): ArrayBuffer;
}

export type RequestFn = (request: HttpRequest) => Promise<HttpResponse>;
