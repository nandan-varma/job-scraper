/**
 * Tiny in-process TTL cache for the expensive multi-round-trip aggregate
 * queries (facets, tab counts, /status page stats). Each round-trip to
 * Turso costs ~300ms of network latency regardless of how small the query
 * is, and this data only changes on the sync engine's ~20-minute cadence —
 * a short TTL here turns N sequential round-trips into zero for any repeat
 * request within the window, which is the single biggest lever for
 * perceived dashboard speed. Module-scoped, so it's shared across requests
 * within one warm server process (and reset on cold start/redeploy, which
 * is fine — it's a cache, not a source of truth).
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();
const MAX_ENTRIES = 300;

export async function cached<T>(
  key: string,
  ttlMs: number,
  compute: () => Promise<T>,
): Promise<T> {
  const hit = store.get(key);
  const now = Date.now();
  if (hit && hit.expiresAt > now) return hit.value as T;

  const value = await compute();
  store.set(key, { value, expiresAt: now + ttlMs });

  if (store.size > MAX_ENTRIES) {
    const excess = store.size - MAX_ENTRIES;
    const keys = store.keys();
    for (let i = 0; i < excess; i++) {
      const next = keys.next();
      if (next.done) break;
      store.delete(next.value);
    }
  }
  return value;
}
