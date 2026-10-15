import { describe, expect, it } from 'vitest';
import { renderPage } from '../../src/convert/render-page';
import { codeLanguage, inertBody } from '../../src/convert/inert-markdown';
import { serializeFrontMatter } from '../../src/sync/front-matter/managed-front-matter';

const ZERO_WIDTH_SPACE: string = String.fromCharCode(0x200b);

function render(storage: string): string {
  return renderPage(storage, new Map<string, string>(), 'https://site.atlassian.net');
}

function codeMacro(language: string, code: string): string {
  return `<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">${language}</ac:parameter>`
    + `<ac:plain-text-body><![CDATA[${code}]]></ac:plain-text-body></ac:structured-macro>`;
}

describe('inert markdown', (): void => {
  it('keeps known code languages and maps Confluence names to highlighting names', (): void => {
    expect(codeLanguage('Python')).toBe('python');
    expect(codeLanguage('c#')).toBe('csharp');
    expect(codeLanguage('html/xml')).toBe('xml');
  });

  it('drops a code language a plugin could execute', (): void => {
    expect(render(codeMacro('dataviewjs', 'app.vault.adapter'))).toBe('```\napp.vault.adapter\n```');
    expect(codeLanguage('js-engine')).toBe('');
    expect(codeLanguage('python\n```dataviewjs')).toBe('');
  });

  it('never lets paragraphs of backticks or tildes build a code fence', (): void => {
    const fenced: string = render('<p>```dataviewjs</p><p>dv.span(1)</p><p>```</p>');
    expect(fenced).toBe('\\`\\`\\`dataviewjs\n\ndv.span(1)\n\n\\`\\`\\`');
    expect(render('<p>~~~dataviewjs</p>')).toBe('\\~\\~\\~dataviewjs');
  });

  it('keeps backticks inside inline code verbatim', (): void => {
    expect(render('<p><code>a ` b</code></p>')).toBe('``a ` b``');
  });

  it('breaks Dataview inline JavaScript', (): void => {
    expect(render('<p><code>$= dv.current()</code></p>')).toBe(`\`${ZERO_WIDTH_SPACE}$= dv.current()\``);
  });

  it('turns text that looks like HTML or Templater into plain text', (): void => {
    expect(render('<p>&lt;iframe src="x"&gt; and &lt;%* tp.user %&gt; but 1 &lt; 2</p>'))
      .toBe('&lt;iframe src="x"> and &lt;%* tp.user %> but 1 < 2');
  });

  it('breaks Templater commands left in code samples and titles', (): void => {
    expect(inertBody('```\n<%* await tp.system() %>\n```')).toBe(`\`\`\`\n<${ZERO_WIDTH_SPACE}%* await tp.system() %>\n\`\`\``);
  });

  it('writes no Templater opener into front-matter', (): void => {
    const yaml: string = serializeFrontMatter({
      pageId: '1', spaceKey: 'S', title: '<%* tp %>', version: 1, hash: 'h', converter: 2,
      url: '', parentId: '', type: 'page', fileStem: 'tp'
    });
    expect(yaml).not.toContain('<%');
    expect(yaml).toContain('"\\u003c%* tp %>"');
  });
});
