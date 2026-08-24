"use client";

import {
  ArrowDownUp,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
  ChevronDown,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { Job } from "@/lib/types";
import { FEATURED } from "@/lib/featured";
import {
  fetchJobs,
  fetchJobDetail,
  fetchSitesRegistry,
} from "@/lib/api-client";
import { normalizeQuery, dedupeJobs } from "@/lib/format";
import { computeCoverage, platformFacets } from "@/lib/platforms";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { JobCard } from "./job-card";
import { JobDetail } from "./job-detail";
import { FiltersBar, DEFAULT_FILTERS, type Filters } from "./filters";
import { CommandMenu } from "./command-menu";
import { EmptyState, JobListSkeleton } from "./states";

interface Props {
  initialJobs: Job[];
  initialLoaded: Set<string>;
}

const PAGE_SIZE = 20;
/** How many extra filtered jobs are appended per "load more" / scroll batch. */
const LOAD_MORE_STEP = 40;

/** Debounce any value; state update happens via timeout (async, lint-safe). */
function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export function JobBrowser({ initialJobs, initialLoaded }: Props) {
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [loadedSlugs, setLoadedSlugs] = useState<Set<string>>(initialLoaded);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [registry, setRegistry] = useState<
    Array<{ slug: string; name: string; platform: string }>
  >([]);
  const [loadingSlugs, setLoadingSlugs] = useState<Set<string>>(new Set());
  const [commandOpen, setCommandOpen] = useState(false);

  // Full details (with description) fetched on demand, cached by job id.
  const [detailsCache, setDetailsCache] = useState<Record<string, Job>>({});
  const [detailLoading, setDetailLoading] = useState(false);

  // Pagination for the master list so huge result sets never blow up the DOM.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Debounced search — the expensive filter/sort runs only after typing stops.
  const debouncedQuery = useDebouncedValue(filters.query, 250);

  // Load the site registry (for the company picker) once.
  useEffect(() => {
    fetchSitesRegistry()
      .then((r) => setRegistry(r.sites))
      .catch(() => {});
  }, []);

  const loadSites = useCallback(
    async (
      slugs: string[],
      showToast = false,
      chunkSize = 0,
      force = false,
    ) => {
      const pending = force ? slugs : slugs.filter((s) => !loadedSlugs.has(s));
      if (!pending.length) return;
      const chunks =
        chunkSize > 0
          ? Array.from(
              { length: Math.ceil(pending.length / chunkSize) },
              (_, i) => pending.slice(i * chunkSize, i * chunkSize + chunkSize),
            )
          : [pending];
      setLoading(true);
      let totalAdded = 0;
      let failed = 0;
      try {
        for (const chunk of chunks) {
          setLoadingSlugs((prev) => new Set([...prev, ...chunk]));
          try {
            const data = await fetchJobs({ sites: chunk, fresh: force });
            const added = data.results.flatMap((r) => (r.ok ? r.jobs : []));
            totalAdded += added.length;
            failed += data.sites_failed;
            setJobs((prev) => dedupeJobs([...prev, ...added]));
            setLoadedSlugs((prev) => {
              const next = new Set(prev);
              chunk.forEach((s) => next.add(s));
              return next;
            });
          } catch {
            failed += chunk.length;
          }
          setLoadingSlugs((prev) => {
            const next = new Set(prev);
            chunk.forEach((s) => next.delete(s));
            return next;
          });
        }
        if (showToast) {
          if (failed > 0) {
            toast.warning(
              `Loaded ${totalAdded.toLocaleString()} roles${failed ? ` — ${failed} source(s) unavailable` : ""}`,
            );
          } else {
            toast.success(`${totalAdded.toLocaleString()} roles loaded`);
          }
        }
      } finally {
        setLoading(false);
      }
    },
    [loadedSlugs],
  );

  // Bootstrap: fetch the curated featured set on first mount if none supplied.
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (!bootstrapped.current && initialJobs.length === 0) {
      bootstrapped.current = true;
      void loadSites(FEATURED, false, 4);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleCompany = useCallback(
    (slug: string) => {
      setFilters((prev) => {
        const next = new Set(prev.companies);
        if (next.has(slug)) next.delete(slug);
        else next.add(slug);
        return { ...prev, companies: next };
      });
      if (!loadedSlugs.has(slug)) void loadSites([slug]);
    },
    [loadSites, loadedSlugs],
  );

  const loadAll = useCallback(() => {
    void loadSites(
      registry.map((s) => s.slug),
      true,
      12,
    );
  }, [loadSites, registry]);

  const refresh = useCallback(() => {
    const slugs = [...loadedSlugs];
    setJobs([]);
    setLoadedSlugs(new Set());
    setFilters(DEFAULT_FILTERS);
    setSelectedId(null);
    void loadSites(slugs, false, 0, true);
  }, [loadedSlugs, loadSites]);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  const filtered = useMemo(() => {
    const q = normalizeQuery(debouncedQuery);
    let list = jobs.filter((j) => {
      if (filters.workMode !== "all" && j.work_mode !== filters.workMode)
        return false;
      if (filters.companies.size && !filters.companies.has(j.site))
        return false;
      if (
        filters.departments.size &&
        !filters.departments.has(j.department ?? "")
      )
        return false;
      if (filters.platforms.size && !filters.platforms.has(j.platform))
        return false;
      if (filters.salary === "has" && !j.compensation) return false;
      if (filters.salary === "none" && j.compensation) return false;
      if (!q) return true;
      return (
        normalizeQuery(j.title).includes(q) ||
        normalizeQuery(j.company).includes(q) ||
        normalizeQuery(j.location ?? "").includes(q) ||
        normalizeQuery(j.department ?? "").includes(q)
      );
    });
    switch (filters.sort) {
      case "newest":
        list = [...list].sort((a, b) =>
          (b.posted_date ?? "").localeCompare(a.posted_date ?? ""),
        );
        break;
      case "company":
        list = [...list].sort((a, b) => a.company.localeCompare(b.company));
        break;
      case "title":
        list = [...list].sort((a, b) => a.title.localeCompare(b.title));
        break;
    }
    return list;
  }, [jobs, filters, debouncedQuery]);

  const departments = useMemo(() => {
    const counts = new Map<string, number>();
    for (const j of jobs) {
      const d = j.department;
      if (!d) continue;
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40)
      .map(([d]) => d);
  }, [jobs]);

  // Live data availability — drives adaptive filters and the coverage explainer.
  const coverage = useMemo(() => computeCoverage(jobs), [jobs]);
  const platforms = useMemo(() => platformFacets(jobs), [jobs]);

  // Paginate: reset the window whenever the query/filters change. Adjust
  // state during render (guarded) per React's recommended reset pattern — no
  // effect needed, so the reset is committed in the same pass as the filter
  // change that triggered it.
  const paginationKey = `${debouncedQuery}|${filters.workMode}|${filters.sort}|${filters.companies.size}|${filters.departments.size}|${filters.platforms.size}|${filters.salary}`;
  const [lastPaginationKey, setLastPaginationKey] = useState(paginationKey);
  if (paginationKey !== lastPaginationKey) {
    setLastPaginationKey(paginationKey);
    setVisibleCount(PAGE_SIZE);
  }

  const visible = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount],
  );

  // Infinite scroll: extend the window as the user nears the bottom.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && visibleCount < filtered.length) {
          setVisibleCount((v) => Math.min(v + LOAD_MORE_STEP, filtered.length));
        }
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visibleCount, filtered.length]);

  const loadMore = useCallback(() => {
    setVisibleCount((v) => Math.min(v + LOAD_MORE_STEP, filtered.length));
  }, [filtered.length]);

  // The selected job with any fetched full detail merged in.
  const selected = useMemo(() => {
    const base = jobs.find((j) => j.id === selectedId) ?? null;
    if (!base) return null;
    return detailsCache[base.id] ?? base;
  }, [jobs, selectedId, detailsCache]);

  const handleSelect = useCallback(
    (job: Job) => {
      setSelectedId(job.id);
      if (job.hasDescription && !detailsCache[job.id]) {
        // Fetch the full description on demand (the list carries compact items).
        setDetailLoading(true);
        fetchJobDetail(job.site, job.source_id)
          .then((full) => {
            if (full) {
              setDetailsCache((prev) => ({ ...prev, [full.id]: full }));
            }
          })
          .catch(() => {})
          .finally(() => setDetailLoading(false));
      }
      if (typeof window === "undefined" || window.innerWidth < 1024) {
        setMobileOpen(true);
      }
    },
    [detailsCache],
  );

  const hasFilters =
    filters.query !== "" ||
    filters.workMode !== "all" ||
    filters.companies.size > 0 ||
    filters.departments.size > 0 ||
    filters.platforms.size > 0 ||
    filters.salary !== "all";

  const showMore = visibleCount < filtered.length;

  return (
    <div className="relative">
      <CommandMenu
        jobs={jobs}
        onSelect={handleSelect}
        open={commandOpen}
        onOpenChange={setCommandOpen}
      />

      {/* Toolbar */}
      <div className="sticky top-14 z-30 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm">
              <Sparkles className="size-4 text-primary" />
              <span className="font-semibold">
                {jobs.length.toLocaleString()}
              </span>
              <span className="text-muted-foreground">open roles</span>
              <span className="hidden text-muted-foreground sm:inline">
                · {loadedSlugs.size} companies
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCommandOpen(true)}
                className="hidden gap-2 text-muted-foreground md:inline-flex"
              >
                <ArrowDownUp className="size-3.5" />
                Search
                <kbd className="rounded border bg-muted px-1.5 text-[10px] font-medium">
                  ⌘K
                </kbd>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={refresh}
                disabled={loading}
                aria-label="Refresh data"
              >
                <RefreshCw
                  className={loading ? "size-3.5 animate-spin" : "size-3.5"}
                />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={loadAll}
                disabled={loading || registry.length === 0}
              >
                {loading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
                <span className="hidden sm:inline">
                  Load all {registry.length} companies
                </span>
                <span className="sm:hidden">Load all</span>
              </Button>
            </div>
          </div>
          <div className="mt-3">
            <FiltersBar
              filters={filters}
              onChange={setFilters}
              sites={registry}
              loadedSlugs={loadedSlugs}
              onToggleCompany={toggleCompany}
              departments={departments}
              platforms={platforms}
              coverage={coverage}
              resultCount={filtered.length}
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Master list */}
        <div className="min-w-0">
          {loading && jobs.length === 0 ? (
            <JobListSkeleton count={8} />
          ) : filtered.length === 0 ? (
            <EmptyState hasFilters={hasFilters} onReset={resetFilters} />
          ) : (
            <div className="space-y-2.5">
              {loading && <LoadingBanner count={loadingSlugs.size} />}
              {visible.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  selected={selected?.id === job.id}
                  onSelect={handleSelect}
                />
              ))}

              {/* Pager */}
              {filtered.length > PAGE_SIZE && (
                <div className="pt-2">
                  <p className="mb-2 text-center text-xs text-muted-foreground">
                    Showing {visible.length.toLocaleString()} of{" "}
                    {filtered.length.toLocaleString()} roles
                  </p>
                  {showMore && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mx-auto flex"
                      onClick={loadMore}
                    >
                      Load more
                      <ChevronDown className="size-3.5" />
                    </Button>
                  )}
                  {!showMore && (
                    <p className="pt-1 text-center text-xs text-muted-foreground">
                      You’ve reached the end 🎉
                    </p>
                  )}
                </div>
              )}
              {/* Infinite-scroll sentinel */}
              {showMore && (
                <div ref={sentinelRef} aria-hidden className="h-px" />
              )}
            </div>
          )}
        </div>

        {/* Detail pane (desktop) */}
        <div className="sticky top-36 hidden h-[calc(100dvh-11rem)] lg:block">
          <div className="relative h-full overflow-hidden rounded-2xl border bg-card">
            {detailLoading && !selected && (
              <div className="absolute inset-0 z-10 grid place-items-center bg-card/60 backdrop-blur-sm">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {selected ? (
              <JobDetail job={selected} loading={detailLoading} />
            ) : (
              <DetailPlaceholder count={filtered.length} />
            )}
          </div>
        </div>
      </div>

      {/* Mobile detail sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="right" className="w-full p-0 sm:max-w-md">
          {selected && <JobDetail job={selected} loading={detailLoading} />}
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="absolute top-4 right-4 z-10 rounded-full bg-background/80 p-1.5 text-muted-foreground backdrop-blur hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function LoadingBanner({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
      <Loader2 className="size-3.5 animate-spin" />
      Loading {count} more compan{count === 1 ? "y" : "ies"}…
    </div>
  );
}

function DetailPlaceholder({ count }: { count: number }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <div className="text-muted-foreground">
        <Sparkles className="mx-auto size-8" />
      </div>
      <p className="text-sm font-medium text-foreground">
        Select a role to view details
      </p>
      <p className="max-w-xs text-xs text-muted-foreground">
        Click any of the {count.toLocaleString()} open roles to see the full
        description, apply link, and company info.
      </p>
    </div>
  );
}
