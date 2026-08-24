import { and, desc, isNull, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "./client";
import { jobs, syncLog, syncState } from "./schema";

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

/** Per-platform sync health — the source of truth for the /status page. */
export async function platformStatuses(): Promise<PlatformStatus[]> {
  const stateRows = await db
    .select({
      platform: syncState.platform,
      sitesTracked: sql<number>`count(*)::int`,
      syncedLast24h: sql<number>`count(*) filter (where ${syncState.lastSuccessAt} > now() - interval '24 hours')::int`,
      neverSynced: sql<number>`count(*) filter (where ${syncState.lastSuccessAt} is null)::int`,
      failing: sql<number>`count(*) filter (where ${syncState.consecutiveFailures} > 0)::int`,
      lastSuccessAt: sql<string | null>`max(${syncState.lastSuccessAt})`,
    })
    .from(syncState)
    .groupBy(syncState.platform);

  const openRows = await db
    .select({
      platform: jobs.platform,
      openJobs: sql<number>`count(*)::int`,
    })
    .from(jobs)
    .where(isNull(jobs.closedAt))
    .groupBy(jobs.platform);

  const openByPlatform = new Map(openRows.map((r) => [r.platform, r.openJobs]));

  return stateRows
    .map((r) => ({ ...r, openJobs: openByPlatform.get(r.platform) ?? 0 }))
    .sort((a, b) => b.sitesTracked - a.sitesTracked);
}

/** Most recent non-'ok' sync attempts, newest first. */
export async function recentFailures(limit = 30): Promise<RecentFailure[]> {
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
}

export async function overallStatus(): Promise<OverallStatus> {
  const [openRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(jobs)
    .where(isNull(jobs.closedAt));
  const [closedRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(jobs)
    .where(
      and(isNotNull(jobs.closedAt), sql`${jobs.closedAt} > now() - interval '24 hours'`),
    );
  const [trackedRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(syncState);
  const [syncedRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(syncState)
    .where(sql`${syncState.lastSuccessAt} > now() - interval '24 hours'`);
  const [lastSyncRow] = await db
    .select({ t: sql<string | null>`max(${syncState.lastSuccessAt})` })
    .from(syncState);

  return {
    totalOpenJobs: openRow?.n ?? 0,
    companiesTracked: trackedRow?.n ?? 0,
    companiesSyncedLast24h: syncedRow?.n ?? 0,
    closedLast24h: closedRow?.n ?? 0,
    lastSyncAt: lastSyncRow?.t ?? null,
  };
}
