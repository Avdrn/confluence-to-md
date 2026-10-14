import { describe, expect, it } from 'vitest';
import { resolveLinks } from '../../src/sync/links/link-resolver';
import type { LinkResolveOptions } from '../../src/sync/links/link-resolver';

function options(overrides: Partial<LinkResolveOptions> = {}): LinkResolveOptions {
  return {
    spaceKey: 'ISO',
    siteUrl: 'https://site.atlassian.net',
    pagesByTitle: new Map<string, string>([
      ['iso\nother', 'ISO/Other.md'],
      ['iso\npolicies', 'ISO/Policies/Policies.md'],
      ['dev\nguide', 'DEV/Guide.md']
    ]),
    attachments: new Map<string, string>([
      ['d.png', 'ISO/_attachments/1/d.png'],
      ['spec.pdf', 'ISO/_attachments/1/spec.pdf']
    ]),
    children: [],
    ...overrides
  };
}

describe('resolveLinks', (): void => {
  it('turns a placed page link into a wikilink with the full path', (): void => {
    expect(resolveLinks('see [[confluence-page:Other||the other|]]', options())).toBe('see [[ISO/Other|the other]]');
  });

  it('omits the alias when it only repeats the note name', (): void => {
    expect(resolveLinks('[[confluence-page:Other||Other|]]', options())).toBe('[[ISO/Other]]');
    expect(resolveLinks('[[confluence-page:Other|||]]', options())).toBe('[[ISO/Other]]');
  });

  it('adds heading anchors in Obsidian form', (): void => {
    expect(resolveLinks('[[confluence-page:Other||x|Some **Heading**]]', options())).toBe('[[ISO/Other#Some Heading|x]]');
  });

  it('escapes pipes inside table rows', (): void => {
    expect(resolveLinks('| [[confluence-page:Other||x|]] | [[#Top|up]] |', options())).toBe('| [[ISO/Other\\|x]] | [[#Top\\|up]] |');
  });

  it('links to Confluence when the page is not in the vault', (): void => {
    expect(resolveLinks('[[confluence-page:Missing||x|]]', options()))
      .toBe('[x](https://site.atlassian.net/wiki/spaces/ISO/pages?title=Missing)');
  });

  it('resolves links into other spaces when they are placed too', (): void => {
    expect(resolveLinks('[[confluence-page:Guide|DEV|x|]]', options())).toBe('[[DEV/Guide|x]]');
    expect(resolveLinks('[[confluence-page:Nope|DEV|x|]]', options()))
      .toBe('[x](https://site.atlassian.net/wiki/spaces/DEV/pages?title=Nope)');
  });

  it('embeds downloaded images and links other files', (): void => {
    expect(resolveLinks('[[confluence-attachment:d.png|Diagram|image]]', options())).toBe('![[ISO/_attachments/1/d.png]]');
    expect(resolveLinks('[[confluence-attachment:spec.pdf|the spec|link]]', options())).toBe('[[ISO/_attachments/1/spec.pdf|the spec]]');
  });

  it('names attachments that were not downloaded', (): void => {
    expect(resolveLinks('[[confluence-attachment:x.png|x|image]] [[confluence-attachment:y.zip||link]]', options({ attachments: new Map<string, string>() })))
      .toBe('_[Image: x.png]_ _[Attachment: y.zip]_');
  });

  it('expands the children marker into a list', (): void => {
    const children: LinkResolveOptions['children'] = [
      { title: 'A', notePath: 'ISO/A.md' },
      { title: 'B page', notePath: 'ISO/B/B page.md' }
    ];
    expect(resolveLinks('<!--confluence-children-->', options({ children }))).toBe('- [[ISO/A]]\n- [[ISO/B/B page]]');
    expect(resolveLinks('<!--confluence-children-->', options())).toBe('_[This page has no child pages.]_');
  });

  it('expands the table of contents from the headings, skipping fences', (): void => {
    const markdown: string = '<!--confluence-toc-->\n\n## One\n\n```\n# not a heading\n```\n\n### Two **bold**\n\n## Three';
    expect(resolveLinks(markdown, options()).split('\n').slice(0, 3)).toEqual(['- [[#One]]', '  - [[#Two bold]]', '- [[#Three]]']);
  });
});
