import { parseStorage } from './storage-parser';
import { renderStorage } from './storage-renderer';
import type { UserDirectory } from './storage-types';

/** Storage XHTML to markdown with placeholders, pure and synchronous. */
export function renderPage(storage: string, users: UserDirectory, siteUrl: string): string {
  return renderStorage(parseStorage(storage), users, siteUrl);
}
