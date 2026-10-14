/**
 * The heading text Obsidian expects in a `[[note#Heading]]` link.
 *
 * Obsidian matches on the heading's text, not on a GitHub-style slug. Markdown
 * formatting is stripped the way Obsidian strips it, and the characters that
 * cannot appear in a link target are removed.
 */
export function obsidianHeadingAnchor(heading: string): string {
  return heading
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#|^[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
