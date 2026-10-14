import { FileSystemAdapter, Platform } from 'obsidian';
import type { App } from 'obsidian';

/** Windows refuses paths longer than this unless long paths are enabled. */
const WINDOWS_MAX_PATH: number = 259;

/** The longest vault-relative path the file system allows, or 0 for no limit. */
export function maxVaultPathLength(app: App): number {
  if (!Platform.isWin) {
    return 0;
  }
  const adapter: unknown = app.vault.adapter;
  if (!(adapter instanceof FileSystemAdapter)) {
    return 0;
  }
  return Math.max(0, WINDOWS_MAX_PATH - adapter.getBasePath().length - 1);
}
