import { describe, expect, it } from 'vitest';
import { withRetry } from '../../src/confluence/api/retry-policy';
import type { RetryOptions } from '../../src/confluence/api/retry-policy';
import type { HttpResponse } from '../../src/confluence/api/request-fn.type';

function response(status: number, retryAfterSeconds: number = 0): HttpResponse {
  return { status, retryAfterSeconds, text: (): string => '', arrayBuffer: (): ArrayBuffer => new ArrayBuffer(0) };
}

function sequence(responses: Array<HttpResponse | Error>): () => Promise<HttpResponse> {
  let index: number = 0;
  return async (): Promise<HttpResponse> => {
    const next: HttpResponse | Error = responses[index];
    index++;
    if (next instanceof Error) {
      throw next;
    }
    return next;
  };
}

function options(delays: Array<number>): RetryOptions {
  return {
    maxAttempts: 5,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    sleep: async (ms: number): Promise<void> => {
      delays.push(ms);
    }
  };
}

describe('withRetry', (): void => {
  it('returns a success without sleeping', async (): Promise<void> => {
    const delays: Array<number> = [];
    const result: HttpResponse = await withRetry(sequence([response(200)]), options(delays));
    expect(result.status).toBe(200);
    expect(delays).toEqual([]);
  });

  it('does not retry a client error', async (): Promise<void> => {
    const delays: Array<number> = [];
    expect((await withRetry(sequence([response(404), response(200)]), options(delays))).status).toBe(404);
    expect(delays).toEqual([]);
  });

  it('honours Retry-After on a rate limit, then backs off exponentially', async (): Promise<void> => {
    const delays: Array<number> = [];
    const result: HttpResponse = await withRetry(sequence([response(429, 2), response(500), response(503), response(200)]), options(delays));
    expect(result.status).toBe(200);
    expect(delays).toEqual([2000, 2000, 4000]);
  });

  it('retries a network failure and gives up after the last attempt', async (): Promise<void> => {
    const delays: Array<number> = [];
    const failing: () => Promise<HttpResponse> = sequence([new Error('a'), new Error('b'), new Error('c'), new Error('d'), new Error('e')]);
    await expect(withRetry(failing, options(delays))).rejects.toThrow('e');
    expect(delays).toEqual([1000, 2000, 4000, 8000]);
  });

  it('returns the last server error when attempts run out', async (): Promise<void> => {
    const delays: Array<number> = [];
    const result: HttpResponse = await withRetry(sequence([response(500), response(500), response(500), response(500), response(502)]), options(delays));
    expect(result.status).toBe(502);
    expect(delays.length).toBe(4);
  });
});
