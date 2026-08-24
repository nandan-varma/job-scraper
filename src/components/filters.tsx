"use client";

import {
  Check,
  ChevronDown,
  Info,
  Package,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  DEFAULT_FILTERS,
  WORK_MODES,
  SALARY_MODES,
  REGION_MODES,
  type Filters,
  type FacetCounts,
} from "@/lib/filtering";
import {
  ALL_PROVIDERS,
  PLATFORM_META,
  pct,
  platformsProviding,
  type Coverage,
  type PlatformFacet,
} from "@/lib/platforms";
import type { StarterPack } from "@/lib/featured";
import { CompanyPicker } from "./company-picker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export { DEFAULT_FILTERS } from "@/lib/filtering";
export type { Filters } from "@/lib/filtering";

interface Props {
  filters: Filters;
  onChange: (next: Filters) => void;
  loadedSlugs: Set<string>;
  onToggleCompany: (slug: string) => void;
  platforms: PlatformFacet[];
  coverage: Coverage;
  facets: FacetCounts;
  resultCount: number;
  packs: StarterPack[];
  onLoadPack: (pack: StarterPack) => void;
}

/** Fields shown in the cross-source "what data do they provide" matrix. */
const MATRIX_FIELDS: Array<{
  key: "department" | "work_mode" | "salary" | "posted";
  label: string;
}> = [
  { key: "department", label: "Dept" },
  { key: "work_mode", label: "Mode" },
  { key: "salary", label: "Salary" },
  { key: "posted", label: "Posted" },
];

function allProvidersActive(filters: Filters): boolean {
  return (
    filters.providers.size === ALL_PROVIDERS.length ||
    ALL_PROVIDERS.every((p) => filters.providers.has(p))
  );
}

