import { NextRequest, NextResponse } from "next/server";
import { fetchSites, allSites, compactJobs, siteBySlug } from "@/lib/jobs";
import { FEATURED } from "@/lib/featured";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 60s fresh, serve stale in background for up to 5 min (edge/CDN friendly). */
const CACHE_HEADER = "public, s-maxage=60, stale-while-revalidate=300";

/**
 * GET /api/jobs
 *   ?sites=a,b,c   fetch (or serve from cache) specific companies
 *   ?featured=1    fetch a curated starter set
 *   &q=term         server-side text search over title|company|location|department
 *   &platforms=gh,.. restrict to job-provider platform(s)
 *   &page=1&perPage=20  paginate the filtered role set (flat `jobs`)
 *   &fresh=1        bypass the in-process cache
 *
 * Returns `{ jobs, total, page, perPage, totalPages, sites_fetched, sites_failed,
 * errors }`. `results` (per-site) is included when not paginating for backward
 * compat. Descriptions are compacted; the full JD loads on demand via
 * /api/jobs/[slug].
 */
import type { Job } from "@/lib/types";

function stableSort(jobs: Job[]): Job[] {
  const idx = new Map<string, number>();
  jobs.forEach((j, i) => idx.set(j.id, i));
  return [...jobs].sort(
    (a, b) =>
      (b.posted_date ?? "").localeCompare(a.posted_date ?? "") ||
      (idx.get(a.id) ?? 0) - (idx.get(b.id) ?? 0),
  );
}

function matches(j: Job, q: string): boolean {
  return (
    j.title.toLowerCase().includes(q) ||
    j.company.toLowerCase().includes(q) ||
    (j.location ?? "").toLowerCase().includes(q) ||
    (j.department ?? "").toLowerCase().includes(q)
  );
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const force = params.get("fresh") === "1";
  const q = (params.get("q") ?? "").toLowerCase().trim();

  const platforms = (params.get("platforms") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const paginated =
    params.get("page") !== null || params.get("perPage") !== null;
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
  const perPage = Math.min(
    100,
    Math.max(1, Number(params.get("perPage") ?? 20) || 20),
  );

  let slugs: string[] | null = null;
  if (params.get("all") === "1") {
    // Global "load everything" is impractical at registry scale — cap it so the
    // server isn't hammered; the app now searches companies instead.
    const maxSites = Math.min(Number(params.get("maxSites") ?? 0) || 0, 300);
    slugs = allSites().map((s) => s.slug);
    if (maxSites) slugs = slugs.slice(0, maxSites);
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

  if (platforms.length) {
    slugs = slugs.filter((slug) =>
      platforms.includes(siteBySlug(slug)?.platform ?? ""),
    );
  }
  if (!slugs.length) {
    return NextResponse.json({
      jobs: [],
      total: 0,
      page,
      perPage,
      totalPages: 1,
      sites_fetched: 0,
      sites_failed: 0,
      errors: [],
    });
  }

  const payload = await fetchSites(slugs, force ? 8 : 12, force);
  const ok = payload.results.filter((r) => r.ok);
  const jobs = stableSort(ok.flatMap((r) => compactJobs(r.jobs)));
  const filtered = q ? jobs.filter((j) => matches(j, q)) : jobs;

  const total = filtered.length;
  const totalPages = paginated ? Math.max(1, Math.ceil(total / perPage)) : 1;
  const slice = paginated
    ? filtered.slice((page - 1) * perPage, page * perPage)
    : filtered;

  const res = NextResponse.json({
    jobs: slice,
    total,
    page,
    perPage,
    totalPages,
    sites_fetched: payload.sites_fetched,
    sites_failed: payload.sites_failed,
    errors: payload.errors,
  });
  res.headers.set("Cache-Control", CACHE_HEADER);
  return res;
}
