import { TFolder } from 'obsidian';
import type { App, Vault } from 'obsidian';
import { baseName, parentOf } from '../shared/vault-path';

/** Creates a folder and every missing parent, tolerating a parallel creation. */
export async function ensureFolder(vault: Vault, path: string): Promise<void> {
  if (!path || vault.getFolderByPath(path)) {
    return;
  }
  await ensureFolder(vault, parentOf(path));
  if (vault.getFolderByPath(path)) {
    return;
  }
  try {
    await vault.createFolder(path);
  } catch (err) {
    if (vault.getFolderByPath(path)) {
      return;
    }
    throw err;
  }
}

/** Every folder below `root`, deepest first, so children are handled before parents. */
export function foldersUnder(root: TFolder): Array<TFolder> {
  const found: Array<TFolder> = new Array<TFolder>();
  for (const child of root.children) {
    if (child instanceof TFolder) {
      found.push(...foldersUnder(child));
      found.push(child);
    }
  }
  return found;
}

/**
 * Moves empty folders the placement no longer needs to the trash. A folder
 * the user owns, or one still in the placement, is never touched.
 */
export async function trashEmptyFolders(
  app: App,
  root: TFolder,
  keep: ReadonlySet<string>,
  reserved: ReadonlyMap<string, ReadonlySet<string>>
): Promise<Array<string>> {
  const trashed: Array<string> = new Array<string>();
  for (const folder of foldersUnder(root)) {
    if (folder.children.length > 0 || keep.has(folder.path)) {
      continue;
    }
    if (reserved.get(parentOf(folder.path))?.has(baseName(folder.path).toLowerCase())) {
      continue;
    }
    await app.vault.trash(folder, false);
    trashed.push(folder.path);
  }
  return trashed;
}
