export type WorkMode = "remote" | "hybrid" | "onsite" | null;

export interface WorkdayConfig {
  tenant: string;
  wd: string;
  site: string;
}

export interface OracleCloudConfig {
  /** Host serving the Candidate Experience UI + REST API — either a raw
   * *.fa.<dc>.oraclecloud.com domain or a company's custom domain proxying
   * the same Oracle Fusion Recruiting Cloud instance (e.g. Dell's
   * enterpriseplatform.dell.com). */
  host: string;
  siteNumber: string;
  /** Path segment after /hcmUI/CandidateExperience/en/sites/ in public job
   * URLs — not always equal to siteNumber (e.g. Oracle itself uses
   * "jobsearch", Dell uses "careers"). */
  sitePath: string;
}

export interface Site {
  slug: string;
  name: string;
  platform: string;
  ashby_slug?: string;
  workday?: WorkdayConfig;
  oracleCloud?: OracleCloudConfig;
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
