"use client";

import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { Job } from "@/lib/types";
import { browseJobs } from "@/lib/api-client";
import { DEFAULT_FILTERS } from "@/lib/filtering";

interface Props {
  onSelect: (job: Job) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Global ⌘K / Ctrl-K search — queries the whole catalog server-side, not
 * just whatever page happens to be loaded in the list below it. */
export function CommandMenu({ onSelect, open, onOpenChange }: Props) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);

  // Mark loading from the input handler, not the debounce effect below —
  // setState synchronously inside an effect body trips
  // react-hooks/set-state-in-effect (see the same pattern in company-picker.tsx).
  const onQueryChange = (v: string) => {
    setQuery(v);
    if (v.trim()) setLoading(true);
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!document.querySelector("[cmdk-dialog]"));
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [onOpenChange]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    // Nothing to fetch when closed or empty — the render below already
    // hides `results` in that case, so there's no state to reset here.
    if (!open || !debounced) return;
    let stale = false;
    browseJobs(DEFAULT_FILTERS, debounced, 1, 20, false)
      .then((data) => {
        if (!stale) setResults(data.jobs);
      })
      .catch(() => {
        if (!stale) setResults([]);
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [open, debounced]);

  return (
    <CommandDialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setQuery("");
      }}
    >
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Search jobs, companies, locations…"
          value={query}
          onValueChange={onQueryChange}
        />
        <CommandList>
          {!debounced ? (
            <CommandEmpty className="py-6 text-sm text-muted-foreground">
              Type to search across the whole catalog.
            </CommandEmpty>
          ) : loading && results.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Searching…
            </div>
          ) : (
            <>
              <CommandEmpty>No results for “{debounced}”.</CommandEmpty>
              <CommandGroup heading="Roles">
                {results.map((job) => (
                  <CommandItem
                    key={job.id}
                    value={job.id}
                    onSelect={() => {
                      onSelect(job);
                      onOpenChange(false);
                      setQuery("");
                    }}
                    className="flex items-center gap-2"
                  >
                    <Search className="size-4 opacity-60" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{job.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {job.company}
                        {job.location ? ` · ${job.location}` : ""}
                      </p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
