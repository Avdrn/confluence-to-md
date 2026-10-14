import type { App, TFile } from 'obsidian';
import { PROPERTY } from '../sync/front-matter/managed-front-matter';

export interface MarkerInfo {
  spaceName: string;
  spaceId: string;
  site: string;
}

/** Front-matter of the marker note as Obsidian hands it to `processFrontMatter`. */
interface MarkerProperties {
  [key: string]: unknown;
}

/** Records when the space was last synced. The marker's body is never touched. */
export async function updateMarker(app: App, markerFile: TFile, info: MarkerInfo): Promise<void> {
  await app.fileManager.processFrontMatter(markerFile, (frontmatter: MarkerProperties): void => {
    frontmatter[PROPERTY.lastSync] = new Date().toISOString();
    frontmatter[PROPERTY.spaceName] = info.spaceName;
    frontmatter[PROPERTY.spaceId] = info.spaceId;
    frontmatter[PROPERTY.site] = info.site;
  });
}

/** Refreshes the recorded body hash of a note whose links Obsidian rewrote after a rename. */
export async function updateRecordedHash(app: App, file: TFile, hash: string): Promise<void> {
  await app.fileManager.processFrontMatter(file, (frontmatter: MarkerProperties): void => {
    frontmatter[PROPERTY.hash] = hash;
  });
}
