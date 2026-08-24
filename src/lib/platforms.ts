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

/** Distinct platforms present in the current result set, sorted by role count desc. */
export interface PlatformFacet {
  key: string;
  label: string;
  count: number;
}

/** Builds the tab-strip list from the server's per-platform facet counts. */
export function platformFacetsFromCounts(
  counts: Record<string, number>,
): PlatformFacet[] {
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, count]) => ({
      key,
      label: PLATFORM_META[key]?.label ?? key,
      count,
    }));
}

