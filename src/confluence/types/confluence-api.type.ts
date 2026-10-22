// Trimmed shapes of the Confluence REST responses this plugin reads.

export interface V2Version {
  number: number;
}

/** `version` as the v1 content API expands it: who saved it and when. */
export interface V1Version {
  number: number;
  when?: string;
  message?: string;
  by?: { displayName?: string; accountId?: string };
}

export interface V2Links {
  webui?: string;
  next?: string;
}

export interface V2Page {
  id: string;
  title: string;
  status?: string;
  /** `live` for a live doc. */
  subtype?: string;
  parentId?: string | null;
  parentType?: string | null;
  version?: V2Version;
  body?: { storage?: { value: string } };
  _links?: V2Links;
}

export interface V2PageList {
  results: Array<V2Page>;
  _links?: V2Links;
}

export interface V2Space {
  id: string;
  key: string;
  name?: string;
  homepageId?: string | null;
  _links?: V2Links;
}

export interface V2SpaceList {
  results: Array<V2Space>;
  _links?: V2Links;
}

/** A folder, database, whiteboard or embed record from `/wiki/api/v2/{type}s/{id}`. */
export interface V2Content {
  id: string;
  title?: string;
  parentId?: string | null;
  parentType?: string | null;
  version?: V2Version;
  _links?: V2Links;
}

export interface CqlSearchResult {
  title?: string;
  excerpt?: string;
  url?: string;
  content?: {
    id?: string;
    type: string;
    title?: string;
  };
}

export interface CqlSearchResponse {
  results?: Array<CqlSearchResult>;
  _links?: { next?: string };
}

/** `GET /wiki/rest/api/content/{id}?expand=body.storage,version`. */
export interface ConfluencePage {
  id: string;
  title: string;
  status?: string;
  version: V1Version;
  body?: { storage?: { value: string } };
  _links?: { webui?: string };
}

export interface ConfluencePageList {
  results: Array<ConfluencePage>;
}

export interface ConfluenceUser {
  displayName: string;
  email?: string;
  accountId?: string;
}

export interface ConfluenceAttachment {
  id?: string;
  title: string;
  _links: { download: string };
  extensions?: { fileSize?: number; mediaType?: string };
}

export interface ConfluenceAttachmentList {
  results: Array<ConfluenceAttachment>;
}

/**
 * A field (column) of a database, from `GET /wiki/api/v2/databases/{id}/fields`.
 * The settings differ per type; only what the renderer reads is typed.
 */
export interface V2DatabaseField {
  id: string;
  name: string;
  type: string;
  settings?: V2DatabaseFieldSettings;
}

export interface V2DatabaseFieldSettings {
  richText?: boolean;
  includesTime?: boolean;
  options?: Array<{ id: string; label: string }>;
  format?: { type?: string; prefix?: string; suffix?: string; decimalPlaces?: number };
}

/**
 * One field of one entry. Text carries `plain` and an ADF document `rich`;
 * `plain` runs the blocks together, so the renderer reads `rich` when it is
 * there. Everything else carries `value`, whose shape follows `type`: a string
 * for numbers and dates, a boolean for checkboxes, a list of references for
 * select, user, hyperlink, page, entry, Jira and attachment fields.
 */
export interface V2DatabaseFieldValue {
  type: string;
  plain?: string | null;
  rich?: unknown;
  value?: unknown;
}

/** A row, from `GET /wiki/api/v2/databases/{id}/entries`. Every field is present; unset ones hold a null value. */
export interface V2DatabaseEntry {
  id: string;
  databaseId?: string;
  values: Record<string, V2DatabaseFieldValue>;
}

/** One page of a Databases API listing. `next` is site-relative (`/wiki/api/v2/...`). */
export interface V2DatabaseList<T> {
  results?: Array<T>;
  _links?: { next?: string };
  meta?: { hasMore?: boolean };
}
