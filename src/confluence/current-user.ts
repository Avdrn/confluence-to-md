import type { ConfluenceClient } from './api/confluence-client';
import type { ConfluenceUser } from './types/confluence-api.type';

export interface CurrentUser {
  displayName: string;
  accountId: string;
}

/** The account the credentials belong to. */
export async function fetchCurrentUser(client: ConfluenceClient): Promise<CurrentUser> {
  const user: ConfluenceUser = await client.getJson<ConfluenceUser>('/wiki/rest/api/user/current');
  return { displayName: user.displayName, accountId: user.accountId ?? '' };
}
