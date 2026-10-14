import type { App, TAbstractFile, TFile } from 'obsidian';
import { ensureFolder } from './folder-ops';
import { parentOf } from '../shared/vault-path';

/** Every write, move and trash of a synced note goes through here. */
export class NoteWriter {
  public constructor(private readonly app: App) {}

  public async write(path: string, content: string): Promise<TFile> {
    const existing: TFile | null = this.app.vault.getFileByPath(path);
    if (existing) {
      await this.app.vault.modify(existing, content);
      return existing;
    }
    await ensureFolder(this.app.vault, parentOf(path));
    try {
      return await this.app.vault.create(path, content);
    } catch (err) {
      const found: TFile | null = this.findIgnoringCase(path);
      if (!found) {
        throw err;
      }
      await this.app.vault.modify(found, content);
      return found;
    }
  }

  public async writeBinary(path: string, data: ArrayBuffer): Promise<TFile> {
    const existing: TFile | null = this.app.vault.getFileByPath(path);
    if (existing) {
      await this.app.vault.modifyBinary(existing, data);
      return existing;
    }
    await ensureFolder(this.app.vault, parentOf(path));
    try {
      return await this.app.vault.createBinary(path, data);
    } catch (err) {
      const found: TFile | null = this.findIgnoringCase(path);
      if (!found) {
        throw err;
      }
      await this.app.vault.modifyBinary(found, data);
      return found;
    }
  }

  /** Renames through the file manager, so links in the user's own notes follow. */
  public async move(file: TAbstractFile, newPath: string): Promise<void> {
    await ensureFolder(this.app.vault, parentOf(newPath));
    await this.app.fileManager.renameFile(file, newPath);
  }

  /** Follows the user's "Deleted files" preference: system trash, vault trash or permanent. */
  public async trash(file: TAbstractFile): Promise<void> {
    await this.app.fileManager.trashFile(file);
  }

  /**
   * The vault index is case-sensitive while most file systems are not, so a
   * create can fail for a file the index knows under different casing.
   */
  private findIgnoringCase(path: string): TFile | null {
    const wanted: string = path.toLowerCase();
    return this.app.vault.getFiles().find((file: TFile): boolean => file.path.toLowerCase() === wanted) ?? null;
  }
}
