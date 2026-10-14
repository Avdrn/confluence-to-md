import type { ConfluenceClient } from './api/confluence-client';
import type { ConfluenceUser } from './types/confluence-api.type';
import type { UserDirectory as UserNames } from '../convert/storage-types';

/**
 * Account id to display name, cached for a whole run: the same people are
 * mentioned on many pages.
 */
export class UserDirectory {
  private readonly names: Map<string, string> = new Map<string, string>();

  public constructor(private readonly client: ConfluenceClient) {}

  public async resolve(accountIds: ReadonlySet<string>): Promise<UserNames> {
    const unknown: Array<string> = [...accountIds].filter(
      (id: string): boolean => id.length > 0 && !this.names.has(id)
    );
    await Promise.all(unknown.map((id: string): Promise<void> => this.lookup(id)));
    return this.names;
  }

  private async lookup(accountId: string): Promise<void> {
    try {
      const user: ConfluenceUser = await this.client.getJson<ConfluenceUser>(
        `/wiki/rest/api/user?accountId=${encodeURIComponent(accountId)}`
      );
      this.names.set(accountId, user.displayName);
    } catch {
      // An account that cannot be read is usually deactivated. Keeping the id
      // is better than dropping the mention: the reader sees someone was named.
      this.names.set(accountId, accountId);
    }
  }
}
