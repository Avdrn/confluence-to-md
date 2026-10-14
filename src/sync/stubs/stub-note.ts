import type { ContentNode } from '../../confluence/types/content-node.type';

/**
 * The body of a note for content that has no body any API will return.
 *
 * Databases, whiteboards and embeds are real content in the tree, but their
 * rows and shapes are not exposed through the REST API. A note that says so
 * and links to Confluence is better than a silent gap in the folder.
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
  if (node.webUrl) {
    lines.push(`- **Confluence:** ${node.webUrl}`);
  }
  return lines.join('\n');
}
