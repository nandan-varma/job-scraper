import type { WorkMode } from "@/lib/types";

/**
 * What a "full" (uncapped, sync-mode) fetcher returns per posting — a
 * superset of the interactive `Job` type. Every field that isn't directly
 * and unambiguously present on the source is left null rather than guessed.
 */
export interface FetchedJob {
  sourceId: string;
  title: string;
  department: string | null;
  departmentPath: string | null;
  location: string | null;
  secondaryLocations: unknown | null;
  workMode: WorkMode;
  /** 'structured' when the platform gave an explicit field, 'inferred' when regex-derived. */
  workModeSource: "structured" | "inferred";
  employmentType: string | null;
  requisitionId: string | null;
  /** YYYY-MM-DD */
  postedDate: string | null;
  updatedAtSource: string | null;
  applicationDeadline: string | null;
  url: string | null;
  applyUrl: string | null;
  description: string | null;
  compensationText: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
}

export type SyncStatus = "ok" | "http_error" | "timeout" | "parse_error" | "empty";

/** Result of one site's fetch attempt, before it's written to sync_log. */
export interface SiteFetchResult {
  ok: boolean;
  status: SyncStatus;
  httpStatus?: number;
  jobs: FetchedJob[];
  error?: string;
}
