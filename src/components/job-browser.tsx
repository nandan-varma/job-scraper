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
import { FEATURED, STARTER_PACKS, type StarterPack } from "@/lib/featured";
import { fetchJobs, fetchJobDetail } from "@/lib/api-client";
import { dedupeJobs, normalizeQuery } from "@/lib/format";
import { ALL_PROVIDERS, PLATFORM_META, platformFacets } from "@/lib/platforms";
import {
  jobMatches,
  sortJobs,
  facetCounts,
  providerTabCounts,
} from "@/lib/filtering";
import { isLikelyUSVisitor } from "@/lib/geo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { JobCard } from "./job-card";
import { JobDetail } from "./job-detail";
import { FiltersBar, DEFAULT_FILTERS, type Filters } from "./filters";
import { CompanyPicker } from "./company-picker";
import { CommandMenu } from "./command-menu";
import { Onboarding, EmptyState, JobListSkeleton } from "./states";

interface Props {
  initialJobs: Job[];
  initialLoaded: Set<string>;
}

const PAGE_SIZE = 20;
const LOAD_MORE_STEP = 40;
/** Height of the sticky site header (h-14), used to offset the sticky detail pane. */
const HEADER_HEIGHT = 56;

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
  const [loadingSlugs, setLoadingSlugs] = useState<Set<string>>(new Set());
  const [commandOpen, setCommandOpen] = useState(false);

  const [detailsCache, setDetailsCache] = useState<Record<string, Job>>({});
  const [detailLoading, setDetailLoading] = useState(false);

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const debouncedQuery = useDebouncedValue(filters.query, 250);

  // Measure the toolbar's real height (it wraps to 2-3 lines once companies
  // and filter chips pile up) so the sticky detail pane never drifts out of
  // sync with a fixed offset guess.
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const [toolbarHeight, setToolbarHeight] = useState(0);
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setToolbarHeight(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Nudge the Region filter toward "US" for visitors in US timezones. Client-only
  // (timezone isn't known at SSR time) and reversible via the Region filter chip.
  const appliedRegionDefault = useRef(false);
  useEffect(() => {
    if (!appliedRegionDefault.current && isLikelyUSVisitor()) {
      appliedRegionDefault.current = true;
      setFilters((prev) => ({ ...prev, region: "us" }));
    }
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
            totalAdded += data.jobs.length;
            failed += data.sites_failed;
            setJobs((prev) => dedupeJobs([...prev, ...data.jobs]));
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

  // Bootstrap: fetch the curated featured set on first mount if none supplied,
  // so a first-time visitor sees real roles immediately instead of an empty
  // "build your feed" screen.
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (!bootstrapped.current && initialJobs.length === 0) {
      bootstrapped.current = true;
      setFilters((prev) => ({
        ...prev,
        companies: new Set([...prev.companies, ...FEATURED]),
      }));
      void loadSites(FEATURED, false, 4);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Selection-driven: adding a company also marks it selected (so the filter
  // state and the loaded feed stay in sync) and fetches its roles on demand.
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

  const selectCompanies = useCallback(
    (slugs: string[]) => {
      setFilters((prev) => ({
        ...prev,
        companies: new Set([...prev.companies, ...slugs]),
      }));
      void loadSites(slugs);
    },
    [loadSites],
  );

  const loadPack = useCallback(
    (pack: StarterPack) => {
      void selectCompanies(pack.slugs);
      toast.success(`Added ${pack.label} (${pack.slugs.length} companies)`);
    },
    [selectCompanies],
  );

  const refresh = useCallback(() => {
    const slugs = [...loadedSlugs];
    setJobs([]);
    setLoadedSlugs(new Set());
    setFilters(DEFAULT_FILTERS);
    setSelectedId(null);
    void loadSites(slugs, false, 0, true);
  }, [loadedSlugs, loadSites]);

  const resetFilters = useCallback(() => setFilters(DEFAULT_FILTERS), []);

  const q = normalizeQuery(debouncedQuery);

  const filtered = useMemo(
    () =>
      sortJobs(
        jobs.filter((j) => jobMatches(j, filters, q)),
        filters.sort,
      ),
    [jobs, filters, q],
  );

  // Faceted counts power every filter option (work-mode, salary, sources, dept).
  const facets = useMemo(
    () => facetCounts(jobs, filters, q),
    [jobs, filters, q],
  );

  const platforms = useMemo(() => platformFacets(jobs), [jobs]);
  const tabCounts = useMemo(
    () => providerTabCounts(jobs, filters, q),
    [jobs, filters, q],
  );

  const paginationKey = `${q}|${filters.workMode}|${filters.sort}|${filters.companies.size}|${filters.departments.size}|${filters.providers.size}|${filters.salary}|${filters.region}`;
  const [lastPaginationKey, setLastPaginationKey] = useState(paginationKey);
  if (paginationKey !== lastPaginationKey) {
    setLastPaginationKey(paginationKey);
    setVisibleCount(PAGE_SIZE);
  }

  const visible = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount],
  );

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

  const selected = useMemo(() => {
    const base = jobs.find((j) => j.id === selectedId) ?? null;
    return base ? (detailsCache[base.id] ?? base) : null;
  }, [jobs, selectedId, detailsCache]);

  const handleSelect = useCallback(
    (job: Job) => {
      setSelectedId(job.id);
      if (job.hasDescription && !detailsCache[job.id]) {
        setDetailLoading(true);
        fetchJobDetail(job.site, job.source_id)
          .then((full) => {
            if (full) setDetailsCache((prev) => ({ ...prev, [full.id]: full }));
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
    filters.salary !== "all" ||
    filters.region !== "all";

  const showMore = visibleCount < filtered.length;
  const showOnboarding = jobs.length === 0 && !loading;
  const activeCompanies = loadedSlugs.size;

  return (
    <div className="relative">
      <CommandMenu
        jobs={jobs}
        onSelect={handleSelect}
        open={commandOpen}
        onOpenChange={setCommandOpen}
      />

      {/* Toolbar */}
      <div
        ref={toolbarRef}
        className="sticky top-14 z-30 border-b bg-background/80 backdrop-blur-md"
      >
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm">
              <Sparkles className="size-4 text-primary" />
              <span className="font-semibold">
                {jobs.length.toLocaleString()}
              </span>
              <span className="text-muted-foreground">open roles</span>
              <span className="hidden text-muted-foreground sm:inline">
                · {activeCompanies} companies ·{" "}
                {filters.providers.size === ALL_PROVIDERS.length
                  ? "all sources"
                  : `${PLATFORM_META[[...filters.providers][0]]?.label ?? [...filters.providers][0]} only`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCommandOpen(true)}
                disabled={showOnboarding}
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
            </div>
          </div>
          {!showOnboarding && (
            <div className="mt-3">
              <FiltersBar
                filters={filters}
                onChange={setFilters}
                loadedSlugs={loadedSlugs}
                onToggleCompany={toggleCompany}
                platforms={platforms}
                tabCounts={tabCounts}
                facets={facets}
                resultCount={filtered.length}
                packs={STARTER_PACKS}
                onLoadPack={loadPack}
              />
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div
        className={`mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 ${
          showOnboarding ? "" : "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
        }`}
      >
        {/* Master list */}
        <div className="min-w-0">
          {showOnboarding ? (
            <Onboarding packs={STARTER_PACKS} onLoadPack={loadPack}>
              <CompanyPicker
                selected={filters.companies}
                loaded={loadedSlugs}
                providers={[...filters.providers]}
                onToggle={toggleCompany}
              />
            </Onboarding>
          ) : loading && jobs.length === 0 ? (
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
              {showMore && (
                <div ref={sentinelRef} aria-hidden className="h-px" />
              )}
            </div>
          )}
        </div>

        {/* Detail pane (desktop) */}
        {!showOnboarding && (
          <div
            className="sticky hidden lg:block"
            style={{
              top: HEADER_HEIGHT + toolbarHeight,
              height: `calc(100dvh - ${HEADER_HEIGHT + toolbarHeight}px)`,
            }}
          >
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
        )}
      </div>

      {/* Mobile detail sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col p-0 sm:max-w-md"
          showCloseButton={false}
        >
          <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
            <span className="text-sm font-medium text-muted-foreground">
              Job details
            </span>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1">
            {selected && <JobDetail job={selected} loading={detailLoading} />}
          </div>
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
