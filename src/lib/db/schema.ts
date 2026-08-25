import {
  sqliteTable,
  integer,
  text,
  real,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * One row per posting, keyed by (site_slug, source_id) — every fetcher in
 * this repo produces a stable source_id, so there's no url-based fallback
 * dedup key.
 *
 * No raw_json/raw_html here (dropped in the Turso migration — see commit
 * history): they were pure provenance blobs never rendered in the UI and
 * accounted for ~60% of storage. Everything actually displayed lives in a
 * real column; if a field is missing, it wasn't structurally available from
 * the source at sync time and can be re-derived by re-fetching (these are
 * live APIs, not one-off scrapes) rather than re-parsing a stored blob.
 */
export const jobs = sqliteTable(
  "jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    siteSlug: text("site_slug").notNull(),
    company: text("company").notNull(),
    platform: text("platform").notNull(),
    sourceId: text("source_id").notNull(),

    title: text("title").notNull(),
    department: text("department"),
    /**
     * Keyword-categorized from `department` at sync time (lib/department-
     * category.ts) into a broad, filterable bucket — 8,502 companies each
     * name teams differently, and the raw field is too noisy (19k+ distinct
     * values, some literal internal codenames) to filter on directly.
     * Advisory: null when nothing matches confidently, never forced.
     */
    departmentCategory: text("department_category"),
    /** Full Greenhouse-style department hierarchy, joined "Parent, Child". */
    departmentPath: text("department_path"),
    location: text("location"),
    /** Ashby-style secondary/additional locations, verbatim structured data. */
    secondaryLocations: text("secondary_locations", { mode: "json" }),
    workMode: text("work_mode", {
      enum: ["remote", "hybrid", "onsite"],
    }),
    /**
     * 'structured': the platform gave an explicit field (Ashby workplaceType,
     * SmartRecruiters location.remote/hybrid, HiringCafe JSON-LD).
     * 'inferred': derived via regex heuristics over metadata/text (Greenhouse
     * custom fields, HiringCafe meta description) — advisory only, never used
     * to exclude data.
     */
    workModeSource: text("work_mode_source", {
      enum: ["structured", "inferred"],
    })
      .notNull()
      .default("inferred"),
    /** Verbatim from the ATS (e.g. "FullTime", "Contract") — never reclassified. */
    employmentType: text("employment_type"),
    /** Canonicalized from employmentType at sync time (lib/employment-type.ts)
     * — formatting variants of the same fact ("FullTime"/"Full-time"/"Full
     * Time") folded together, not a semantic guess. Null when unrecognized. */
    employmentTypeCategory: text("employment_type_category"),
    requisitionId: text("requisition_id"),

    /** True "first listed" date when the platform distinguishes it from edits (YYYY-MM-DD). */
    postedDate: text("posted_date"),
    /** The platform's own "last edited" date — kept distinct from postedDate. */
    updatedAtSource: text("updated_at_source"),
    applicationDeadline: text("application_deadline"),

    url: text("url"),
    applyUrl: text("apply_url"),
    description: text("description"),

    /**
     * Precomputed at sync time from lib/geo.ts's isUSLocation() — the same
     * heuristic the region filter always used, just evaluated once in JS
     * and stored instead of re-run as a SQL expression on every query.
     * SQLite can't index a computed LIKE/substr expression, so the region
     * facet (a common default — geo-nudged on for US visitors) was a full
     * table scan on every uncached request; this column is indexed below.
     */
    isUs: integer("is_us", { mode: "boolean" }).notNull().default(false),

    /** Verbatim compensation summary string, when that's all the platform gives. */
    compensationText: text("compensation_text"),
    /** Only populated from structured numeric fields — never regex-parsed from prose. */
    salaryMin: real("salary_min"),
    salaryMax: real("salary_max"),
    salaryCurrency: text("salary_currency"),

    /** Hash of the fields that matter, to detect real changes without re-writing every row. */
    contentHash: text("content_hash").notNull(),

    firstSeenAt: integer("first_seen_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    /** NULL = currently open. Set by the mark-and-sweep after a clean full fetch. */
    closedAt: integer("closed_at", { mode: "timestamp" }),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    uniqueIndex("jobs_site_source_unique").on(t.siteSlug, t.sourceId),
    index("jobs_open_idx").on(t.siteSlug).where(sql`${t.closedAt} is null`),
    index("jobs_posted_idx")
      .on(t.postedDate)
      .where(sql`${t.closedAt} is null`),
    index("jobs_platform_idx")
      .on(t.platform)
      .where(sql`${t.closedAt} is null`),
    index("jobs_region_idx").on(t.isUs).where(sql`${t.closedAt} is null`),
    index("jobs_department_idx")
      .on(t.department)
      .where(sql`${t.closedAt} is null`),
    index("jobs_dept_category_idx")
      .on(t.departmentCategory)
      .where(sql`${t.closedAt} is null`),
    index("jobs_emp_type_category_idx")
      .on(t.employmentTypeCategory)
      .where(sql`${t.closedAt} is null`),
    // workMode/compensationText power the facet-count GROUP BYs in
    // computeBrowseFacets — without these, those two aggregates were full
    // table scans on every uncached browse request (root cause of a Turso
    // read-quota block: 226M rows read in one day off a ~200k-row table).
    index("jobs_work_mode_idx")
      .on(t.workMode)
      .where(sql`${t.closedAt} is null`),
    index("jobs_compensation_idx")
      .on(t.compensationText)
      .where(sql`${t.closedAt} is null`),
  ],
);

/** One row per site — drives the tiered scheduler and per-site backoff. */
export const syncState = sqliteTable("sync_state", {
  siteSlug: text("site_slug").primaryKey(),
  platform: text("platform").notNull(),
  /** 1 = hot (featured/starter packs), 2 = normal, 3 = cold (backing off). */
  tier: integer("tier").notNull().default(2),
  lastAttemptAt: integer("last_attempt_at", { mode: "timestamp" }),
  lastSuccessAt: integer("last_success_at", { mode: "timestamp" }),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  lastOpenCount: integer("last_open_count"),
  nextDueAt: integer("next_due_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/** Append-only structured log of every sync attempt — queryable history, not just console output. */
export const syncLog = sqliteTable(
  "sync_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: text("run_id").notNull(),
    siteSlug: text("site_slug").notNull(),
    platform: text("platform").notNull(),
    startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
    durationMs: integer("duration_ms").notNull(),
    status: text("status", {
      enum: ["ok", "http_error", "timeout", "parse_error", "empty"],
    }).notNull(),
    httpStatus: integer("http_status"),
    jobsFound: integer("jobs_found"),
    jobsUpserted: integer("jobs_upserted"),
    jobsClosed: integer("jobs_closed"),
    error: text("error"),
  },
  (t) => [
    index("sync_log_run_idx").on(t.runId),
    index("sync_log_site_idx").on(t.siteSlug, t.startedAt),
    // Partial index over only non-'ok' rows (the rare case) — the /status
    // page's "recent failures" query filters on this and sorts by time;
    // 'ok' rows (the vast majority as the table grows) never enter this
    // index at all, so it stays small regardless of total log volume.
    index("sync_log_failures_idx")
      .on(t.startedAt)
      .where(sql`${t.status} != 'ok'`),
  ],
);

export type JobRow = typeof jobs.$inferSelect;
export type NewJobRow = typeof jobs.$inferInsert;
export type SyncStateRow = typeof syncState.$inferSelect;
export type SyncLogRow = typeof syncLog.$inferInsert;
