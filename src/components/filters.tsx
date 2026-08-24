"use client";

import { Check, ChevronDown, Info, Package, Search, X } from "lucide-react";
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
} from "@/lib/filtering";
import type { FacetCounts } from "@/lib/db/queries";
import { ALL_PROVIDERS, PLATFORM_META, type PlatformFacet } from "@/lib/platforms";
import type { StarterPack } from "@/lib/featured";
import { CompanyPicker } from "./company-picker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export { DEFAULT_FILTERS } from "@/lib/filtering";
export type { Filters } from "@/lib/filtering";

interface Props {
  filters: Filters;
  onChange: (next: Filters) => void;
  onToggleCompany: (slug: string) => void;
  platforms: PlatformFacet[];
  /** Job counts per platform under filters that survive a tab switch. */
  tabCounts: Record<string, number>;
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

export function FiltersBar({
  filters,
  onChange,
  onToggleCompany,
  platforms,
  tabCounts,
  facets,
  resultCount,
  packs,
  onLoadPack,
}: Props) {
  const router = useRouter();
  const [deptOpen, setDeptOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);

  const patch = (p: Partial<Filters>) => onChange({ ...filters, ...p });

  // A source tab is just "providers narrowed to exactly one" — no separate
  // state to keep in sync.
  const activeTab =
    filters.providers.size === 1 ? [...filters.providers][0] : "all";
  const activeMeta = activeTab !== "all" ? PLATFORM_META[activeTab] : undefined;

  // Switching tabs drops provider-specific filters: a work-mode/salary/
  // department selection made on one source is meaningless (or misleading)
  // on another that doesn't expose that field.
  const selectTab = (tab: string) =>
    onChange({
      ...filters,
      providers: tab === "all" ? new Set(ALL_PROVIDERS) : new Set([tab]),
      workMode: "all",
      salary: "all",
      departments: new Set(),
    });

  const toggleDepartment = (d: string) => {
    const next = new Set(filters.departments);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    patch({ departments: next });
  };

  const clearAll = () => onChange({ ...DEFAULT_FILTERS, query: filters.query });

  const activeFilters =
    activeTab !== "all" ||
    filters.workMode !== "all" ||
    filters.companies.size > 0 ||
    filters.departments.size > 0 ||
    filters.salary !== "all" ||
    filters.region !== "all";

  const allCount = Object.values(tabCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-3">
      {/* Row 1: search + sort — universal, always shown */}
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

      {/* Row 2: source tabs — each source's own filters only exist within its tab */}
      {platforms.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          <TabButton
            active={activeTab === "all"}
            label="All sources"
            count={allCount}
            onClick={() => selectTab("all")}
          />
          {platforms.map((p) => (
            <TabButton
              key={p.key}
              active={activeTab === p.key}
              label={PLATFORM_META[p.key]?.label ?? p.key}
              count={tabCounts[p.key] ?? 0}
              onClick={() => selectTab(p.key)}
            />
          ))}
        </div>
      )}

      {/* Row 3: companies + filters available on the active tab */}
      <div className="flex flex-wrap items-center gap-2">
        <CompanyPicker
          selected={filters.companies}
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

        {/* Region is derived from location text, which every source provides. */}
        <SegmentedControl
          value={filters.region}
          options={REGION_MODES}
          counts={facets.region}
          onChange={(v) => patch({ region: v })}
        />

        {activeMeta?.provide.work_mode && (
          <SegmentedControl
            value={filters.workMode}
            options={WORK_MODES}
            counts={facets.workMode}
            onChange={(v) => patch({ workMode: v })}
          />
        )}

        {activeMeta?.provide.salary && (
          <SegmentedControl
            value={filters.salary}
            options={SALARY_MODES}
            counts={facets.salary}
            onChange={(v) => patch({ salary: v })}
          />
        )}

        {activeMeta?.provide.department && (
          <Popover open={deptOpen} onOpenChange={setDeptOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5">
                Department
                {filters.departments.size > 0 && (
                  <Badge className="bg-primary text-primary-foreground">
                    {filters.departments.size}
                  </Badge>
                )}
                <ChevronDown className="size-3 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="start">
              {facets.departments.length === 0 ? (
                <Muted>No departments in the loaded roles.</Muted>
              ) : (
                <div className="max-h-64 overflow-y-auto">
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
            </PopoverContent>
          </Popover>
        )}

        <Popover open={dataOpen} onOpenChange={setDataOpen}>
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
              Not every ATS exposes every field — switch to a source tab to
              filter by what it actually supports.
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
      {activeFilters && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeTab !== "all" && (
            <Chip onClear={() => selectTab("all")}>
              {PLATFORM_META[activeTab]?.label ?? activeTab} only
            </Chip>
          )}
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
          <button
            type="button"
            onClick={clearAll}
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary/50 bg-primary/10 text-foreground"
          : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
    >
      {label}
      <span
        className={cn(
          "tabular-nums",
          active ? "text-muted-foreground" : "opacity-60",
        )}
      >
        {count.toLocaleString()}
      </span>
    </button>
  );
}

function SegmentedControl<T extends string>({
  value,
  options,
  counts,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  counts: Record<string, number>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex h-8 items-center rounded-lg border bg-muted/40 p-0.5">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-md px-2 py-1 text-xs font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="inline-flex items-center gap-1">
              {o.label}
              <span
                className={cn(
                  "text-[10px] tabular-nums",
                  active ? "text-muted-foreground" : "opacity-60",
                )}
              >
                {(counts[o.value] ?? 0).toLocaleString()}
              </span>
            </span>
          </button>
        );
      })}
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
