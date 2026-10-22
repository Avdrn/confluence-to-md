/**
 * A database as one markdown table: the fields as columns in their Confluence
 * order, one row per entry.
 *
 * The page renderer's rule holds here too: nothing is dropped silently. A cell
 * shows the plain text of what it holds, a person's name, a link to the note
 * that mirrors a linked page. A column the API only ever returns empty (a
 * lookup, a backlink, a page status) is left out and named under the table,
 * so a reader knows the database shows more in Confluence than the note does.
 */

import { adfLines } from '../../convert/adf-text';
import { inertText } from '../../convert/inert-markdown';
import { wikilink } from '../links/wikilink';
import type { V2DatabaseEntry, V2DatabaseField, V2DatabaseFieldValue } from '../../confluence/types/confluence-api.type';

/** A note in the vault that mirrors a piece of Confluence content, for links from cells. */
export interface LinkedNote {
  notePath: string;
  title: string;
}

export interface DatabaseRenderInput {
  databaseId: string;
  fields: ReadonlyArray<V2DatabaseField>;
  entries: ReadonlyArray<V2DatabaseEntry>;
  /** Account id to display name. */
  users: ReadonlyMap<string, string>;
  /** Confluence content id to the note that mirrors it. */
  notesById: ReadonlyMap<string, LinkedNote>;
  siteUrl: string;
}

interface CellContext {
  input: DatabaseRenderInput;
  entriesById: ReadonlyMap<string, V2DatabaseEntry>;
  /** The first text column, which names a row when another row links to it. '' when there is none. */
  labelFieldId: string;
}

/** Field types whose values the API returns as null in every row. */
const UNREADABLE_TYPES: ReadonlySet<string> = new Set<string>([
  'entryDetails', 'backlink', 'pageDetails', 'pageLabels', 'pageStatus', 'jiraIssueDetails'
]);
const TEXT_TYPES: ReadonlySet<string> = new Set<string>(['text', 'aiSummary']);
const LIST_SEPARATOR: string = ', ';
/** A markdown cell cannot be empty, or the row loses a column. */
const EMPTY_CELL: string = ' ';
/** Ordinary spaces at either end of a line. Not the non-breaking ones: they indent a nested list item. */
const EDGE_SPACES: RegExp = /^[ \t\f\v]+|[ \t\f\v]+$/g;
const DATETIME: RegExp = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
/** Characters that would end a markdown link target early. */
const URL_UNSAFE: RegExp = /[ ()|<>`]/g;
const URL_ESCAPES: ReadonlyMap<string, string> = new Map<string, string>([
  [' ', '%20'], ['(', '%28'], [')', '%29'], ['|', '%7C'], ['<', '%3C'], ['>', '%3E'], ['`', '%60']
]);
/** Properties a reference of a type this renderer does not know might carry a readable value in. */
const FALLBACK_KEYS: ReadonlyArray<string> = ['label', 'name', 'title', 'key', 'url', 'plain', 'value', 'id'];

export function renderDatabase(input: DatabaseRenderInput): string {
  if (input.fields.length === 0) {
    return '_This database has no fields._';
  }
  const shown: Array<V2DatabaseField> = input.fields.filter(
    (field: V2DatabaseField): boolean => !UNREADABLE_TYPES.has(field.type)
  );
  const hidden: Array<V2DatabaseField> = input.fields.filter(
    (field: V2DatabaseField): boolean => UNREADABLE_TYPES.has(field.type)
  );
  const lines: Array<string> = new Array<string>();
  if (shown.length > 0) {
    const context: CellContext = {
      input,
      entriesById: new Map<string, V2DatabaseEntry>(
        input.entries.map((entry: V2DatabaseEntry): [string, V2DatabaseEntry] => [entry.id, entry])
      ),
      labelFieldId: shown.find((field: V2DatabaseField): boolean => TEXT_TYPES.has(field.type))?.id ?? ''
    };
    lines.push(`| ${shown.map((field: V2DatabaseField): string => cellText(field.name)).join(' | ')} |`);
    lines.push(`|${shown.map((): string => ' --- ').join('|')}|`);
    for (const entry of input.entries) {
      const cells: Array<string> = shown.map(
        (field: V2DatabaseField): string => renderCell(field, entry.values?.[field.id], context)
      );
      lines.push(`| ${cells.join(' | ')} |`);
    }
    if (input.entries.length === 0) {
      lines.push('', '_No entries._');
    }
  }
  if (hidden.length > 0) {
    const names: string = hidden.map((field: V2DatabaseField): string => inertText(field.name)).join(LIST_SEPARATOR);
    if (lines.length > 0) {
      lines.push('');
    }
    lines.push(`_Columns the Confluence API does not return: ${names}._`);
  }
  return lines.join('\n');
}

