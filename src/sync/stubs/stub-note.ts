import { inertText } from '../../convert/inert-markdown';
import type { ContentNode } from '../../confluence/types/content-node.type';

/**
 * The body of a note for content whose body no API returns.
 *
 * Whiteboards and embeds are real content in the tree, but their shapes are
 * not exposed through the REST API. A note that says so and links to
 * Confluence is better than a silent gap in the folder.
 */
export function stubBody(node: ContentNode): string {
  const lines: Array<string> = [
    `# ${node.title}`,
    '',
    '> [!INFO]',
    `> This is a Confluence **${node.type}**. Its contents cannot be read through the Confluence API,`,
    '> so only this record is mirrored. Open it in Confluence to see it.',
    '',
    `- **Type:** ${node.type}`
  ];
  return withLink(lines, node).join('\n');
}

/**
 * A database normally gets its rows. When the Databases API refused, the note
 * says why and how to try again, instead of looking like an empty database.
 */
export function databaseStubBody(node: ContentNode, detail: string): string {
  const lines: Array<string> = [
    `# ${node.title}`,
    '',
    '> [!WARNING]',
    `> This is a Confluence **database**. Its rows could not be read this time: ${inertText(detail)}`,
    '> Run "Resync this space" to try again, or open it in Confluence.',
    '',
    '- **Type:** database'
  ];
  return withLink(lines, node).join('\n');
}

function withLink(lines: Array<string>, node: ContentNode): Array<string> {
  if (node.webUrl) {
    lines.push(`- **Confluence:** ${node.webUrl}`);
  }
  return lines;
}
