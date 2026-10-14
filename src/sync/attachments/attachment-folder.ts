import { sanitizeFileName } from '../placement/file-name';
import { joinPath } from '../../shared/vault-path';
import type { SiblingNames } from '../placement/sibling-names';

/** Attachments live under the space root, keyed by page id, so sibling pages never collide. */
export const ATTACHMENTS_FOLDER: string = '_attachments';
const MAX_STEM: number = 60;
const MAX_EXTENSION: number = 12;

export function attachmentFolder(rootFolder: string, pageId: string): string {
  return joinPath(rootFolder, ATTACHMENTS_FOLDER, pageId);
}

/**
 * A Confluence attachment name can contain anything. The extension is kept,
 * because it decides whether Obsidian embeds the file as an image.
 */
export function attachmentFileName(title: string, names: SiblingNames): string {
  const dot: number = title.lastIndexOf('.');
  let stem: string = title;
  let extension: string = '';
  if (dot > 0) {
    stem = title.slice(0, dot);
    extension = title.slice(dot).toLowerCase().replace(/[^a-z0-9.]/g, '').slice(0, MAX_EXTENSION);
  }
  return names.claim(sanitizeFileName(stem, 'file', MAX_STEM), extension);
}
