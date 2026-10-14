import type { App, CachedMetadata, TFile } from 'obsidian';

const FRONT_MATTER_BLOCK: RegExp = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
const BYTE_ORDER_MARK: string = String.fromCharCode(0xfeff);

/** The note without its front-matter, as the body hash was computed over it. */
export async function bodyOf(app: App, file: TFile): Promise<string> {
  const content: string = (await app.vault.cachedRead(file)).replace(BYTE_ORDER_MARK, '');
  const cache: CachedMetadata | null = app.metadataCache.getFileCache(file);
  const end: number | undefined = cache?.frontmatterPosition?.end.offset;
  if (end !== undefined) {
    return content.slice(end).replace(/^\r?\n/, '');
  }
  return content.replace(FRONT_MATTER_BLOCK, '');
}
