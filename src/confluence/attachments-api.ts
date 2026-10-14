import type { ConfluenceClient } from './api/confluence-client';
import type { ConfluenceAttachment, ConfluenceAttachmentList } from './types/confluence-api.type';

const ATTACHMENT_BATCH: number = 100;

/** Everything attached to a page, with sizes so unchanged files can be skipped. */
export async function listAttachments(
  client: ConfluenceClient,
  pageId: string
): Promise<Array<ConfluenceAttachment>> {
  const found: Array<ConfluenceAttachment> = new Array<ConfluenceAttachment>();
  let start: number = 0;
  while (true) {
    const batch: ConfluenceAttachmentList = await client.getJson<ConfluenceAttachmentList>(
      `/wiki/rest/api/content/${pageId}/child/attachment?expand=extensions&limit=${ATTACHMENT_BATCH}&start=${start}`
    );
    found.push(...batch.results);
    if (batch.results.length < ATTACHMENT_BATCH) {
      return found;
    }
    start += batch.results.length;
  }
}

export async function downloadAttachment(
  client: ConfluenceClient,
  attachment: ConfluenceAttachment
): Promise<ArrayBuffer> {
  return client.getBinary(downloadUrl(client.site, attachment));
}

/** The download link is relative to `/wiki` and carries its own query string. */
function downloadUrl(siteUrl: string, attachment: ConfluenceAttachment): string {
  const href: string = attachment._links.download;
  if (/^https?:\/\//i.test(href)) {
    return href;
  }
  return `${siteUrl}/wiki${href}`;
}
