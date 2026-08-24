import { NextRequest, NextResponse } from "next/server";
import {
  browseJobs,
  browseFacets,
  browseTabCounts,
  type BrowseFilters,
  type SortKey,
} from "@/lib/db/queries";
import type { WorkMode } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 30s fresh, serve stale in background — the sync engine updates the DB on
 * its own cadence (minutes), so a short edge cache smooths request bursts
 * without ever serving noticeably stale data. */
const CACHE_HEADER = "public, s-maxage=30, stale-while-revalidate=120";

/**
 * GET /api/jobs — server-driven browse across the ENTIRE synced catalog.
 * No company selection required: omit `companies` to search/filter/sort
 * across every open role currently in the DB.
 *
 *   ?q=term                 full-text search (title/company/department) + location substring
 *   &workMode=remote|hybrid|onsite
 *   &salary=has|none
 *   &region=us|intl
 *   &platforms=ashby,lever  restrict to job-provider platform(s)
 *   &departments=Eng,Sales  restrict to department(s)
 *   &companies=openai,vercel  optional narrowing filter (was previously required)
 *   &sort=newest|company|title
 *   &page=1&perPage=20
 *   &facets=0               skip the facet/tab-count aggregate queries (for "load more")
 *
 * Returns `{ jobs, total, page, perPage, totalPages, facets?, tabCounts? }`.
 * Descriptions are omitted from list rows; load the full JD on demand via
 * /api/jobs/[slug].
 */
function csv(v: string | null): string[] {
  return v
    ? v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const page = Math.max(1, Number(p.get("page") ?? 1) || 1);
  const perPage = Math.min(100, Math.max(1, Number(p.get("perPage") ?? 20) || 20));
  const sort = ((p.get("sort") as SortKey) || "newest") as SortKey;
  const wantFacets = p.get("facets") !== "0";

  const workMode = (p.get("workMode") as WorkMode) || undefined;
  const salary = (p.get("salary") as "has" | "none" | null) || undefined;
  const region = (p.get("region") as "us" | "intl" | null) || undefined;

  const filters: BrowseFilters = {
    q: p.get("q")?.trim() || undefined,
    workMode: workMode && workMode !== null ? workMode : undefined,
    salary: salary === "has" || salary === "none" ? salary : undefined,
    region: region === "us" || region === "intl" ? region : undefined,
    platforms: csv(p.get("platforms")),
    departments: csv(p.get("departments")),
    // "sites" kept as an alias so the company page's existing calls
    // (?sites=slug) keep working against the same underlying filter.
    companies: csv(p.get("companies") ?? p.get("sites")),
  };

  const [result, facets, tabCounts] = await Promise.all([
    browseJobs(filters, sort, page, perPage),
    wantFacets ? browseFacets(filters) : Promise.resolve(undefined),
    wantFacets
      ? browseTabCounts({
          q: filters.q,
          region: filters.region,
          companies: filters.companies,
        })
      : Promise.resolve(undefined),
  ]);

  const totalPages = Math.max(1, Math.ceil(result.total / perPage));
  const res = NextResponse.json({
    jobs: result.jobs,
    total: result.total,
    page,
    perPage,
    totalPages,
    facets,
    tabCounts,
  });
  res.headers.set("Cache-Control", CACHE_HEADER);
  return res;
}
