/** What a sync does with notes that were changed in Obsidian and not sent to Confluence. */
export type UnpushedEditsPolicy = 'ask' | 'keep' | 'overwrite';

/** The user's answer when a sync asks about such notes. */
export type KeepEditsAnswer = 'keep' | 'overwrite' | 'cancel';

export interface SyncOptions {
  /** Plan only: fetch the listing, decide, report, write nothing. */
  dryRun: boolean;
  /** Re-render every note whether or not its version moved. */
  force: boolean;
  downloadAttachments: boolean;
  unpushedEdits: UnpushedEditsPolicy;
}
