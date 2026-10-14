import { requestUrl } from 'obsidian';
import type { RequestUrlResponse } from 'obsidian';
import type { HttpRequest, HttpResponse, RequestFn } from './request-fn.type';

/**
 * HTTP through Obsidian, which bypasses CORS. A plain `fetch` from the
 * renderer is blocked by atlassian.net, so every request goes through here.
 */
export const obsidianRequest: RequestFn = async (request: HttpRequest): Promise<HttpResponse> => {
  const response: RequestUrlResponse = await requestUrl({
    url: request.url,
    method: 'GET',
    headers: {
      Authorization: request.headers.Authorization,
      Accept: request.headers.Accept
    },
    throw: false
  });
  return {
    status: response.status,
    retryAfterSeconds: retryAfterOf(response),
    text: (): string => response.text,
    arrayBuffer: (): ArrayBuffer => response.arrayBuffer
  };
};

function retryAfterOf(response: RequestUrlResponse): number {
  const raw: string | undefined = response.headers['retry-after'] ?? response.headers['Retry-After'];
  const seconds: number = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return 0;
  }
  return seconds;
}
