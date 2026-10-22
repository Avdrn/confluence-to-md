/**
 * Everything a push needs from Confluence and the vault, fetched once, so the
 * assessment itself can run again on every edit without a request.
 */

import { MarkdownView } from 'obsidian';
import type { App, TFile } from 'obsidian';
import { fetchPageBody } from '../confluence/page-body';
import { fetchDraft } from '../confluence/page-draft';
import { listAttachments } from '../confluence/attachments-api';
import { fetchIncludedBody, includedPageOf } from '../confluence/include-resolver';
import { collectMentionIds } from '../convert/mention-ids';
import { parseStorage } from '../convert/storage-parser';
import { segmentStorage } from '../convert/storage-segments';
import { attachmentPaths } from '../sync/attachments/attachment-sync';
import { attachmentFolder } from '../sync/attachments/attachment-folder';
import { PROPERTY, readManagedFrontMatter } from '../sync/front-matter/managed-front-matter';
import { buildManagedIndex } from '../vault/managed-note-index';
import { bodyOf, stripFrontMatter } from '../vault/note-body';
import { storageTargets } from './link-mapper';
import { assess } from './preflight';
import { childrenOf, pagesByTitleOf } from './space-links';
import type { ConfluenceClient } from '../confluence/api/confluence-client';
import type { PageBody } from '../confluence/page-body';
import type { PageDraft } from '../confluence/page-draft';
import type { UserDirectory } from '../confluence/user-directory';
import type { ConfluenceAttachment } from '../confluence/types/confluence-api.type';
import type { ManagedFrontMatterFields } from '../sync/front-matter/managed-front-matter';
import type { LinkResolveOptions } from '../sync/links/link-resolver';
import type { ManagedIndex } from '../vault/managed-note-index';
import type { SpaceScope } from '../vault/marker-notes';
import type { PushAssessment } from './preflight';
import type { AttachmentRef, StorageTargets } from './storage-writer';

export interface PushContext {
  app: App;
  client: ConfluenceClient;
  users: UserDirectory;
}

export interface PreparedPush {
  file: TFile;
  scope: SpaceScope;
  fields: ManagedFrontMatterFields;
  remote: PageBody;
  draft: PageDraft | null;
  includes: Map<number, string>;
  names: ReadonlyMap<string, string>;
  links: LinkResolveOptions;
  targets: StorageTargets;
}

const ATTACHMENT_FOLDER_REF: RegExp = /_attachments\/(\d+)\//g;

export async function preparePush(context: PushContext, file: TFile, scope: SpaceScope): Promise<PreparedPush> {
  const { app, client } = context;
  const frontmatter: unknown = app.metadataCache.getFileCache(file)?.frontmatter;
  const fields: ManagedFrontMatterFields | null = readManagedFrontMatter(frontmatter);
  if (!fields) {
    throw new Error('This note is not a synced Confluence page.');
  }
  if ((frontmatter as Record<string, unknown>)[PROPERTY.type]) {
    throw new Error('This note stands for a Confluence database, whiteboard or embed, which cannot be edited from Obsidian.');
  }
  const index: ManagedIndex = buildManagedIndex(app, scope.rootFolder, scope.spaceKey);
  if (index.duplicates.includes(file.path)) {
    throw new Error('Another note already mirrors this page. Keep one of the two.');
  }
  const remote: PageBody = await fetchPageBody(client, fields.pageId);
  const draft: PageDraft | null = await fetchDraft(client, fields.pageId, remote.versionWhen);
  const includes: Map<number, string> = await includedBodies(client, remote.storage, scope.spaceKey);
  const names: ReadonlyMap<string, string> = await context.users.resolve(mentionIds(remote.storage, includes));
  const own: Array<ConfluenceAttachment> = await listAttachments(client, fields.pageId);
  const attachments: Map<string, string> = new Map<string, string>();
  const attachmentIndex: Map<string, AttachmentRef> = new Map<string, AttachmentRef>();
  for (const target of attachmentPaths(own, attachmentFolder(scope.rootFolder, fields.pageId))) {
    attachments.set(target.attachment.title, target.path);
    attachmentIndex.set(target.path, { filename: target.attachment.title, pageTitle: '', spaceKey: scope.spaceKey });
  }
  await indexOtherPagesAttachments(context, index, scope, await bodyOf(app, file), fields.pageId, attachmentIndex);
  const links: LinkResolveOptions = {
    spaceKey: scope.spaceKey,
    siteUrl: client.site,
    pagesByTitle: pagesByTitleOf(index, scope.spaceKey),
    attachments,
    children: childrenOf(index, fields.pageId)
  };
  return {
    file, scope, fields, remote, draft, includes, names, links,
    targets: storageTargets(app, file.path, scope.spaceKey, client.site, attachmentIndex)
  };
}

/** The assessment for the note as it reads now. Pure, so it can follow every keystroke. */
export function assessPrepared(prepared: PreparedPush, body: string): PushAssessment {
  return assess({
    body,
    fields: prepared.fields,
    remote: prepared.remote,
    draft: prepared.draft,
    users: prepared.names,
    links: prepared.links,
    targets: prepared.targets,
    includes: prepared.includes
  });
}

/** The note body as it reads right now: the editor's buffer when the note is open, else the file. */
export async function bodyNow(app: App, file: TFile): Promise<string> {
  for (const leaf of app.workspace.getLeavesOfType('markdown')) {
    const view: unknown = leaf.view;
    if (view instanceof MarkdownView && view.file?.path === file.path) {
      return stripFrontMatter(view.editor.getValue());
    }
  }
  return bodyOf(app, file);
}

async function includedBodies(client: ConfluenceClient, storage: string, spaceKey: string): Promise<Map<number, string>> {
  const bodies: Map<number, string> = new Map<number, string>();
  for (const segment of segmentStorage(parseStorage(storage))) {
    if (segment.kind !== 'include') {
      continue;
    }
    const page: { spaceKey: string; title: string } | null = includedPageOf(storage.slice(segment.start, segment.end), spaceKey);
    if (!page) {
      continue;
    }
    const body: string = await fetchIncludedBody(client, page.spaceKey, page.title);
    if (body) {
      bodies.set(segment.start, body);
    }
  }
  return bodies;
}

function mentionIds(storage: string, includes: ReadonlyMap<number, string>): Set<string> {
  const ids: Set<string> = collectMentionIds(storage);
  for (const body of includes.values()) {
    for (const id of collectMentionIds(body)) {
      ids.add(id);
    }
  }
  return ids;
}

/** Files the note embeds from other pages' attachment folders, named after the pages that own them. */
async function indexOtherPagesAttachments(
  context: PushContext,
  index: ManagedIndex,
  scope: SpaceScope,
  body: string,
  ownPageId: string,
  into: Map<string, AttachmentRef>
): Promise<void> {
  const pageIds: Set<string> = new Set<string>();
  for (const match of body.matchAll(ATTACHMENT_FOLDER_REF)) {
    if (match[1] !== ownPageId && index.notes.has(match[1])) {
      pageIds.add(match[1]);
    }
  }
  for (const pageId of pageIds) {
    const title: string = index.notes.get(pageId)?.fields.title ?? '';
    const listed: Array<ConfluenceAttachment> = await listAttachments(context.client, pageId);
    for (const target of attachmentPaths(listed, attachmentFolder(scope.rootFolder, pageId))) {
      into.set(target.path, { filename: target.attachment.title, pageTitle: title, spaceKey: scope.spaceKey });
    }
  }
}
