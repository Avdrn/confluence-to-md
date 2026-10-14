/** Page links name a space and a title, so that pair is the lookup key. */
export function titleKey(spaceKey: string, title: string): string {
  return `${spaceKey.toLowerCase()}\n${title.trim().toLowerCase()}`;
}
