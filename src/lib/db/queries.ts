import { and, asc, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { db } from "./client";
import { jobs } from "./schema";
import type { Job, WorkMode } from "@/lib/types";
import { US_KEYWORDS, US_STATE_ABBRS } from "@/lib/geo";

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

// --- server-driven browse: search/filter/facet/paginate the whole catalog ---

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Same rule as isUSLocation() in lib/geo.ts, translated to a Postgres regex
 * — one definition of "US location" derived from the shared word lists, not
 * a second hand-written copy that can drift. Always evaluates to a real
 * boolean (never SQL NULL) so `region=intl` correctly includes jobs with no
 * location at all, matching the client-side rule it replaces. */
const US_KEYWORD_PATTERN = US_KEYWORDS.map(escapeRegex).join("|");
const US_STATE_PATTERN = US_STATE_ABBRS.join("|");
const isUsLocationSql = sql`(
  ${jobs.location} is not null
  and (
    ${jobs.location} ~* ${US_KEYWORD_PATTERN}
    or ${jobs.location} ~* ${",\\s*(" + US_STATE_PATTERN + ")\\y"}
  )
)`;

export type SortKey = "newest" | "company" | "title";

export interface BrowseFilters {
  q?: string;
  workMode?: WorkMode;
  salary?: "has" | "none";
  region?: "us" | "intl";
  platforms?: string[];
  departments?: string[];
  companies?: string[];
}

type FilterKey = keyof BrowseFilters;

/** Full-text search over title/company/department (GIN-indexed) plus a
 * plain substring match over location (not indexed, but cheap at this scale). */
function searchCondition(q: string): SQL {
  return sql`(
    to_tsvector('english', ${jobs.title} || ' ' || ${jobs.company} || ' ' || coalesce(${jobs.department}, ''))
      @@ plainto_tsquery('english', ${q})
    or ${jobs.location} ilike ${"%" + q + "%"}
  )`;
}

/** Builds the WHERE clause for `f`, optionally omitting one dimension — the
 * "what would this facet's counts be if every OTHER filter still applied"
 * base used both for the main query and for each facet's own count query. */
function buildWhere(f: BrowseFilters, omit?: FilterKey): SQL {
  const conds: SQL[] = [isNull(jobs.closedAt)];
  if (f.q?.trim()) conds.push(searchCondition(f.q.trim()));
  if (f.companies?.length) conds.push(inArray(jobs.siteSlug, f.companies));
  if (omit !== "workMode" && f.workMode) conds.push(eq(jobs.workMode, f.workMode));
  if (omit !== "salary" && f.salary) {
    conds.push(
      f.salary === "has"
        ? isNotNull(jobs.compensationText)
        : isNull(jobs.compensationText),
    );
  }
  if (omit !== "region" && f.region) {
    conds.push(f.region === "us" ? isUsLocationSql : sql`not ${isUsLocationSql}`);
  }
  if (omit !== "platforms" && f.platforms?.length) {
    conds.push(inArray(jobs.platform, f.platforms));
  }
  if (omit !== "departments" && f.departments?.length) {
    conds.push(inArray(jobs.department, f.departments));
  }
  return and(...conds)!;
}

function orderFor(sort: SortKey) {
  switch (sort) {
    case "company":
      return [asc(jobs.company), asc(jobs.id)];
    case "title":
      return [asc(jobs.title), asc(jobs.id)];
    case "newest":
    default:
      return [desc(jobs.postedDate), desc(jobs.id)];
  }
}

export interface BrowseResult {
  jobs: Job[];
  total: number;
}

/** The main catalog query — search + every filter dimension + sort + page,
 * all in SQL. No client-side company selection required beforehand. */
export async function browseJobs(
  f: BrowseFilters,
  sort: SortKey,
  page: number,
  perPage: number,
): Promise<BrowseResult> {
  const where = buildWhere(f);
  const [rows, totalRows] = await Promise.all([
    db
      .select(listColumns)
      .from(jobs)
      .where(where)
      .orderBy(...orderFor(sort))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db.select({ n: sql<number>`count(*)::int` }).from(jobs).where(where),
  ]);
  return { jobs: rows.map((r) => toJob(r)), total: totalRows[0]?.n ?? 0 };
}

export interface FacetCounts {
  workMode: { all: number; remote: number; hybrid: number; onsite: number };
  salary: { all: number; has: number; none: number };
  region: { all: number; us: number; intl: number };
  providers: Record<string, number>;
  departments: Array<{ name: string; count: number }>;
}

/** Per-dimension counts under every OTHER active filter — the "how many
 * results would each option give you" the filter bar renders live. Five
 * small aggregate queries, each using buildWhere's omit to relax exactly
 * the dimension being counted (mirrors the old client-side "relaxed
 * predicate" faceting, just computed in SQL against the whole catalog
 * instead of whatever happened to be loaded in the browser). */
export async function browseFacets(f: BrowseFilters): Promise<FacetCounts> {
  const [wmRows, salRows, regionRows, platRows, deptRows] = await Promise.all([
    db
      .select({ v: jobs.workMode, n: sql<number>`count(*)::int` })
      .from(jobs)
      .where(buildWhere(f, "workMode"))
      .groupBy(jobs.workMode),
    db
      .select({
        has: sql<boolean>`(${jobs.compensationText} is not null)`,
        n: sql<number>`count(*)::int`,
      })
      .from(jobs)
      .where(buildWhere(f, "salary"))
      .groupBy(sql`1`),
    db
      .select({ us: sql<boolean>`${isUsLocationSql}`, n: sql<number>`count(*)::int` })
      .from(jobs)
      .where(buildWhere(f, "region"))
      .groupBy(sql`1`),
    db
      .select({ v: jobs.platform, n: sql<number>`count(*)::int` })
      .from(jobs)
      .where(buildWhere(f, "platforms"))
      .groupBy(jobs.platform),
    db
      .select({ v: jobs.department, n: sql<number>`count(*)::int` })
      .from(jobs)
      .where(and(buildWhere(f, "departments"), isNotNull(jobs.department)))
      .groupBy(jobs.department)
      .orderBy(desc(sql`count(*)`))
      .limit(40),
  ]);

  const workMode = { all: 0, remote: 0, hybrid: 0, onsite: 0 };
  for (const r of wmRows) {
    workMode.all += r.n;
    if (r.v) workMode[r.v] += r.n;
  }
  const salary = { all: 0, has: 0, none: 0 };
  for (const r of salRows) {
    salary.all += r.n;
    salary[r.has ? "has" : "none"] += r.n;
  }
  const region = { all: 0, us: 0, intl: 0 };
  for (const r of regionRows) {
    region.all += r.n;
    region[r.us ? "us" : "intl"] += r.n;
  }
  const providers: Record<string, number> = {};
  for (const r of platRows) providers[r.v] = r.n;
  const departments = deptRows
    .filter((r): r is { v: string; n: number } => !!r.v)
    .map((r) => ({ name: r.v, count: r.n }));

  return { workMode, salary, region, providers, departments };
}

/** Per-platform counts under only the filters that survive a source-tab
 * switch (companies + region + query) — sizes the tab strip. Mirrors
 * browseFacets' `providers` dimension but deliberately ignores workMode/
 * salary/departments, since those reset when the tab changes. */
export async function browseTabCounts(
  f: Pick<BrowseFilters, "q" | "region" | "companies">,
): Promise<Record<string, number>> {
  const rows = await db
    .select({ v: jobs.platform, n: sql<number>`count(*)::int` })
    .from(jobs)
    .where(buildWhere(f))
    .groupBy(jobs.platform);
  return Object.fromEntries(rows.map((r) => [r.v, r.n]));
}