export function FiltersBar({
  filters,
  onChange,
  loadedSlugs,
  onToggleCompany,
  platforms,
  coverage,
  facets,
  resultCount,
  packs,
  onLoadPack,
}: Props) {
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [coverageOpen, setCoverageOpen] = useState(false);

  const patch = (p: Partial<Filters>) => onChange({ ...filters, ...p });

  const toggleDepartment = (d: string) => {
    const next = new Set(filters.departments);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    patch({ departments: next });
  };

  const toggleProvider = (p: string) => {
    const next = new Set(filters.providers);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    patch({ providers: next });
  };

  const clearAdvanced = () =>
    patch({ departments: new Set(), salary: "all", region: "all" });

  const clearAll = () => onChange({ ...DEFAULT_FILTERS, query: filters.query });

  const advancedActive =
    filters.departments.size +
    (filters.salary !== "all" ? 1 : 0) +
    (filters.region !== "all" ? 1 : 0);

  const activeFilters =
    filters.workMode !== "all" ||
    filters.companies.size > 0 ||
    filters.departments.size > 0 ||
    filters.salary !== "all" ||
    filters.region !== "all";

  const deptCoverage = coverage.department;
  const salaryCoverage = coverage.salary;
  const deptPlatforms = platformsProviding(platforms, "department");

  return (
    <div className="space-y-3">
      {/* Row 1: search + work-mode + sort (universal, always shown) */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.query}
            onChange={(e) => patch({ query: e.target.value })}
            placeholder="Search title, company, tech, keyword…"
            className="h-9 pl-9"
          />
          {filters.query && (
            <button
              type="button"
              onClick={() => patch({ query: "" })}
              className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Work-mode segmented with live counts */}
          <div className="flex rounded-lg border bg-muted/40 p-0.5">
            {WORK_MODES.map((m) => {
              const count = facets.workMode[m.value];
              const active = filters.workMode === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => patch({ workMode: m.value })}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {m.label}
                    <span
                      className={cn(
                        "text-[10px] tabular-nums",
                        active ? "text-muted-foreground" : "opacity-60",
                      )}
                    >
                      {count.toLocaleString()}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <Select
            value={filters.sort}
            onValueChange={(v) => patch({ sort: v as Filters["sort"] })}
          >
            <SelectTrigger
              className="h-9 w-auto gap-1 [&>svg]:size-3.5"
              aria-label="Sort"
            >
              <span className="hidden sm:inline">Sort:</span>
              <SelectValue placeholder="Newest" />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="company">Company A–Z</SelectItem>
              <SelectItem value="title">Title A–Z</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 2: companies + more filters + data coverage + count */}
      <div className="flex flex-wrap items-center gap-2">
        <CompanyPicker
          selected={filters.companies}
          loaded={loadedSlugs}
          providers={[...filters.providers]}
          onToggle={onToggleCompany}
          onOpenCompany={(slug) => router.push(`/companies/${slug}`)}
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5">
              <Package className="size-3.5" />
              Packs
              <ChevronDown className="size-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {packs.map((pack) => (
              <DropdownMenuItem
                key={pack.id}
                onSelect={() => onLoadPack(pack)}
                className="justify-between gap-4"
              >
                {pack.label}
                <span className="text-xs text-muted-foreground">
                  {pack.slugs.length}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Popover open={moreOpen} onOpenChange={setMoreOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5">
              <SlidersHorizontal className="size-3.5" />
              More filters
              {advancedActive > 0 && (
                <Badge className="bg-primary text-primary-foreground">
                  {advancedActive}
                </Badge>
              )}
              <ChevronDown className="size-3 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[19rem] p-0" align="start">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-sm font-semibold">More filters</span>
              {advancedActive > 0 && (
                <button
                  type="button"
                  onClick={clearAdvanced}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Reset
                </button>
              )}
            </div>
            <div className="p-2">
              <FilterSection label="Region">
                <div className="flex rounded-lg border bg-muted/40 p-0.5">
                  {REGION_MODES.map((m) => {
                    const count = facets.region[m.value];
                    return (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => patch({ region: m.value })}
                        className={cn(
                          "flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                          filters.region === m.value
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <span className="inline-flex flex-col items-center leading-tight">
                          {m.label}
                          <span className="text-[10px] tabular-nums opacity-60">
                            {count.toLocaleString()}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 px-1 text-[11px] leading-snug text-muted-foreground">
                  Guessed from the role&apos;s location text — not exact.
                </p>
              </FilterSection>

              {salaryCoverage.available > 0 && (
                <FilterSection label="Salary">
                  <div className="flex rounded-lg border bg-muted/40 p-0.5">
                    {SALARY_MODES.map((m) => {
                      const count = facets.salary[m.value];
                      return (
                        <button
                          key={m.value}
                          type="button"
                          onClick={() => patch({ salary: m.value })}
                          className={cn(
                            "flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                            filters.salary === m.value
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          <span className="inline-flex flex-col items-center leading-tight">
                            {m.label}
                            <span className="text-[10px] tabular-nums opacity-60">
                              {count.toLocaleString()}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </FilterSection>
              )}

              <FilterSection label="Department">
                {platforms.length === 0 ? null : (
                  <p className="mb-1.5 px-1 text-[11px] leading-snug text-muted-foreground">
                    {deptCoverage.available > 0
                      ? `${deptPlatforms} of ${platforms.length} sources · ${pct(deptCoverage)}% of roles`
                      : "None of the loaded sources provide departments."}
                  </p>
                )}
                {facets.departments.length === 0 ? (
                  <Muted>No departments in the loaded roles.</Muted>
                ) : (
                  <div className="max-h-48 overflow-y-auto">
                    <FacetList>
                      {facets.departments.map((d) => (
                        <FacetRow
                          key={d.name}
                          checked={filters.departments.has(d.name)}
                          onToggle={() => toggleDepartment(d.name)}
                          label={d.name}
                          hint={d.count.toLocaleString()}
                        />
                      ))}
                    </FacetList>
                  </div>
                )}
              </FilterSection>
            </div>
          </PopoverContent>
        </Popover>

        <Popover open={coverageOpen} onOpenChange={setCoverageOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-muted-foreground hover:text-foreground"
              aria-label="Data coverage by source"
            >
              <Info className="size-4" />
              <span className="hidden sm:inline">Data</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3" align="end">
            <p className="text-xs font-semibold">What each source provides</p>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
              Not every ATS exposes every field. Filters only cover sources that
              provide the data.
            </p>
            <div className="mt-3 space-y-1.5">
              {platforms.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  No sources loaded yet.
                </p>
              ) : (
                platforms.map((p) => {
                  const meta = PLATFORM_META[p.key];
                  if (!meta) return null;
                  return (
                    <div
                      key={p.key}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="truncate font-medium">{meta.label}</span>
                      <span className="flex shrink-0 items-center gap-2.5">
                        {MATRIX_FIELDS.map((f) => (
                          <FieldMark
                            key={f.key}
                            label={f.label}
                            on={meta.provide[f.key]}
                          />
                        ))}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
            <div className="mt-3 flex items-center gap-3 border-t pt-2 text-[10px] text-muted-foreground">
              <FieldMark on label="Provided" />
              <FieldMark label="Not provided" />
            </div>
          </PopoverContent>
        </Popover>

        <span className="ml-auto text-xs font-medium text-muted-foreground">
          {resultCount.toLocaleString()} role{resultCount === 1 ? "" : "s"}
        </span>
      </div>

      {/* Row 3: job-provider selector with live role counts */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Sources
        </span>
        {ALL_PROVIDERS.map((p) => {
          const meta = PLATFORM_META[p];
          const active = filters.providers.has(p);
          const count = facets.providers[p] ?? 0;
          return (
            <button
              key={p}
              type="button"
              onClick={() => toggleProvider(p)}
              title={`${meta?.label}: ${active ? "enabled" : "disabled"}`}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
                active
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : "border-border bg-muted/40 text-muted-foreground hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  active ? "bg-primary" : "bg-muted-foreground/40",
                )}
              />
              {meta?.label ?? p}
              <span className="tabular-nums opacity-70">
                {count.toLocaleString()}
              </span>
            </button>
          );
        })}
        {!allProvidersActive(filters) && (
          <button
            type="button"
            onClick={() => patch({ providers: new Set(ALL_PROVIDERS) })}
            className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            Enable all
          </button>
        )}
      </div>

      {/* Active filter chips */}
      {(activeFilters || filters.companies.size > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {filters.workMode !== "all" && (
            <Chip onClear={() => patch({ workMode: "all" })}>
              {filters.workMode}
            </Chip>
          )}
          {[...filters.companies].map((slug) => (
            <Chip key={slug} onClear={() => onToggleCompany(slug)}>
              {slug}
            </Chip>
          ))}
          {[...filters.departments].map((d) => (
            <Chip key={d} onClear={() => toggleDepartment(d)}>
              {d}
            </Chip>
          ))}
          {filters.salary === "has" && (
            <Chip onClear={() => patch({ salary: "all" })}>Has pay</Chip>
          )}
          {filters.salary === "none" && (
            <Chip onClear={() => patch({ salary: "all" })}>No pay</Chip>
          )}
          {filters.region !== "all" && (
            <Chip onClear={() => patch({ region: "all" })}>
              {filters.region === "us" ? "US roles" : "International"}
            </Chip>
          )}
          {activeFilters && (
            <button
              type="button"
              onClick={clearAll}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FilterSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2 last:mb-0">
      <p className="px-1 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      {children}
    </div>
  );
}

function FacetList({ children }: { children: React.ReactNode }) {
  return <div className="space-y-0.5">{children}</div>;
}

function FacetRow({
  checked,
  onToggle,
  label,
  hint,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-accent"
    >
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded border",
          checked
            ? "border-primary bg-primary text-primary-foreground"
            : "border-input",
        )}
      >
        {checked && <Check className="size-3" />}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint && (
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
          {hint}
        </span>
      )}
    </button>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-1.5 py-1 text-[11px] leading-snug text-muted-foreground">
      {children}
    </p>
  );
}

function FieldMark({ on = false, label }: { on?: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px]",
        on
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-muted-foreground/50",
      )}
      title={label}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          on ? "bg-emerald-500" : "bg-muted-foreground/40",
        )}
      />
      {label}
    </span>
  );
}

function Chip({
  children,
  onClear,
}: {
  children: React.ReactNode;
  onClear: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClear}
      className="inline-flex items-center gap-1 rounded-full border bg-muted/50 py-0.5 pr-1.5 pl-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
    >
      {children}
      <X className="size-3 text-muted-foreground" />
    </button>
  );
}

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
