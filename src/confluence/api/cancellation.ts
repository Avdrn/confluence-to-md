export class CancelledError extends Error {
  public constructor() {
    super('Sync cancelled');
    this.name = 'CancelledError';
  }
}

/** Set once by the UI, checked by every stage that could still do work. */
export class CancellationToken {
  private cancelled: boolean = false;

  public cancel(): void {
    this.cancelled = true;
  }

  public get isCancelled(): boolean {
    return this.cancelled;
  }

  public throwIfCancelled(): void {
    if (this.cancelled) {
      throw new CancelledError();
    }
  }
}
