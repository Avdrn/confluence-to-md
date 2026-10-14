import type { ConfluenceClient } from './api/confluence-client';
import type { V2Space, V2SpaceList } from './types/confluence-api.type';

export async function lookupSpace(client: ConfluenceClient, spaceKey: string): Promise<V2Space> {
  const list: V2SpaceList = await client.getJson<V2SpaceList>(
    `/wiki/api/v2/spaces?keys=${encodeURIComponent(spaceKey)}`
  );
  const space: V2Space | undefined = list.results[0];
  if (!space) {
    throw new Error(`Space "${spaceKey}" was not found, or your account cannot read it.`);
  }
  return space;
}
