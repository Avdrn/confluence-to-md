/**
 * What a single page needs from the rest of its space to render links: the
 * notes its page links can point at, and its child notes. Both come from the
 * managed index, so no space listing is fetched.
 */

import { titleKey } from '../sync/links/title-key';
import { stemOf } from '../shared/vault-path';
import type { LinkedNote } from '../sync/database/render-database';
import type { ChildNoteLink } from '../sync/placement/placement.type';
import type { ManagedIndex, ManagedNote } from '../vault/managed-note-index';

/** Every synced note by the content id it mirrors, for the links in a database's cells. */
export function notesByIdOf(index: ManagedIndex): Map<string, LinkedNote> {
  const byId: Map<string, LinkedNote> = new Map<string, LinkedNote>();
  for (const [id, note] of index.notes) {
    byId.set(id, { notePath: note.file.path, title: note.fields.title || stemOf(note.file.path) });
  }
  return byId;
}

/** Lowercased "spacekey\ntitle" to note path, for every synced note of the space. */
export function pagesByTitleOf(index: ManagedIndex, spaceKey: string): Map<string, string> {
  const byTitle: Map<string, string> = new Map<string, string>();
  for (const note of index.notes.values()) {
    if (note.fields.title) {
      byTitle.set(titleKey(spaceKey, note.fields.title), note.file.path);
    }
  }
  return byTitle;
}

/** The synced child notes of a page, in title order, for a children macro. */
export function childrenOf(index: ManagedIndex, pageId: string): Array<ChildNoteLink> {
  const children: Array<ChildNoteLink> = new Array<ChildNoteLink>();
  for (const note of index.notes.values()) {
    if (note.fields.parentId === pageId) {
      children.push({ title: note.fields.title, notePath: note.file.path });
    }
  }
  return children.sort((a: ChildNoteLink, b: ChildNoteLink): number => a.title.localeCompare(b.title));
}

/** The note that mirrors a page, or null. */
export function noteOf(index: ManagedIndex, pageId: string): ManagedNote | null {
  return index.notes.get(pageId) ?? null;
}
