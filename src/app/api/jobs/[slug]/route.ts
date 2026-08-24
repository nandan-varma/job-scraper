import { NextRequest, NextResponse } from "next/server";
import { fetchJobDetail, refreshSite, siteBySlug } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/jobs/[slug]?id=<source_id>[&fresh=1]
 *
 * Returns the FULL job (including its description) for one role, read
 * straight from the DB (kept fresh by the background sync engine).
 * `fresh=1` forces a live re-sync of this company before reading — the
 * on-demand escape hatch for a user who wants up-to-the-second data.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const id = req.nextUrl.searchParams.get("id");
  const force = req.nextUrl.searchParams.get("fresh") === "1";

  if (!id) {
    return NextResponse.json({ error: "Missing ?id" }, { status: 400 });
  }

  const site = siteBySlug(slug);
  if (!site) {
    return NextResponse.json(
      { error: `Unknown company '${slug}'` },
      { status: 404 },
    );
  }

  if (force) {
    const result = await refreshSite(site);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error ?? `Refresh failed for '${slug}'` },
        { status: 502 },
      );
    }
  }

  const job = await fetchJobDetail(slug, id);
  if (!job) {
    return NextResponse.json(
      { error: `Role not found in '${slug}'` },
      { status: 404 },
    );
  }

  const res = NextResponse.json({ job });
  res.headers.set(
    "Cache-Control",
    "public, s-maxage=60, stale-while-revalidate=300",
  );
  return res;
}
