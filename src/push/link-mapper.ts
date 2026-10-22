/**
 * What a wikilink or embed in the note points at in Confluence, read from the
 * vault: the target note's front-matter names its page, and an attachment
 * folder names the page a file belongs to.
 */

import type { App, TFile } from 'obsidian';
import { readManagedFrontMatter } from '../sync/front-matter/managed-front-matter';
import type { ManagedFrontMatterFields } from '../sync/front-matter/managed-front-matter';
import type { AttachmentRef, PageRef, StorageTargets } from './storage-writer';

/** Vault path of a downloaded attachment to what it is in Confluence. */
export type AttachmentIndex = ReadonlyMap<string, AttachmentRef>;

export function storageTargets(
  app: App,
  notePath: string,
  spaceKey: string,
  siteUrl: string,
  attachments: AttachmentIndex
): StorageTargets {
  return {
    siteUrl,
    spaceKey,
    page: (target: string): PageRef | null => {
      const fields: ManagedFrontMatterFields | null = managedFieldsOf(app, target, notePath);
      if (!fields) {
        return null;
      }
      return { title: fields.title, spaceKey: fields.spaceKey };
    },
    attachment: (target: string): AttachmentRef | null => {
      const file: TFile | null = app.metadataCache.getFirstLinkpathDest(target, notePath);
      if (!file) {
        return null;
      }
      return attachments.get(file.path) ?? null;
    }
  };
}

/** The managed front-matter of the note a link target resolves to, or null. */
export function managedFieldsOf(app: App, target: string, notePath: string): ManagedFrontMatterFields | null {
  const file: TFile | null = app.metadataCache.getFirstLinkpathDest(target, notePath);
  if (!file) {
    return null;
  }
  return readManagedFrontMatter(app.metadataCache.getFileCache(file)?.frontmatter);
}
