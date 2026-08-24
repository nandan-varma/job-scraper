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
import { STARTER_PACKS, type StarterPack } from "@/lib/featured";
import { browseJobs, fetchJobDetail, type JobsPage } from "@/lib/api-client";
import { dedupeJobs, normalizeQuery } from "@/lib/format";
import { platformFacetsFromCounts } from "@/lib/platforms";
import { isLikelyUSVisitor } from "@/lib/geo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { JobCard } from "./job-card";
import { JobDetail } from "./job-detail";
import { FiltersBar, DEFAULT_FILTERS, type Filters } from "./filters";
import { PAGE_SIZE } from "@/lib/filtering";
import { CommandMenu } from "./command-menu";
import { EmptyState, JobListSkeleton } from "./states";

interface Props {
  /** First page of the whole catalog, fetched server-side for an instant paint. */
  initialPage: JobsPage;
}

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

export function JobBrowser({ initialPage }: Props) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [jobs, setJobs] = useState<Job[]>(initialPage.jobs);
  const [total, setTotal] = useState(initialPage.total);
  const [facets, setFacets] = useState(initialPage.facets!);
  const [tabCounts, setTabCounts] = useState(initialPage.tabCounts ?? {});
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  const [detailsCache, setDetailsCache] = useState<Record<string, Job>>({});
  const [detailLoading, setDetailLoading] = useState(false);

  const debouncedQuery = useDebouncedValue(filters.query, 250);
  const q = normalizeQuery(debouncedQuery);

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

  // Server-driven: any filter/search/sort change re-queries the whole
  // catalog from page 1. `companies` narrows the result set — it's no
  // longer a prerequisite for seeing anything.
  const filterKey = [
    q,
    filters.workMode,
    filters.salary,
    filters.region,
    filters.sort,
    [...filters.providers].sort().join(","),
    [...filters.departments].sort().join(","),
    [...filters.companies].sort().join(","),
  ].join("|");

  const isFirstRun = useRef(true);
  useEffect(() => {
    if (isFirstRun.current) {
      // The initial render already has server-fetched page 1 for the
      // default (unfiltered) state — skip the redundant refetch.
      isFirstRun.current = false;
      return;
    }
    let stale = false;
    setLoading(true);
    browseJobs(filters, q, 1, PAGE_SIZE, true)
      .then((data) => {
        if (stale) return;
        setJobs(data.jobs);
        setTotal(data.total);
        setFacets(data.facets!);
        setTabCounts(data.tabCounts ?? {});
        setPage(1);
      })
      .catch(() => {
        if (!stale) toast.error("Failed to load roles");
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  const loadMore = useCallback(() => {
    setLoadingMore(true);
    browseJobs(filters, q, page + 1, PAGE_SIZE, false)
      .then((data) => {
        setJobs((prev) => dedupeJobs([...prev, ...data.jobs]));
        setPage(data.page);
      })
      .catch(() => toast.error("Failed to load more roles"))
      .finally(() => setLoadingMore(false));
  }, [filters, q, page]);

  const hasMore = jobs.length < total;

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          loadMore();
        }
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, loadingMore, loadMore]);

  const platforms = useMemo(
    () => platformFacetsFromCounts(facets.providers),
    [facets.providers],
  );

  const toggleCompany = useCallback((slug: string) => {
    setFilters((prev) => {
      const next = new Set(prev.companies);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return { ...prev, companies: next };
    });
  }, []);

  const loadPack = useCallback((pack: StarterPack) => {
    setFilters((prev) => ({
      ...prev,
      companies: new Set([...prev.companies, ...pack.slugs]),
    }));
    toast.success(`Filtering to ${pack.label} (${pack.slugs.length} companies)`);
  }, []);

  const refresh = useCallback(() => {
    setLoading(true);
    browseJobs(filters, q, 1, PAGE_SIZE, true)
      .then((data) => {
        setJobs(data.jobs);
        setTotal(data.total);
        setFacets(data.facets!);
        setTabCounts(data.tabCounts ?? {});
        setPage(1);
        toast.success(`${data.total.toLocaleString()} roles`);
      })
      .catch(() => toast.error("Refresh failed"))
      .finally(() => setLoading(false));
  }, [filters, q]);

  const resetFilters = useCallback(() => setFilters(DEFAULT_FILTERS), []);

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
    filters.region !== "all" ||
    filters.providers.size < platforms.length;

  return (
    <div className="relative">
      <CommandMenu onSelect={handleSelect} open={commandOpen} onOpenChange={setCommandOpen} />

      {/* Toolbar */}
      <div
        ref={toolbarRef}
        className="sticky top-14 z-30 border-b bg-background/80 backdrop-blur-md"
      >
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm">
              <Sparkles className="size-4 text-primary" />
              <span className="font-semibold">{total.toLocaleString()}</span>
              <span className="text-muted-foreground">open roles</span>
              <span className="hidden text-muted-foreground sm:inline">
                {filters.companies.size > 0
                  ? `· ${filters.companies.size} companies selected`
                  : "· across the whole catalog"}
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
                aria-label="Refresh results"
              >
                <RefreshCw className={loading ? "size-3.5 animate-spin" : "size-3.5"} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            </div>
          </div>
          <div className="mt-3">
            <FiltersBar
              filters={filters}
              onChange={setFilters}
              onToggleCompany={toggleCompany}
              platforms={platforms}
              tabCounts={tabCounts}
              facets={facets}
              resultCount={total}
              packs={STARTER_PACKS}
              onLoadPack={loadPack}
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
          ) : jobs.length === 0 ? (
            <EmptyState hasFilters={hasFilters} onReset={resetFilters} />
          ) : (
            <div className="space-y-2.5">
              {jobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  selected={selected?.id === job.id}
                  onSelect={handleSelect}
                />
              ))}

              <div className="pt-2">
                <p className="mb-2 text-center text-xs text-muted-foreground">
                  Showing {jobs.length.toLocaleString()} of {total.toLocaleString()} roles
                </p>
                {loadingMore && (
                  <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" /> Loading more…
                  </div>
                )}
                {!hasMore && !loadingMore && (
                  <p className="pt-1 text-center text-xs text-muted-foreground">
                    You’ve reached the end 🎉
                  </p>
                )}
                {hasMore && !loadingMore && (
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
              </div>
              {hasMore && <div ref={sentinelRef} aria-hidden className="h-px" />}
            </div>
          )}
        </div>

        {/* Detail pane (desktop) */}
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
              <DetailPlaceholder count={total} />
            )}
          </div>
        </div>
      </div>

      {/* Mobile detail sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col p-0 sm:max-w-md"
          showCloseButton={false}
        >
          <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
            <span className="text-sm font-medium text-muted-foreground">Job details</span>
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

function DetailPlaceholder({ count }: { count: number }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <div className="text-muted-foreground">
        <Sparkles className="mx-auto size-8" />
      </div>
      <p className="text-sm font-medium text-foreground">Select a role to view details</p>
      <p className="max-w-xs text-xs text-muted-foreground">
        Click any of the {count.toLocaleString()} open roles to see the full
        description, apply link, and company info.
      </p>
    </div>
  );
}
