export type WorkMode = "remote" | "hybrid" | "onsite" | null;

export interface WorkdayConfig {
  tenant: string;
  wd: string;
  site: string;
}

export interface Site {
  slug: string;
  name: string;
  platform: string;
  ashby_slug?: string;
  workday?: WorkdayConfig;
  search_queries?: string[];
  status?: string;
  source_url?: string;
}

/** Normalized job record — the shape the UI consumes. */
export interface Job {
  id: string; // stable: source_id + site slug
  site: string; // site slug / company key
  company: string; // human company name
  platform: string;
  source_id: string;
  title: string;
  department: string | null;
  location: string | null;
  work_mode: WorkMode;
  posted_date: string | null; // YYYY-MM-DD
  url: string | null;
  apply_url: string | null;
  description: string | null;
  /** True when the source has a description not included in this (list) payload. */
  hasDescription?: boolean;
  compensation: string | null;
  fetched_at: string; // ISO
}

export interface SiteResult {
  site: string;
  company: string;
  platform: string;
  ok: boolean;
  error?: string;
  jobs: Job[];
  fetched_at: string;
  cached?: boolean;
}

export interface JobsPayload {
  results: SiteResult[];
  total: number;
  sites_fetched: number;
  sites_failed: number;
  errors: string[];
}

export type SortKey = "newest" | "relevance" | "company" | "title";
