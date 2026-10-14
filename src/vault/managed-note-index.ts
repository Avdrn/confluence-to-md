/**
 * Which notes under a space root the plugin owns, read from the metadata
 * cache so no file has to be opened.
 *
 * Everything else under the root belongs to the user. Its names are reserved
 * so the placement never writes over a note or folder it did not create.
 */

import { TFile, TFolder } from 'obsidian';
import type { App, CachedMetadata } from 'obsidian';
import { readManagedFrontMatter } from '../sync/front-matter/managed-front-matter';
import type { ManagedFrontMatterFields } from '../sync/front-matter/managed-front-matter';
import { ATTACHMENTS_FOLDER } from '../sync/attachments/attachment-folder';
import { stemOf } from '../shared/vault-path';

export interface ManagedNote {
  file: TFile;
  fields: ManagedFrontMatterFields;
}

export interface ManagedIndex {
  /** Page id to the note that mirrors it. */
  notes: Map<string, ManagedNote>;
  /** Paths of notes that claim a page id another note already holds. */
  duplicates: Array<string>;
  /** Folder path to the lowercased names taken by the user's own notes and folders. */
  reservedNames: Map<string, Set<string>>;
}

interface FolderContents {
  hasManaged: boolean;
  hasUnmanaged: boolean;
}

export function buildManagedIndex(app: App, rootFolder: string, spaceKey: string): ManagedIndex {
  const index: ManagedIndex = { notes: new Map<string, ManagedNote>(), duplicates: [], reservedNames: new Map<string, Set<string>>() };
  const root: TFolder | null = resolveFolder(app, rootFolder);
  if (!root) {
    return index;
  }
  const managedPaths: Set<string> = new Set<string>();
  collectManaged(app, root, spaceKey, index, managedPaths);
  reserveNames(root, rootFolder, managedPaths, index.reservedNames);
  return index;
}

export function resolveFolder(app: App, path: string): TFolder | null {
  if (!path) {
    return app.vault.getRoot();
  }
  return app.vault.getFolderByPath(path);
}

function collectManaged(
  app: App,
  folder: TFolder,
  spaceKey: string,
  index: ManagedIndex,
  managedPaths: Set<string>
): void {
  for (const child of folder.children) {
    if (child instanceof TFolder) {
      collectManaged(app, child, spaceKey, index, managedPaths);
      continue;
    }
    if (!(child instanceof TFile) || child.extension !== 'md') {
      continue;
    }
    const fields: ManagedFrontMatterFields | null = managedFields(app, child, spaceKey);
    if (!fields) {
      continue;
    }
    managedPaths.add(child.path);
    if (index.notes.has(fields.pageId)) {
      index.duplicates.push(child.path);
      continue;
    }
    index.notes.set(fields.pageId, { file: child, fields });
  }
}

function managedFields(app: App, file: TFile, spaceKey: string): ManagedFrontMatterFields | null {
  const cache: CachedMetadata | null = app.metadataCache.getFileCache(file);
  const fields: ManagedFrontMatterFields | null = readManagedFrontMatter(cache?.frontmatter);
  if (!fields || fields.spaceKey.toLowerCase() !== spaceKey.toLowerCase()) {
    return null;
  }
  return fields;
}

/**
 * A note is reserved unless the plugin wrote it. A folder is reserved when it
 * holds something of the user's and nothing of the plugin's: a folder the two
 * share keeps its name, and the user's files inside it stay where they are.
 */
function reserveNames(
  folder: TFolder,
  folderPath: string,
  managedPaths: ReadonlySet<string>,
  reserved: Map<string, Set<string>>
): FolderContents {
  const contents: FolderContents = { hasManaged: false, hasUnmanaged: false };
  const names: Set<string> = new Set<string>();
  for (const child of folder.children) {
    if (child instanceof TFolder) {
      const inner: FolderContents = reserveNames(child, child.path, managedPaths, reserved);
      contents.hasManaged = contents.hasManaged || inner.hasManaged;
      contents.hasUnmanaged = contents.hasUnmanaged || inner.hasUnmanaged;
      if (child.name === ATTACHMENTS_FOLDER || (inner.hasUnmanaged && !inner.hasManaged)) {
        names.add(child.name.toLowerCase());
      }
      continue;
    }
    if (managedPaths.has(child.path)) {
      contents.hasManaged = true;
      continue;
    }
    contents.hasUnmanaged = true;
    if (child instanceof TFile && child.extension === 'md') {
      names.add(stemOf(child.path).toLowerCase());
    }
  }
  if (names.size > 0) {
    reserved.set(folderPath, names);
  }
  return contents;
}
