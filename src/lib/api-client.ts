import type { Job, JobsPayload } from "./types";

/** Client-side helper to request jobs from the API route. */
export async function fetchJobs(
  opts: {
    sites?: string[];
    featured?: boolean;
    all?: boolean;
    fresh?: boolean;
  } = {},
): Promise<JobsPayload> {
  const params = new URLSearchParams();
  if (opts.all) params.set("all", "1");
  else if (opts.featured) params.set("featured", "1");
  else if (opts.sites?.length) params.set("sites", opts.sites.join(","));
  if (opts.fresh) params.set("fresh", "1");

  const res = await fetch(`/api/jobs?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to load jobs (${res.status})`);
  return res.json();
}

/** Load the full detail (description) for a single role, on demand. */
export async function fetchJobDetail(
  slug: string,
  id: string,
): Promise<Job | null> {
  const res = await fetch(
    `/api/jobs/${encodeURIComponent(slug)}?id=${encodeURIComponent(id)}`,
  );
  if (!res.ok) return null;
  const data = await res.json();
  return (data as { job?: Job }).job ?? null;
}

export async function fetchSitesRegistry(): Promise<{
  count: number;
  sites: Array<{ slug: string; name: string; platform: string }>;
}> {
  const res = await fetch("/api/sites");
  if (!res.ok) throw new Error("Failed to load sites");
  return res.json();
}
