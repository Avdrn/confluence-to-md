/**
 * One space, end to end: read the listing, decide, then do it.
 *
 * The order matters. Every path is assigned before the first body is fetched,
 * so a link to a page that has not been synced yet still resolves; and every
 * decision is taken before the first write, so a run that changes nothing
 * writes nothing.
 */

import type { App, TFolder } from 'obsidian';
import { fetchSpace } from '../confluence/space-content';
import { fetchPageBody } from '../confluence/page-body';
import { resolveIncludes } from '../confluence/include-resolver';
import { UserDirectory } from '../confluence/user-directory';
import { CancelledError } from '../confluence/api/cancellation';
import { STUB_TYPES } from '../confluence/types/content-node.type';
import { collectMentionIds } from '../convert/mention-ids';
import { renderPage } from '../convert/render-page';
import { inertBody } from '../convert/inert-markdown';
import { CONVERTER_VERSION } from '../convert/converter-version';
import { placeContent } from './placement/place-content';
import { buildPlan, needsBody } from './plan/build-plan';
import { hashBody } from './plan/body-hash';
import { resolveLinks } from './links/link-resolver';
import { serializeFrontMatter } from './front-matter/managed-front-matter';
import { stubBody } from './stubs/stub-note';
import { SyncReport } from './report/sync-report';
import { AttachmentSync } from './attachments/attachment-sync';
import { buildManagedIndex, resolveFolder } from '../vault/managed-note-index';
import { NoteWriter } from '../vault/note-writer';
import { bodyOf } from '../vault/note-body';
import { trashEmptyFolders } from '../vault/folder-ops';
import { updateMarker, updateRecordedHash } from '../vault/marker-updater';
import { maxVaultPathLength } from '../vault/vault-limits';
import { errorMessage } from '../shared/error-message';
import { runPool } from '../shared/run-pool';
import { depthOf, joinPath, parentOf, stemOf } from '../shared/vault-path';
import type { ConfluenceClient } from '../confluence/api/confluence-client';
import type { CancellationToken } from '../confluence/api/cancellation';
import type { PageBody } from '../confluence/page-body';
import type { ContentNode, SpaceContent } from '../confluence/types/content-node.type';
import type { ProgressReporter } from '../shared/progress';
import type { ContentPlacement, PlacedContent } from './placement/placement.type';
import type { LocalNoteState } from './plan/build-plan';
import type { SyncAction } from './plan/sync-action.type';
import type { SyncOptions } from './sync-options';
import type { ManagedIndex, ManagedNote } from '../vault/managed-note-index';
import type { SpaceScope } from '../vault/marker-notes';

const PAGES_IN_FLIGHT: number = 4;
const TEMP_SUFFIX: string = '.confluence-sync-tmp.md';

export interface SpaceSyncContext {
  app: App;
  client: ConfluenceClient;
  scope: SpaceScope;
  options: SyncOptions;
  progress: ProgressReporter;
  token: CancellationToken;
  /** Asked before more notes than the threshold are trashed. */
  confirmTrash: (count: number) => Promise<boolean>;
  trashConfirmThreshold: number;
}

interface PendingMove {
  action: SyncAction;
  note: ManagedNote;
}

export class SpaceSync {
  private readonly report: SyncReport;
  private readonly writer: NoteWriter;
  private readonly users: UserDirectory;
  private readonly attachments: AttachmentSync;

  public constructor(private readonly context: SpaceSyncContext) {
    this.report = new SyncReport(context.scope.spaceKey);
    this.writer = new NoteWriter(context.app);
    this.users = new UserDirectory(context.client);
    this.attachments = new AttachmentSync(context.app, context.client, this.writer);
  }

