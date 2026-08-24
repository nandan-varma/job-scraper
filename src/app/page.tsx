import { ArrowRight, Building2, Globe2, Zap } from "lucide-react";
import { JobBrowser } from "@/components/job-browser";

const PLATFORMS = [
  "Ashby",
  "Greenhouse",
  "Lever",
  "Workday",
  "Apple",
  "SmartRecruiters",
  "Roblox",
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b">
        {/* Animated gradient mesh */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-32 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-gradient-to-br from-indigo-500/25 via-purple-500/15 to-transparent blur-3xl dark:from-indigo-500/20 dark:via-purple-500/10" />
          <div className="absolute top-24 -left-24 h-72 w-72 rounded-full bg-cyan-400/15 blur-3xl dark:bg-cyan-400/10" />
          <div className="absolute top-40 -right-24 h-72 w-72 rounded-full bg-fuchsia-400/15 blur-3xl dark:bg-fuchsia-400/10" />
          <div
            className="absolute inset-0 opacity-[0.35] dark:opacity-[0.18]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, var(--foreground) 1px, transparent 0)",
              backgroundSize: "28px 28px",
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
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            Streaming live from {PLATFORMS.length} job platforms
          </div>

          <h1 className="mx-auto max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
            Every open role.{" "}
            <span className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
              Every company.
            </span>{" "}
            One feed.
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">
            Browse thousands of roles pulled straight from the careers pages of
            the best companies in tech. No sign-ups, no database — the source is
            the source.
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-medium text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Zap className="size-3.5 text-primary" /> Live source data
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Building2 className="size-3.5 text-primary" /> 130+ companies
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Globe2 className="size-3.5 text-primary" /> Remote &amp; on-site
            </span>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {PLATFORMS.map((p) => (
              <span
                key={p}
                className="rounded-lg border bg-background/70 px-2.5 py-1 text-xs font-medium text-muted-foreground backdrop-blur"
              >
                {p}
              </span>
            ))}
          </div>

          <a
            href="#browse"
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background shadow-sm transition-transform hover:-translate-y-0.5"
          >
            Start browsing
            <ArrowRight className="size-4" />
          </a>
        </div>
      </section>

      {/* Browse app */}
      <div id="browse">
        <JobBrowser initialJobs={[]} initialLoaded={new Set()} />
      </div>
    </>
  );
}
