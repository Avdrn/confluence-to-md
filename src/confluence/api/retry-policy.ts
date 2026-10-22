import type { HttpResponse } from './request-fn.type';

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  sleep: (ms: number) => Promise<void>;
  /** Which statuses are worth asking again. */
  retryOn: (status: number) => boolean;
  /** Whether a request that threw, usually a network failure, is sent again. */
  retryOnFailure: boolean;
}

/** 429 and 5xx: the server is busy or broken, not the request. */
export function isTransientStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/** A write is repeated only when the server asked for patience: a repeated PUT could land twice. */
export function isRateLimitStatus(status: number): boolean {
  return status === 429;
}

export const DEFAULT_RETRY: RetryOptions = {
  maxAttempts: 5,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  sleep: (ms: number): Promise<void> => new Promise<void>((resolve: () => void): void => {
    setTimeout(resolve, ms);
  }),
  retryOn: isTransientStatus,
  retryOnFailure: true
};

export const WRITE_RETRY: RetryOptions = { ...DEFAULT_RETRY, retryOn: isRateLimitStatus, retryOnFailure: false };

/**
 * Repeats a request on the statuses `retryOn` accepts, and on a network
 * failure when `retryOnFailure` says so, with exponential backoff capped at
 * `maxDelayMs`. A `Retry-After` from the server wins over the backoff. Any
 * other status is returned as it is: a 404 will not become a 200 by asking again.
 */
export async function withRetry(
  attempt: () => Promise<HttpResponse>,
  options: RetryOptions = DEFAULT_RETRY
): Promise<HttpResponse> {
  let lastError: unknown = new Error('No attempt was made');
  for (let n: number = 1; n <= options.maxAttempts; n++) {
    try {
      const response: HttpResponse = await attempt();
      if (!options.retryOn(response.status) || n === options.maxAttempts) {
        return response;
      }
      await options.sleep(delayFor(n, response.retryAfterSeconds, options));
    } catch (err) {
      lastError = err;
      if (!options.retryOnFailure || n === options.maxAttempts) {
        throw err;
      }
      await options.sleep(delayFor(n, 0, options));
    }
  }
  throw lastError;
}

function delayFor(attempt: number, retryAfterSeconds: number, options: RetryOptions): number {
  if (retryAfterSeconds > 0) {
    return Math.min(retryAfterSeconds * 1000, options.maxDelayMs);
  }
  return Math.min(options.baseDelayMs * 2 ** (attempt - 1), options.maxDelayMs);
}
