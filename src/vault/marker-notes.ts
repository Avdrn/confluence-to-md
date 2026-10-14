/**
 * A marker note carries `confluence-space: KEY` in its front-matter and makes
 * its folder the root of that space in the vault.
 */

import { TFile } from 'obsidian';
import type { App, TFolder } from 'obsidian';
import { readSpaceKey } from '../sync/front-matter/managed-front-matter';
import { isUnder } from '../shared/vault-path';

export interface SpaceScope {
  spaceKey: string;
  /** Vault folder the space is mirrored into. '' is the vault root. */
  rootFolder: string;
  markerFile: TFile;
}

export interface MarkerSearch {
  scopes: Array<SpaceScope>;
  warnings: Array<string>;
}

/** The space whose folder contains this file, walking up from its folder. */
export function findMarkerForFile(app: App, file: TFile): SpaceScope | null {
  let folder: TFolder | null = file.parent;
  while (folder) {
    const scope: SpaceScope | null = markerIn(app, folder);
    if (scope) {
      return scope;
    }
    if (folder.isRoot()) {
      return null;
    }
    folder = folder.parent;
  }
  return null;
}

/** Every marker note in the vault, one per folder, outermost only. */
export function findAllMarkers(app: App): MarkerSearch {
  const byFolder: Map<string, Array<SpaceScope>> = new Map<string, Array<SpaceScope>>();
  for (const file of app.vault.getMarkdownFiles()) {
    const scope: SpaceScope | null = scopeOf(app, file);
    if (!scope) {
      continue;
    }
    const siblings: Array<SpaceScope> = byFolder.get(scope.rootFolder) ?? [];
    siblings.push(scope);
    byFolder.set(scope.rootFolder, siblings);
  }
  const warnings: Array<string> = new Array<string>();
  const candidates: Array<SpaceScope> = new Array<SpaceScope>();
  for (const [folder, scopes] of byFolder) {
    if (scopes.length > 1) {
      warnings.push(`Folder "${folder || '/'}" holds ${scopes.length} space markers; skipped. Keep one per folder.`);
      continue;
    }
    candidates.push(scopes[0]);
  }
  const scopes: Array<SpaceScope> = candidates.filter((scope: SpaceScope): boolean => {
    const outer: SpaceScope | undefined = candidates.find((other: SpaceScope): boolean =>
      other !== scope && other.rootFolder !== scope.rootFolder && isUnder(scope.rootFolder, other.rootFolder)
    );
    if (outer) {
      warnings.push(`Space ${scope.spaceKey} in "${scope.rootFolder}" is nested inside space ${outer.spaceKey}; skipped.`);
      return false;
    }
    return true;
  });
  scopes.sort((a: SpaceScope, b: SpaceScope): number => a.rootFolder.localeCompare(b.rootFolder));
  return { scopes, warnings };
}

function markerIn(app: App, folder: TFolder): SpaceScope | null {
  for (const child of folder.children) {
    if (!(child instanceof TFile)) {
      continue;
    }
    const scope: SpaceScope | null = scopeOf(app, child);
    if (scope) {
      return scope;
    }
  }
  return null;
}

function scopeOf(app: App, file: TFile): SpaceScope | null {
  if (file.extension !== 'md') {
    return null;
  }
  const spaceKey: string = readSpaceKey(app.metadataCache.getFileCache(file)?.frontmatter);
  if (!spaceKey) {
    return null;
  }
  return { spaceKey, rootFolder: folderPath(file.parent), markerFile: file };
}

export function folderPath(folder: TFolder | null): string {
  if (!folder || folder.isRoot()) {
    return '';
  }
  return folder.path;
}
