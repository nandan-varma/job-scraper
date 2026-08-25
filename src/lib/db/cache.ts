import { LRUCache } from "lru-cache";

/**
 * In-process TTL cache for the expensive multi-round-trip aggregate queries
 * (facets, tab counts, /status page stats). Each round-trip to Turso costs
 * ~300ms of network latency regardless of how small the query is, and this
 * data only changes on the sync engine's ~20-minute cadence — a short TTL
 * here turns N sequential round-trips into zero for any repeat request
 * within the window, which is the single biggest lever for perceived
 * dashboard speed. Module-scoped, so it's shared across requests within one
 * warm server process (and reset on cold start/redeploy, which is fine —
 * it's a cache, not a source of truth).
 *
 * Stores the in-flight Promise, not the resolved value: concurrent requests
 * for the same key while it's still computing share one Promise instead of
 * each triggering their own compute() (a stampede on cold cache/expiry).
 */
const store = new LRUCache<string, Promise<unknown>>({ max: 300 });

export async function cached<T>(
  key: string,
  ttlMs: number,
  compute: () => Promise<T>,
): Promise<T> {
  const hit = store.get(key);
  if (hit) return hit as Promise<T>;

  const promise = compute().catch((e) => {
    store.delete(key);
    throw e;
  });
  store.set(key, promise, { ttl: ttlMs });
  return promise as Promise<T>;
}
