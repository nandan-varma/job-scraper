import { notFound } from "next/navigation";
import type { Job } from "@/lib/types";
import { siteBySlug, fetchSites, compactJobs } from "@/lib/jobs";
import { PLATFORM_META } from "@/lib/platforms";
import { CompanyView } from "@/components/company-view";

export const dynamic = "force-dynamic";

/** First page seeded server-side for an instant first paint (no client effect). */
const PAGE = 100;

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const site = siteBySlug(slug);
  if (!site) notFound();
  const meta = PLATFORM_META[site.platform];

  let initialJobs: Job[] = [];
  let total = 0;
  try {
    const res = await fetchSites([site.slug]);
    const r = res.results[0];
    if (r?.ok) {
      const all = compactJobs(r.jobs);
      total = all.length;
      initialJobs = all.slice(0, PAGE);
    }
  } catch {
    /* fall back to empty state; client retries via scroll */
  }

  return (
    <CompanyView
      site={{ slug: site.slug, name: site.name, platform: site.platform }}
      sourceUrl={site.source_url ?? null}
      provider={{ label: meta?.label ?? site.platform, provide: meta?.provide }}
      initialJobs={initialJobs}
      initialTotal={total}
    />
  );
}
