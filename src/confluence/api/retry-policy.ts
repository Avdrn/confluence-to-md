import type { HttpResponse } from './request-fn.type';

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  sleep: (ms: number) => Promise<void>;
}

export const DEFAULT_RETRY: RetryOptions = {
  maxAttempts: 5,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  sleep: (ms: number): Promise<void> => new Promise<void>((resolve: () => void): void => {
    setTimeout(resolve, ms);
  })
};

/**
 * Repeats a request on 429, on 5xx and on a network failure, with exponential
 * backoff capped at `maxDelayMs`. A `Retry-After` from the server wins over the
 * backoff. Any other status is returned as it is: a 404 will not become a 200
 * by asking again.
 */
export async function withRetry(
  attempt: () => Promise<HttpResponse>,
  options: RetryOptions = DEFAULT_RETRY
): Promise<HttpResponse> {
  let lastError: unknown = new Error('No attempt was made');
  for (let n: number = 1; n <= options.maxAttempts; n++) {
    try {
      const response: HttpResponse = await attempt();
      if (!shouldRetry(response.status) || n === options.maxAttempts) {
        return response;
      }
      await options.sleep(delayFor(n, response.retryAfterSeconds, options));
    } catch (err) {
      lastError = err;
      if (n === options.maxAttempts) {
        throw err;
      }
      await options.sleep(delayFor(n, 0, options));
    }
  }
  throw lastError;
}

function shouldRetry(status: number): boolean {
  return status === 429 || status >= 500;
}

function delayFor(attempt: number, retryAfterSeconds: number, options: RetryOptions): number {
  if (retryAfterSeconds > 0) {
    return Math.min(retryAfterSeconds * 1000, options.maxDelayMs);
  }
  return Math.min(options.baseDelayMs * 2 ** (attempt - 1), options.maxDelayMs);
}
