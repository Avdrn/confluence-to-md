/**
 * "Add Confluence space here": pick a space, drop a marker note into the
 * folder, and offer to sync straight away.
 */

import type { App, TFile } from 'obsidian';
import { listSpaces } from '../confluence/space-list';
import { spaceUrlOf } from '../confluence/page-url';
import { PROPERTY } from '../sync/front-matter/managed-front-matter';
import { sanitizeFileName } from '../sync/placement/file-name';
import { joinPath } from '../shared/vault-path';
import { SpacePickerModal } from './space-picker-modal';
import { confirm } from './confirm-modal';
import { notify, notifyError } from './notices';
import type { ConfluenceClient } from '../confluence/api/confluence-client';
import type { SpaceSummary } from '../confluence/space-list';
import type { SpaceScope } from '../vault/marker-notes';

export interface AddSpaceDeps {
  app: App;
  pluginId: string;
  createClient: () => ConfluenceClient;
  syncScope: (scope: SpaceScope) => Promise<void>;
}

export async function addSpaceHere(deps: AddSpaceDeps, targetFolder: string): Promise<void> {
  try {
    const client: ConfluenceClient = deps.createClient();
    const spaces: Array<SpaceSummary> = await listSpaces(client);
    if (spaces.length === 0) {
      notify('Your account cannot see any Confluence space.');
      return;
    }
    new SpacePickerModal(deps.app, spaces, (space: SpaceSummary): void => {
      void createMarkerAndSync(deps, client, targetFolder, space);
    }).open();
  } catch (err) {
    notifyError(deps.app, err, deps.pluginId);
  }
}

async function createMarkerAndSync(
  deps: AddSpaceDeps,
  client: ConfluenceClient,
  targetFolder: string,
  space: SpaceSummary
): Promise<void> {
  try {
    const markerFile: TFile = await createMarker(deps.app, client.site, targetFolder, space);
    await deps.app.workspace.openLinkText(markerFile.path, '', false);
    const folderLabel: string = targetFolder || 'the vault root';
    const syncNow: boolean = await confirm(
      deps.app,
      'Sync now?',
      `The space "${space.name}" will be mirrored into ${folderLabel}. Start the first sync now?`,
      'Sync now'
    );
    if (syncNow) {
      await deps.syncScope({ spaceKey: space.key, rootFolder: targetFolder, markerFile });
    }
  } catch (err) {
    notifyError(deps.app, err, deps.pluginId);
  }
}

async function createMarker(app: App, siteUrl: string, targetFolder: string, space: SpaceSummary): Promise<TFile> {
  const stem: string = sanitizeFileName(space.key, 'Confluence');
  const path: string = freePath(app, targetFolder, stem);
  const content: string = [
    '---',
    `${PROPERTY.space}: ${JSON.stringify(space.key)}`,
    '---',
    '',
    `This folder mirrors the Confluence space **${space.name}** (${space.key}).`,
    '',
    `- Confluence: ${spaceUrlOf(siteUrl, space.key)}`,
    '- Run the command **Confluence Space Sync: Sync this space** from any note in this folder to update it.',
    '- Confluence is the source of truth: notes synced from it are overwritten on every sync. This note is yours.',
    ''
  ].join('\n');
  return app.vault.create(path, content);
}

function freePath(app: App, folder: string, stem: string): string {
  let candidate: string = joinPath(folder, `${stem}.md`);
  let counter: number = 2;
  while (app.vault.getAbstractFileByPath(candidate)) {
    candidate = joinPath(folder, `${stem} (${counter}).md`);
    counter++;
  }
  return candidate;
}
