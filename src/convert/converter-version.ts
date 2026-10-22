/**
 * Bumped whenever the storage-to-markdown conversion changes what it produces.
 *
 * Every synced note records the version that wrote it, so raising this makes
 * the next sync re-render every note. Without it a page whose Confluence version
 * has not moved would keep output from a converter that has since been fixed.
 */
export const CONVERTER_VERSION: number = 3;
