import { and, desc, gt, isNull, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "./client";
import { jobs, syncLog, syncState } from "./schema";
import { cached } from "./cache";

/** /status is a dashboard, not a live ticker — 60s staleness is invisible
 * and turns 5+ sequential ~300ms Turso round-trips into zero on repeat loads. */
const STATUS_TTL_MS = 60_000;

export interface PlatformStatus {
  platform: string;
  sitesTracked: number;
  syncedLast24h: number;
  neverSynced: number;
  failing: number;
  openJobs: number;
  lastSuccessAt: string | null;
}

export interface RecentFailure {
  siteSlug: string;
  platform: string;
  status: string;
  httpStatus: number | null;
  error: string | null;
  startedAt: string;
}

export interface OverallStatus {
  totalOpenJobs: number;
  companiesTracked: number;
  companiesSyncedLast24h: number;
  closedLast24h: number;
  lastSyncAt: string | null;
}

/** SQLite has no `now() - interval`; compute the cutoff in JS and bind it. */
function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}

/** `max()` over an integer-mode timestamp column returns raw unix seconds
 * through a raw sql<> expression (it doesn't go through drizzle's column
 * type mapper) — convert back to an ISO string for the UI's timeAgo(). */
function unixToIso(seconds: number | null): string | null {
  return seconds == null ? null : new Date(seconds * 1000).toISOString();
}

/** Per-platform sync health — the source of truth for the /status page. */
export async function platformStatuses(): Promise<PlatformStatus[]> {
  return cached("platformStatuses", STATUS_TTL_MS, computePlatformStatuses);
}

async function computePlatformStatuses(): Promise<PlatformStatus[]> {
  const cutoff = hoursAgo(24);
  const [stateRows, openRows] = await Promise.all([
    db
      .select({
        platform: syncState.platform,
        sitesTracked: sql<number>`count(*)`,
        syncedLast24h: sql<number>`count(*) filter (where ${gt(syncState.lastSuccessAt, cutoff)})`,
        neverSynced: sql<number>`count(*) filter (where ${syncState.lastSuccessAt} is null)`,
        failing: sql<number>`count(*) filter (where ${syncState.consecutiveFailures} > 0)`,
        lastSuccessAt: sql<number | null>`max(${syncState.lastSuccessAt})`,
      })
      .from(syncState)
      .groupBy(syncState.platform),
    db
      .select({
        platform: jobs.platform,
        openJobs: sql<number>`count(*)`,
      })
      .from(jobs)
      .where(isNull(jobs.closedAt))
      .groupBy(jobs.platform),
  ]);

  const openByPlatform = new Map(openRows.map((r) => [r.platform, r.openJobs]));

  return stateRows
    .map((r) => ({
      ...r,
      lastSuccessAt: unixToIso(r.lastSuccessAt),
      openJobs: openByPlatform.get(r.platform) ?? 0,
    }))
    .sort((a, b) => b.sitesTracked - a.sitesTracked);
}

/** Most recent non-'ok' sync attempts, newest first. */
export async function recentFailures(limit = 30): Promise<RecentFailure[]> {
  return cached(`recentFailures:${limit}`, STATUS_TTL_MS, async () => {
    const rows = await db
      .select({
        siteSlug: syncLog.siteSlug,
        platform: syncLog.platform,
        status: syncLog.status,
        httpStatus: syncLog.httpStatus,
        error: syncLog.error,
        startedAt: syncLog.startedAt,
      })
      .from(syncLog)
      .where(ne(syncLog.status, "ok"))
      .orderBy(desc(syncLog.startedAt))
      .limit(limit);
    return rows.map((r) => ({ ...r, startedAt: r.startedAt.toISOString() }));
  });
}

export async function overallStatus(): Promise<OverallStatus> {
  return cached("overallStatus", STATUS_TTL_MS, computeOverallStatus);
}

async function computeOverallStatus(): Promise<OverallStatus> {
  const cutoff = hoursAgo(24);
  const [[openRow], [closedRow], [trackedRow], [syncedRow], [lastSyncRow]] =
    await Promise.all([
      db.select({ n: sql<number>`count(*)` }).from(jobs).where(isNull(jobs.closedAt)),
      db
        .select({ n: sql<number>`count(*)` })
        .from(jobs)
        .where(and(isNotNull(jobs.closedAt), gt(jobs.closedAt, cutoff))),
      db.select({ n: sql<number>`count(*)` }).from(syncState),
      db
        .select({ n: sql<number>`count(*)` })
        .from(syncState)
        .where(gt(syncState.lastSuccessAt, cutoff)),
      db
        .select({ t: sql<number | null>`max(${syncState.lastSuccessAt})` })
        .from(syncState),
    ]);

  return {
    totalOpenJobs: openRow?.n ?? 0,
    companiesTracked: trackedRow?.n ?? 0,
    companiesSyncedLast24h: syncedRow?.n ?? 0,
    closedLast24h: closedRow?.n ?? 0,
    lastSyncAt: unixToIso(lastSyncRow?.t ?? null),
  };
}
