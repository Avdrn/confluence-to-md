export type ContentType = 'page' | 'folder' | 'database' | 'whiteboard' | 'embed';

/** Content with no body any API returns, mirrored as a stub note. A database has rows, read separately. */
export const STUB_TYPES: ReadonlySet<ContentType> = new Set<ContentType>(['whiteboard', 'embed']);

/** One entry in a space's content tree, whatever its type. */
export interface ContentNode {
  id: string;
  type: ContentType;
  title: string;
  parentId: string;
  parentType: string;
  version: number;
  webUrl: string;
}

export interface SpaceContent {
  spaceKey: string;
  spaceId: string;
  spaceName: string;
  spaceUrl: string;
  homepageId: string;
  nodes: ReadonlyArray<ContentNode>;
}
