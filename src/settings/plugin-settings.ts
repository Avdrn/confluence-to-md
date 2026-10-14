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
}

export const DEFAULT_SETTINGS: ConfluenceSyncSettings = {
  siteUrl: '',
  email: '',
  tokenSecretName: '',
  downloadAttachments: true,
  concurrency: 4,
  showReportAfterSync: true,
  confirmTrashAbove: 5
};
