import { parseBlocks } from './markdown/block-parser';
import type { MdBlock } from './markdown/markdown-ast';

/** One top-level block of the note, with its lines as the user typed them. */
export interface NoteBlock {
  block: MdBlock;
  text: string;
}

/** The note body as blocks. Comments are invisible in Obsidian and are left out. */
export function noteBlocks(body: string): Array<NoteBlock> {
  const lines: Array<string> = body.replace(/\r\n?/g, '\n').split('\n');
  return parseBlocks(body)
    .filter((block: MdBlock): boolean => block.kind !== 'comment')
    .map((block: MdBlock): NoteBlock => ({ block, text: lines.slice(block.from, block.to + 1).join('\n').trim() }));
}
