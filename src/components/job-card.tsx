"use client";

import { memo } from "react";
import type { Job } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CompanyLogo } from "./company-logo";
import { JobMeta } from "./job-meta";

interface Props {
  job: Job;
  selected: boolean;
  onSelect: (job: Job) => void;
  index?: number;
}

/** A single job row in the browse list (master pane). */
function JobCardInner({ job, selected, onSelect, index }: Props) {
  return (
    <button
      type="button"
      onClick={() => onSelect(job)}
      data-index={index}
      className={cn(
        "group relative w-full rounded-xl border p-4 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-primary/40 bg-accent/40 shadow-sm"
          : "border-border bg-card hover:border-primary/25 hover:bg-accent/30 hover:shadow-sm",
      )}
      aria-current={selected ? "true" : undefined}
    >
      <div className="flex items-start gap-3.5">
        <CompanyLogo name={job.company} size="md" className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground group-hover:underline">
              {job.title}
            </h3>
          </div>
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            {job.company}
            {job.department ? (
              <span className="text-muted-foreground/70">
                {" "}
                · {job.department}
              </span>
            ) : null}
          </p>
          <JobMeta job={job} className="mt-2.5" />
        </div>
      </div>
    </button>
  );
}

export const JobCard = memo(JobCardInner);
