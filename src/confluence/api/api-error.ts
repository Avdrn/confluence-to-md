export class ConfluenceApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly url: string,
    detail: string
  ) {
    super(describe(status, url, detail));
    this.name = 'ConfluenceApiError';
  }

  public isAuth(): boolean {
    return this.status === 401 || this.status === 403;
  }

  public isNotFound(): boolean {
    return this.status === 404;
  }

  public isRateLimit(): boolean {
    return this.status === 429;
  }

  /** The version number sent with an update is not the next one: someone else saved first. */
  public isConflict(): boolean {
    return this.status === 409;
  }

  /** Confluence rejected the request itself, for example a body it cannot parse. */
  public isBadRequest(): boolean {
    return this.status === 400;
  }
}

function describe(status: number, url: string, detail: string): string {
  const base: string = `Confluence answered HTTP ${status} for ${url}`;
  if (!detail) {
    return base;
  }
  return `${base}: ${detail}`;
}
