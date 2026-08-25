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

/** Source of truth for "which API gives department/salary/etc." */
export const PLATFORM_META: Record<string, PlatformMeta> = {
  ashby: {
    label: "Ashby",
    tag: "border-primary/35 bg-primary/15 text-foreground/70 dark:border-primary/40 dark:bg-primary/15 dark:text-foreground/70",
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
    tag: "border-primary/35 bg-primary/15 text-foreground/70 dark:border-primary/40 dark:bg-primary/15 dark:text-foreground/70",
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
    tag: "border-primary/35 bg-primary/15 text-foreground/70 dark:border-primary/40 dark:bg-primary/15 dark:text-foreground/70",
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
    tag: "border-primary/35 bg-primary/15 text-foreground/70 dark:border-primary/40 dark:bg-primary/15 dark:text-foreground/70",
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
    tag: "border-primary/35 bg-primary/15 text-foreground/70 dark:border-primary/40 dark:bg-primary/15 dark:text-foreground/70",
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
    tag: "border-primary/35 bg-primary/15 text-foreground/70 dark:border-primary/40 dark:bg-primary/15 dark:text-foreground/70",
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
    tag: "border-primary/35 bg-primary/15 text-foreground/70 dark:border-primary/40 dark:bg-primary/15 dark:text-foreground/70",
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
    tag: "border-primary/35 bg-primary/15 text-foreground/70 dark:border-primary/40 dark:bg-primary/15 dark:text-foreground/70",
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
