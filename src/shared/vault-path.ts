/**
 * Vault-relative path helpers. Obsidian paths always use `/`, never start with
 * one, and the vault root is ''.
 */

export function joinPath(...parts: ReadonlyArray<string>): string {
  return parts
    .map((part: string): string => part.replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''))
    .filter((part: string): boolean => part.length > 0)
    .join('/');
}

export function parentOf(path: string): string {
  const slash: number = path.lastIndexOf('/');
  if (slash === -1) {
    return '';
  }
  return path.slice(0, slash);
}

export function baseName(path: string): string {
  const slash: number = path.lastIndexOf('/');
  return path.slice(slash + 1);
}

/** The file name without its `.md` extension. */
export function stemOf(path: string): string {
  return baseName(path).replace(/\.md$/i, '');
}

export function withoutMarkdownExtension(path: string): string {
  return path.replace(/\.md$/i, '');
}

/** True when `path` is `folder` itself or lies anywhere below it. '' is the vault root. */
export function isUnder(path: string, folder: string): boolean {
  if (!folder) {
    return true;
  }
  return path === folder || path.startsWith(`${folder}/`);
}

export function depthOf(path: string): number {
  if (!path) {
    return 0;
  }
  return path.split('/').length;
}