  public async run(): Promise<SyncReport> {
    const { app, client, scope, options, progress, token } = this.context;
    progress.phase('Reading space');
    const space: SpaceContent = await fetchSpace(client, scope.spaceKey, progress);
    token.throwIfCancelled();

    const index: ManagedIndex = buildManagedIndex(app, scope.rootFolder, scope.spaceKey);
    for (const duplicate of index.duplicates) {
      this.report.addWarning(`"${duplicate}" mirrors a page another note already holds; it was left alone.`);
    }
    const placement: ContentPlacement = placeContent(space.nodes, {
      rootFolder: scope.rootFolder,
      spaceKey: space.spaceKey,
      homepageId: space.homepageId,
      reservedNames: index.reservedNames,
      maxPathLength: maxVaultPathLength(app)
    });
    this.report.warnings.push(...placement.warnings);

    progress.phase('Comparing with the vault');
    const local: Map<string, LocalNoteState> = await this.localStates(index);
    const actions: Array<SyncAction> = buildPlan({
      placements: placement.byId,
      local,
      force: options.force,
      converterVersion: CONVERTER_VERSION
    });
    this.report.planned = actions.filter((action: SyncAction): boolean => action.verb !== 'keep');
    this.report.kept = actions.length - this.report.planned.length;
    this.assertListingIsSane(space, index);

    if (options.dryRun) {
      this.report.dryRun = true;
      return this.report;
    }
    try {
      await this.apply(actions, placement, space, index);
    } catch (err) {
      if (!(err instanceof CancelledError)) {
        throw err;
      }
      this.report.cancelled = true;
    }
    this.report.finishedAt = new Date();
    return this.report;
  }

  /** A listing that came back empty while notes exist is a failure, not a deletion of everything. */
  private assertListingIsSane(space: SpaceContent, index: ManagedIndex): void {
    const pages: number = space.nodes.filter((node: ContentNode): boolean => node.type === 'page').length;
    if (pages === 0 && index.notes.size > 0) {
      throw new Error(
        `Confluence returned no pages for space ${space.spaceKey} while the vault holds ${index.notes.size} synced notes. Nothing was changed.`
      );
    }
  }

  private async localStates(index: ManagedIndex): Promise<Map<string, LocalNoteState>> {
    const states: Map<string, LocalNoteState> = new Map<string, LocalNoteState>();
    for (const [pageId, note] of index.notes) {
      const body: string = await bodyOf(this.context.app, note.file);
      states.set(pageId, {
        path: note.file.path,
        title: note.fields.title || stemOf(note.file.path),
        version: note.fields.version,
        hash: note.fields.hash,
        converter: note.fields.converter,
        bodyHash: hashBody(body)
      });
    }
    return states;
  }

  private async apply(
    actions: ReadonlyArray<SyncAction>,
    placement: ContentPlacement,
    space: SpaceContent,
    index: ManagedIndex
  ): Promise<void> {
    const { app, scope, token, progress } = this.context;
    await this.moveNotes(actions, placement, index);
    await this.writeNotes(actions, placement, space);
    token.throwIfCancelled();
    await this.trashNotes(actions, index);
    const root: TFolder | null = resolveFolder(app, scope.rootFolder);
    if (root) {
      await trashEmptyFolders(app, root, placement.folders, index.reservedNames);
    }
    progress.phase('Finishing');
    await updateMarker(app, scope.markerFile, { spaceName: space.spaceName, spaceId: space.spaceId, site: this.context.client.site });
  }

  /**
   * Renames first, content second. A page with children moves its whole
   * folder, which carries the children and any notes of the user's inside it.
   * Everything still out of place is then parked under a temporary name and
   * renamed to its target, so swapped titles cannot collide.
   */
  private async moveNotes(
    actions: ReadonlyArray<SyncAction>,
    placement: ContentPlacement,
    index: ManagedIndex
  ): Promise<void> {
    const pending: Array<PendingMove> = this.pendingMoves(actions, index);
    if (pending.length === 0) {
      return;
    }
    this.context.progress.phase(`Moving ${pending.length} note(s)`);
    await this.moveFolderNotes(pending, placement);
    const stillPending: Array<PendingMove> = pending.filter(
      (move: PendingMove): boolean => move.note.file.path !== move.action.notePath
    );
    await this.parkAndRename(stillPending);
    for (const move of pending) {
      if (move.action.verb === 'move') {
        this.report.moved.push({ title: move.action.title, path: move.note.file.path, detail: `from ${move.action.previousPath}` });
      }
    }
    await this.refreshHashesAfterLinkUpdates(actions, index);
  }

