/**
 * One note refreshed from its page: the sync's pipeline for a single page,
 * at the note's current path. Renames are left to the next sync.
 */

import type { App, TFile } from 'obsidian';
import { fetchPageBody } from '../confluence/page-body';
import { CONVERTER_VERSION } from '../convert/converter-version';
import { stemOf } from '../shared/vault-path';
import { AttachmentSync } from '../sync/attachments/attachment-sync';
import { fetchDatabaseNote } from '../sync/database/database-note';
import { readManagedFrontMatter, serializeFrontMatter } from '../sync/front-matter/managed-front-matter';
import { renderNote } from '../sync/note-renderer';
import { hashBody } from '../sync/plan/body-hash';
import { SyncReport } from '../sync/report/sync-report';
import { buildManagedIndex } from '../vault/managed-note-index';
import { NoteWriter } from '../vault/note-writer';
import { childrenOf, notesByIdOf, pagesByTitleOf } from './space-links';
import type { ConfluenceClient } from '../confluence/api/confluence-client';
import type { PageBody } from '../confluence/page-body';
import type { UserDirectory } from '../confluence/user-directory';
import type { DatabaseNote } from '../sync/database/database-note';
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
  if (fields.type === 'database') {
    return pullDatabase(context, file, scope, fields);
  }
  if (fields.type !== 'page') {
    throw new Error('This note mirrors a Confluence whiteboard or embed. Run "Sync this space" to refresh it.');
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

/** The note a sync writes for a database, at the note's current path. */
async function pullDatabase(
  context: PullContext,
  file: TFile,
  scope: SpaceScope,
  fields: ManagedFrontMatterFields
): Promise<PullOutcome> {
  const { app, client } = context;
  const index: ManagedIndex = buildManagedIndex(app, scope.rootFolder, scope.spaceKey);
  const note: DatabaseNote = await fetchDatabaseNote(client, context.users, fields.pageId, notesByIdOf(index));
  const title: string = note.record.title || fields.title;
  const frontMatter: string = serializeFrontMatter({
    pageId: fields.pageId,
    spaceKey: scope.spaceKey,
    title,
    version: note.record.version,
    hash: hashBody(note.body),
    converter: CONVERTER_VERSION,
    url: note.record.webUrl,
    parentId: note.record.parentId || fields.parentId,
    type: 'database',
    fileStem: stemOf(file.path)
  });
  const content: string = `${frontMatter}${note.body}\n`;
  const before: string = await app.vault.cachedRead(file);
  const changed: boolean = before !== content;
  if (changed) {
    await new NoteWriter(app).write(file.path, content);
  }
  return { version: note.record.version, changed, titleChanged: title !== fields.title, warnings: [] };
}
