import {
  pgTable,
  bigserial,
  text,
  smallint,
  integer,
  numeric,
  date,
  timestamp,
  jsonb,
  uuid,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * One row per posting, keyed by (site_slug, source_id) — every fetcher in
 * this repo produces a stable source_id, so there's no url-based fallback
 * dedup key (unlike the sibling job-fetcher pipeline's curated rows).
 *
 * raw_json is mandatory: normalized columns are convenience derivations,
 * never the source of truth. Nothing the ATS API returns is ever discarded.
 */
export const jobs = pgTable(
  "jobs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    siteSlug: text("site_slug").notNull(),
    company: text("company").notNull(),
    platform: text("platform").notNull(),
    sourceId: text("source_id").notNull(),

    title: text("title").notNull(),
    department: text("department"),
    /** Full Greenhouse-style department hierarchy, joined "Parent, Child". */
    departmentPath: text("department_path"),
    location: text("location"),
    /** Ashby-style secondary/additional locations, verbatim structured data. */
    secondaryLocations: jsonb("secondary_locations"),
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
    requisitionId: text("requisition_id"),

    /** True "first listed" date when the platform distinguishes it from edits. */
    postedDate: date("posted_date"),
    /** The platform's own "last edited" timestamp — kept distinct from postedDate. */
    updatedAtSource: date("updated_at_source"),
    applicationDeadline: date("application_deadline"),

    url: text("url"),
    applyUrl: text("apply_url"),
    description: text("description"),
    /** Original JD HTML, when the source provides it — for future re-parsing without a re-fetch. */
    rawHtml: text("raw_html"),

    /** Verbatim compensation summary string, when that's all the platform gives. */
    compensationText: text("compensation_text"),
    /** Only populated from structured numeric fields — never regex-parsed from prose. */
    salaryMin: numeric("salary_min"),
    salaryMax: numeric("salary_max"),
    salaryCurrency: text("salary_currency"),

    /** Full verbatim source object(s) (list + detail, merged) for this posting. */
    rawJson: jsonb("raw_json").notNull(),
    /** Hash of the fields that matter, to detect real changes without diffing raw_json. */
    contentHash: text("content_hash").notNull(),

    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** NULL = currently open. Set by the mark-and-sweep after a clean full fetch. */
    closedAt: timestamp("closed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("jobs_site_source_unique").on(t.siteSlug, t.sourceId),
    index("jobs_open_idx").on(t.siteSlug).where(sql`${t.closedAt} IS NULL`),
    index("jobs_posted_idx")
      .on(t.postedDate)
      .where(sql`${t.closedAt} IS NULL`),
    index("jobs_platform_idx")
      .on(t.platform)
      .where(sql`${t.closedAt} IS NULL`),
    index("jobs_search_idx").using(
      "gin",
      sql`to_tsvector('english', ${t.title} || ' ' || ${t.company} || ' ' || coalesce(${t.department}, ''))`,
    ),
  ],
);

/** One row per site — drives the tiered scheduler and per-site backoff. */
export const syncState = pgTable("sync_state", {
  siteSlug: text("site_slug").primaryKey(),
  platform: text("platform").notNull(),
  /** 1 = hot (featured/starter packs), 2 = normal, 3 = cold (backing off). */
  tier: smallint("tier").notNull().default(2),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  consecutiveFailures: smallint("consecutive_failures").notNull().default(0),
  lastOpenCount: integer("last_open_count"),
  nextDueAt: timestamp("next_due_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Append-only structured log of every sync attempt — queryable history, not just console output. */
export const syncLog = pgTable(
  "sync_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    runId: uuid("run_id").notNull(),
    siteSlug: text("site_slug").notNull(),
    platform: text("platform").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
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
  ],
);

export type JobRow = typeof jobs.$inferSelect;
export type NewJobRow = typeof jobs.$inferInsert;
export type SyncStateRow = typeof syncState.$inferSelect;
export type SyncLogRow = typeof syncLog.$inferInsert;
