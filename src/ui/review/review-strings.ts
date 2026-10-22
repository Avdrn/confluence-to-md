/**
 * Every sentence the review pane shows, in one place, so the wording can be
 * read and changed as a whole. Written for someone who has never seen a
 * diff: no "diff", "hunk", "storage", "macro" or "hash".
 */

export const REVIEW: {
  title(pageTitle: string): string;
  changedSummary(count: number, when: string, version: number): string;
  nothingToSend: string;
  remoteSame: string;
  remoteMoved(by: string, when: string): string;
  draft(by: string): string;
  sendAnyway: string;
  cardLabel(kind: 'changed' | 'added' | 'removed', what: string): string;
  sendThisChange: string;
  showInNote: string;
  sideBySide: string;
  oneView: string;
  confluenceColumn: string;
  noteColumn: string;
  readsDifferently: string;
  ok: string;
  unchanged(count: number): string;
  show: string;
  historyNote: string;
  sendButton(count: number): string;
  cancel: string;
  close: string;
  getConfluenceVersion: string;
  openInConfluence: string;
  sent(version: number): string;
  sentSome(version: number, kept: number): string;
  staleNotice: string;
  conflictNotice: string;
  pullSummary(count: number): string;
  replaceMyNote: string;
  compareSame: string;
  noPage: string;
  loading: string;
} = {
  title: (pageTitle: string): string => `Review: ${pageTitle}`,
  changedSummary: (count: number, when: string, version: number): string => {
    let things: string = `${count} things`;
    if (count === 1) {
      things = '1 thing';
    }
    let since: string = `version ${version}`;
    if (when) {
      since = `${when}, version ${version}`;
    }
    return `You changed ${things} on this page since it was last synced from Confluence (${since}).`;
  },
  nothingToSend: 'Nothing to send: this note and the Confluence page read the same.',
  remoteSame: 'Confluence has not changed since then.',
  remoteMoved: (by: string, when: string): string => {
    let who: string = 'Someone';
    if (by) {
      who = by;
    }
    let time: string = '';
    if (when) {
      time = ` on ${when}`;
    }
    return `Confluence changed too. ${who} edited the page${time}. Get the Confluence version first, then make your changes again.`;
  },
  draft: (by: string): string => {
    let who: string = 'Someone';
    if (by) {
      who = by;
    }
    return `${who} has unpublished changes on this page in Confluence. Sending now folds your text into that draft, which may surprise them.`;
  },
  sendAnyway: 'Send anyway',
  cardLabel: (kind: 'changed' | 'added' | 'removed', what: string): string => {
    if (kind === 'added') {
      return `New ${what}`;
    }
    if (kind === 'removed') {
      return `Removed ${what}`;
    }
    return `Changed ${what}`;
  },
  sendThisChange: 'Send this change',
  showInNote: 'Show in note',
  sideBySide: 'Side by side',
  oneView: 'One view',
  confluenceColumn: 'Confluence',
  noteColumn: 'Your note',
  readsDifferently: 'After sending, this part will read like this:',
  ok: 'OK',
  unchanged: (count: number): string => {
    if (count === 1) {
      return '1 unchanged block';
    }
    return `${count} unchanged blocks`;
  },
  show: 'Show',
  historyNote: 'Note for the page history (optional)',
  sendButton: (count: number): string => {
    if (count === 1) {
      return 'Send 1 change to Confluence';
    }
    return `Send ${count} changes to Confluence`;
  },
  cancel: 'Cancel',
  close: 'Close',
  getConfluenceVersion: 'Get the Confluence version',
  openInConfluence: 'Open in Confluence',
  sent: (version: number): string => `Sent. Confluence is now at version ${version} and matches your note.`,
  sentSome: (version: number, kept: number): string => {
    let held: string = `${kept} changes stay`;
    if (kept === 1) {
      held = '1 change stays';
    }
    return `Sent. Confluence is now at version ${version}; ${held} in your note only.`;
  },
  staleNotice: 'The note changed while the review was open. The review was refreshed; check it and send again.',
  conflictNotice: 'Someone saved the page in Confluence just now. Nothing was sent.',
  pullSummary: (count: number): string => {
    if (count === 1) {
      return 'Taking the Confluence version removes the 1 change you made here.';
    }
    return `Taking the Confluence version removes the ${count} changes you made here.`;
  },
  replaceMyNote: 'Replace my note with the Confluence version',
  compareSame: 'This note and the Confluence page read the same.',
  noPage: 'Open a synced Confluence note to review it.',
  loading: 'Reading the page in Confluence…'
};
