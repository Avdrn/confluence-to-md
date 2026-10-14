import type { ContentNode } from '../../confluence/types/content-node.type';

export interface PlacedContent {
  node: ContentNode;
  /** Vault path of the note, or '' for a Confluence folder, which is only a directory. */
  notePath: string;
  /** Vault folder this node's children are written into. */
  folderPath: string;
  /** True when the note sits inside a folder of its own name. */
  isFolderNote: boolean;
}

/** One child of a page, for expanding a children macro. */
export interface ChildNoteLink {
  title: string;
  notePath: string;
}

export interface ContentPlacement {
  byId: ReadonlyMap<string, PlacedContent>;
  /** Lowercased "spacekey\ntitle" to note path, for resolving page links. */
  byTitle: ReadonlyMap<string, string>;
  /** Content id to its child notes, in title order. */
  childrenById: ReadonlyMap<string, ReadonlyArray<ChildNoteLink>>;
  /** Every folder the placement needs, the root included. */
  folders: ReadonlySet<string>;
  warnings: ReadonlyArray<string>;
}

export interface PlacementOptions {
  rootFolder: string;
  spaceKey: string;
  homepageId: string;
  /** Folder path to the lowercased names already taken by the user's own notes and folders. */
  reservedNames: ReadonlyMap<string, ReadonlySet<string>>;
  /** Longest vault-relative path the file system allows, or 0 for no limit. */
  maxPathLength: number;
}
