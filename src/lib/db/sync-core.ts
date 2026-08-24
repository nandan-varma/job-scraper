import { createHash } from "node:crypto";
import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { db } from "./client";
import { jobs, syncLog, syncState, type NewJobRow } from "./schema";
import type { FetchedJob, SyncStatus } from "./types";
import { FETCHERS, FULL_SYNC_CAP } from "../fetchers";
import { HttpError } from "../http";
import { isUSLocation } from "../geo";
import type { Site } from "../types";

/**
 * Hash of only the fields that matter for "did this posting meaningfully
 * change" — lets a re-sync bump `last_seen_at` on every pass without
 * spuriously bumping `updated_at` (and thus "recently updated" sort order)
 * when nothing actually changed.
 */
export function contentHash(j: FetchedJob): string {
  const basis = JSON.stringify([
    j.title,
    j.department,
    j.location,
    j.workMode,
    j.postedDate,
    j.description,
    j.compensationText,
    j.salaryMin,
    j.salaryMax,
    j.url,
  ]);
  return createHash("sha256").update(basis).digest("hex");
}

const UPSERT_BATCH = 500;

function toRow(
  siteSlug: string,
  company: string,
  platform: string,
  runStartedAt: Date,
  j: FetchedJob,
): NewJobRow {
  return {
    siteSlug,
    company,
    platform,
    sourceId: j.sourceId,
    title: j.title,
    department: j.department,
    departmentPath: j.departmentPath,
    location: j.location,
    secondaryLocations: j.secondaryLocations ?? null,
    workMode: j.workMode,
    workModeSource: j.workModeSource,
    employmentType: j.employmentType,
    requisitionId: j.requisitionId,
    postedDate: j.postedDate,
    updatedAtSource: j.updatedAtSource,
    applicationDeadline: j.applicationDeadline,
    url: j.url,
    applyUrl: j.applyUrl,
    description: j.description,
    isUs: isUSLocation(j.location),
    compensationText: j.compensationText,
    salaryMin: j.salaryMin ?? null,
    salaryMax: j.salaryMax ?? null,
    salaryCurrency: j.salaryCurrency,
    contentHash: contentHash(j),
    firstSeenAt: runStartedAt,
    lastSeenAt: runStartedAt,
    closedAt: null,
    updatedAt: runStartedAt,
  };
}

/**
 * Upsert every job a site returned in one fetch pass. Idempotent: safe to
 * re-run with the same data (dedup key is (site_slug, source_id)), and a
 * job that reappears after being marked closed is transparently reopened.
 */
export async function upsertSiteJobs(
  siteSlug: string,
  company: string,
  platform: string,
  fetched: FetchedJob[],
  runStartedAt: Date,
): Promise<number> {
  if (!fetched.length) return 0;
  const rows = fetched.map((j) =>
    toRow(siteSlug, company, platform, runStartedAt, j),
  );

  let upserted = 0;
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const chunk = rows.slice(i, i + UPSERT_BATCH);
    await db
      .insert(jobs)
      .values(chunk)
      .onConflictDoUpdate({
        target: [jobs.siteSlug, jobs.sourceId],
        set: {
          company: sql`excluded.company`,
          title: sql`excluded.title`,
          department: sql`excluded.department`,
          departmentPath: sql`excluded.department_path`,
          location: sql`excluded.location`,
          secondaryLocations: sql`excluded.secondary_locations`,
          workMode: sql`excluded.work_mode`,
          workModeSource: sql`excluded.work_mode_source`,
          employmentType: sql`excluded.employment_type`,
          requisitionId: sql`excluded.requisition_id`,
          postedDate: sql`excluded.posted_date`,
          updatedAtSource: sql`excluded.updated_at_source`,
          applicationDeadline: sql`excluded.application_deadline`,
          url: sql`excluded.url`,
          applyUrl: sql`excluded.apply_url`,
          description: sql`excluded.description`,
          isUs: sql`excluded.is_us`,
          compensationText: sql`excluded.compensation_text`,
          salaryMin: sql`excluded.salary_min`,
          salaryMax: sql`excluded.salary_max`,
          salaryCurrency: sql`excluded.salary_currency`,
          lastSeenAt: sql`excluded.last_seen_at`,
          // A posting that reappears after being marked closed is reopened.
          closedAt: sql`NULL`,
          // Only bump updated_at (and thus "recently updated" ordering) when
          // the content actually changed — every pass would otherwise look
          // like every job was just updated. SQLite's `IS NOT` is the
          // null-safe distinctness comparison (Postgres calls this
          // IS DISTINCT FROM).
          updatedAt: sql`CASE WHEN ${jobs.contentHash} IS NOT excluded.content_hash THEN excluded.updated_at ELSE ${jobs.updatedAt} END`,
          contentHash: sql`excluded.content_hash`,
        },
      });
    upserted += chunk.length;
  }
  return upserted;
}

/**
 * Mark-and-sweep: anything for this site not touched by the fetch pass that
 * just completed (last_seen_at older than when this run started) is gone
 * from the source's live listing — the ATS itself is the ground truth for
 * closure, not a heuristic. Only call this after a *successful, complete*
 * fetch; a failed or partial fetch must never be interpreted as "no jobs
 * left" (see callers in scripts/sync.ts).
 */
