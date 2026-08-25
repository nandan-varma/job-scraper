import { ArrowRight, Building2, Globe2, Zap } from "lucide-react";
import { Suspense } from "react";
import { JobBrowser } from "@/components/job-browser";
import { PAGE_SIZE } from "@/lib/filtering";
import { SITES } from "@/lib/sites";
import { ALL_PROVIDERS, PLATFORM_META } from "@/lib/platforms";
import { browseJobs, browseFacets, browseTabCounts } from "@/lib/db/queries";
import type { JobsPage } from "@/lib/api-client";

const PLATFORMS = ALL_PROVIDERS.map((p) => PLATFORM_META[p]?.label ?? p);

// The sync engine updates the DB on a ~20-minute cadence, so up to 60s of
// staleness here is invisible — ISR serves cached HTML for repeat visits
// instead of re-querying Turso on every request.
export const revalidate = 60;

export default async function HomePage() {
  // Page 1 of the whole catalog, fetched server-side — no company selection
  // required, and no client-side loading flash on first paint.
  const [result, facets, tabCounts] = await Promise.all([
    browseJobs({}, "newest", 1, PAGE_SIZE),
    browseFacets({}),
    browseTabCounts({}),
  ]);
  const initialPage: JobsPage = {
    jobs: result.jobs,
    total: result.total,
    page: 1,
    perPage: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(result.total / PAGE_SIZE)),
    facets,
    tabCounts,
  };

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b">
        {/* Minimal sage glow + dot grid */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-32 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl dark:bg-primary/10" />
          <div className="absolute top-24 -left-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl dark:bg-primary/10" />
          <div className="absolute top-40 -right-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl dark:bg-primary/10" />
          <div
            className="absolute inset-0 opacity-[0.22] dark:opacity-[0.12]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, var(--ring) 1px, transparent 0)",
              backgroundSize: "32px 32px",
              maskImage:
                "linear-gradient(to bottom, black 40%, transparent 100%)",
              WebkitMaskImage:
                "linear-gradient(to bottom, black 40%, transparent 100%)",
            }}
          />
        </div>

        <div className="mx-auto max-w-7xl px-4 py-14 text-center sm:px-6 sm:py-20">
          <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            Synced continuously from {PLATFORMS.length} job platforms
          </div>

          <h1 className="mx-auto max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
            Every open role. Every company.{" "}
            <span className="text-primary">One feed.</span>
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">
            Browse thousands of roles synced straight from the careers pages of
            the best companies in tech. No sign-ups — postings that close get
            removed automatically, so what you see is what&apos;s actually open.
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-medium text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Zap className="size-3.5 text-primary" /> Synced every ~20 min
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Building2 className="size-3.5 text-primary" />{" "}
              {SITES.length.toLocaleString()} companies
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Globe2 className="size-3.5 text-primary" /> Remote &amp; on-site
            </span>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {PLATFORMS.map((p) => (
              <span
                key={p}
                className="rounded-lg border border-primary/25 bg-primary/5 px-2.5 py-1 text-xs font-medium text-muted-foreground"
              >
                {p}
              </span>
            ))}
          </div>

          <a
            href="#browse"
            className="mt-8 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:bg-primary/85"
          >
            Start browsing
            <ArrowRight className="size-4" />
          </a>
        </div>
      </section>

      {/* Browse app */}
      <div id="browse">
        {/* nuqs's useQueryStates reads useSearchParams — Suspense-boundary it
            so static prerendering of / doesn't bail out (CSR bailout error). */}
        <Suspense fallback={null}>
          <JobBrowser initialPage={initialPage} />
        </Suspense>
      </div>
    </>
  );
}
