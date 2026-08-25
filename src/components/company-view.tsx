"use client";

import {
  ArrowLeft,
  ChevronDown,
  ExternalLink,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Job } from "@/lib/types";
import type { PlatformMeta } from "@/lib/platforms";
import { fetchCompanyJobs, fetchJobDetail } from "@/lib/api-client";
import { dedupeJobs, normalizeQuery } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { CompanyLogo } from "./company-logo";
import { JobCard } from "./job-card";
import { JobDetail } from "./job-detail";
import { JobCardSkeleton } from "./states";
import { cn } from "@/lib/utils";

interface Props {
  site: { slug: string; name: string; platform: string };
  sourceUrl: string | null;
  provider: {
    label: string;
    provide?: PlatformMeta["provide"];
  };
  /** Page 1 already fetched server-side for an instant first paint. */
  initialJobs: Job[];
  initialTotal: number;
}

type WorkMode = "all" | "remote" | "hybrid" | "onsite";
type SortKey = "newest" | "title";

const PAGE = 100;

/**
 * One company's careers — fetched with server pagination (no giant payload) and
 * filtered by controls tailored to that company's ATS provider (e.g. Greenhouse
 * exposes work-mode + department, so those controls appear; salary only for
 * providers that publish it).
 */
export function CompanyView({
  site,
  sourceUrl,
  provider,
  initialJobs,
  initialTotal,
}: Props) {
  const caps = provider.provide;
  const showWorkMode = !!caps?.work_mode;
  const showDepartment = !!caps?.department;
  const showSalary = !!caps?.salary;

  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const [q, setQ] = useState("");
  const [workMode, setWorkMode] = useState<WorkMode>("all");
  const [departments, setDepartments] = useState<Set<string>>(new Set());
  const [salary, setSalary] = useState<"all" | "has" | "none">("all");
  const [sort, setSort] = useState<SortKey>("newest");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [detailsCache, setDetailsCache] = useState<Record<string, Job>>({});
  const [detailLoading, setDetailLoading] = useState(false);

  const loadMore = useCallback(async () => {
    try {
      const data = await fetchCompanyJobs(site.slug, {
        page: page + 1,
        perPage: PAGE,
      });
      setJobs((prev) => dedupeJobs([...prev, ...data.jobs]));
      setPage(data.page);
      setTotal(data.total);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [page, site.slug]);

  const departmentsList = useMemo(() => {
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

  const hasMore = jobs.length < total;

  const filtered = useMemo(() => {
    const query = normalizeQuery(q);
    let list = jobs.filter((j) => {
      if (workMode !== "all" && j.work_mode !== workMode) return false;
      if (departments.size && !departments.has(j.department ?? ""))
        return false;
      if (salary === "has" && !j.compensation) return false;
      if (salary === "none" && j.compensation) return false;
      if (query) {
        const inTxt =
          normalizeQuery(j.title).includes(query) ||
          normalizeQuery(j.location ?? "").includes(query) ||
          normalizeQuery(j.department ?? "").includes(query);
        if (!inTxt) return false;
      }
      return true;
    });
    list = [...list].sort((a, b) =>
      sort === "newest"
        ? (b.posted_date ?? "").localeCompare(a.posted_date ?? "")
        : a.title.localeCompare(b.title),
    );
    return list;
  }, [jobs, q, workMode, departments, salary, sort]);

  const toggleDepartment = (d: string) => {
    const next = new Set(departments);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    setDepartments(next);
  };

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

  // Infinite scroll to pull the company's remaining pages.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadFailed) {
          setLoading(true);
          void loadMore();
        }
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, loadFailed, loadMore]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/#browse"
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> All jobs
        </Link>
        <div className="flex items-start gap-4">
          <CompanyLogo name={site.name} size="xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                {site.name}
              </h1>
              <Badge variant="secondary">{provider.label}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {total.toLocaleString()} open role{total === 1 ? "" : "s"} ·
              streamed live
            </p>
          </div>
          {(sourceUrl || site) && (
            <Button variant="outline" size="sm" asChild>
              <a
                href={
                  sourceUrl ??
                  `https://www.google.com/search?q=${encodeURIComponent(site.name + " careers")}`
                }
                target="_blank"
                rel="noopener noreferrer"
              >
                Careers site <ExternalLink className="size-3.5" />
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* Tailored filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search roles at this company…"
            className="h-9 pl-9"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {showWorkMode && (
          <div className="flex rounded-lg border bg-muted/40 p-0.5">
            {(["all", "remote", "hybrid", "onsite"] as WorkMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setWorkMode(m)}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-xs font-medium capitalize transition-colors",
                  workMode === m
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m === "all" ? "All" : m}
              </button>
            ))}
          </div>
        )}

        {showSalary && (
          <div className="flex rounded-lg border bg-muted/40 p-0.5">
            {(["all", "has", "none"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setSalary(m)}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                  salary === m
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m === "all"
                  ? "Any pay"
                  : m === "has"
                    ? "Salary posted"
                    : "No pay"}
              </button>
            ))}
          </div>
        )}

        {showDepartment && departmentsList.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5">
                Department
                {departments.size > 0 && (
                  <Badge className="bg-primary text-primary-foreground">
                    {departments.size}
                  </Badge>
                )}
                <ChevronDown className="size-3 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-1" align="start">
              <div className="max-h-72 overflow-y-auto">
                {departmentsList.map((d) => {
                  const checked = departments.has(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDepartment(d)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <span
                        className={cn(
                          "flex size-4 items-center justify-center rounded border",
                          checked
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input",
                        )}
                      >
                        {checked && <CheckMark />}
                      </span>
                      <span className="truncate">{d}</span>
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        )}

        <div className="ml-auto">
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="h-8 w-auto gap-1 text-xs [&>svg]:size-3.5">
              <SelectValue placeholder="Newest" />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="title">Title A–Z</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Roles */}
      {loading && jobs.length === 0 ? (
        <div className="space-y-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <JobCardSkeleton key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card/50 px-6 py-16 text-center">
          <p className="text-sm font-medium">No roles match your filters</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Try adjusting the controls above.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              selected={selected?.id === job.id}
              onSelect={handleSelect}
            />
          ))}
          {loading && (
            <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Loading more…
            </div>
          )}
          {hasMore && <div ref={sentinelRef} aria-hidden className="h-px" />}
          {!hasMore && !loading && filtered.length > 0 && (
            <p className="py-2 text-center text-xs text-muted-foreground">
              You’ve reached the end.
            </p>
          )}
        </div>
      )}

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

function CheckMark() {
  return (
    <svg
      className="size-3"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
