import { NextRequest, NextResponse } from "next/server";
import { fetchSites, allSites, compactJobs } from "@/lib/jobs";
import { FEATURED } from "@/lib/featured";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 60s fresh, serve stale in background for up to 5 min (edge/CDN friendly). */
const CACHE_HEADER = "public, s-maxage=60, stale-while-revalidate=300";

/**
 * GET /api/jobs
 *   ?sites=a,b,c     fetch (or serve from cache) the given company slugs
 *   ?featured=1      fetch a curated starter set of companies
 *   ?all=1           fetch every registered API-backed company
 *   &fresh=1         bypass the in-process cache and hit the sources again
 *
 * Data is always pulled live from the ATS sources (no DB); results are cached
 * in-process for TTL. The response carries compact jobs (no full descriptions)
 * so large lists stay small — descriptions load on demand via /api/jobs/[slug]
 * when a role is selected.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const force = params.get("fresh") === "1";

  let slugs: string[] | null = null;
  if (params.get("all") === "1") {
    slugs = allSites().map((s) => s.slug);
  } else if (params.get("featured") === "1") {
    slugs = FEATURED;
  } else {
    const raw = params.get("sites");
    if (raw) {
      slugs = raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }

  if (!slugs || slugs.length === 0) {
    return NextResponse.json(
      { error: "Provide ?sites=a,b,c, ?featured=1, or ?all=1" },
      { status: 400 },
    );
  }

  const payload = await fetchSites(slugs, force ? 8 : 12, force);
  const compact = {
    ...payload,
    results: payload.results.map((r) => ({
      ...r,
      jobs: compactJobs(r.jobs),
    })),
  };
  const res = NextResponse.json(compact);
  res.headers.set("Cache-Control", CACHE_HEADER);
  return res;
}
