/** The message of whatever was thrown, for a notice or a report line. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}