  private pendingMoves(actions: ReadonlyArray<SyncAction>, index: ManagedIndex): Array<PendingMove> {
    const pending: Array<PendingMove> = new Array<PendingMove>();
    for (const action of actions) {
      if (action.verb === 'trash' || action.verb === 'create') {
        continue;
      }
      const note: ManagedNote | undefined = index.notes.get(action.pageId);
      if (note && note.file.path !== action.notePath) {
        pending.push({ action, note });
      }
    }
    return pending.sort((a: PendingMove, b: PendingMove): number =>
      depthOf(a.note.file.path) - depthOf(b.note.file.path)
    );
  }

  private async moveFolderNotes(pending: ReadonlyArray<PendingMove>, placement: ContentPlacement): Promise<void> {
    for (const move of pending) {
      const placed: PlacedContent | undefined = placement.byId.get(move.action.pageId);
      const folder: TFolder | null = move.note.file.parent;
      if (!placed?.isFolderNote || !folder || folder.isRoot() || folder.path === this.context.scope.rootFolder) {
        continue;
      }
      if (stemOf(move.note.file.path) !== folder.name || folder.path === placed.folderPath) {
        continue;
      }
      if (this.context.app.vault.getAbstractFileByPath(placed.folderPath)) {
        continue; // occupied: the note moves on its own below
      }
      try {
        await this.writer.move(folder, placed.folderPath);
      } catch (err) {
        this.report.addWarning(`Could not move folder "${folder.path}": ${errorMessage(err)}`);
      }
    }
  }

  private async parkAndRename(pending: ReadonlyArray<PendingMove>): Promise<void> {
    const parked: Array<PendingMove> = new Array<PendingMove>();
    for (const move of pending) {
      const origin: string = move.note.file.path;
      try {
        await this.writer.move(move.note.file, joinPath(parentOf(move.action.notePath), `${move.action.pageId}${TEMP_SUFFIX}`));
        parked.push(move);
      } catch (err) {
        this.report.failed.push({ title: move.action.title, path: origin, detail: `could not move: ${errorMessage(err)}` });
      }
    }
    for (const move of parked) {
      const parkedPath: string = move.note.file.path;
      try {
        await this.writer.move(move.note.file, move.action.notePath);
      } catch (err) {
        this.report.failed.push({ title: move.action.title, path: parkedPath, detail: `could not move: ${errorMessage(err)}` });
        await this.writer.move(move.note.file, move.action.previousPath).catch((): void => {});
      }
    }
  }

  /**
   * Obsidian rewrites links to a renamed note in every other note, including
   * ones this plugin wrote. Those notes were untouched a moment ago, so the
   * new hash is recorded rather than reported as a hand edit next time.
   */
  private async refreshHashesAfterLinkUpdates(actions: ReadonlyArray<SyncAction>, index: ManagedIndex): Promise<void> {
    for (const action of actions) {
      if (action.verb !== 'keep' && action.verb !== 'move') {
        continue;
      }
      const note: ManagedNote | undefined = index.notes.get(action.pageId);
      if (!note || !note.fields.hash) {
        continue;
      }
      const hash: string = hashBody(await bodyOf(this.context.app, note.file));
      if (hash !== note.fields.hash) {
        await updateRecordedHash(this.context.app, note.file, hash);
      }
    }
  }

  private async writeNotes(
    actions: ReadonlyArray<SyncAction>,
    placement: ContentPlacement,
    space: SpaceContent
  ): Promise<void> {
    const { progress, token } = this.context;
    const todo: Array<SyncAction> = actions.filter(needsBody);
    if (todo.length === 0) {
      return;
    }
    let done: number = 0;
    progress.step(done, todo.length);
    await runPool(todo, PAGES_IN_FLIGHT, async (action: SyncAction): Promise<void> => {
      if (token.isCancelled) {
        return;
      }
      try {
        await this.writeOne(action, placement, space);
      } catch (err) {
        if (err instanceof CancelledError) {
          return;
        }
        this.report.failed.push({ title: action.title, path: action.previousPath, detail: errorMessage(err) });
      }
      done++;
      progress.step(done, todo.length);
    });
  }

