/**
 * Attributes of one storage-format element, keyed by lowercased attribute name.
 * Confluence attribute names carry namespaces (`ac:name`, `ri:content-title`),
 * so they cannot be enumerated in an interface.
 */
export type StorageAttributes = ReadonlyMap<string, string>;

/** One element or text run of a parsed storage body. `tag` is '' for text. */
export interface StorageNode {
  readonly tag: string;
  readonly attrs: StorageAttributes;
  readonly text: string;
  readonly children: ReadonlyArray<StorageNode>;
}

/** Confluence account id to display name. */
export type UserDirectory = ReadonlyMap<string, string>;
