import { SearchX } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

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
