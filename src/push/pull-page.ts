/**
 * One note refreshed from its page: the sync's pipeline for a single page,
 * at the note's current path. Renames are left to the next sync.
 */

import type { App, TFile } from 'obsidian';
import { fetchPageBody } from '../confluence/page-body';
import { AttachmentSync } from '../sync/attachments/attachment-sync';
import { readManagedFrontMatter } from '../sync/front-matter/managed-front-matter';
import { renderNote } from '../sync/note-renderer';
import { SyncReport } from '../sync/report/sync-report';
import { buildManagedIndex } from '../vault/managed-note-index';
import { NoteWriter } from '../vault/note-writer';
import { childrenOf, pagesByTitleOf } from './space-links';
import type { ConfluenceClient } from '../confluence/api/confluence-client';
import type { PageBody } from '../confluence/page-body';
import type { UserDirectory } from '../confluence/user-directory';
import type { ManagedFrontMatterFields } from '../sync/front-matter/managed-front-matter';
import type { RenderedNote } from '../sync/note-renderer';
import type { ManagedIndex } from '../vault/managed-note-index';
import type { SpaceScope } from '../vault/marker-notes';

export interface PullContext {
  app: App;
  client: ConfluenceClient;
  users: UserDirectory;
  downloadAttachments: boolean;
}

export interface PullOutcome {
  version: number;
  /** False when the note already read exactly like the page. */
  changed: boolean;
  /** The page was renamed in Confluence; the note keeps its name until the next sync. */
  titleChanged: boolean;
  warnings: Array<string>;
}

export async function pullNote(context: PullContext, file: TFile, scope: SpaceScope): Promise<PullOutcome> {
  const { app, client } = context;
  const fields: ManagedFrontMatterFields | null = readManagedFrontMatter(app.metadataCache.getFileCache(file)?.frontmatter);
  if (!fields) {
    throw new Error('This note is not a synced Confluence page.');
  }
  const page: PageBody = await fetchPageBody(client, fields.pageId);
  const index: ManagedIndex = buildManagedIndex(app, scope.rootFolder, scope.spaceKey);
  const writer: NoteWriter = new NoteWriter(app);
  const report: SyncReport = new SyncReport(scope.spaceKey);
  let attachments: Map<string, string> = new Map<string, string>();
  if (context.downloadAttachments) {
    attachments = await new AttachmentSync(app, client, writer).syncPage(scope.rootFolder, page.id, report);
  }
  const rendered: RenderedNote = await renderNote(client, context.users, {
    page,
    spaceKey: scope.spaceKey,
    title: page.title,
    type: 'page',
    parentId: fields.parentId,
    webUrl: page.webUrl,
    notePath: file.path,
    pagesByTitle: pagesByTitleOf(index, scope.spaceKey),
    children: childrenOf(index, page.id),
    attachments
  });
  const before: string = await app.vault.cachedRead(file);
  const changed: boolean = before !== rendered.content;
  if (changed) {
    await writer.write(file.path, rendered.content);
  }
  return { version: page.version, changed, titleChanged: page.title !== fields.title, warnings: report.warnings };
}
