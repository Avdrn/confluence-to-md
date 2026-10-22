/**
 * Replaces each `include` or `excerpt-include` macro with the storage body of
 * the page it names, so the included text is mirrored rather than a marker.
 */

import { logWarning } from '../shared/log';
import { errorMessage } from '../shared/error-message';
import type { ConfluenceClient } from './api/confluence-client';
import type { ConfluencePageList } from './types/confluence-api.type';

const INCLUDE_MACRO: RegExp =
  /<ac:structured-macro[^>]*ac:name="(?:include|excerpt-include)"[^>]*>[\s\S]*?<\/ac:structured-macro>/gi;
const CONTENT_TITLE: RegExp = /ri:content-title="([^"]*)"/i;
const SPACE_KEY: RegExp = /ri:space-key="([^"]*)"/i;

interface IncludeRef {
  /** The complete macro markup, replaced wholesale by the included body. */
  macro: string;
  spaceKey: string;
  title: string;
}

export async function resolveIncludes(
  client: ConfluenceClient,
  storage: string,
  currentSpaceKey: string
): Promise<string> {
  const refs: Array<IncludeRef> = collectIncludeRefs(storage, currentSpaceKey);
  if (refs.length === 0) {
    return storage;
  }
  const bodies: Map<string, string> = new Map<string, string>();
  await Promise.all(refs.map(async (ref: IncludeRef): Promise<void> => {
    const body: string = await fetchIncludedBody(client, ref.spaceKey, ref.title);
    if (body) {
      bodies.set(ref.macro, body);
    }
  }));
  let resolved: string = storage;
  for (const [macro, body] of bodies) {
    resolved = resolved.split(macro).join(body);
  }
  return resolved;
}

/** The storage body of the page an include macro names, or '' when it cannot be read. */
export async function fetchIncludedBody(client: ConfluenceClient, spaceKey: string, title: string): Promise<string> {
  try {
    const url: string = `/wiki/rest/api/content?spaceKey=${encodeURIComponent(spaceKey)}`
      + `&title=${encodeURIComponent(title)}&expand=body.storage`;
    const list: ConfluencePageList = await client.getJson<ConfluencePageList>(url);
    return list.results[0]?.body?.storage?.value ?? '';
  } catch (err) {
    logWarning(`Could not resolve included page "${title}": ${errorMessage(err)}`);
    return '';
  }
}

/** The page an include macro names, read from the macro's own markup. */
export function includedPageOf(macroXml: string, currentSpaceKey: string): { spaceKey: string; title: string } | null {
  const title: RegExpMatchArray | null = macroXml.match(CONTENT_TITLE);
  if (!title) {
    return null;
  }
  const space: RegExpMatchArray | null = macroXml.match(SPACE_KEY);
  let spaceKey: string = currentSpaceKey;
  if (space && space[1]) {
    spaceKey = space[1];
  }
  return { spaceKey, title: title[1] };
}

function collectIncludeRefs(storage: string, currentSpaceKey: string): Array<IncludeRef> {
  const refs: Array<IncludeRef> = new Array<IncludeRef>();
  for (const match of storage.matchAll(INCLUDE_MACRO)) {
    const macro: string = match[0];
    const title: RegExpMatchArray | null = macro.match(CONTENT_TITLE);
    if (!title) {
      continue;
    }
    const space: RegExpMatchArray | null = macro.match(SPACE_KEY);
    let spaceKey: string = currentSpaceKey;
    if (space && space[1]) {
      spaceKey = space[1];
    }
    refs.push({ macro, spaceKey, title: title[1] });
  }
  return refs;
}
