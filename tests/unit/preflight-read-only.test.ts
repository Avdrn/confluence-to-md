import { describe, expect, it } from 'vitest';
import { READ_ONLY_REASON, assess } from '../../src/push/preflight';
import { hashBody } from '../../src/sync/plan/body-hash';
import type { PreflightInput, PushAssessment, ReviewChange, ReviewRun } from '../../src/push/preflight';

const SITE: string = 'https://site.atlassian.net';
const TABLE: string = [
  '| Customer | Status |',
  '| --- | --- |',
  '| Roche | On hold |',
  '| LANXESS | Inactive |'
].join('\n');
const REMOTE: string = `${TABLE}\n\n_Columns the Confluence API does not return: Backlinks._`;

function input(body: string, remoteBody: string = REMOTE, remoteVersion: number = 44): PreflightInput {
  return {
    body,
    fields: { pageId: '7', spaceKey: 'SM', title: 'Leads', version: 44, hash: hashBody(REMOTE), converter: 3, parentId: '', type: 'database' },
    remote: { id: '7', title: 'Leads', version: remoteVersion, storage: '', webUrl: '', versionBy: 'Ada', versionById: 'a', versionWhen: '2026-10-21T09:09:34.101Z' },
    draft: null,
    users: new Map<string, string>(),
    links: { spaceKey: 'SM', siteUrl: SITE, pagesByTitle: new Map<string, string>(), attachments: new Map<string, string>(), children: [] },
    includes: new Map<number, string>(),
    targets: { siteUrl: SITE, spaceKey: 'SM', page: (): null => null, attachment: (): null => null },
    readOnlyBody: remoteBody
  };
}

describe('assess for a database note', (): void => {
  it('finds nothing when the note reads like the table Confluence gives now, and never allows a send', (): void => {
    const assessment: PushAssessment = assess(input(REMOTE));
    expect(assessment.changes).toEqual([]);
    expect(assessment.unchanged).toBe(2);
    expect(assessment.localChanged).toBe(false);
    expect(assessment.remoteMoved).toBe(false);
    expect(assessment.blocked).toBe(READ_ONLY_REASON);
    expect(assessment.storageFor(new Set<number>())).toBe('');
    expect(assessment.renderedFor('')).toBe(REMOTE);
    expect(assessment.roundTrip).toEqual({ body: REMOTE, differences: [] });
  });

  it('shows an edited row as a changed table, with nothing to warn about', (): void => {
    const edited: string = REMOTE.replace('On hold', 'Active');
    const assessment: PushAssessment = assess(input(edited));
    expect(assessment.localChanged).toBe(true);
    expect(assessment.changes.length).toBe(1);
    const change: ReviewChange = assessment.changes[0];
    expect(change.kind).toBe('changed');
    expect(change.what).toBe('table');
    expect(change.before).toBe(TABLE);
    expect(change.after).toBe(TABLE.replace('On hold', 'Active'));
    expect(change.headsUp).toEqual([]);
    expect(change.lines).toEqual([0, 3]);
    expect(assessment.runs.map((run: ReviewRun): string => run.kind)).toEqual(['change', 'unchanged']);
  });

  it('shows rows added in Confluence as a change and says Confluence moved on', (): void => {
    const newer: string = REMOTE.replace('| LANXESS | Inactive |', '| LANXESS | Inactive |\n| DOW | Active |');
    const assessment: PushAssessment = assess(input(REMOTE, newer, 45));
    expect(assessment.remoteMoved).toBe(true);
    expect(assessment.remoteVersion).toBe(45);
    expect(assessment.changes.length).toBe(1);
    expect(assessment.changes[0].kind).toBe('changed');
    expect(assessment.changes[0].before).toContain('| DOW | Active |');
  });
});
