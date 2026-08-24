import type { Job } from "./types";

/**
 * Static metadata about every job platform we can fetch from — what the
 * underlying API does (and doesn't) expose. Lets the UI explain data
 * availability instead of showing filters that silently do nothing.
 */
export interface PlatformMeta {
  label: string;
  /** Tailwind classes for the tag chip on rows/cards. */
  tag: string;
  provide: {
    location: boolean;
    department: boolean;
    work_mode: boolean;
    salary: boolean;
    posted: boolean;
    description: boolean;
  };
}

export type ProvideKey = keyof PlatformMeta["provide"];

/** Source of truth for "which API gives department/salary/etc." */
export const PLATFORM_META: Record<string, PlatformMeta> = {
  ashby: {
    label: "Ashby",
    tag: "border-indigo-400/40 bg-indigo-50 text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300",
    provide: {
      location: true,
      department: true,
      work_mode: false,
      salary: true,
      posted: true,
      description: true,
    },
  },
  greenhouse: {
    label: "Greenhouse",
    tag: "border-emerald-400/40 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
    provide: {
      location: true,
      department: true,
      work_mode: true,
      salary: false,
      posted: true,
      description: true,
    },
  },
  lever: {
    label: "Lever",
    tag: "border-amber-400/40 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
    provide: {
      location: true,
      department: true,
      work_mode: false,
      salary: false,
      posted: true,
      description: true,
    },
  },
  workday: {
    label: "Workday",
    tag: "border-blue-400/40 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300",
    provide: {
      location: true,
      department: true,
      work_mode: false,
      salary: false,
      posted: true,
      description: true,
    },
  },
  apple: {
    label: "Apple",
    tag: "border-zinc-400/50 bg-zinc-100 text-zinc-700 dark:border-zinc-500/40 dark:bg-zinc-500/10 dark:text-zinc-300",
    provide: {
      location: true,
      department: true,
      work_mode: false,
      salary: false,
      posted: true,
      description: true,
    },
  },
  smartrecruiters: {
    label: "SmartRecruiters",
    tag: "border-violet-400/40 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300",
    provide: {
      location: true,
      department: true,
      work_mode: true,
      salary: false,
      posted: true,
      description: true,
    },
  },
  roblox: {
    label: "Roblox",
    tag: "border-orange-400/40 bg-orange-50 text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-300",
    provide: {
      location: true,
      department: true,
      work_mode: false,
      salary: false,
      posted: false,
      description: false,
    },
  },
  hiringcafe: {
    label: "HiringCafe",
    tag: "border-fuchsia-400/40 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-500/30 dark:bg-fuchsia-500/10 dark:text-fuchsia-300",
    provide: {
      location: true,
      department: false,
      work_mode: true,
      salary: true,
      posted: true,
      description: true,
    },
  },
};

export const FIELD_LABELS: Record<ProvideKey, string> = {
  location: "Location",
  department: "Department",
  work_mode: "Work mode",
  salary: "Salary",
  posted: "Posted",
  description: "Description",
};

export function platformMeta(platform: string): PlatformMeta | undefined {
  return PLATFORM_META[platform];
}

/** Every supported job-provider platform, in display order. */
export const ALL_PROVIDERS = Object.keys(PLATFORM_META);

/** A single field's availability over a loaded job set. */
export interface FieldCoverage {
  available: number;
  total: number;
  /** 0..1 */
  pct: number;
}

export type Coverage = Record<ProvideKey, FieldCoverage>;

function cov(available: number, total: number): FieldCoverage {
  return { available, total, pct: total ? available / total : 0 };
}

/** Observable field coverage across the currently loaded job set. */
export function computeCoverage(jobs: Job[]): Coverage {
  let location = 0,
    department = 0,
    work_mode = 0,
    salary = 0,
    posted = 0,
    description = 0;
  for (const j of jobs) {
    if (j.location) location++;
    if (j.department) department++;
    if (j.work_mode) work_mode++;
    if (j.compensation) salary++;
    if (j.posted_date) posted++;
    // List payloads carry compact jobs: full desc is fetched on demand, but
    // `hasDescription` tells us the source *does* provide one.
    if (j.description || j.hasDescription) description++;
  }
  const total = jobs.length || 1;
  return {
    location: cov(location, total),
    department: cov(department, total),
    work_mode: cov(work_mode, total),
    salary: cov(salary, total),
    posted: cov(posted, total),
    description: cov(description, total),
  };
}

/** Distinct platforms present in the loaded set, sorted by role count desc. */
export interface PlatformFacet {
  key: string;
  label: string;
  count: number;
}

export function platformFacets(jobs: Job[]): PlatformFacet[] {
  const counts = new Map<string, number>();
  for (const j of jobs) {
    counts.set(j.platform, (counts.get(j.platform) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, count]) => ({
      key,
      label: PLATFORM_META[key]?.label ?? key,
      count,
    }));
}

/** How many distinct platforms in `platforms` advertise this field. */
export function platformsProviding(
  platforms: PlatformFacet[],
  field: ProvideKey,
): number {
  return platforms.filter((p) => PLATFORM_META[p.key]?.provide[field]).length;
}

/** Percent (0-100) of roles that carry this field. */
export function pct(c: FieldCoverage): number {
  return Math.round(c.pct * 100);
}
