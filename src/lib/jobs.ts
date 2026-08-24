import type { Job, JobsPayload, Site, SiteResult } from "./types";
import { SITES } from "./sites";
import { FETCHERS } from "./fetchers";

/**
 * Strip heavy fields (full description) for list payloads. The source may
 * still carry a description, so we flag it and fetch it on demand by id.
 */
export function toCompact(job: Job): Job {
  return { ...job, description: null, hasDescription: !!job.description };
}

export function compactJobs(jobs: Job[]): Job[] {
  return jobs.map(toCompact);
}

/**
 * In-memory cache, keyed by site slug. No database: fetched data lives for the
 * TTL then is re-fetched from the source on demand. `Map` is module-scoped so
 * it survives across requests within a single Node process.
 */
const CACHE_TTL_MS = 15 * 60 * 1000;

const cache = new Map<string, { jobs: Job[]; fetched_at: string }>();

interface Inflight {
  promise: Promise<SiteResult>;
}

const inflight = new Map<string, Inflight>();

export function siteBySlug(slug: string): Site | undefined {
  return SITES.find((s) => s.slug === slug);
}

export function allSites(): Site[] {
  return SITES;
}

export function getCachedJobs(slug: string): Job[] | null {
  const hit = cache.get(slug);
  if (!hit) return null;
  if (Date.now() - Date.parse(hit.fetched_at) > CACHE_TTL_MS) {
    cache.delete(slug);
    return null;
  }
  return hit.jobs;
}

/**
 * Fetch one site, honoring the in-memory cache and deduping concurrent
 * in-flight requests for the same site.
 */
export async function fetchSite(
  site: Site,
  force = false,
): Promise<SiteResult> {
  if (!force) {
    const cached = getCachedJobs(site.slug);
    if (cached) {
      return {
        site: site.slug,
        company: site.name,
        platform: site.platform,
        ok: true,
        jobs: cached,
        fetched_at: getCachedMeta(site.slug),
        cached: true,
      };
    }
  }

  const existing = force ? undefined : inflight.get(site.slug);
  if (existing) return existing.promise;

  const inflightEntry: Inflight = {} as Inflight;
  inflightEntry.promise = (async () => {
    const fetcher = FETCHERS[site.platform];
    if (!fetcher) {
      return {
        site: site.slug,
        company: site.name,
        platform: site.platform,
        ok: false,
        error: `No fetcher for platform '${site.platform}'`,
        jobs: [],
        fetched_at: new Date().toISOString(),
      };
    }
    try {
      const jobs = await fetcher(site);
      const fetchedAt = new Date().toISOString();
      cache.set(site.slug, { jobs, fetched_at: fetchedAt });
      return {
        site: site.slug,
        company: site.name,
        platform: site.platform,
        ok: true,
        jobs,
        fetched_at: fetchedAt,
        cached: false,
      };
    } catch (e) {
      return {
        site: site.slug,
        company: site.name,
        platform: site.platform,
        ok: false,
        error: (e as Error).message,
        jobs: [],
        fetched_at: new Date().toISOString(),
      };
    } finally {
      inflight.delete(site.slug);
    }
  })();
  inflight.set(site.slug, inflightEntry);
  return inflightEntry.promise;
}

function getCachedMeta(slug: string): string {
  return cache.get(slug)?.fetched_at ?? new Date().toISOString();
}

/**
 * Fetch many sites with bounded concurrency, returning the aggregate payload.
 * `errorsAreFatal: true` surfaces failures per-site instead of failing all.
 */
export async function fetchSites(
  slugs: string[],
  concurrency = 12,
  force = false,
): Promise<JobsPayload> {
  const sites = slugs.map(siteBySlug).filter((s): s is Site => !!s);
  const results: SiteResult[] = new Array(sites.length);
  let idx = 0;

  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= sites.length) return;
      results[i] = await fetchSite(sites[i], force);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(1, sites.length)) },
    () => worker(),
  );
  await Promise.all(workers);

  const ok = results.filter((r) => r && r.ok);
  const failed = results.filter((r) => r && !r.ok);
  const allJobs = ok.flatMap((r) => r.jobs);
  return {
    results,
    total: allJobs.length,
    sites_fetched: ok.length,
    sites_failed: failed.length,
    errors: failed.slice(0, 20).map((r) => `${r.site}: ${r.error}`),
  };
}
