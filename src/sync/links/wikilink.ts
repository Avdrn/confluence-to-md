import { stemOf, withoutMarkdownExtension } from '../../shared/vault-path';

const WIKILINK: RegExp = /\[\[([^\]]*)\]\]/g;

/**
 * An Obsidian link with the full vault path, so it resolves whatever the
 * "shortest path" setting says. The alias is left out when it would only
 * repeat the note name.
 */
export function wikilink(notePath: string, label: string, anchor: string, inTableRow: boolean): string {
  const target: string = withoutMarkdownExtension(notePath);
  let link: string = target;
  if (anchor) {
    link = `${target}#${anchor}`;
  }
  const alias: string = cleanLabel(label);
  let inner: string = link;
  if (alias && alias !== stemOf(notePath) && alias !== target) {
    inner = `${link}|${alias}`;
  }
  return `[[${escapeForTable(inner, inTableRow)}]]`;
}

export function embedLink(path: string): string {
  return `![[${path}]]`;
}

/** A label cannot contain the characters that end a wikilink or start its alias. */
export function cleanLabel(label: string): string {
  return label.replace(/\]\]/g, '] ]').replace(/\|/g, '/').trim();
}

/** Inside a table row every pipe inside a wikilink must be escaped, or it ends the cell. */
export function escapePipesInWikilinks(line: string): string {
  if (!line.startsWith('|')) {
    return line;
  }
  return line.replace(WIKILINK, (_whole: string, inner: string): string =>
    `[[${inner.replace(/\\\|/g, '|').replace(/\|/g, '\\|')}]]`
  );
}

function escapeForTable(inner: string, inTableRow: boolean): string {
  if (!inTableRow) {
    return inner;
  }
  return inner.replace(/\|/g, '\\|');
}
