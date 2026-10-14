export interface SyncOptions {
  /** Plan only: fetch the listing, decide, report, write nothing. */
  dryRun: boolean;
  /** Re-render every note whether or not its version moved. */
  force: boolean;
  downloadAttachments: boolean;
}
