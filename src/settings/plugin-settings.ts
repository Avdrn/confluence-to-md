import type { UnpushedEditsPolicy } from '../sync/sync-options';

export interface ConfluenceSyncSettings {
  /** For example https://yourcompany.atlassian.net */
  siteUrl: string;
  email: string;
  /** Name of the entry in Obsidian's secret storage that holds the API token. */
  tokenSecretName: string;
  downloadAttachments: boolean;
  /** Requests in flight at once. */
  concurrency: number;
  showReportAfterSync: boolean;
  /** Ask before trashing more notes than this in one run. */
  confirmTrashAbove: number;
  /** What a sync does with notes changed in Obsidian and not sent to Confluence. */
  unpushedEditsOnSync: UnpushedEditsPolicy;
  /** Whether notes can be sent back to Confluence at all. */
  enablePush: boolean;
  /** The default note written into the page history by a send. */
  pushVersionMessage: string;
}

export const DEFAULT_SETTINGS: ConfluenceSyncSettings = {
  siteUrl: '',
  email: '',
  tokenSecretName: '',
  downloadAttachments: true,
  concurrency: 4,
  showReportAfterSync: true,
  confirmTrashAbove: 5,
  unpushedEditsOnSync: 'ask',
  enablePush: false,
  pushVersionMessage: 'Updated from Obsidian'
};