/** Every account id named in a user field, so names can be looked up before rendering. */
export function collectDatabaseAccountIds(entries: ReadonlyArray<V2DatabaseEntry>): Set<string> {
  const ids: Set<string> = new Set<string>();
  for (const entry of entries) {
    for (const value of Object.values(entry.values ?? {})) {
      if (value?.type !== 'user') {
        continue;
      }
      for (const ref of refsOf(value)) {
        const id: string = stringOf(ref, 'accountId');
        if (id) {
          ids.add(id);
        }
      }
    }
  }
  return ids;
}

function renderCell(field: V2DatabaseField, value: V2DatabaseFieldValue | undefined, context: CellContext): string {
  if (!value) {
    return EMPTY_CELL;
  }
  const type: string = value.type || field.type;
  if (TEXT_TYPES.has(type)) {
    return cellText(textOf(value));
  }
  switch (type) {
    case 'number':
      return cellText(numberText(field, value));
    case 'checkbox':
      return checkboxText(value);
    case 'date':
      return cellText(dateText(value));
    case 'select':
      return cellText(refsOf(value).map((ref: unknown): string => stringOf(ref, 'label')).filter(Boolean).join(LIST_SEPARATOR));
    case 'user':
      return cellText(refsOf(value).map((ref: unknown): string => userName(ref, context)).filter(Boolean).join(LIST_SEPARATOR));
    case 'hyperlink':
      return joinCells(refsOf(value).map((ref: unknown): string => hyperlink(ref)));
    case 'pageLink':
      return joinCells(refsOf(value).map((ref: unknown): string => pageLink(stringOf(ref, 'contentId'), context)));
    case 'entryLink':
      return joinCells(refsOf(value).map((ref: unknown): string => entryLink(ref, context)));
    case 'jiraIssue':
      return joinCells(refsOf(value).map((ref: unknown): string => jiraLink(stringOf(ref, 'key'), context)));
    case 'attachment':
      return attachmentText(refsOf(value).length);
    default:
      return cellText(fallbackText(value));
  }
}

/**
 * The text of a text field, one line per block. The rich document is the
 * source when there is one: the API's `plain` runs paragraphs and list items
 * together with nothing in between.
 */
function textOf(value: V2DatabaseFieldValue | undefined): string {
  if (!value) {
    return '';
  }
  if (value.rich && typeof value.rich === 'object') {
    const lines: Array<string> = adfLines(value.rich);
    if (lines.length > 0) {
      return lines.join('\n');
    }
  }
  return value.plain ?? '';
}

/**
 * Text as one table cell: the same characters, on one line. A raw pipe would
 * end the column and a newline the row, so paragraphs are joined with `<br>`,
 * the only line break a markdown table understands.
 */
function cellText(raw: string): string {
  const flat: string = inertText(raw.replace(/\r\n?/g, '\n'))
    .split('\n')
    .map((line: string): string => line.replace(EDGE_SPACES, ''))
    .filter((line: string): boolean => line.trim().length > 0)
    .join('<br>')
    .replace(/\|/g, '\\|');
  if (!flat) {
    return EMPTY_CELL;
  }
  return flat;
}

function joinCells(parts: ReadonlyArray<string>): string {
  const filled: Array<string> = parts.filter((part: string): boolean => part.trim().length > 0);
  if (filled.length === 0) {
    return EMPTY_CELL;
  }
  return filled.join(LIST_SEPARATOR);
}

/** The canonical decimal as Confluence stores it, with the display prefix and suffix the field is set to. */
function numberText(field: V2DatabaseField, value: V2DatabaseFieldValue): string {
  const raw: unknown = value.value;
  if (raw === null || raw === undefined || raw === '') {
    return '';
  }
  const format: { prefix?: string; suffix?: string } = field.settings?.format ?? {};
  return `${format.prefix ?? ''}${String(raw)}${format.suffix ?? ''}`;
}

/** Confluence treats an unset checkbox as unchecked, and so does the note. */
function checkboxText(value: V2DatabaseFieldValue): string {
  if (value.value === true) {
    return 'Yes';
  }
  return 'No';
}

/** A date stays `YYYY-MM-DD`; a date with time reads `YYYY-MM-DD HH:mm` plus its zone. */
function dateText(value: V2DatabaseFieldValue): string {
  if (typeof value.value !== 'string') {
    return '';
  }
  const match: RegExpExecArray | null = DATETIME.exec(value.value);
  if (!match) {
    return value.value;
  }
  let zone: string = match[3];
  if (zone === 'Z') {
    zone = 'UTC';
  }
  return `${match[1]} ${match[2]} ${zone}`;
}

