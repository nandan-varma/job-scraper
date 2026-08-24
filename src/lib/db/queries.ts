import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "./client";
import { jobs } from "./schema";
import type { Job } from "@/lib/types";

const listColumns = {
  siteSlug: jobs.siteSlug,
  company: jobs.company,
  platform: jobs.platform,
  sourceId: jobs.sourceId,
  title: jobs.title,
  department: jobs.department,
  location: jobs.location,
  workMode: jobs.workMode,
  postedDate: jobs.postedDate,
  url: jobs.url,
  applyUrl: jobs.applyUrl,
  compensationText: jobs.compensationText,
  lastSeenAt: jobs.lastSeenAt,
  hasDescription: sql<boolean>`(${jobs.description} is not null)`,
};

interface ListRow {
  siteSlug: string;
  company: string;
  platform: string;
  sourceId: string;
  title: string;
  department: string | null;
  location: string | null;
  workMode: "remote" | "hybrid" | "onsite" | null;
  postedDate: string | null;
  url: string | null;
  applyUrl: string | null;
  compensationText: string | null;
  lastSeenAt: Date;
  hasDescription: boolean;
}

function toJob(row: ListRow, description: string | null = null): Job {
  return {
    id: `${row.siteSlug}:${row.sourceId}`,
    site: row.siteSlug,
    company: row.company,
    platform: row.platform,
    source_id: row.sourceId,
    title: row.title,
    department: row.department,
    location: row.location,
    work_mode: row.workMode,
    posted_date: row.postedDate,
    url: row.url,
    apply_url: row.applyUrl,
    description,
    hasDescription: row.hasDescription,
    compensation: row.compensationText,
    fetched_at: row.lastSeenAt.toISOString(),
  };
}

/** Currently open jobs for a set of companies — descriptions omitted (list payload). */
export async function jobsForSites(slugs: string[]): Promise<Job[]> {
  if (!slugs.length) return [];
  const rows = await db
    .select(listColumns)
    .from(jobs)
    .where(and(inArray(jobs.siteSlug, slugs), isNull(jobs.closedAt)))
    .orderBy(desc(jobs.postedDate));
  return rows.map((r) => toJob(r));
}

/** One job with its full description, for the detail pane. */
export async function jobDetail(
  siteSlug: string,
  sourceId: string,
): Promise<Job | null> {
  const rows = await db
    .select({ ...listColumns, description: jobs.description })
    .from(jobs)
    .where(and(eq(jobs.siteSlug, siteSlug), eq(jobs.sourceId, sourceId)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return toJob(row, row.description);
}

/** Open-role count per company — cheap existence check without hydrating rows. */
export async function openCountsBySite(
  slugs: string[],
): Promise<Map<string, number>> {
  if (!slugs.length) return new Map();
  const rows = await db
    .select({ siteSlug: jobs.siteSlug, count: sql<number>`count(*)::int` })
    .from(jobs)
    .where(and(inArray(jobs.siteSlug, slugs), isNull(jobs.closedAt)))
    .groupBy(jobs.siteSlug);
  return new Map(rows.map((r) => [r.siteSlug, r.count]));
}
