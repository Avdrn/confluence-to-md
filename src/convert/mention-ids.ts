/**
 * Every account id a storage body mentions, so display names can be looked up
 * before rendering. Regular expressions are enough here: an id is an attribute
 * value, never nested markup.
 */

const LINKED_USER: RegExp = /<ri:user[^>]*ri:account-id="([^"]+)"/gi;
const MENTION_PARAMETER: RegExp =
  /<ac:structured-macro[^>]*ac:name="mention"[^>]*>[\s\S]*?<ac:parameter[^>]*ac:name=""[^>]*>([\s\S]*?)<\/ac:parameter>/gi;
const ADF_MENTION: RegExp = /<ac:adf-attribute key="id">([^<]+)<\/ac:adf-attribute>/gi;

export function collectMentionIds(storage: string): Set<string> {
  const ids: Set<string> = new Set<string>();
  for (const match of storage.matchAll(LINKED_USER)) {
    ids.add(match[1].trim());
  }
  for (const match of storage.matchAll(MENTION_PARAMETER)) {
    ids.add(match[1].trim());
  }
  for (const match of storage.matchAll(ADF_MENTION)) {
    if (match[1].includes(':')) {
      ids.add(match[1].trim());
    }
  }
  ids.delete('');
  return ids;
}
