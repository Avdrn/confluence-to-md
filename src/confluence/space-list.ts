import type { ConfluenceClient } from './api/confluence-client';
import type { V2Space, V2SpaceList } from './types/confluence-api.type';

export interface SpaceSummary {
  id: string;
  key: string;
  name: string;
}

/** Every space the account can see, for the picker. */
export async function listSpaces(client: ConfluenceClient): Promise<Array<SpaceSummary>> {
  const spaces: Array<SpaceSummary> = new Array<SpaceSummary>();
  let next: string = '/wiki/api/v2/spaces?limit=250&status=current&sort=name';
  while (next) {
    const batch: V2SpaceList = await client.getJson<V2SpaceList>(next);
    for (const space of batch.results) {
      spaces.push(summaryOf(space));
    }
    next = batch._links?.next ?? '';
  }
  return spaces;
}

function summaryOf(space: V2Space): SpaceSummary {
  return { id: space.id, key: space.key, name: space.name ?? space.key };
}
