import type { Job, JobsPayload, Site, SiteResult } from "./types";
import { SITES } from "./sites";
import { jobsForSites, jobDetail as dbJobDetail } from "./db/queries";
import { syncSite, markSyncSuccess, markSyncFailure } from "./db/sync-core";

/**
 * Reads come from the DB (kept fresh by the GH Actions sync engine —
 * scripts/sync.ts), not from live ATS fetches. `refreshSite` is the one
 * on-demand exception: it calls the exact same syncSite() the cron uses, so
 * there's never a second write path that could produce different data.
 */

export function siteBySlug(slug: string): Site | undefined {
  return SITES.find((s) => s.slug === slug);
}

export function allSites(): Site[] {
  return SITES;
}

/** Strip heavy fields (full description) for list payloads — kept for API
 * back-compat; DB list queries already return jobs in this shape. */
export function toCompact(job: Job): Job {
  return { ...job, description: null, hasDescription: !!job.hasDescription };
}

export function compactJobs(jobs: Job[]): Job[] {
  return jobs.map(toCompact);
}

/** Force a live re-fetch + upsert for one company right now, bypassing the
 * scheduler. Used by the "refresh this company" UI action. */
export async function refreshSite(site: Site): Promise<SiteResult> {
  const startedAt = new Date();
  const outcome = await syncSite(site, startedAt);
  if (outcome.ok) {
    await markSyncSuccess(site.slug, outcome.jobsFound);
  } else {
    await markSyncFailure(site.slug);
  }
  const jobs = outcome.ok ? await jobsForSites([site.slug]) : [];
  return {
    site: site.slug,
    company: site.name,
    platform: site.platform,
    ok: outcome.ok,
    error: outcome.error,
    jobs,
    fetched_at: startedAt.toISOString(),
    cached: false,
  };
}

/**
 * Read whatever's currently in the DB for these sites. No upstream fetch,
 * no cache/TTL dance — the sync engine keeps the DB fresh in the
 * background, so this is just a query. `force` triggers a live refresh
 * first (see refreshSite) for the rare case a user wants up-to-the-second
 * data for a specific company.
 */
export async function fetchSites(
  slugs: string[],
  force = false,
): Promise<JobsPayload> {
  const sites = slugs.map(siteBySlug).filter((s): s is Site => !!s);
  const unknown = slugs.filter((s) => !siteBySlug(s));

  if (force) {
    const outcomes = await Promise.all(sites.map((s) => refreshSite(s)));
    const results: SiteResult[] = [
      ...outcomes,
      ...unknown.map((slug) => unknownSiteResult(slug)),
    ];
    return toPayload(results);
  }

  const jobs = await jobsForSites(sites.map((s) => s.slug));
  const bySite = new Map<string, Job[]>();
  for (const j of jobs) bySite.set(j.site, [...(bySite.get(j.site) ?? []), j]);

  const fetchedAt = new Date().toISOString();
  const results: SiteResult[] = [
    ...sites.map((s) => ({
      site: s.slug,
      company: s.name,
      platform: s.platform,
      ok: true,
      jobs: bySite.get(s.slug) ?? [],
      fetched_at: fetchedAt,
      cached: true,
    })),
    ...unknown.map((slug) => unknownSiteResult(slug)),
  ];
  return toPayload(results);
}

function unknownSiteResult(slug: string): SiteResult {
  return {
    site: slug,
    company: slug,
    platform: "",
    ok: false,
    error: `Unknown company '${slug}'`,
    jobs: [],
    fetched_at: new Date().toISOString(),
  };
}

function toPayload(results: SiteResult[]): JobsPayload {
  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  return {
    results,
    total: ok.reduce((n, r) => n + r.jobs.length, 0),
    sites_fetched: ok.length,
    sites_failed: failed.length,
    errors: failed.slice(0, 20).map((r) => `${r.site}: ${r.error}`),
  };
}

/** Single job with full description, for the detail pane. */
export async function fetchJobDetail(
  siteSlug: string,
  sourceId: string,
): Promise<Job | null> {
  return dbJobDetail(siteSlug, sourceId);
}
