import { NextRequest, NextResponse } from "next/server";
import { allSites } from "@/lib/jobs";

export const dynamic = "force-dynamic";

/**
 * GET /api/sites
 *   ?q=term        server-side, instant company name/slug search (no pagination lag)
 *   &platforms=a,b  restrict to job-provider platform(s)
 *   &limit=N        max results (default 60, clamp 200)
 *
 * The registry holds ~8.5k companies, so the client never downloads/stores the
 * full list — it queries a capped, pre-filtered slice instead.
 */
export function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").toLowerCase().trim();
  const limit = Math.min(Number(sp.get("limit") ?? 60) || 60, 200);

  const platforms = (sp.get("platforms") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  let sites = allSites();
  if (platforms.length) {
    sites = sites.filter((s) => platforms.includes(s.platform));
  }

  if (q) {
    // Prefix/slug match scores higher than substring so typing feels exact.
    const scored = [];
    for (const s of sites) {
      const name = s.name.toLowerCase();
      const slug = s.slug.toLowerCase();
      let rank = -1;
      if (slug === q) rank = 0;
      else if (slug.startsWith(q)) rank = 1;
      else if (name.startsWith(q)) rank = 2;
      else if (name.includes(q)) rank = 3;
      else if (slug.includes(q)) rank = 4;
      if (rank >= 0) scored.push({ s, rank });
    }
    sites = scored
      .sort((a, b) => a.rank - b.rank || a.s.name.localeCompare(b.s.name))
      .map((x) => x.s);
  }

  const total = sites.length;
  const top = sites.slice(0, limit).map((s) => ({
    slug: s.slug,
    name: s.name,
    platform: s.platform,
  }));

  return NextResponse.json({ count: top.length, total, q, sites: top });
}
