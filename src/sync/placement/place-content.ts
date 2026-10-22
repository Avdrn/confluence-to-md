/**
 * Where every piece of Confluence content belongs in the vault, decided before
 * anything is fetched or written.
 *
 * Deciding first is what lets a page link to a page that has not been synced
 * yet: the whole path map exists before the first body is converted.
 *
 * Layout, with every name taken from the title:
 *
 *     <root>/<Home page>.md             the space home page, children directly under <root>
 *     <root>/<Leaf page>.md
 *     <root>/<Parent page>/<Parent page>.md   a page with children owns a folder (folder note)
 *     <root>/<Folder>/                  a Confluence folder is a directory only
 *     <root>/<Database>.md              a table of its rows; a whiteboard or embed is a stub
 */

import { MIN_NAME_LENGTH, sanitizeFileName, shortenName } from './file-name';
import { SiblingNames } from './sibling-names';
import { titleKey } from '../links/title-key';
import { ATTACHMENTS_FOLDER } from '../attachments/attachment-folder';
import { joinPath } from '../../shared/vault-path';
import type { ContentNode } from '../../confluence/types/content-node.type';
import type { ChildNoteLink, ContentPlacement, PlacedContent, PlacementOptions } from './placement.type';

const MARKDOWN_EXTENSION_LENGTH: number = 3;

export function placeContent(nodes: ReadonlyArray<ContentNode>, options: PlacementOptions): ContentPlacement {
  const placer: Placer = new Placer(nodes, options);
  return placer.place();
}

class Placer {
  private readonly byId: Map<string, PlacedContent> = new Map<string, PlacedContent>();
  private readonly byTitle: Map<string, string> = new Map<string, string>();
  private readonly folders: Set<string> = new Set<string>();
  private readonly warnings: Array<string> = new Array<string>();
  private readonly namesByFolder: Map<string, SiblingNames> = new Map<string, SiblingNames>();
  private readonly childrenOf: Map<string, Array<ContentNode>>;
  private readonly nodesById: Map<string, ContentNode>;

  public constructor(
    private readonly nodes: ReadonlyArray<ContentNode>,
    private readonly options: PlacementOptions
  ) {
    this.nodesById = new Map<string, ContentNode>(
      nodes.map((node: ContentNode): [string, ContentNode] => [node.id, node])
    );
    this.childrenOf = groupByParent(nodes);
  }

  public place(): ContentPlacement {
    const root: string = this.options.rootFolder;
    this.folders.add(root);
    const home: ContentNode | undefined = this.nodesById.get(this.options.homepageId);
    if (home) {
      this.placeHome(home, root);
    }
    const roots: Array<ContentNode> = this.nodes.filter((node: ContentNode): boolean =>
      node.id !== this.options.homepageId && (!node.parentId || !this.nodesById.has(node.parentId))
    );
    this.walk(roots, root);
    return {
      byId: this.byId,
      byTitle: this.byTitle,
      childrenById: this.collectChildren(),
      folders: this.folders,
      warnings: this.warnings
    };
  }

  /** The home page sits at the root and its children directly beneath it. */
  private placeHome(home: ContentNode, root: string): void {
    const stem: string = this.names(root).claim(this.leafName(home, root));
    this.record({ node: home, notePath: joinPath(root, `${stem}.md`), folderPath: root, isFolderNote: false });
    this.walk(this.childrenOf.get(home.id) ?? [], root);
  }

  private walk(level: ReadonlyArray<ContentNode>, folder: string): void {
    for (const node of [...level].sort(byTitleThenId)) {
      const children: Array<ContentNode> = this.childrenOf.get(node.id) ?? [];
      const placed: PlacedContent = this.placeOne(node, children.length > 0, folder);
      this.record(placed);
      if (children.length > 0) {
        this.walk(children, placed.folderPath);
      }
    }
  }

  private placeOne(node: ContentNode, hasChildren: boolean, folder: string): PlacedContent {
    if (node.type === 'folder') {
      const name: string = this.names(folder).claim(this.folderName(node, folder));
      return { node, notePath: '', folderPath: joinPath(folder, name), isFolderNote: false };
    }
    if (!hasChildren) {
      const stem: string = this.names(folder).claim(this.leafName(node, folder));
      return { node, notePath: joinPath(folder, `${stem}.md`), folderPath: folder, isFolderNote: false };
    }
    const name: string = this.names(folder).claim(this.folderName(node, folder));
    const ownFolder: string = joinPath(folder, name);
    return { node, notePath: joinPath(ownFolder, `${name}.md`), folderPath: ownFolder, isFolderNote: true };
  }

