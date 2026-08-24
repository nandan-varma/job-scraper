import type { Job } from "./types";
import { ALL_PROVIDERS } from "./platforms";
import { normalizeQuery } from "./format";
import { isUSLocation } from "./geo";

export type WorkModeFilter = "all" | "remote" | "hybrid" | "onsite";
export type SortKey = "newest" | "company" | "title";
export type SalaryFilter = "all" | "has" | "none";
export type RegionFilter = "all" | "us" | "intl";

export interface Filters {
  query: string;
  workMode: WorkModeFilter;
  sort: SortKey;
  /** Selected company slugs (the feed is built from these). */
  companies: Set<string>;
  /** Enabled job-provider platforms. */
  providers: Set<string>;
  departments: Set<string>;
  salary: SalaryFilter;
  region: RegionFilter;
}

export const DEFAULT_FILTERS: Filters = {
  query: "",
  workMode: "all",
  sort: "newest",
  companies: new Set(),
  providers: new Set(ALL_PROVIDERS),
  departments: new Set(),
  salary: "all",
  region: "all",
};

export const WORK_MODES: Array<{ value: WorkModeFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site" },
];

export const SALARY_MODES: Array<{ value: SalaryFilter; label: string }> = [
  { value: "all", label: "Any pay" },
  { value: "has", label: "Has pay" },
  { value: "none", label: "No pay" },
];

export const REGION_MODES: Array<{ value: RegionFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "us", label: "US" },
  { value: "intl", label: "Intl" },
];

const qMatches = (j: Job, q: string): boolean =>
  !!q &&
  (normalizeQuery(j.title).includes(q) ||
    normalizeQuery(j.company).includes(q) ||
    normalizeQuery(j.location ?? "").includes(q) ||
    normalizeQuery(j.department ?? "").includes(q));

function regionMatches(j: Job, region: RegionFilter): boolean {
  if (region === "all") return true;
  const us = isUSLocation(j.location);
  return region === "us" ? us : !us;
}

/** Main predicate: does a job satisfy the active filters + query? */
export function jobMatches(j: Job, f: Filters, q?: string): boolean {
  if (f.workMode !== "all" && j.work_mode !== f.workMode) return false;
  if (f.companies.size && !f.companies.has(j.site)) return false;
  if (f.providers.size && !f.providers.has(j.platform)) return false;
  if (f.departments.size && !f.departments.has(j.department ?? ""))
    return false;
  if (f.salary === "has" && !j.compensation) return false;
  if (f.salary === "none" && j.compensation) return false;
  if (!regionMatches(j, f.region)) return false;
  if (q) return qMatches(j, q);
  return true;
}

/** Which facet dimensions the relaxed predicate should ignore (for counting). */
export type OmitFacet =
  | "workMode"
  | "providers"
  | "departments"
  | "salary"
  | "region";

/** Matches all filters EXCEPT one dimension — the faceted "refine by" base. */
export function jobMatchesRelaxed(
  j: Job,
  f: Filters,
  q: string | undefined,
  omit: OmitFacet,
): boolean {
  if (f.workMode !== "all" && omit !== "workMode" && j.work_mode !== f.workMode)
    return false;
  if (f.companies.size && !f.companies.has(j.site)) return false;
  if (f.providers.size && omit !== "providers" && !f.providers.has(j.platform))
    return false;
  if (
    f.departments.size &&
    omit !== "departments" &&
    !f.departments.has(j.department ?? "")
  )
    return false;
  if (f.salary === "has" && omit !== "salary" && !j.compensation) return false;
  if (f.salary === "none" && omit !== "salary" && j.compensation) return false;
  if (omit !== "region" && !regionMatches(j, f.region)) return false;
  if (q) return qMatches(j, q);
  return true;
}

export function sortJobs(list: Job[], sort: SortKey): Job[] {
  switch (sort) {
    case "company":
      return [...list].sort((a, b) => a.company.localeCompare(b.company));
    case "title":
      return [...list].sort((a, b) => a.title.localeCompare(b.title));
    case "newest":
    default:
      return [...list].sort((a, b) =>
        (b.posted_date ?? "").localeCompare(a.posted_date ?? ""),
      );
  }
}

/** Per-option result counts for every facet — the "filter works on everything" UX. */
export interface FacetCounts {
  workMode: { all: number; remote: number; hybrid: number; onsite: number };
  salary: { all: number; has: number; none: number };
  region: { all: number; us: number; intl: number };
  providers: Record<string, number>;
  departments: Array<{ name: string; count: number }>;
}

export function facetCounts(jobs: Job[], f: Filters, q?: string): FacetCounts {
  const wm = { all: 0, remote: 0, hybrid: 0, onsite: 0 };
  const sal = { all: 0, has: 0, none: 0 };
  const region = { all: 0, us: 0, intl: 0 };
  const providers: Record<string, number> = {};
  const dept = new Map<string, number>();

  for (const j of jobs) {
    const wmBase = jobMatchesRelaxed(j, f, q, "workMode");
    if (wmBase) {
      wm.all++;
      if (j.work_mode) wm[j.work_mode]++;
    }
    const salBase = jobMatchesRelaxed(j, f, q, "salary");
    if (salBase) {
      sal.all++;
      if (j.compensation) sal.has++;
      else sal.none++;
    }
    if (jobMatchesRelaxed(j, f, q, "region")) {
      region.all++;
      if (isUSLocation(j.location)) region.us++;
      else region.intl++;
    }
    if (jobMatchesRelaxed(j, f, q, "providers"))
      providers[j.platform] = (providers[j.platform] ?? 0) + 1;
    if (jobMatchesRelaxed(j, f, q, "departments") && j.department)
      dept.set(j.department, (dept.get(j.department) ?? 0) + 1);
  }

  const departments = [...dept.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([name, count]) => ({ name, count }));

  return { workMode: wm, salary: sal, region, providers, departments };
}

/**
 * Per-platform job counts under only the filters that survive a source-tab
 * switch (companies, region, query) — sizes the tab strip without counting
 * provider-specific filters (work mode/salary/department) that get reset
 * when the tab changes.
 */
export function providerTabCounts(
  jobs: Job[],
  f: Filters,
  q?: string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const j of jobs) {
    if (f.companies.size && !f.companies.has(j.site)) continue;
    if (!regionMatches(j, f.region)) continue;
    if (q && !qMatches(j, q)) continue;
    counts[j.platform] = (counts[j.platform] ?? 0) + 1;
  }
  return counts;
}