export async function sweepClosed(
  siteSlug: string,
  runStartedAt: Date,
): Promise<number> {
  const result = await db
    .update(jobs)
    .set({ closedAt: new Date() })
    .where(
      and(
        eq(jobs.siteSlug, siteSlug),
        isNull(jobs.closedAt),
        lt(jobs.lastSeenAt, runStartedAt),
      ),
    )
    .returning({ id: jobs.id });
  return result.length;
}

/**
 * sync_log is an append-only audit trail with no natural cap — left alone,
 * it grows forever across every site synced on every cron tick. Delete
 * anything older than `retentionDays`; callers invoke this occasionally
 * (see scripts/sync.ts), not on every run, since it's a maintenance task
 * rather than something that needs to happen every 20 minutes.
 */
export async function pruneSyncLog(retentionDays = 14): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const result = await db
    .delete(syncLog)
    .where(lt(syncLog.startedAt, cutoff))
    .returning({ id: syncLog.id });
  return result.length;
}

export interface LogSyncAttemptInput {
  runId: string;
  siteSlug: string;
  platform: string;
  startedAt: Date;
  durationMs: number;
  status: "ok" | "http_error" | "timeout" | "parse_error" | "empty";
  httpStatus?: number;
  jobsFound?: number;
  jobsUpserted?: number;
  jobsClosed?: number;
  error?: string;
}

export async function logSyncAttempt(input: LogSyncAttemptInput): Promise<void> {
  await db.insert(syncLog).values({
    runId: input.runId,
    siteSlug: input.siteSlug,
    platform: input.platform,
    startedAt: input.startedAt,
    durationMs: input.durationMs,
    status: input.status,
    httpStatus: input.httpStatus ?? null,
    jobsFound: input.jobsFound ?? null,
    jobsUpserted: input.jobsUpserted ?? null,
    jobsClosed: input.jobsClosed ?? null,
    error: input.error ?? null,
  });
}

/** Record a successful sync: reset backoff, bump last_success_at, cache the open count. */
export async function markSyncSuccess(
  siteSlug: string,
  openCount: number,
): Promise<void> {
  await db
    .update(syncState)
    .set({
      lastAttemptAt: new Date(),
      lastSuccessAt: new Date(),
      consecutiveFailures: 0,
      lastOpenCount: openCount,
    })
    .where(eq(syncState.siteSlug, siteSlug));
}

/** Record a failed sync: bump the failure streak so the scheduler can back off. */
export async function markSyncFailure(siteSlug: string): Promise<void> {
  await db
    .update(syncState)
    .set({
      lastAttemptAt: new Date(),
      consecutiveFailures: sql`${syncState.consecutiveFailures} + 1`,
    })
    .where(eq(syncState.siteSlug, siteSlug));
}

export interface SyncSiteOutcome {
  ok: boolean;
  status: SyncStatus;
  httpStatus?: number;
  jobsFound: number;
  jobsUpserted: number;
  jobsClosed: number;
  error?: string;
}

/**
 * The one place "fetch a site, upsert, sweep closures" happens. Both the
 * cron (scripts/sync.ts) and the manual "refresh this company" path
 * (src/lib/jobs.ts) call this — there is no second, divergent write path.
 *
 * An empty result is never swept: it's ambiguous (genuinely zero open roles
 * vs. a silent scraper/parse regression), so treating it as "site now has
 * zero jobs" would risk mass-closing real postings on a broken fetch. A
 * thrown error is likewise never swept — see closure semantics in the
 * architecture notes / sync-core.ts module comment.
 */
export async function syncSite(
  site: Site,
  runStartedAt: Date = new Date(),
): Promise<SyncSiteOutcome> {
  const fetcher = FETCHERS[site.platform];
  if (!fetcher) {
    return {
      ok: false,
      status: "parse_error",
      jobsFound: 0,
      jobsUpserted: 0,
      jobsClosed: 0,
      error: `No fetcher for platform '${site.platform}'`,
    };
  }
  try {
    const fetched = await fetcher(site, FULL_SYNC_CAP);
    if (!fetched.length) {
      return { ok: false, status: "empty", jobsFound: 0, jobsUpserted: 0, jobsClosed: 0 };
    }
    const upserted = await upsertSiteJobs(
      site.slug,
      site.name,
      site.platform,
      fetched,
      runStartedAt,
    );
    const closed = await sweepClosed(site.slug, runStartedAt);
    return {
      ok: true,
      status: "ok",
      jobsFound: fetched.length,
      jobsUpserted: upserted,
      jobsClosed: closed,
    };
  } catch (e) {
    const status: SyncStatus =
      e instanceof HttpError
        ? "http_error"
        : e instanceof Error && /timeout|abort/i.test(e.message)
          ? "timeout"
          : "parse_error";
    return {
      ok: false,
      status,
      httpStatus: e instanceof HttpError ? e.status : undefined,
      jobsFound: 0,
      jobsUpserted: 0,
      jobsClosed: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
