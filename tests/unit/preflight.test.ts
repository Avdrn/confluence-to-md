import { describe, expect, it } from 'vitest';
import samplePage from '../fixtures/sample-page.storage.xml?raw';
import { inertBody } from '../../src/convert/inert-markdown';
import { renderPage } from '../../src/convert/render-page';
import { assess } from '../../src/push/preflight';
import { hashBody } from '../../src/sync/plan/body-hash';
import { resolveLinks } from '../../src/sync/links/link-resolver';
import type { PreflightInput, PushAssessment, ReviewChange } from '../../src/push/preflight';
import type { AttachmentRef, PageRef } from '../../src/push/storage-writer';
import type { LinkResolveOptions } from '../../src/sync/links/link-resolver';

const SITE: string = 'https://site.atlassian.net';
const USERS: Map<string, string> = new Map<string, string>([['5b10ac8d82e05b22cc7d4ef5', 'Ada Lovelace']]);
const LINKS: LinkResolveOptions = {
  spaceKey: 'DOCS',
  siteUrl: SITE,
  pagesByTitle: new Map<string, string>([['docs\nuser guide', 'DOCS/User guide.md']]),
  attachments: new Map<string, string>([['import-wizard.png', 'DOCS/_attachments/42/import-wizard.png']]),
  children: []
};
const NOTE: string = inertBody(resolveLinks(renderPage(samplePage, USERS, SITE), LINKS));

function input(body: string, remoteVersion: number = 12): PreflightInput {
  return {
    body,
    fields: { pageId: '42', spaceKey: 'DOCS', title: 'Release 2.4', version: 12, hash: hashBody(NOTE), converter: 2, parentId: '', type: 'page' },
    remote: { id: '42', title: 'Release 2.4', version: remoteVersion, storage: samplePage, webUrl: '', versionBy: 'Jane Doe', versionById: 'j', versionWhen: '2026-10-20T10:00:00.000Z' },
    draft: null,
    users: USERS,
    links: LINKS,
    includes: new Map<number, string>(),
    readOnlyBody: null,
    targets: {
      siteUrl: SITE,
      spaceKey: 'DOCS',
      page: (target: string): PageRef | null => {
        if (target === 'DOCS/User guide') {
          return { title: 'User guide', spaceKey: 'DOCS' };
        }
        return null;
      },
      attachment: (target: string): AttachmentRef | null => {
        if (target === 'DOCS/_attachments/42/import-wizard.png') {
          return { filename: 'import-wizard.png', pageTitle: '', spaceKey: 'DOCS' };
        }
        return null;
      }
    }
  };
}

function only(assessment: PushAssessment): ReviewChange {
  expect(assessment.changes.length).toBe(1);
  return assessment.changes[0];
}

describe('assess', (): void => {
  it('finds nothing to send when the note is as the sync wrote it', (): void => {
    const assessment: PushAssessment = assess(input(NOTE));
    expect(assessment.localChanged).toBe(false);
    expect(assessment.remoteMoved).toBe(false);
    expect(assessment.blocked).toBe('');
    expect(assessment.changes).toEqual([]);
    expect(assessment.unchanged).toBe(21);
    expect(assessment.storageFor(new Set<number>())).toBe(samplePage);
  });

  it('sends one changed paragraph and keeps every macro around it byte for byte', (): void => {
    const edited: string = NOTE.replace('Please note: features marked', 'Please note that features marked');
    const assessment: PushAssessment = assess(input(edited));
    expect(assessment.localChanged).toBe(true);
    const change: ReviewChange = only(assessment);
    expect(change.kind).toBe('changed');
    expect(change.what).toBe('paragraph');
    expect(change.lines).toEqual([15, 15]);
    expect(change.headsUp.some((text: string): boolean => text.includes('a status label'))).toBe(true);
    expect(change.headsUp.some((text: string): boolean => text.includes('a date field'))).toBe(true);
    const storage: string = assessment.storageFor(new Set<number>([change.index]));
    expect(storage).toContain('<p>Please note that features marked <code>PREVIEW</code> are hidden in the demo system until 2026-11-01.</p>');
    expect(storage).toContain('<ac:structured-macro ac:name="jira" ac:schema-version="1" ac:macro-id="a4">');
    expect(storage).toContain('<ac:structured-macro ac:name="toc" ac:schema-version="1" ac:macro-id="a1">');
    expect(storage).toContain('ri:version-at-save="1"');
    expect(assessment.roundTrip.differences).toEqual([]);
    expect(assessment.renderedFor(storage)).toBe(edited);
  });

  it('warns when a block Confluence builds is edited', (): void => {
    const edited: string = NOTE.replace('- [[#In this release]]', '- [[#In this release now]]');
    const change: ReviewChange = only(assess(input(edited)));
    expect(change.headsUp.some((text: string): boolean => text.includes('the table of contents'))).toBe(true);
  });

  it('places an added block after the block before it, and names a removed one', (): void => {
    const added: PushAssessment = assess(input(`${NOTE}\n\nNew final paragraph`));
    const addition: ReviewChange = only(added);
    expect(addition.kind).toBe('added');
    expect(addition.what).toBe('paragraph');
    const storage: string = added.storageFor(new Set<number>([addition.index]));
    expect(storage.indexOf('<p>New final paragraph</p>')).toBeGreaterThan(storage.indexOf('online documentation'));
    expect(storage.indexOf('<p>New final paragraph</p>')).toBeLessThan(storage.indexOf('recently-updated'));

    const removed: PushAssessment = assess(input(NOTE.replace('![[DOCS/_attachments/42/import-wizard.png]]\n_The new import wizard, step 2 of 3_\n\n', '')));
    const removal: ReviewChange = only(removed);
    expect(removal.kind).toBe('removed');
    expect(removal.what).toBe('image');
    expect(removal.headsUp.some((text: string): boolean => text.includes('size and position'))).toBe(true);
    expect(removed.storageFor(new Set<number>([removal.index]))).not.toContain('import-wizard.png');
  });

  it('is blocked while Confluence is at another version', (): void => {
    const assessment: PushAssessment = assess(input(NOTE, 13));
    expect(assessment.remoteMoved).toBe(true);
    expect(assessment.blocked).toContain('Confluence changed');
  });
});
