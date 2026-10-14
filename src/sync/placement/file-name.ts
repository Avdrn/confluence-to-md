/**
 * A Confluence title as a note or folder name.
 *
 * Windows refuses `\ / : * ? " < > |`, and Obsidian cannot link to a name
 * holding `# ^ [ ]`. Trailing dots and spaces are dropped because Windows
 * drops them silently, which would make the planned path and the real one
 * differ.
 */

const ILLEGAL_CHARACTERS: RegExp = /[\\/:*?"<>|#^[\]]/g;
const LAST_CONTROL_CHARACTER: number = 0x1f;
const DELETE_CHARACTER: number = 0x7f;
const RESERVED_NAMES: RegExp = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const TRAILING_DOTS_AND_SPACES: RegExp = /[. ]+$/;
const LEADING_DOTS: RegExp = /^\.+/;

/** Long enough for any real title, short enough to leave room for nesting. */
export const MAX_NAME_LENGTH: number = 100;
/** A name is never shortened below this, whatever the path budget says. */
export const MIN_NAME_LENGTH: number = 24;
const WORD_BOUNDARY_KEEP_RATIO: number = 0.6;

export function sanitizeFileName(title: string, fallback: string, maxLength: number = MAX_NAME_LENGTH): string {
  const cleaned: string = withoutControlCharacters(title)
    .replace(ILLEGAL_CHARACTERS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(LEADING_DOTS, '')
    .replace(TRAILING_DOTS_AND_SPACES, '');
  const capped: string = shortenName(cleaned, maxLength);
  if (!capped) {
    return fallback;
  }
  if (RESERVED_NAMES.test(capped)) {
    return `${capped}_`;
  }
  return capped;
}

/**
 * Cuts a name back to `maxLength`, at a word boundary when that keeps most of
 * the allowance, and never in the middle of a surrogate pair.
 */
export function shortenName(name: string, maxLength: number): string {
  if (name.length <= maxLength) {
    return name;
  }
  let cut: string = name.slice(0, maxLength);
  if (endsInHighSurrogate(cut)) {
    cut = cut.slice(0, -1);
  }
  const boundary: number = cut.lastIndexOf(' ');
  if (boundary >= Math.floor(maxLength * WORD_BOUNDARY_KEEP_RATIO)) {
    cut = cut.slice(0, boundary);
  }
  return cut.replace(TRAILING_DOTS_AND_SPACES, '');
}

function withoutControlCharacters(text: string): string {
  let kept: string = '';
  for (const char of text) {
    const code: number = char.codePointAt(0) ?? 0;
    if (code <= LAST_CONTROL_CHARACTER || code === DELETE_CHARACTER) {
      continue;
    }
    kept += char;
  }
  return kept;
}

function endsInHighSurrogate(text: string): boolean {
  const code: number = text.charCodeAt(text.length - 1);
  return code >= 0xd800 && code <= 0xdbff;
}
