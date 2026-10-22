import { describe, expect, it } from 'vitest';
import { parseBlocks } from '../../src/push/markdown/block-parser';
import { writeStorage } from '../../src/push/storage-writer';
import type { AttachmentRef, PageRef, StorageResult, StorageTargets } from '../../src/push/storage-writer';

const SITE: string = 'https://site.atlassian.net';
const MACRO: string = 'ac:structured-macro';
const targets: StorageTargets = {
  siteUrl: SITE,
  spaceKey: 'DOCS',
  page: (target: string): PageRef | null => {
    if (target === 'DOCS/User guide') {
      return { title: 'User guide', spaceKey: 'DOCS' };
    }
    if (target === 'DEV/Setup') {
      return { title: 'Setup', spaceKey: 'DEV' };
    }
    return null;
  },
  attachment: (target: string): AttachmentRef | null => {
    if (target === 'DOCS/_attachments/42/import-wizard.png') {
      return { filename: 'import wizard.png', pageTitle: '', spaceKey: 'DOCS' };
    }
    if (target === 'DOCS/_attachments/7/spec.pdf') {
      return { filename: 'spec.pdf', pageTitle: 'Specs', spaceKey: 'DOCS' };
    }
    return null;
  }
};

function storage(markdown: string): StorageResult {
  return writeStorage(parseBlocks(markdown), targets);
}

describe('writeStorage', (): void => {
  it('writes headings, paragraphs and inline formatting, escaping as XML', (): void => {
    expect(storage('## A & B\n\nSome **bold** *em* ~~gone~~ `co<de>`\nnext line\n\n---').storage)
      .toBe('<h2>A &amp; B</h2><p>Some <strong>bold</strong> <em>em</em> <s>gone</s> <code>co&lt;de&gt;</code><br/>next line</p><hr/>');
  });

  it('writes a code fence as a code macro, with CDATA that survives a closing marker', (): void => {
    expect(storage('```csharp\nvar x = "]]>";\n```').storage).toBe(
      `<${MACRO} ac:name="code" ac:schema-version="1"><ac:parameter ac:name="language">c#</ac:parameter>`
      + `<ac:plain-text-body><![CDATA[var x = "]]]]><![CDATA[>";]]></ac:plain-text-body></${MACRO}>`
    );
  });

  it('writes callouts as panels, a folded one as an expand, and names a type it has to change', (): void => {
    expect(storage('> [!WARNING] Careful\n> text').storage).toBe(
      `<${MACRO} ac:name="warning" ac:schema-version="1"><ac:parameter ac:name="title">Careful</ac:parameter>`
      + `<ac:rich-text-body><p>text</p></ac:rich-text-body></${MACRO}>`
    );
    expect(storage('> [!NOTE]- Steps\n> 1. one').storage).toBe(
      `<${MACRO} ac:name="expand" ac:schema-version="1"><ac:parameter ac:name="title">Steps</ac:parameter>`
      + `<ac:rich-text-body><ol><li>one</li></ol></ac:rich-text-body></${MACRO}>`
    );
    const result: StorageResult = storage('> [!SUCCESS]\n> done');
    expect(result.storage).toContain('ac:name="tip"');
    expect(result.lost[0]).toContain('"SUCCESS" callout');
  });

  it('writes nested lists, and task items as a task list with ids', (): void => {
    expect(storage('- a\n  - b\n- c').storage).toBe('<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>');
    expect(storage('- [x] done\n- [ ] open').storage).toBe(
      '<ac:task-list><ac:task><ac:task-id>1</ac:task-id><ac:task-status>complete</ac:task-status><ac:task-body><span>done</span></ac:task-body></ac:task>'
      + '<ac:task><ac:task-id>2</ac:task-id><ac:task-status>incomplete</ac:task-status><ac:task-body><span>open</span></ac:task-body></ac:task></ac:task-list>'
    );
  });

  it('writes tables and rebuilds the lists the renderer flattened into cells', (): void => {
    const markdown: string = '| **Area** | Fix |\n| --- | --- |\n| Value help | - one<br>- two |\n| Import \\| export | a<br>b |';
    expect(storage(markdown).storage).toBe(
      '<table><tbody><tr><th><p><strong>Area</strong></p></th><th><p>Fix</p></th></tr>'
      + '<tr><td><p>Value help</p></td><td><ul><li>one</li><li>two</li></ul></td></tr>'
      + '<tr><td><p>Import | export</p></td><td><p>a</p><p>b</p></td></tr></tbody></table>'
    );
  });

  it('resolves wikilinks to pages, other spaces, headings and attachments', (): void => {
    expect(storage('[[DOCS/User guide|the guide]] [[DEV/Setup]] [[#Open tasks|tasks]] [[DOCS/_attachments/7/spec.pdf|spec]]').storage).toBe(
      '<p><ac:link><ri:page ri:content-title="User guide"/><ac:plain-text-link-body><![CDATA[the guide]]></ac:plain-text-link-body></ac:link> '
      + '<ac:link><ri:page ri:content-title="Setup" ri:space-key="DEV"/></ac:link> '
      + '<ac:link ac:anchor="Open tasks"><ac:plain-text-link-body><![CDATA[tasks]]></ac:plain-text-link-body></ac:link> '
      + '<ac:link><ri:attachment ri:filename="spec.pdf"><ri:page ri:content-title="Specs"/></ri:attachment>'
      + '<ac:plain-text-link-body><![CDATA[spec]]></ac:plain-text-link-body></ac:link></p>'
    );
  });

  it('turns an embed into an image, keeps its caption, and names an image it cannot place', (): void => {
    expect(storage('![[DOCS/_attachments/42/import-wizard.png]]\n_Step 2_').storage).toBe(
      '<ac:image ac:align="center" ac:layout="center"><ri:attachment ri:filename="import wizard.png"/><ac:caption><p>Step 2</p></ac:caption></ac:image>'
    );
    expect(storage('![[DOCS/_attachments/42/import-wizard.png]] inline').storage)
      .toBe('<p><ac:image><ri:attachment ri:filename="import wizard.png"/></ac:image> inline</p>');
    const missing: StorageResult = storage('![[Pasted image.png]]');
    expect(missing.storage).toBe('<p></p>');
    expect(missing.lost[0]).toContain('Pasted image.png');
  });

  it('restores the Jira macro and page links the renderer wrote, and writes other links plainly', (): void => {
    const markdown: string = `[WM-101](${SITE}/browse/WM-101) [Support](${SITE}/wiki/spaces/HELP/pages?title=Support) `
      + '[docs](https://example.com/a?b=1&c=2) <https://z.example>';
    expect(storage(markdown).storage).toBe(
      `<p><${MACRO} ac:name="jira" ac:schema-version="1"><ac:parameter ac:name="key">WM-101</ac:parameter></${MACRO}> `
      + '<ac:link><ri:page ri:content-title="Support" ri:space-key="HELP"/></ac:link> '
      + '<a href="https://example.com/a?b=1&amp;c=2">docs</a> <a href="https://z.example">https://z.example</a></p>'
    );
  });

  it('names highlights and dangling links as lost', (): void => {
    const result: StorageResult = storage('==hi== [[Nowhere|x]]');
    expect(result.storage).toBe('<p>hi x</p>');
    expect(result.lost.length).toBe(2);
  });
});
