import { ALL_PROVIDERS } from "./platforms";

/**
 * Filter state shape shared by the toolbar and the server browse query
 * (src/lib/db/queries.ts BrowseFilters). Matching/counting no longer happens
 * client-side — the API queries the whole catalog directly — so this file
 * only holds the UI-facing types and constants.
 */

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
