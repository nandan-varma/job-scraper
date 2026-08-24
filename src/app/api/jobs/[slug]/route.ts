import { NextRequest, NextResponse } from "next/server";
import { fetchSite, siteBySlug } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/jobs/[slug]?id=<source_id>[&fresh=1]
 *
 * Returns the FULL job (including its description) for one role. The list
 * endpoint strips descriptions to keep large payloads small; this route loads
 * them on demand from the same in-process cache (or the source) when a role is
 * selected.
 */
export async function GET(
 req: NextRequest,
 { params }: { params: Promise<{ slug: string }> },
) {
 const { slug } = await params;
 const id = req.nextUrl.searchParams.get("id");
 const force = req.nextUrl.searchParams.get("fresh") === "1";

 const site = siteBySlug(slug);
 if (!site) {
  return NextResponse.json(
   { error: `Unknown company '${slug}'` },
   { status: 404 },
  );
 }

 // Fetch (cached) the site's full jobs, then locate the requested role.
 const result = await fetchSite(site, force);
 const job = result.jobs.find(
  (j) => j.id === id || (j.site === slug && j.source_id === id),
 );
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
