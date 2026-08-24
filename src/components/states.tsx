import { SearchX, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type { StarterPack } from "@/lib/featured";

export function JobCardSkeleton() {
  return (
    <div className="flex w-full items-start gap-3.5 rounded-xl border bg-card p-4">
      <Skeleton className="size-10 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1 space-y-2.5">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/3" />
        <div className="flex gap-2 pt-1">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-12" />
        </div>
      </div>
    </div>
  );
}

export function JobListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: count }).map((_, i) => (
        <JobCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Shown only while the default feed is still loading (or failed to load) —
 * the app auto-loads a starter set on first visit, so this is a brief,
 * rare state rather than the normal landing experience. */
export function Onboarding({
  packs,
  onLoadPack,
  children,
}: {
  packs: StarterPack[];
  onLoadPack: (pack: StarterPack) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed bg-card/50 px-6 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/20 text-primary">
        <Sparkles className="size-6" />
      </div>
      <div>
        <h3 className="text-lg font-semibold">Build your job feed</h3>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Pick the companies and sources you care about, or start from a
          curated pack. Filters apply across everything you select.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {children}
        {packs.map((pack) => (
          <Button
            key={pack.id}
            variant="outline"
            size="sm"
            onClick={() => onLoadPack(pack)}
          >
            {pack.label}
            <span className="text-muted-foreground">{pack.slugs.length}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}

export function EmptyState({
  hasFilters,
  onReset,
}: {
  hasFilters: boolean;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card/50 px-6 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <SearchX className="size-6 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold">No roles match your filters</h3>
      <p className="max-w-sm text-sm text-muted-foreground">
        {hasFilters
          ? "Try widening your search, removing a work-mode, or clearing company filters."
          : "No open roles found for this selection. Try adding more companies."}
      </p>
      {hasFilters && (
        <Button variant="outline" size="sm" onClick={onReset} className="mt-1">
          Reset filters
        </Button>
      )}
    </div>
  );
}
