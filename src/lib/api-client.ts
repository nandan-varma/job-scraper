import type { Job } from "./types";
import type { Filters } from "./filtering";
import type { FacetCounts } from "./db/queries";
import { ALL_PROVIDERS } from "./platforms";

export interface SiteRef {
  slug: string;
  name: string;
  platform: string;
}

/** Server-paginated jobs page — the client never holds the full catalog. */
export interface JobsPage {
  jobs: Job[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
  facets?: FacetCounts;
  tabCounts?: Record<string, number>;
}

function browseParams(
  f: Filters,
  q: string,
  page: number,
  perPage: number,
  includeFacets: boolean,
): URLSearchParams {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (f.workMode !== "all") params.set("workMode", f.workMode);
  if (f.salary !== "all") params.set("salary", f.salary);
  if (f.region !== "all") params.set("region", f.region);
  if (f.providers.size && f.providers.size < ALL_PROVIDERS.length) {
    params.set("platforms", [...f.providers].join(","));
  }
  if (f.departments.size) params.set("departments", [...f.departments].join(","));
  if (f.companies.size) params.set("companies", [...f.companies].join(","));
  params.set("sort", f.sort);
  params.set("page", String(page));
  params.set("perPage", String(perPage));
  if (!includeFacets) params.set("facets", "0");
  return params;
}

/**
 * The main browse query: searches/filters/sorts/paginates across the WHOLE
 * synced catalog server-side. `filters.companies` is an optional narrowing
 * filter, not a prerequisite — an empty set browses every open role.
 */
export async function browseJobs(
  filters: Filters,
  q: string,
  page = 1,
  perPage = 20,
  includeFacets = true,
): Promise<JobsPage> {
  const params = browseParams(filters, q, page, perPage, includeFacets);
  const res = await fetch(`/api/jobs?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to load jobs (${res.status})`);
  return res.json();
}

/** All jobs for one company, server-paginated (used by the company page). */
export async function fetchCompanyJobs(
  slug: string,
  opts: { q?: string; page?: number; perPage?: number } = {},
): Promise<JobsPage> {
  const params = new URLSearchParams({ sites: slug, facets: "0" });
  if (opts.q) params.set("q", opts.q);
  if (opts.page) params.set("page", String(opts.page));
  if (opts.perPage) params.set("perPage", String(opts.perPage));
  const res = await fetch(`/api/jobs?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to load jobs (${res.status})`);
  return res.json();
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
