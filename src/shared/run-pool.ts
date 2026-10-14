/** Runs `worker` over every item with at most `limit` in flight at once. */
export async function runPool<T>(
  items: ReadonlyArray<T>,
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let next: number = 0;
  const laneCount: number = Math.max(1, Math.min(limit, items.length));
  const lanes: Array<Promise<void>> = new Array<Promise<void>>();
  for (let lane: number = 0; lane < laneCount; lane++) {
    lanes.push((async (): Promise<void> => {
      while (next < items.length) {
        const item: T = items[next];
        next++;
        await worker(item);
      }
    })());
  }
  await Promise.all(lanes);
}