  private async writeOne(action: SyncAction, placement: ContentPlacement, space: SpaceContent): Promise<void> {
    const placed: PlacedContent | undefined = placement.byId.get(action.pageId);
    if (!placed) {
      return;
    }
    const node: ContentNode = placed.node;
    let body: string;
    let version: number = node.version;
    let webUrl: string = node.webUrl;
    if (STUB_TYPES.has(node.type)) {
      body = stubBody(node);
    } else {
      const page: PageBody = await fetchPageBody(this.context.client, node.id);
      version = page.version;
      webUrl = page.webUrl || node.webUrl;
      body = await this.renderBody(page, placed, placement, space);
    }
    // Before hashing, so the recorded hash matches what lands in the file.
    body = inertBody(body);
    this.context.token.throwIfCancelled();
    const frontMatter: string = serializeFrontMatter({
      pageId: node.id,
      spaceKey: space.spaceKey,
      title: node.title,
      version,
      hash: hashBody(body),
      converter: CONVERTER_VERSION,
      url: webUrl,
      parentId: node.parentId,
      type: node.type,
      fileStem: stemOf(placed.notePath)
    });
    await this.writer.write(placed.notePath, `${frontMatter}${body}\n`);
    this.record(action, placed.notePath);
  }

  private async renderBody(
    page: PageBody,
    placed: PlacedContent,
    placement: ContentPlacement,
    space: SpaceContent
  ): Promise<string> {
    const { client, scope, options } = this.context;
    const storage: string = await resolveIncludes(client, page.storage, space.spaceKey);
    const users: ReadonlyMap<string, string> = await this.users.resolve(collectMentionIds(storage));
    const rendered: string = renderPage(storage, users, client.site);
    let attachments: Map<string, string> = new Map<string, string>();
    if (options.downloadAttachments) {
      attachments = await this.attachments.syncPage(scope.rootFolder, page.id, this.report);
    }
    return resolveLinks(rendered, {
      spaceKey: space.spaceKey,
      siteUrl: client.site,
      pagesByTitle: placement.byTitle,
      attachments,
      children: placement.childrenById.get(placed.node.id) ?? []
    });
  }

  private record(action: SyncAction, path: string): void {
    const entry = { title: action.title, path, detail: action.reason };
    if (action.verb === 'create') {
      this.report.created.push(entry);
    } else {
      this.report.updated.push(entry);
    }
    if (action.overwritesLocalEdit) {
      this.report.overwrittenLocalEdits.push(entry);
    }
  }

  private async trashNotes(actions: ReadonlyArray<SyncAction>, index: ManagedIndex): Promise<void> {
    const trash: Array<SyncAction> = actions.filter((action: SyncAction): boolean => action.verb === 'trash');
    if (trash.length === 0) {
      return;
    }
    if (trash.length > this.context.trashConfirmThreshold) {
      const confirmed: boolean = await this.context.confirmTrash(trash.length);
      if (!confirmed) {
        this.report.addWarning(`${trash.length} note(s) deleted in Confluence were kept because the deletion was not confirmed.`);
        return;
      }
    }
    this.context.progress.phase(`Trashing ${trash.length} note(s)`);
    for (const action of trash) {
      const note: ManagedNote | undefined = index.notes.get(action.pageId);
      if (!note) {
        continue;
      }
      try {
        await this.writer.trash(note.file);
        await this.attachments.trashFolder(this.context.scope.rootFolder, action.pageId);
        this.report.trashed.push({ title: action.title, path: '', detail: action.previousPath });
      } catch (err) {
        this.report.failed.push({ title: action.title, path: action.previousPath, detail: `could not trash: ${errorMessage(err)}` });
      }
    }
  }
}
