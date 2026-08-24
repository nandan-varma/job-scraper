import { NextResponse } from "next/server";
import { allSites } from "@/lib/jobs";

export const dynamic = "force-dynamic";

/** GET /api/sites — the full registry (slug/name/platform) for building filters. */
export async function GET() {
  const sites = allSites().map((s) => ({
    slug: s.slug,
    name: s.name,
    platform: s.platform,
  }));
  return NextResponse.json({ count: sites.length, sites });
}
