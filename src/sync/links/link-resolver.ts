/**
 * Turns the placeholders the renderer left behind into Obsidian links, and
 * expands the children and table-of-contents markers.
 *
 * A link to another page is a title, and which note that title became is only
 * known once the whole space has been placed; an attachment link is a
 * filename, and whether it was downloaded is only known once the page's
 * attachments have been fetched. A target that was not placed still gets a
 * link, to Confluence: a dead placeholder would be worse.
 */

import {
  ATTACHMENT_PREFIX,
  CHILDREN_PLACEHOLDER,
  PAGE_LINK_PREFIX,
  TOC_PLACEHOLDER
} from '../../convert/storage-renderer';
import { obsidianHeadingAnchor } from '../../convert/heading-anchor';
import { pageSearchUrl } from '../../confluence/page-url';
import { titleKey } from './title-key';
import { cleanLabel, embedLink, escapePipesInWikilinks, wikilink } from './wikilink';
import type { ChildNoteLink } from '../placement/placement.type';

const PAGE_PLACEHOLDER: RegExp = new RegExp(`\\[\\[${PAGE_LINK_PREFIX}:([^\\]]*)\\]\\]`, 'g');
const ATTACHMENT_PLACEHOLDER: RegExp = new RegExp(`\\[\\[${ATTACHMENT_PREFIX}:([^\\]]*)\\]\\]`, 'g');
const HEADING_LINE: RegExp = /^(#{1,6})[ \t]+(.+)$/gm;
const FENCE_LINE: RegExp = /^\s*(?:```|~~~)/;
const IMAGE_EXTENSION: RegExp = /\.(png|jpe?g|gif|svg|webp|bmp|avif)$/i;
const INDENT_PER_LEVEL: string = '  ';

export interface LinkResolveOptions {
  spaceKey: string;
  siteUrl: string;
  /** Lowercased "spacekey\ntitle" to note path. */
  pagesByTitle: ReadonlyMap<string, string>;
  /** Attachment filename to the vault path it was stored at, for this page only. */
  attachments: ReadonlyMap<string, string>;
  /** This page's children, in title order, for expanding a children macro. */
  children: ReadonlyArray<ChildNoteLink>;
}

/** Runs every post-render pass over one page body, in order. */
export function resolveLinks(markdown: string, options: LinkResolveOptions): string {
  const linked: string = markdown
    .split('\n')
    .map((line: string): string => resolveLine(line, options))
    .join('\n');
  return expandTableOfContents(expandChildren(linked, options));
}

function resolveLine(line: string, options: LinkResolveOptions): string {
  const inTableRow: boolean = line.startsWith('|');
  const withPages: string = line.replace(PAGE_PLACEHOLDER, (_whole: string, fields: string): string => {
    const [title, space, label, anchor] = splitFields(fields, 4);
    const targetSpace: string = space || options.spaceKey;
    const text: string = label || title;
    const target: string | undefined = options.pagesByTitle.get(titleKey(targetSpace, title));
    if (target) {
      return wikilink(target, text, obsidianHeadingAnchor(anchor), inTableRow);
    }
    return `[${cleanLabel(text)}](${pageSearchUrl(options.siteUrl, targetSpace, title)})`;
  });
  const withAttachments: string = withPages.replace(ATTACHMENT_PLACEHOLDER, (_whole: string, fields: string): string => {
    const [filename, label, kind] = splitFields(fields, 3);
    const target: string | undefined = options.attachments.get(filename);
    if (!target) {
      if (kind === 'image') {
        return `_[Image: ${filename}]_`;
      }
      return `_[Attachment: ${filename}]_`;
    }
    if (kind === 'image' && IMAGE_EXTENSION.test(target)) {
      return embedLink(target);
    }
    return wikilink(target, label || filename, '', inTableRow);
  });
  return escapePipesInWikilinks(withAttachments);
}

/**
 * Splits on '|' into exactly `count` fields. The renderer always emits every
 * slot, empty or not, so a missing space key cannot shift the label into it.
 */
function splitFields(fields: string, count: number): Array<string> {
  const parts: Array<string> = fields.split('|').map((part: string): string => part.trim());
  while (parts.length < count) {
    parts.push('');
  }
  return parts;
}

/**
 * Replaces the children marker with a real list of the page's child notes.
 * Many index pages have a children macro as their entire body.
 */
export function expandChildren(markdown: string, options: LinkResolveOptions): string {
  if (!markdown.includes(CHILDREN_PLACEHOLDER)) {
    return markdown;
  }
  if (options.children.length === 0) {
    return markdown.replace(CHILDREN_PLACEHOLDER, '_[This page has no child pages.]_');
  }
  const entries: Array<string> = options.children.map((child: ChildNoteLink): string =>
    `- ${wikilink(child.notePath, child.title, '', false)}`
  );
  return markdown.replace(CHILDREN_PLACEHOLDER, entries.join('\n'));
}

/**
 * Replaces the marker with a linked list of the page's own headings. Headings
 * inside a fenced code block are skipped.
 */
export function expandTableOfContents(markdown: string): string {
  if (!markdown.includes(TOC_PLACEHOLDER)) {
    return markdown;
  }
  const headings: Array<RegExpMatchArray> = collectHeadings(markdown);
  if (headings.length === 0) {
    return markdown.replace(TOC_PLACEHOLDER, '');
  }
  const topLevel: number = Math.min(
    ...headings.map((heading: RegExpMatchArray): number => heading[1].length)
  );
  const entries: Array<string> = headings.map((heading: RegExpMatchArray): string => {
    const indent: string = INDENT_PER_LEVEL.repeat(heading[1].length - topLevel);
    const text: string = obsidianHeadingAnchor(heading[2].trim());
    return `${indent}- [[#${text}]]`;
  });
  return markdown.replace(TOC_PLACEHOLDER, entries.join('\n'));
}

function collectHeadings(markdown: string): Array<RegExpMatchArray> {
  const outsideFences: Array<string> = new Array<string>();
  let inFence: boolean = false;
  for (const line of markdown.split('\n')) {
    if (FENCE_LINE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      outsideFences.push('');
      continue;
    }
    outsideFences.push(line);
  }
  return [...outsideFences.join('\n').matchAll(HEADING_LINE)];
}
