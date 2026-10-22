/**
 * The text of an Atlassian Document Format (ADF) body as plain lines, for the
 * rich text cells of a database. Each block (a paragraph, a heading, a list
 * item) is one line, so a cell keeps its paragraphs where the API's own
 * `plain` projection runs them together. List items keep a bullet or their
 * number, nested ones an indent, so a list still reads as a list on one row.
 *
 * Marks (bold, colour, link) are dropped and the text is kept: losing markup
 * is acceptable, losing text is not.
 */

interface AdfNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: Array<unknown>;
}

/** Non-breaking, because a table cell collapses ordinary spaces. */
const NESTED_INDENT: string = '  ';
const BULLET: string = '• ';
const TASK_OPEN: string = '☐ ';
const TASK_DONE: string = '☑ ';
const DATE_LENGTH: number = 10;
/** Blocks that hold inline content and end a line. */
const LINE_BLOCKS: ReadonlySet<string> = new Set<string>([
  'paragraph', 'heading', 'codeBlock', 'blockCard', 'embedCard', 'mediaSingle', 'mediaGroup', 'taskItem', 'decisionItem'
]);
const LIST_BLOCKS: ReadonlySet<string> = new Set<string>(['bulletList', 'orderedList', 'taskList', 'decisionList']);

export function adfLines(doc: unknown): Array<string> {
  const writer: LineWriter = new LineWriter();
  writer.block(asNode(doc), '', 0);
  return writer.finish();
}

class LineWriter {
  private readonly lines: Array<string> = new Array<string>();
  private current: string = '';
  private hasText: boolean = false;

  public finish(): Array<string> {
    this.flush();
    return this.lines;
  }

  /** A block: a line of its own, a list, or a container whose children follow in order. */
  public block(node: AdfNode | null, prefix: string, depth: number): void {
    if (!node) {
      return;
    }
    const type: string = node.type ?? '';
    if (LIST_BLOCKS.has(type)) {
      this.list(node, type, depth);
      return;
    }
    if (LINE_BLOCKS.has(type)) {
      this.line(node, prefix);
      return;
    }
    if (type === 'rule') {
      this.flush();
      return;
    }
    let childPrefix: string = prefix;
    for (const child of childrenOf(node)) {
      this.block(child, childPrefix, depth);
      childPrefix = indentOf(depth);
    }
  }

  private line(node: AdfNode, prefix: string): void {
    this.flush();
    this.current = prefix;
    this.inline(node);
    this.flush();
  }

  /** Every item gets its marker on its first line; what follows inside the item is indented under it. */
  private list(node: AdfNode, type: string, depth: number): void {
    const start: number = numberOf(node.attrs?.order, 1);
    childrenOf(node).forEach((item: AdfNode, index: number): void => {
      const prefix: string = indentOf(depth) + markerOf(type, start + index, item);
      if (LINE_BLOCKS.has(item.type ?? '')) {
        this.line(item, prefix);
        return;
      }
      let childPrefix: string = prefix;
      for (const child of childrenOf(item)) {
        this.block(child, childPrefix, depth + 1);
        childPrefix = indentOf(depth + 1);
      }
    });
  }

  private inline(node: AdfNode): void {
    for (const child of childrenOf(node)) {
      switch (child.type) {
        case 'text':
          this.append(child.text ?? '');
          break;
        case 'hardBreak':
          this.flush();
          break;
        case 'emoji':
          this.append(stringAttr(child, 'text') || stringAttr(child, 'shortName'));
          break;
        case 'mention':
        case 'status':
          this.append(stringAttr(child, 'text'));
          break;
        case 'inlineCard':
        case 'blockCard':
        case 'embedCard':
          this.append(stringAttr(child, 'url'));
          break;
        case 'date':
          this.append(dateOf(child));
          break;
        case 'media':
          this.append(stringAttr(child, 'alt') || stringAttr(child, 'url') || '[media]');
          break;
        default:
          this.append(child.text ?? '');
          this.inline(child);
      }
    }
  }

  private append(text: string): void {
    if (!text) {
      return;
    }
    this.current += text;
    if (text.trim()) {
      this.hasText = true;
    }
  }

  /** A line with a marker but no text (an empty paragraph, an empty bullet) is not worth a row. */
  private flush(): void {
    if (this.hasText) {
      this.lines.push(this.current.trimEnd());
    }
    this.current = '';
    this.hasText = false;
  }
}

function markerOf(listType: string, number: number, item: AdfNode): string {
  if (listType === 'orderedList') {
    return `${number}. `;
  }
  if (listType === 'taskList') {
    if (stringAttr(item, 'state') === 'DONE') {
      return TASK_DONE;
    }
    return TASK_OPEN;
  }
  return BULLET;
}

function indentOf(depth: number): string {
  return NESTED_INDENT.repeat(depth);
}

function dateOf(node: AdfNode): string {
  const timestamp: number = numberOf(node.attrs?.timestamp, Number.NaN);
  if (!Number.isFinite(timestamp)) {
    return '';
  }
  return new Date(timestamp).toISOString().slice(0, DATE_LENGTH);
}

function asNode(value: unknown): AdfNode | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as AdfNode;
}

function childrenOf(node: AdfNode): Array<AdfNode> {
  const children: Array<AdfNode> = new Array<AdfNode>();
  for (const child of node.content ?? []) {
    const found: AdfNode | null = asNode(child);
    if (found) {
      children.push(found);
    }
  }
  return children;
}

function stringAttr(node: AdfNode, key: string): string {
  const value: unknown = node.attrs?.[key];
  if (typeof value === 'string') {
    return value;
  }
  return '';
}

function numberOf(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed: number = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}
