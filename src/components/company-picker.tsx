"use client";

import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Building2,
  Check,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { searchSites, type SiteRef } from "@/lib/api-client";
import { PLATFORM_META } from "@/lib/platforms";
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
import { cn } from "@/lib/utils";

interface Props {
  selected: Set<string>;
  loaded: Set<string>;
  /** Active job-provider platforms, used to scope the server search. */
  providers: string[];
  onToggle: (slug: string) => void;
  onOpenCompany?: (slug: string) => void;
}

const LIMIT = 60;

/**
 * Instant, server-backed company search. The registry is ~8.5k companies, so the
 * static 8.5k-CommandItem popover is gone — we query /api/sites on a debounce
 * and render only the top matches. Never lags regardless of registry size.
 */
export function CompanyPicker({
  selected,
  loaded,
  providers,
  onToggle,
  onOpenCompany,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [items, setItems] = useState<SiteRef[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // Mark loading from event handlers (typing / opening), not from the effect.
  const onQuery = (v: string) => {
    setQ(v);
    setLoading(true);
  };
  const onOpen = (o: boolean) => {
    setOpen(o);
    if (o) setLoading(true);
  };

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 180);
    return () => clearTimeout(t);
  }, [q]);

  const providersKey = providers.join(",");

  useEffect(() => {
    if (!open) return;
    let stale = false;
    searchSites(debounced, providers, LIMIT)
      .then((r) => {
        if (!stale) {
          setItems(r.sites);
          setTotal(r.total);
        }
      })
      .catch(() => {
        if (!stale) setItems([]);
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, debounced, providersKey]);

  return (
    <Popover open={open} onOpenChange={onOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5">
          <Building2 className="size-3.5" />
          Companies
          {selected.size > 0 && (
            <Badge className="ml-0.5 bg-primary text-primary-foreground">
              {selected.size}
            </Badge>
          )}
          <ChevronDown className="size-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search 8,500+ companies…"
            value={q}
            onValueChange={onQuery}
          />
          <CommandList>
            <div className="flex items-center justify-between border-b px-3 py-1.5 text-[11px] text-muted-foreground">
              <span>
                {loading && items.length === 0
                  ? "Searching…"
                  : `${total.toLocaleString()} matches`}
              </span>
              {onOpenCompany && (
                <span className="hidden sm:inline">⟶ opens full page</span>
              )}
            </div>
            <div className="max-h-72 overflow-y-auto">
              {loading && items.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Searching…
                </div>
              ) : (
                <CommandGroup>
                  {items.map((s) => {
                    const checked = selected.has(s.slug);
                    const isLoaded = loaded.has(s.slug);
                    return (
                      <CommandItem
                        key={s.slug}
                        value={`${s.name} ${s.slug}`}
                        onSelect={() => onToggle(s.slug)}
                        className="flex items-center gap-2"
                      >
                        <span
                          className={cn(
                            "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                            checked
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-input",
                          )}
                        >
                          {checked && <Check className="size-3" />}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {s.name}
                        </span>
                        <ProviderChip platform={s.platform} />
                        {!isLoaded && (
                          <span className="text-[10px] text-muted-foreground">
                            load
                          </span>
                        )}
                        {onOpenCompany && (
                          <button
                            type="button"
                            aria-label={`Open ${s.name} page`}
                            onSelect={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              onOpenCompany(s.slug);
                            }}
                            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                          >
                            <ArrowUpRight className="size-3.5" />
                          </button>
                        )}
                      </CommandItem>
                    );
                  })}
                  {!loading && items.length === 0 && (
                    <CommandEmpty>No companies found.</CommandEmpty>
                  )}
                </CommandGroup>
              )}
            </div>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ProviderChip({ platform }: { platform: string }) {
  const meta = PLATFORM_META[platform];
  return (
    <span
      className={cn(
        "hidden shrink-0 rounded-full border px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide sm:inline",
        meta?.tag ?? "border-border bg-muted text-muted-foreground",
      )}
    >
      {meta?.label ?? platform}
    </span>
  );
}