function userName(ref: unknown, context: CellContext): string {
  const accountId: string = stringOf(ref, 'accountId');
  if (!accountId) {
    return '';
  }
  return context.input.users.get(accountId) ?? accountId;
}

/** A link with a label reads as one; a bare link shows its address once, as an autolink. */
function hyperlink(ref: unknown): string {
  const url: string = stringOf(ref, 'url');
  if (!url) {
    return '';
  }
  const label: string = stringOf(ref, 'label').trim();
  if (!label) {
    return `<${safeUrl(url)}>`;
  }
  return markdownLink(label, url);
}

/** A page this sync placed becomes a wikilink; any other page a link to Confluence. */
function pageLink(contentId: string, context: CellContext): string {
  if (!contentId) {
    return '';
  }
  const note: LinkedNote | undefined = context.input.notesById.get(contentId);
  if (note) {
    return wikilink(note.notePath, note.title, '', true);
  }
  return markdownLink(`page ${contentId}`, `${context.input.siteUrl}/wiki/pages/viewpage.action?pageId=${contentId}`);
}

/**
 * A link to a row of this database shows that row's first text, the way
 * Confluence shows it. A row of another database is beyond this note; the
 * link goes to that database's note when the sync placed one.
 */
function entryLink(ref: unknown, context: CellContext): string {
  const entryId: string = stringOf(ref, 'entryId');
  const otherDatabase: string = stringOf(ref, 'databaseContentId');
  if (otherDatabase && otherDatabase !== context.input.databaseId) {
    const note: LinkedNote | undefined = context.input.notesById.get(otherDatabase);
    if (note) {
      return wikilink(note.notePath, note.title, '', true);
    }
    return cellText(`entry in database ${otherDatabase}`);
  }
  const target: V2DatabaseEntry | undefined = context.entriesById.get(entryId);
  const label: string = textOf(target?.values?.[context.labelFieldId]);
  if (label.trim()) {
    return cellText(label);
  }
  if (!entryId) {
    return '';
  }
  return cellText(`entry ${entryId}`);
}

function jiraLink(key: string, context: CellContext): string {
  if (!key) {
    return '';
  }
  return markdownLink(key, `${context.input.siteUrl}/browse/${key}`);
}

/** The API names an attachment only by its media id, so the note can say how many there are, not which. */
function attachmentText(count: number): string {
  if (count === 0) {
    return EMPTY_CELL;
  }
  if (count === 1) {
    return '_[1 attachment]_';
  }
  return `_[${count} attachments]_`;
}

/** A field type this renderer does not know still shows whatever readable text its value carries. */
function fallbackText(value: V2DatabaseFieldValue): string {
  if (typeof value.plain === 'string') {
    return value.plain;
  }
  const raw: unknown = value.value;
  if (raw === null || raw === undefined) {
    return '';
  }
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
    return String(raw);
  }
  if (Array.isArray(raw)) {
    return raw.map(readableOf).filter(Boolean).join(LIST_SEPARATOR);
  }
  return readableOf(raw);
}

function readableOf(ref: unknown): string {
  if (typeof ref === 'string' || typeof ref === 'number' || typeof ref === 'boolean') {
    return String(ref);
  }
  for (const key of FALLBACK_KEYS) {
    const found: string = stringOf(ref, key);
    if (found) {
      return found;
    }
  }
  return JSON.stringify(ref) ?? '';
}

function markdownLink(label: string, url: string): string {
  const target: string = safeUrl(url);
  const safeLabel: string = inertText(label)
    .replace(/\s+/g, ' ')
    .replace(/[[\]]/g, '')
    .replace(/\|/g, '\\|')
    .trim();
  return `[${safeLabel || target}](${target})`;
}

function safeUrl(url: string): string {
  return url.trim().replace(URL_UNSAFE, (ch: string): string => URL_ESCAPES.get(ch) ?? ch);
}

function refsOf(value: V2DatabaseFieldValue): Array<unknown> {
  if (Array.isArray(value.value)) {
    return value.value;
  }
  return [];
}

function stringOf(ref: unknown, key: string): string {
  if (!ref || typeof ref !== 'object') {
    return '';
  }
  const found: unknown = (ref as Record<string, unknown>)[key];
  if (typeof found === 'string') {
    return found;
  }
  if (typeof found === 'number') {
    return String(found);
  }
  return '';
}
