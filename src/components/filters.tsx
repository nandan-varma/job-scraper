"use client";

import {
  Building2,
  Check,
  ChevronDown,
  Info,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  PLATFORM_META,
  pct,
  platformsProviding,
  type Coverage,
  type PlatformFacet,
} from "@/lib/platforms";

export type WorkModeFilter = "all" | "remote" | "hybrid" | "onsite";
export type SortKey = "newest" | "company" | "title";
export type SalaryFilter = "all" | "has" | "none";

export interface Filters {
  query: string;
  workMode: WorkModeFilter;
  sort: SortKey;
  companies: Set<string>;
  departments: Set<string>;
  /** API-specific filter — only meaningful once sources are loaded. */
  platforms: Set<string>;
  salary: SalaryFilter;
}

export const DEFAULT_FILTERS: Filters = {
  query: "",
  workMode: "all",
  sort: "newest",
  companies: new Set(),
  departments: new Set(),
  platforms: new Set(),
  salary: "all",
};

interface Props {
  filters: Filters;
  onChange: (next: Filters) => void;
  sites: Array<{ slug: string; name: string; platform: string }>;
  loadedSlugs: Set<string>;
  onToggleCompany: (slug: string) => void;
  departments: string[];
  platforms: PlatformFacet[];
  coverage: Coverage;
  resultCount: number;
}

const WORK_MODES: Array<{ value: WorkModeFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site" },
];

const SALARY_MODES: Array<{ value: SalaryFilter; label: string }> = [
  { value: "all", label: "Any" },
  { value: "has", label: "Has salary" },
  { value: "none", label: "No salary" },
];

/** The fields shown in the cross-source "what data do they provide" matrix. */
const MATRIX_FIELDS: Array<{
  key: "department" | "work_mode" | "salary" | "posted";
  label: string;
}> = [
  { key: "department", label: "Dept" },
  { key: "work_mode", label: "Mode" },
  { key: "salary", label: "Salary" },
  { key: "posted", label: "Posted" },
];

