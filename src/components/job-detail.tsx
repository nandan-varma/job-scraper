"use client";

import {
  ArrowUpRight,
  Building2,
  CalendarDays,
  ExternalLink,
  MapPin,
} from "lucide-react";
import type { Job } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { CompanyLogo } from "./company-logo";
import { JobMeta } from "./job-meta";
import { timeAgo } from "@/lib/format";

/** Right-hand detail pane showing the full job. Render inside scroll area. */
export function JobDetail({ job, loading }: { job: Job; loading?: boolean }) {
  const posted = job.posted_date ? timeAgo(job.posted_date) : null;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start gap-4 p-6 pb-4">
        <CompanyLogo name={job.company} size="xl" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-primary">{job.company}</p>
          <h2 className="mt-0.5 text-xl font-semibold leading-tight tracking-tight text-foreground">
            {job.title}
          </h2>
        </div>
        <a
          href={job.url ?? job.apply_url ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open original posting"
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <ExternalLink className="size-5" />
        </a>
      </div>

      <div className="flex flex-wrap gap-2 px-6">
        {job.work_mode ? (
          <Badge variant="secondary" className="capitalize">
            {job.work_mode}
          </Badge>
        ) : null}
        {job.department ? (
          <Badge variant="outline">{job.department}</Badge>
        ) : null}
        {job.compensation ? (
          <Badge variant="outline">{job.compensation}</Badge>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 px-6 text-xs text-muted-foreground">
        {job.location ? (
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-3.5" /> {job.location}
          </span>
        ) : null}
        {posted ? (
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-3.5" /> Posted {posted}
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1.5">
          <Building2 className="size-3.5" /> {job.company}
        </span>
      </div>

      <div className="px-6 pt-5">
        <Button asChild size="lg" className="w-full">
          <a
            href={job.apply_url ?? job.url ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
          >
            Apply on {job.company}
            <ArrowUpRight className="size-4" />
          </a>
        </Button>
      </div>

      <Separator className="mt-6" />

      <div className="scroll-area flex-1 overflow-y-auto px-6 py-5">
        {loading && !job.description ? (
          <div className="space-y-3">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-11/12" />
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ) : job.description ? (
          <div className="job-prose">{job.description}</div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No description provided for this role on the source board.
          </p>
        )}
      </div>

      <Separator />
      <div className="flex items-center justify-between gap-2 p-4 text-xs text-muted-foreground">
        <JobMeta job={job} />
        <a
          href={job.url ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 font-medium text-primary hover:underline"
        >
          Source <ArrowUpRight className="size-3" />
        </a>
      </div>
    </div>
  );
}
