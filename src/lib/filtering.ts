import { ALL_PROVIDERS } from "./platforms";

/**
 * Filter state shape shared by the toolbar and the server browse query
 * (src/lib/db/queries.ts BrowseFilters). Matching/counting no longer happens
 * client-side — the API queries the whole catalog directly — so this file
 * only holds the UI-facing types and constants.
 */

/** Default page size for browseJobs. Lives here (not job-browser.tsx) because
 * that's a "use client" module — a Server Component importing a plain
 * constant from a client-boundary file can silently resolve to `undefined`
 * (Next only reliably exposes component references across that boundary),
 * which turned into `browseJobs(..., undefined)` fetching the entire
 * 200k+-row table instead of one page of it. */
export const PAGE_SIZE = 30;

export type WorkModeFilter = "all" | "remote" | "hybrid" | "onsite";
export type SortKey = "newest" | "company" | "title";
export type SalaryFilter = "all" | "has" | "none";
export type RegionFilter = "all" | "us" | "intl";

export interface Filters {
  query: string;
  workMode: WorkModeFilter;
  sort: SortKey;
  /** Selected company slugs — an optional narrowing filter, not a prerequisite. */
  companies: Set<string>;
  /** Enabled job-provider platforms. */
  providers: Set<string>;
  /** Categorized department buckets (Engineering/Sales/...), not raw ATS strings. */
  departmentCategories: Set<string>;
  /** Categorized employment types (full_time/contract/...), not raw ATS strings. */
  employmentTypes: Set<string>;
  salary: SalaryFilter;
  region: RegionFilter;
}

export const DEFAULT_FILTERS: Filters = {
  query: "",
  workMode: "all",
  sort: "newest",
  companies: new Set(),
  providers: new Set(ALL_PROVIDERS),
  departmentCategories: new Set(),
  employmentTypes: new Set(),
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
