/**
 * The front-matter every synced note carries. Keys are namespaced so they never
 * collide with the user's own properties, and ids are quoted so YAML never
 * turns them into numbers.
 */

import type { ContentType } from '../../confluence/types/content-node.type';

export const PROPERTY = {
  pageId: 'confluence-page-id',
  space: 'confluence-space',
  title: 'confluence-title',
  version: 'confluence-version',
  hash: 'confluence-hash',
  converter: 'confluence-converter',
  url: 'confluence-url',
  parentId: 'confluence-parent-id',
  type: 'confluence-type',
  /** Time of the sync that kept changes made in Obsidian; absent once they are sent or discarded. */
  unpushed: 'confluence-unpushed',
  lastSync: 'confluence-last-sync',
  spaceName: 'confluence-space-name',
  spaceId: 'confluence-space-id',
  site: 'confluence-site'
} as const;

export interface ManagedFrontMatter {
  pageId: string;
  spaceKey: string;
  title: string;
  version: number;
  hash: string;
  converter: number;
  url: string;
  parentId: string;
  type: ContentType;
  /** The note's file name without extension; an alias is added when it differs from the title. */
  fileStem: string;
}

/** What a sync needs back from an existing note's front-matter. */
export interface ManagedFrontMatterFields {
  pageId: string;
  spaceKey: string;
  title: string;
  version: number;
  hash: string;
  converter: number;
  parentId: string;
  /** What the note mirrors; a note without the property is a page. */
  type: ContentType;
}

const CONTENT_TYPES: ReadonlySet<string> = new Set<string>(['page', 'folder', 'database', 'whiteboard', 'embed']);

/** A YAML mapping as Obsidian's metadata cache hands it over. */
interface PropertyBag {
  readonly [key: string]: unknown;
}

export function serializeFrontMatter(fields: ManagedFrontMatter): string {
  const lines: Array<string> = [
    '---',
    `${PROPERTY.pageId}: ${quote(fields.pageId)}`,
    `${PROPERTY.space}: ${quote(fields.spaceKey)}`,
    `${PROPERTY.title}: ${quote(fields.title)}`,
    `${PROPERTY.version}: ${fields.version}`,
    `${PROPERTY.hash}: ${quote(fields.hash)}`,
    `${PROPERTY.converter}: ${fields.converter}`,
    `${PROPERTY.url}: ${quote(fields.url)}`,
    `${PROPERTY.parentId}: ${quote(fields.parentId)}`
  ];
  if (fields.type !== 'page') {
    lines.push(`${PROPERTY.type}: ${quote(fields.type)}`);
  }
  if (fields.fileStem !== fields.title) {
    lines.push('aliases:', `  - ${quote(fields.title)}`);
  }
  lines.push('---', '');
  return `${lines.join('\n')}\n`;
}

/** The managed fields of a note, or null when the note carries no page id. */
export function readManagedFrontMatter(frontmatter: unknown): ManagedFrontMatterFields | null {
  if (!frontmatter || typeof frontmatter !== 'object') {
    return null;
  }
  const bag: PropertyBag = frontmatter as PropertyBag;
  const pageId: string = asString(bag[PROPERTY.pageId]);
  if (!pageId) {
    return null;
  }
  return {
    pageId,
    spaceKey: asString(bag[PROPERTY.space]),
    title: asString(bag[PROPERTY.title]),
    version: asNumber(bag[PROPERTY.version]),
    hash: asString(bag[PROPERTY.hash]),
    converter: asNumber(bag[PROPERTY.converter]),
    parentId: asString(bag[PROPERTY.parentId]),
    type: asType(bag[PROPERTY.type])
  };
}

function asType(value: unknown): ContentType {
  if (typeof value === 'string' && CONTENT_TYPES.has(value)) {
    return value as ContentType;
  }
  return 'page';
}

/** The space key a marker note declares, or '' when it is not a marker. */
export function readSpaceKey(frontmatter: unknown): string {
  if (!frontmatter || typeof frontmatter !== 'object') {
    return '';
  }
  const bag: PropertyBag = frontmatter as PropertyBag;
  if (asString(bag[PROPERTY.pageId])) {
    return ''; // a synced note names its space too, but it is not a marker
  }
  return asString(bag[PROPERTY.space]).trim();
}

/**
 * JSON string syntax is valid YAML double-quoted syntax. `<` is written as an
 * escape, so a title can never put Templater's `<%` into the file.
 */
function quote(value: string): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function asString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return '';
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed: number = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}