export function FiltersBar({
  filters,
  onChange,
  sites,
  loadedSlugs,
  onToggleCompany,
  departments,
  platforms,
  coverage,
  resultCount,
}: Props) {
  const [companyOpen, setCompanyOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [coverageOpen, setCoverageOpen] = useState(false);

  const patch = (p: Partial<Filters>) => onChange({ ...filters, ...p });

  const toggleDepartment = (d: string) => {
    const next = new Set(filters.departments);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    patch({ departments: next });
  };

  const togglePlatform = (key: string) => {
    const next = new Set(filters.platforms);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    patch({ platforms: next });
  };

  const clearAdvanced = () =>
    patch({
      departments: new Set(),
      platforms: new Set(),
      salary: "all",
    });

  const clearAll = () => {
    onChange({ ...DEFAULT_FILTERS, query: filters.query });
  };

  const advancedActive =
    filters.platforms.size +
    filters.departments.size +
    (filters.salary !== "all" ? 1 : 0);

  const activeFilters =
    filters.workMode !== "all" ||
    filters.companies.size > 0 ||
    filters.departments.size > 0 ||
    filters.platforms.size > 0 ||
    filters.salary !== "all";

  const deptCoverage = coverage.department;
  const salaryCoverage = coverage.salary;
  const deptPlatforms = platformsProviding(platforms, "department");
  const salaryPlatforms = platformsProviding(platforms, "salary");

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
          {/* Work-mode segmented */}
          <div className="flex rounded-lg border bg-muted/40 p-0.5">
            {WORK_MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => patch({ workMode: m.value })}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                  filters.workMode === m.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Sort */}
          <Select
            value={filters.sort}
            onValueChange={(v) => patch({ sort: v as SortKey })}
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
        <Popover open={companyOpen} onOpenChange={setCompanyOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5">
              <Building2 className="size-3.5" />
              Companies
              {filters.companies.size > 0 && (
                <Badge className="ml-0.5 bg-primary text-primary-foreground">
                  {filters.companies.size}
                </Badge>
              )}
              <ChevronDown className="size-3 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="start">
            <Command>
              <CommandInput placeholder="Search companies…" />
              <CommandList>
                <CommandEmpty>No companies found.</CommandEmpty>
                <CommandGroup className="max-h-72 overflow-y-auto">
                  {sites.map((s) => {
                    const checked = filters.companies.has(s.slug);
                    return (
                      <CommandItem
                        key={s.slug}
                        value={`${s.name} ${s.slug}`}
                        onSelect={() => onToggleCompany(s.slug)}
                        className="flex items-center gap-2"
                      >
                        <span
                          className={cn(
                            "flex size-4 items-center justify-center rounded border transition-colors",
                            checked
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-input",
                          )}
                        >
                          {checked && <Check className="size-3" />}
                        </span>
                        <span className="flex-1 truncate text-sm">
                          {s.name}
                        </span>
                        {!loadedSlugs.has(s.slug) && (
                          <span className="text-[10px] text-muted-foreground">
                            load
                          </span>
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* More filters — data-derived filters live here, not in the default bar */}
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

            <div className="max-h-[26rem] overflow-y-auto p-2">
              {/* Platform — every job has a source, always available */}
              <FilterSection label="Platform">
                {platforms.length === 0 ? (
                  <Muted>
                    No sources loaded yet. Pick companies or “Load all” first.
                  </Muted>
                ) : (
                  <FacetList>
                    {platforms.map((p) => {
                      const checked = filters.platforms.has(p.key);
                      return (
                        <FacetRow
                          key={p.key}
                          checked={checked}
                          onToggle={() => togglePlatform(p.key)}
                          label={p.label}
                          hint={`${p.count.toLocaleString()}`}
                        />
                      );
                    })}
                  </FacetList>
                )}
              </FilterSection>

              {/* Department — source-dependent */}
              <FilterSection label="Department">
                {platforms.length === 0 ? null : (
                  <p className="mb-1.5 px-1 text-[11px] leading-snug text-muted-foreground">
                    {deptCoverage.available > 0
                      ? `${deptPlatforms} of ${platforms.length} sources · ${pct(deptCoverage)}% of roles`
                      : "None of the loaded sources provide departments."}
                  </p>
                )}
                {departments.length === 0 ? (
                  <Muted>
                    {deptCoverage.available > 0
                      ? "No department data in the loaded roles."
                      : "No departments to filter by yet."}
                  </Muted>
                ) : (
                  <FacetList>
                    {departments.map((d) => (
                      <FacetRow
                        key={d}
                        checked={filters.departments.has(d)}
                        onToggle={() => toggleDepartment(d)}
                        label={d}
                      />
                    ))}
                  </FacetList>
                )}
              </FilterSection>

              {/* Salary — source-dependent */}
              {salaryCoverage.available > 0 && (
                <FilterSection label="Salary">
                  <p className="mb-1.5 px-1 text-[11px] leading-snug text-muted-foreground">
                    {salaryPlatforms} of {platforms.length} sources publish
                    ranges · {pct(salaryCoverage)}% of roles
                  </p>
                  <div className="flex rounded-lg border bg-muted/40 p-0.5">
                    {SALARY_MODES.map((m) => (
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
                        {m.label}
                      </button>
                    ))}
                  </div>
                </FilterSection>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Data coverage — explain which sources provide which fields */}
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
              provide the data — e.g. department is missing from some feeds.
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

      {/* Active filter chips */}
      {(activeFilters || filters.companies.size > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {filters.workMode !== "all" && (
            <Chip onClear={() => patch({ workMode: "all" })}>
              {filters.workMode}
            </Chip>
          )}
          {[...filters.companies].map((slug) => {
            const s = sites.find((x) => x.slug === slug);
            return (
              <Chip key={slug} onClear={() => onToggleCompany(slug)}>
                {s?.name ?? slug}
              </Chip>
            );
          })}
          {[...filters.departments].map((d) => (
            <Chip key={d} onClear={() => toggleDepartment(d)}>
              {d}
            </Chip>
          ))}
          {[...filters.platforms].map((key) => (
            <Chip key={key} onClear={() => togglePlatform(key)}>
              {PLATFORM_META[key]?.label ?? key}
            </Chip>
          ))}
          {filters.salary === "has" && (
            <Chip onClear={() => patch({ salary: "all" })}>Has salary</Chip>
          )}
          {filters.salary === "none" && (
            <Chip onClear={() => patch({ salary: "all" })}>No salary</Chip>
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
        <span className="shrink-0 text-[10px] text-muted-foreground">
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
