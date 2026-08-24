"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { Job } from "@/lib/types";
import { normalizeQuery } from "@/lib/format";

interface Props {
  jobs: Job[];
  onSelect: (job: Job) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Global ⌘K / Ctrl-K search over the loaded jobs. */
export function CommandMenu({ jobs, onSelect, open, onOpenChange }: Props) {
  const [query, setQuery] = useState("");

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

  const q = normalizeQuery(query);
  const filtered = q
    ? jobs
        .filter(
          (j) =>
            normalizeQuery(j.title).includes(q) ||
            normalizeQuery(j.company).includes(q) ||
            normalizeQuery(j.location ?? "").includes(q) ||
            normalizeQuery(j.department ?? "").includes(q),
        )
        .slice(0, 30)
    : [];

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search jobs, companies, locations…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {!q ? (
          <CommandEmpty className="py-6 text-sm text-muted-foreground">
            Type to search across {jobs.length.toLocaleString()} open roles.
          </CommandEmpty>
        ) : (
          <>
            <CommandEmpty>No results for “{query}”.</CommandEmpty>
            <CommandGroup heading="Roles">
              {filtered.map((job) => (
                <CommandItem
                  key={job.id}
                  value={`${job.title} ${job.company} ${job.location ?? ""}`}
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
    </CommandDialog>
  );
}
