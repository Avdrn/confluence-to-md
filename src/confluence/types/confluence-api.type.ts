// Trimmed shapes of the Confluence REST responses this plugin reads.

export interface V2Version {
  number: number;
}

export interface V2Links {
  webui?: string;
  next?: string;
}

export interface V2Page {
  id: string;
  title: string;
  status?: string;
  parentId?: string | null;
  parentType?: string | null;
  version?: V2Version;
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
  version: V2Version;
  body?: { storage?: { value: string } };
  _links?: { webui?: string };
}

export interface ConfluencePageList {
  results: Array<ConfluencePage>;
}

export interface ConfluenceUser {
  displayName: string;
  email?: string;
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
