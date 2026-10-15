/**
 * Synced notes must stay inert: nothing a Confluence editor writes may turn
 * into something that runs in the vault.
 *
 * Obsidian itself executes nothing in a note, but popular plugins do:
 * Dataview runs `dataviewjs` fences and inline code starting with `$=`, and
 * Templater runs `<% %>` commands in new files when its file-creation trigger
 * is on. Page text is written by anyone with edit rights in Confluence, so
 * each of those entry points is closed here.
 */

/** Invisible, so the note reads the same while no plugin recognizes its syntax. */
const ZERO_WIDTH_SPACE: string = String.fromCharCode(0x200b);

/**
 * The languages of the Confluence code macro, as the names Obsidian highlights.
 * Only these survive: an unknown tag is what a code-running plugin listens for.
 */
const CODE_LANGUAGES: ReadonlyMap<string, string> = new Map<string, string>([
  ['actionscript', 'actionscript'], ['actionscript3', 'actionscript'], ['applescript', 'applescript'],
  ['bash', 'bash'], ['c', 'c'], ['c#', 'csharp'], ['csharp', 'csharp'], ['c++', 'cpp'], ['cpp', 'cpp'],
  ['clojure', 'clojure'], ['css', 'css'], ['dart', 'dart'], ['delphi', 'pascal'], ['diff', 'diff'],
  ['docker', 'docker'], ['dockerfile', 'docker'], ['erlang', 'erlang'], ['go', 'go'],
  ['graphql', 'graphql'], ['groovy', 'groovy'], ['haskell', 'haskell'], ['html', 'html'],
  ['html/xml', 'xml'], ['xml', 'xml'], ['java', 'java'], ['javafx', 'java'],
  ['javascript', 'javascript'], ['js', 'javascript'], ['json', 'json'], ['julia', 'julia'],
  ['kotlin', 'kotlin'], ['less', 'less'], ['lua', 'lua'], ['makefile', 'makefile'],
  ['markdown', 'markdown'], ['matlab', 'matlab'], ['nginx', 'nginx'], ['objective-c', 'objectivec'],
  ['objectivec', 'objectivec'], ['ocaml', 'ocaml'], ['pascal', 'pascal'], ['perl', 'perl'],
  ['php', 'php'], ['powershell', 'powershell'], ['protobuf', 'protobuf'], ['puppet', 'puppet'],
  ['python', 'python'], ['py', 'python'], ['r', 'r'], ['ruby', 'ruby'], ['rust', 'rust'],
  ['sass', 'sass'], ['scss', 'scss'], ['scala', 'scala'], ['shell', 'shell'], ['sh', 'bash'],
  ['sql', 'sql'], ['swift', 'swift'], ['typescript', 'typescript'], ['ts', 'typescript'],
  ['vb', 'vbnet'], ['vbnet', 'vbnet'], ['yaml', 'yaml'], ['yml', 'yaml']
]);

/** `<` that could open an HTML tag, a comment or a Templater command. */
const TAG_OPENER: RegExp = /<(?=[A-Za-z/!?%])/g;
const TEMPLATER_OPENER: RegExp = /<%/g;
/** Dataview's default prefix for inline JavaScript. */
const INLINE_SCRIPT_PREFIX: string = '$=';

/** The highlighting name for a code macro language, or '' for anything unknown. */
export function codeLanguage(raw: string): string {
  return CODE_LANGUAGES.get(raw.trim().toLowerCase()) ?? '';
}

/**
 * Page text as markdown that shows the same characters and nothing more.
 * Confluence has no markdown, so a backtick or tilde in its text is always
 * literal; left bare, paragraphs of them could build a code fence.
 */
export function inertText(text: string): string {
  return text
    .replace(/`/g, '\\`')
    .replace(/~/g, '\\~')
    .replace(TAG_OPENER, '&lt;');
}

/** Inline code Dataview would run as JavaScript gets an invisible first character. */
export function inertInlineCode(code: string): string {
  if (code.startsWith(INLINE_SCRIPT_PREFIX)) {
    return `${ZERO_WIDTH_SPACE}${code}`;
  }
  return code;
}

/**
 * The final pass over a whole note body. Code samples and titles keep their
 * `<%`, so Templater's opener is broken up wherever it is left.
 */
export function inertBody(body: string): string {
  return body.replace(TEMPLATER_OPENER, `<${ZERO_WIDTH_SPACE}%`);
}
