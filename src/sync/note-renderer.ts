/**
 * One page as a note: the pipeline a sync runs for every page it writes, so
 * a single pull and the re-render after a push produce the same file.
 */

import { fetchPageBody } from '../confluence/page-body';
import { resolveIncludes } from '../confluence/include-resolver';
import { collectMentionIds } from '../convert/mention-ids';
import { renderPage } from '../convert/render-page';
import { inertBody } from '../convert/inert-markdown';
import { CONVERTER_VERSION } from '../convert/converter-version';
import { resolveLinks } from './links/link-resolver';
import { serializeFrontMatter } from './front-matter/managed-front-matter';
import { hashBody } from './plan/body-hash';
import { stemOf } from '../shared/vault-path';
import type { ConfluenceClient } from '../confluence/api/confluence-client';
import type { PageBody } from '../confluence/page-body';
import type { UserDirectory } from '../confluence/user-directory';
import type { ContentType } from '../confluence/types/content-node.type';
import type { ChildNoteLink } from './placement/placement.type';

export interface NoteRenderInput {
  page: PageBody;
  spaceKey: string;
  /** Title as the listing has it; the body fetch may lag a rename. */
  title: string;
  type: ContentType;
  parentId: string;
  webUrl: string;
  notePath: string;
  /** Lowercased "spacekey\ntitle" to note path, for page links. */
  pagesByTitle: ReadonlyMap<string, string>;
  children: ReadonlyArray<ChildNoteLink>;
  /** Attachment title to the vault path it was stored at. */
  attachments: ReadonlyMap<string, string>;
}

export interface RenderedNote {
  /** Front-matter and body, ready to write. */
  content: string;
  body: string;
  hash: string;
  version: number;
}

export async function renderNote(client: ConfluenceClient, users: UserDirectory, input: NoteRenderInput): Promise<RenderedNote> {
  const storage: string = await resolveIncludes(client, input.page.storage, input.spaceKey);
  const names: ReadonlyMap<string, string> = await users.resolve(collectMentionIds(storage));
  const rendered: string = renderPage(storage, names, client.site);
  const resolved: string = resolveLinks(rendered, {
    spaceKey: input.spaceKey,
    siteUrl: client.site,
    pagesByTitle: input.pagesByTitle,
    attachments: input.attachments,
    children: input.children
  });
  // Before hashing, so the recorded hash matches what lands in the file.
  const body: string = inertBody(resolved);
  const hash: string = hashBody(body);
  const frontMatter: string = serializeFrontMatter({
    pageId: input.page.id,
    spaceKey: input.spaceKey,
    title: input.title,
    version: input.page.version,
    hash,
    converter: CONVERTER_VERSION,
    url: input.page.webUrl || input.webUrl,
    parentId: input.parentId,
    type: input.type,
    fileStem: stemOf(input.notePath)
  });
  return { content: `${frontMatter}${body}\n`, body, hash, version: input.page.version };
}

/** The body fetch, exposed here so callers of renderNote need one import. */
export { fetchPageBody };
