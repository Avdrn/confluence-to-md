/**
 * Sends the changes the user chose and brings the note back in line with
 * what Confluence now holds.
 *
 * The order keeps one invariant: the note's version and hash describe a real
 * Confluence version, or the note is detectably changed. The front-matter is
 * written as soon as the PUT succeeded; the re-render after it is a comfort
 * that can fail without harm.
 */

import type { App, TFile } from 'obsidian';
import { ConfluenceApiError } from '../confluence/api/api-error';
import { fetchCurrentUser } from '../confluence/current-user';
import { writeLiveContent } from '../confluence/live-doc';
import { fetchPageBody } from '../confluence/page-body';
import { updatePage } from '../confluence/page-write';
import { logError } from '../shared/log';
import { PROPERTY } from '../sync/front-matter/managed-front-matter';
import { hashBody } from '../sync/plan/body-hash';
import { bodyNow } from './prepare-push';
import { pullNote } from './pull-page';
import type { ConfluenceClient } from '../confluence/api/confluence-client';
import type { PageBody } from '../confluence/page-body';
import type { UserDirectory } from '../confluence/user-directory';
import type { PushAssessment } from './preflight';
import type { PreparedPush } from './prepare-push';

export interface PushRequest {
  prepared: PreparedPush;
  assessment: PushAssessment;
  /** Indexes of the changes to send. */
  sending: ReadonlySet<number>;
  /** For the page history. */
  message: string;
  /** Hash of the body the assessment was made from; the push stops when the note moved on. */
  bodyHash: string;
  downloadAttachments: boolean;
}

export type PushOutcome =
  /** `liveFailed`: the version was saved, but the live doc did not take it, so readers may not see it. */
  | { kind: 'sent'; version: number; rerendered: boolean; liveFailed: boolean }
  | { kind: 'stale' }
  | { kind: 'conflict' }
  | { kind: 'nothing' };

export interface PushDeps {
  app: App;
  client: ConfluenceClient;
  users: UserDirectory;
}

export async function pushNote(deps: PushDeps, request: PushRequest): Promise<PushOutcome> {
  const { app, client } = deps;
  const { prepared, assessment, sending } = request;
  const file: TFile = prepared.file;
  if (sending.size === 0) {
    return { kind: 'nothing' };
  }
  const body: string = await bodyNow(app, file);
  if (hashBody(body) !== request.bodyHash) {
    return { kind: 'stale' };
  }
  const storage: string = assessment.storageFor(sending);
  const expected: number = assessment.noteVersion + 1;
  let version: number;
  try {
    version = await updatePage(client, {
      id: prepared.fields.pageId,
      title: prepared.remote.title,
      storage,
      version: expected,
      message: request.message
    });
  } catch (err) {
    if (err instanceof ConfluenceApiError) {
      if (err.isConflict()) {
        return { kind: 'conflict' };
      }
      throw err;
    }
    // The request may have landed before the connection broke. Only a version
    // saved by this account carries the proof.
    version = await landedVersion(client, prepared.fields.pageId, expected, err);
  }
  // After the version, so a refused version leaves the live doc untouched.
  let liveFailed: boolean = false;
  if (prepared.live) {
    liveFailed = !(await updateLiveDoc(client, prepared, storage));
  }
  const sentEverything: boolean = sending.size === assessment.changes.length;
  const rendered: string = assessment.renderedFor(storage);
  await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>): void => {
    frontmatter[PROPERTY.version] = version;
    frontmatter[PROPERTY.hash] = hashBody(rendered);
    if (sentEverything) {
      delete frontmatter[PROPERTY.unpushed];
    }
  });
  let rerendered: boolean = false;
  if (sentEverything && (await bodyNow(app, file)) === body) {
    await pullNote({ app, client, users: deps.users, downloadAttachments: request.downloadAttachments }, file, prepared.scope);
    rerendered = true;
  }
  return { kind: 'sent', version, rerendered, liveFailed };
}

/** The version is already saved, so a failure here is reported, not thrown. */
async function updateLiveDoc(client: ConfluenceClient, prepared: PreparedPush, storage: string): Promise<boolean> {
  try {
    await writeLiveContent(client, { id: prepared.fields.pageId, title: prepared.remote.title, storage });
    return true;
  } catch (err) {
    logError(`The live doc ${prepared.fields.pageId} did not take the sent version.`, err);
    return false;
  }
}

async function landedVersion(client: ConfluenceClient, pageId: string, expected: number, cause: unknown): Promise<number> {
  const page: PageBody = await fetchPageBody(client, pageId);
  if (page.version === expected && page.versionById && page.versionById === (await fetchCurrentUser(client)).accountId) {
    return page.version;
  }
  throw cause;
}
