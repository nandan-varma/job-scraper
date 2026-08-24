import { CalendarDays, DollarSign, MapPin } from "lucide-react";
import type { Job } from "@/lib/types";
import { cn } from "@/lib/utils";
import { shortLocation, timeAgo, workModeLabel } from "@/lib/format";
import { PLATFORM_META } from "@/lib/platforms";

const WM_DOT: Record<string, string> = {
  remote: "bg-emerald-500",
  hybrid: "bg-amber-500",
  onsite: "bg-sky-500",
};

/** Small colored chip naming the ATS/board this role came from. */
export function PlatformTag({ job }: { job: Job }) {
  const meta = PLATFORM_META[job.platform];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide",
        meta?.tag ?? "border-border bg-muted text-muted-foreground",
      )}
      title={`Source: ${meta?.label ?? job.platform}`}
    >
      {meta?.label ?? job.platform}
    </span>
  );
}

/** Small inline row of meta: platform · work mode · location · posted · salary. */
export function JobMeta({ job, className }: { job: Job; className?: string }) {
  const wm = job.work_mode;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground",
        className,
      )}
    >
      <PlatformTag job={job} />
      {wm && (
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("size-1.5 rounded-full", WM_DOT[wm])} />
          {workModeLabel(wm)}
        </span>
      )}
      <span className="inline-flex items-center gap-1.5">
        <MapPin className="size-3.5 opacity-70" />
        <span className="line-clamp-1 max-w-48">
          {shortLocation(job.location)}
        </span>
      </span>
      {job.posted_date && (
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="size-3.5 opacity-70" />
          {timeAgo(job.posted_date)}
        </span>
      )}
      {job.compensation && (
        <span className="inline-flex items-center gap-1.5 font-medium text-foreground/80">
          <DollarSign className="size-3.5 opacity-70" />
          {job.compensation}
        </span>
      )}
    </div>
  );
}