  private record(placed: PlacedContent): void {
    this.byId.set(placed.node.id, placed);
    if (placed.notePath) {
      this.byTitle.set(titleKey(this.options.spaceKey, placed.node.title), placed.notePath);
    }
    this.folders.add(placed.folderPath);
  }

  private names(folder: string): SiblingNames {
    let names: SiblingNames | undefined = this.namesByFolder.get(folder);
    if (!names) {
      const reserved: Array<string> = [...(this.options.reservedNames.get(folder) ?? [])];
      if (folder === this.options.rootFolder) {
        reserved.push(ATTACHMENTS_FOLDER); // the attachments folder may not exist yet
      }
      names = new SiblingNames(reserved);
      this.namesByFolder.set(folder, names);
    }
    return names;
  }

  /** `<folder>/<name>.md` must fit the path budget. */
  private leafName(node: ContentNode, folder: string): string {
    const allowance: number = this.options.maxPathLength - folder.length - 1 - MARKDOWN_EXTENSION_LENGTH;
    return this.fit(node, allowance);
  }

  /** `<folder>/<name>/<name>.md` must fit, so the name counts twice. */
  private folderName(node: ContentNode, folder: string): string {
    const allowance: number = Math.floor((this.options.maxPathLength - folder.length - 2 - MARKDOWN_EXTENSION_LENGTH) / 2);
    return this.fit(node, allowance);
  }

  private fit(node: ContentNode, allowance: number): string {
    const name: string = sanitizeFileName(node.title, `${capitalize(node.type)} ${node.id}`);
    if (this.options.maxPathLength <= 0 || name.length <= allowance) {
      return name;
    }
    const shortened: string = shortenName(name, Math.max(MIN_NAME_LENGTH, allowance));
    if (shortened.length > allowance) {
      this.warnings.push(`"${node.title}" sits so deep that its path may exceed the file system limit.`);
    }
    return shortened;
  }

  /**
   * Which children each page should list. A Confluence folder has no note of
   * its own, so a page filed under one is listed by the nearest ancestor that
   * does have a note.
   */
  private collectChildren(): Map<string, Array<ChildNoteLink>> {
    const byParent: Map<string, Array<ChildNoteLink>> = new Map<string, Array<ChildNoteLink>>();
    for (const node of this.nodes) {
      const placed: PlacedContent | undefined = this.byId.get(node.id);
      if (!placed?.notePath) {
        continue;
      }
      const owner: string = this.nearestNoteAncestor(node);
      if (!owner) {
        continue;
      }
      const siblings: Array<ChildNoteLink> = byParent.get(owner) ?? [];
      siblings.push({ title: node.title, notePath: placed.notePath });
      byParent.set(owner, siblings);
    }
    for (const siblings of byParent.values()) {
      siblings.sort((a: ChildNoteLink, b: ChildNoteLink): number =>
        a.title.toLowerCase().localeCompare(b.title.toLowerCase())
      );
    }
    return byParent;
  }

  private nearestNoteAncestor(node: ContentNode): string {
    let parent: ContentNode | undefined = this.nodesById.get(node.parentId);
    const seen: Set<string> = new Set<string>([node.id]);
    while (parent && !seen.has(parent.id)) {
      seen.add(parent.id);
      if (this.byId.get(parent.id)?.notePath) {
        return parent.id;
      }
      parent = this.nodesById.get(parent.parentId);
    }
    return '';
  }
}

function groupByParent(nodes: ReadonlyArray<ContentNode>): Map<string, Array<ContentNode>> {
  const grouped: Map<string, Array<ContentNode>> = new Map<string, Array<ContentNode>>();
  for (const node of nodes) {
    if (!node.parentId) {
      continue;
    }
    const siblings: Array<ContentNode> = grouped.get(node.parentId) ?? [];
    siblings.push(node);
    grouped.set(node.parentId, siblings);
  }
  return grouped;
}

function byTitleThenId(a: ContentNode, b: ContentNode): number {
  const byName: number = a.title.toLowerCase().localeCompare(b.title.toLowerCase());
  if (byName !== 0) {
    return byName;
  }
  return a.id.localeCompare(b.id);
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
