import type { CancellationToken } from './cancellation';

/**
 * Limits how many requests are in flight at once, so a large space does not
 * open hundreds of connections, and refuses to start new work once cancelled.
 */
export class RequestQueue {
  private active: number = 0;
  private readonly waiting: Array<() => void> = new Array<() => void>();

  public constructor(
    private readonly limit: number,
    private readonly token: CancellationToken
  ) {}

  public async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      this.token.throwIfCancelled();
      return await task();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve: () => void): void => {
      this.waiting.push((): void => {
        this.active++;
        resolve();
      });
    });
  }

  private release(): void {
    this.active--;
    const next: (() => void) | undefined = this.waiting.shift();
    if (next) {
      next();
    }
  }
}
