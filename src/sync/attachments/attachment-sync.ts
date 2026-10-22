import { TFile } from 'obsidian';
import type { App, TFolder } from 'obsidian';
import { downloadAttachment, listAttachments } from '../../confluence/attachments-api';
import { attachmentFileName, attachmentFolder } from './attachment-folder';
import { SiblingNames } from '../placement/sibling-names';
import { ensureFolder } from '../../vault/folder-ops';
import { errorMessage } from '../../shared/error-message';
import { joinPath } from '../../shared/vault-path';
import type { ConfluenceClient } from '../../confluence/api/confluence-client';
import type { ConfluenceAttachment } from '../../confluence/types/confluence-api.type';
import type { NoteWriter } from '../../vault/note-writer';
import type { SyncReport } from '../report/sync-report';

export interface AttachmentTarget {
  attachment: ConfluenceAttachment;
  path: string;
}

/**
 * The vault path of every listed attachment, decided the same way on every
 * run: by title order, with the same renaming, so a push can map a vault file
 * back to its Confluence title.
 */
export function attachmentPaths(listed: ReadonlyArray<ConfluenceAttachment>, folder: string): Array<AttachmentTarget> {
  const names: SiblingNames = new SiblingNames();
  return [...listed]
    .sort((a: ConfluenceAttachment, b: ConfluenceAttachment): number => a.title.localeCompare(b.title))
    .map((attachment: ConfluenceAttachment): AttachmentTarget => ({
      attachment,
      path: joinPath(folder, attachmentFileName(attachment.title, names))
    }));
}

/**
 * Downloads what a page has attached into `_attachments/<pageId>/`, skips
 * files whose size has not changed, and removes files Confluence no longer
 * lists.
 */
export class AttachmentSync {
  public constructor(
    private readonly app: App,
    private readonly client: ConfluenceClient,
    private readonly writer: NoteWriter
  ) {}

  /** Attachment title to the vault path it was stored at. A failed file is simply absent. */
  public async syncPage(rootFolder: string, pageId: string, report: SyncReport): Promise<Map<string, string>> {
    const stored: Map<string, string> = new Map<string, string>();
    let listed: Array<ConfluenceAttachment>;
    try {
      listed = await listAttachments(this.client, pageId);
    } catch (err) {
      report.addWarning(`Could not list the attachments of page ${pageId}: ${errorMessage(err)}`);
      return stored;
    }
    const folder: string = attachmentFolder(rootFolder, pageId);
    if (listed.length === 0) {
      await this.trashFolder(rootFolder, pageId);
      return stored;
    }
    const targets: Array<AttachmentTarget> = this.assignPaths(listed, folder);
    await ensureFolder(this.app.vault, folder);
    await Promise.all(targets.map(async (target: AttachmentTarget): Promise<void> => {
      if (this.unchanged(target)) {
        stored.set(target.attachment.title, target.path);
        return;
      }
      try {
        const bytes: ArrayBuffer = await downloadAttachment(this.client, target.attachment);
        await this.writer.writeBinary(target.path, bytes);
        stored.set(target.attachment.title, target.path);
      } catch (err) {
        report.addWarning(`Attachment "${target.attachment.title}" could not be downloaded: ${errorMessage(err)}`);
      }
    }));
    await this.trashStale(folder, new Set<string>(targets.map((target: AttachmentTarget): string => target.path)));
    return stored;
  }

  public async trashFolder(rootFolder: string, pageId: string): Promise<void> {
    const folder: TFolder | null = this.app.vault.getFolderByPath(attachmentFolder(rootFolder, pageId));
    if (folder) {
      await this.writer.trash(folder);
    }
  }

  private assignPaths(listed: ReadonlyArray<ConfluenceAttachment>, folder: string): Array<AttachmentTarget> {
    return attachmentPaths(listed, folder);
  }

  /** Size is the only cheap signal the listing offers, and it is enough to skip a re-download. */
  private unchanged(target: AttachmentTarget): boolean {
    const file: TFile | null = this.app.vault.getFileByPath(target.path);
    const expected: number | undefined = target.attachment.extensions?.fileSize;
    if (!file || expected === undefined) {
      return false;
    }
    return file.stat.size === expected;
  }

  private async trashStale(folderPath: string, keep: ReadonlySet<string>): Promise<void> {
    const folder: TFolder | null = this.app.vault.getFolderByPath(folderPath);
    if (!folder) {
      return;
    }
    for (const child of [...folder.children]) {
      if (child instanceof TFile && !keep.has(child.path)) {
        await this.writer.trash(child);
      }
    }
  }
}
