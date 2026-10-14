import { describe, expect, it } from 'vitest';
import { renderPage } from '../../src/convert/render-page';

const SITE: string = 'https://site.atlassian.net';

function render(storage: string, users: Map<string, string> = new Map<string, string>()): string {
  return renderPage(storage, users, SITE);
}

function macro(name: string, params: string, body: string): string {
  return `<ac:structured-macro ac:name="${name}">${params}<ac:rich-text-body>${body}</ac:rich-text-body></ac:structured-macro>`;
}

describe('renderPage', (): void => {
  it('renders headings, paragraphs and inline formatting', (): void => {
    expect(render('<h1>Title</h1><p>Hello <strong>world</strong> and <em>more</em></p>'))
      .toBe('# Title\n\nHello **world** and *more*');
  });

  it('keeps the space that sat inside a bold tag', (): void => {
    expect(render('<p><strong>Update: </strong>done</p>')).toBe('**Update:** done');
  });

  it('turns an info panel with a title into an Obsidian callout', (): void => {
    const storage: string = macro('info', '<ac:parameter ac:name="title">Heads up</ac:parameter>', '<p>Body text</p>');
    expect(render(storage)).toBe('> [!INFO] Heads up\n> Body text');
  });

  it('maps success and error panels to callouts Obsidian knows', (): void => {
    expect(render(macro('success', '', '<p>ok</p>'))).toBe('> [!SUCCESS]\n> ok');
    expect(render(macro('error', '', '<p>bad</p>'))).toBe('> [!DANGER]\n> bad');
  });

  it('folds an expand macro into a collapsed callout', (): void => {
    const storage: string = macro('expand', '<ac:parameter ac:name="title">More</ac:parameter>', '<p>Details</p>');
    expect(render(storage)).toBe('> [!NOTE]- More\n> Details');
  });

  it('keeps a list inside a table cell on one row', (): void => {
    const storage: string = '<table><tbody>'
      + '<tr><th>A</th><th>B</th></tr>'
      + '<tr><td><ul><li>x</li><li>y<ul><li>z</li></ul></li></ul></td><td><p>1</p><p>2</p></td></tr>'
      + '</tbody></table>';
    const lines: Array<string> = render(storage).split('\n');
    expect(lines).toEqual([
      '| A | B |',
      '| --- | --- |',
      '| - x<br>- y<br>&nbsp;&nbsp;- z | 1<br>2 |'
    ]);
  });

  it('escapes pipes and flattens dates inside cells', (): void => {
    const storage: string = '<table><tbody><tr><td>a|b</td><td><time datetime="2026-04-17" /></td></tr></tbody></table>';
    expect(render(storage).split('\n')[2]).toBe('| a\\|b | 2026-04-17 |');
  });

  it('renders code macros as fences with the language', (): void => {
    const storage: string = '<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">sql</ac:parameter>'
      + '<ac:plain-text-body><![CDATA[SELECT 1]]></ac:plain-text-body></ac:structured-macro>';
    expect(render(storage)).toBe('```sql\nSELECT 1\n```');
  });

  it('renders task lists', (): void => {
    const storage: string = '<ac:task-list>'
      + '<ac:task><ac:task-status>complete</ac:task-status><ac:task-body>done</ac:task-body></ac:task>'
      + '<ac:task><ac:task-status>incomplete</ac:task-status><ac:task-body>todo</ac:task-body></ac:task>'
      + '</ac:task-list>';
    expect(render(storage)).toBe('- [x] done\n- [ ] todo');
  });

  it('renders status and Jira macros', (): void => {
    expect(render('<p><ac:structured-macro ac:name="status"><ac:parameter ac:name="title">DONE</ac:parameter></ac:structured-macro></p>')).toBe('`DONE`');
    expect(render('<p><ac:structured-macro ac:name="jira"><ac:parameter ac:name="key">IS-1</ac:parameter></ac:structured-macro></p>'))
      .toBe(`[IS-1](${SITE}/browse/IS-1)`);
  });

  it('emits a placeholder for page links and a wikilink for anchors', (): void => {
    const storage: string = '<p><ac:link><ri:page ri:content-title="Other Page" /><ac:plain-text-link-body><![CDATA[see]]></ac:plain-text-link-body></ac:link>'
      + ' <ac:link ac:anchor="Section two"><ac:plain-text-link-body><![CDATA[jump]]></ac:plain-text-link-body></ac:link></p>';
    expect(render(storage)).toBe('[[confluence-page:Other Page||see|]] [[#Section two|jump]]');
  });

  it('emits placeholders for attached images and files', (): void => {
    const storage: string = '<p><ac:image ac:alt="Diagram"><ri:attachment ri:filename="d.png" /></ac:image></p>'
      + '<p><ac:link><ri:attachment ri:filename="spec.pdf" /><ac:plain-text-link-body><![CDATA[the spec]]></ac:plain-text-link-body></ac:link></p>';
    expect(render(storage)).toBe('[[confluence-attachment:d.png|Diagram|image]]\n\n[[confluence-attachment:spec.pdf|the spec|link]]');
  });

  it('resolves mentions through the user directory', (): void => {
    const storage: string = '<p><ac:link><ri:user ri:account-id="123:abc" /></ac:link> wrote it</p>';
    expect(render(storage, new Map<string, string>([['123:abc', 'Ada']]))).toBe('@Ada wrote it');
    expect(render(storage)).toBe('@123:abc wrote it');
  });

  it('never drops the body of an unknown macro, and names an empty one', (): void => {
    expect(render(macro('mystery', '', '<p>kept</p>'))).toBe('kept');
    expect(render('<ac:structured-macro ac:name="foo"></ac:structured-macro>')).toBe('_[Confluence macro: foo]_');
  });

  it('nests lists with the right indentation', (): void => {
    expect(render('<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>')).toBe('- a\n  - b\n- c');
    expect(render('<ol><li>a<ol><li>b</li></ol></li></ol>')).toBe('1. a\n   1. b');
  });

  it('decodes entities and keeps unknown ones', (): void => {
    expect(render('<p>a &amp; b &rarr; c &unknown;</p>')).toBe('a & b → c &unknown;');
  });

  it('leaves placeholders for children and table of contents macros', (): void => {
    expect(render('<ac:structured-macro ac:name="toc" /><ac:structured-macro ac:name="children" />'))
      .toBe('<!--confluence-toc-->\n\n<!--confluence-children-->');
  });

  it('renders ADF panels and dates', (): void => {
    const storage: string = '<ac:adf-extension><ac:adf-node type="panel"><ac:adf-attribute key="panel-type">warning</ac:adf-attribute>'
      + '<ac:adf-content><p>Careful</p></ac:adf-content></ac:adf-node></ac:adf-extension>'
      + '<p><ac:adf-extension><ac:adf-node type="date"><ac:adf-attribute key="timestamp">1776556800000</ac:adf-attribute></ac:adf-node></ac:adf-extension></p>';
    expect(render(storage)).toBe('> [!WARNING]\n> Careful\n\n2026-04-19');
  });
});
