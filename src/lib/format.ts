import type { Job, WorkMode } from "./types";

/** "3 days ago" style relative time from a YYYY-MM-DD date. */
export function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr.length === 10 ? dateStr + "T00:00:00Z" : dateStr);
  if (isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < hr) return "just now";
  if (diff < day) return `${Math.max(1, Math.round(diff / hr))}h ago`;
  if (diff < 30 * day) return `${Math.round(diff / day)}d ago`;
  if (diff < 365 * day) return `${Math.round(diff / (30 * day))}mo ago`;
  return `${Math.round(diff / (365 * day))}y ago`;
}

/** Initials from a company name, e.g. "Cursor (Anysphere)" -> "CA". */
export function initials(name: string): string {
  const clean = name.replace(/\(.*?\)/g, "").trim();
  const words = clean.split(/\s+/).filter(Boolean).slice(0, 2);
  const letters = words.map((w) => (w[0] ?? "").toUpperCase());
  return letters.join("") || "?";
}

// Deterministic gradient pair per company so each logo is stable + distinct.
const PALETTE: Array<[string, string]> = [
  ["#6366f1", "#a855f7"], // indigo -> purple
  ["#0ea5e9", "#6366f1"], // sky -> indigo
  ["#8b5cf6", "#ec4899"], // violet -> pink
  ["#10b981", "#0ea5e9"], // emerald -> sky
  ["#f59e0b", "#ef4444"], // amber -> red
  ["#14b8a6", "#6366f1"], // teal -> indigo
  ["#3b82f6", "#06b6d4"], // blue -> cyan
  ["#a855f7", "#f43f5e"], // purple -> rose
  ["#84cc16", "#0ea5e9"], // lime -> sky
  ["#f97316", "#8b5cf6"], // orange -> violet
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function companyGradient(name: string): [string, string] {
  return PALETTE[hashStr(name) % PALETTE.length];
}

export function workModeLabel(wm: WorkMode): string {
  switch (wm) {
    case "remote":
      return "Remote";
    case "hybrid":
      return "Hybrid";
    case "onsite":
      return "On-site";
    default:
      return "On-site";
  }
}

/** Short, title-cased location (strip "United States"). */
export function shortLocation(loc: string | null): string {
  if (!loc) return "Location TBD";
  return loc.replace(/,?\s*United States$/i, "").trim() || "Remote";
}

export function dedupeJobs(jobs: Job[]): Job[] {
  const seen = new Set<string>();
  const out: Job[] = [];
  for (const j of jobs) {
    const key = `${j.site}|${(j.title || "").toLowerCase()}|${(j.location || "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(j);
  }
  return out;
}

export function normalizeQuery(q: string): string {
  return q.toLowerCase().trim().replace(/\s+/g, " ");
}
