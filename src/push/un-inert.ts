/**
 * Undoes the two insertions inert-markdown.ts makes into a note body that are
 * not ordinary markdown: the zero-width space that splits a Templater opener,
 * and the one in front of inline code Dataview would run.
 *
 * Everything else the renderer escaped (`\``, `\~`, `&lt;`) is plain markdown
 * escaping and is read back by the inline parser, outside code only, which is
 * also where the renderer put it.
 */

const ZERO_WIDTH_SPACE: string = String.fromCharCode(0x200b);
const SPLIT_TEMPLATER: RegExp = new RegExp(`<${ZERO_WIDTH_SPACE}%`, 'g');
const SPLIT_INLINE_SCRIPT: RegExp = new RegExp(`(\`+)${ZERO_WIDTH_SPACE}\\$=`, 'g');

export function removeInertMarkers(body: string): string {
  return body.replace(SPLIT_TEMPLATER, '<%').replace(SPLIT_INLINE_SCRIPT, '$1$=');
}
