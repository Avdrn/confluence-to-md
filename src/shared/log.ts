const PREFIX: string = '[Confluence Space Sync]';

export function logWarning(message: string): void {
  console.warn(`${PREFIX} ${message}`);
}

export function logError(message: string, err?: unknown): void {
  if (err === undefined) {
    console.error(`${PREFIX} ${message}`);
    return;
  }
  console.error(`${PREFIX} ${message}`, err);
}
