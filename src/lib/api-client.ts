import type { Job } from "./types";

export interface SiteRef {
  slug: string;
  name: string;
  platform: string;
}

/** Paginated job response (server-filtered; client never holds the full set). */
export interface JobsPage {
  jobs: Job[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
  sites_fetched: number;
  sites_failed: number;
  errors: string[];
}

interface JobsOpts {
  sites?: string[];
  featured?: boolean;
  all?: boolean;
  fresh?: boolean;
  q?: string;
  platforms?: string[];
  page?: number;
  perPage?: number;
  maxSites?: number;
}

/** Client-side helper to request jobs from the API route. */
export async function fetchJobs(opts: JobsOpts = {}): Promise<JobsPage> {
  const params = new URLSearchParams();
  if (opts.all) params.set("all", "1");
  else if (opts.featured) params.set("featured", "1");
  else if (opts.sites?.length) params.set("sites", opts.sites.join(","));
  if (opts.fresh) params.set("fresh", "1");
  if (opts.q) params.set("q", opts.q);
  if (opts.platforms?.length) params.set("platforms", opts.platforms.join(","));
  if (opts.maxSites) params.set("maxSites", String(opts.maxSites));
  if (opts.page) params.set("page", String(opts.page));
  if (opts.perPage) params.set("perPage", String(opts.perPage));

  const res = await fetch(`/api/jobs?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to load jobs (${res.status})`);
  return res.json();
}

/** All jobs for one company, server-paginated. */
export function fetchCompanyJobs(
  slug: string,
  opts: { q?: string; page?: number; perPage?: number } = {},
): Promise<JobsPage> {
  return fetchJobs({
    sites: [slug],
    q: opts.q,
    perPage: opts.perPage,
    page: opts.page,
  });
}

/** Instant server-side company search (capped — the registry is ~8.5k). */
export async function searchSites(
  q: string,
  platforms?: string[],
  limit = 60,
): Promise<{ count: number; total: number; sites: SiteRef[] }> {
  const params = new URLSearchParams({ q, limit: String(limit) });
  if (platforms?.length) params.set("platforms", platforms.join(","));
  const res = await fetch(`/api/sites?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to search companies");
  return res.json();
}

/** Load the full detail (description) for a single role, on demand. */
export async function fetchJobDetail(
  slug: string,
  id: string,
): Promise<Job | null> {
  const res = await fetch(
    `/api/jobs/${encodeURIComponent(slug)}?id=${encodeURIComponent(id)}`,
  );
  if (!res.ok) return null;
  const data = await res.json();
  return (data as { job?: Job }).job ?? null;
}

export async function fetchSitesRegistry(): Promise<{
  count: number;
  sites: SiteRef[];
}> {
  const res = await fetch("/api/sites");
  if (!res.ok) throw new Error("Failed to load sites");
  return res.json();
}
