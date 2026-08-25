import Link from "next/link";
import { ArrowLeft, CircleAlert, CircleCheck } from "lucide-react";
import {
  overallStatus,
  platformStatuses,
  recentFailures,
} from "@/lib/db/status-queries";
import { PLATFORM_META } from "@/lib/platforms";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/format";

// Dashboard, not a live ticker — matches the in-memory query cache's TTL
// (src/lib/db/cache.ts) so a fresh ISR regeneration still gets cache hits.
export const revalidate = 60;
export const metadata = { title: "Sync status — EveryRole" };

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export default async function StatusPage() {
  const [overall, platforms, failures] = await Promise.all([
    overallStatus(),
    platformStatuses(),
    recentFailures(30),
  ]);

  const pct = (n: number, total: number) =>
    total ? Math.round((n / total) * 100) : 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Back to jobs
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        Sync engine status
      </h1>
      <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
        Jobs are kept fresh by a scheduled background sync, not fetched live per
        request. Each site is re-synced on its own cadence — popular companies
        every ~45 min, the rest a few times a day — and a posting is only ever
        removed once a completed sync confirms it&apos;s gone from the source.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Open roles"
          value={overall.totalOpenJobs.toLocaleString()}
        />
        <StatCard
          label="Companies tracked"
          value={overall.companiesTracked.toLocaleString()}
        />
        <StatCard
          label="Synced in last 24h"
          value={`${pct(overall.companiesSyncedLast24h, overall.companiesTracked)}%`}
          hint={`${overall.companiesSyncedLast24h.toLocaleString()} companies`}
        />
        <StatCard
          label="Closed in last 24h"
          value={overall.closedLast24h.toLocaleString()}
          hint="postings removed after confirmed gone"
        />
      </div>

      <h2 className="mt-10 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        By platform
      </h2>
      <div className="mt-3 overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Platform</th>
              <th className="px-4 py-2.5 text-right font-medium">Sites</th>
              <th className="px-4 py-2.5 text-right font-medium">
                Synced &lt;24h
              </th>
              <th className="px-4 py-2.5 text-right font-medium">
                Never synced
              </th>
              <th className="px-4 py-2.5 text-right font-medium">Failing</th>
              <th className="px-4 py-2.5 text-right font-medium">Open roles</th>
              <th className="px-4 py-2.5 text-right font-medium">
                Last synced
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {platforms.map((p) => (
              <tr key={p.platform}>
                <td className="px-4 py-2.5 font-medium">
                  {PLATFORM_META[p.platform]?.label ?? p.platform}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {p.sitesTracked.toLocaleString()}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {pct(p.syncedLast24h, p.sitesTracked)}%
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                  {p.neverSynced || "—"}
                </td>
                <td
                  className={cn(
                    "px-4 py-2.5 text-right tabular-nums",
                    p.failing > 0 &&
                      "font-medium text-amber-600 dark:text-amber-400",
                  )}
                >
                  {p.failing || "—"}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {p.openJobs.toLocaleString()}
                </td>
                <td className="px-4 py-2.5 text-right text-muted-foreground">
                  {p.lastSuccessAt ? timeAgo(p.lastSuccessAt) : "never"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        Recent sync issues
      </h2>
      {failures.length === 0 ? (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
          <CircleCheck className="size-4 text-primary" />
          No failed sync attempts in the recent log.
        </div>
      ) : (
        <div className="mt-3 space-y-1.5">
          {failures.map((f, i) => (
            <div
              key={`${f.siteSlug}-${f.startedAt}-${i}`}
              className="flex items-start gap-2.5 rounded-lg border px-3 py-2 text-xs"
            >
              <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium">{f.siteSlug}</span>
                  <Badge className="border-border bg-muted text-muted-foreground">
                    {PLATFORM_META[f.platform]?.label ?? f.platform}
                  </Badge>
                  <span className="text-muted-foreground">
                    {f.status}
                    {f.httpStatus ? ` (${f.httpStatus})` : ""}
                  </span>
                  <span className="ml-auto shrink-0 text-muted-foreground">
                    {timeAgo(f.startedAt)}
                  </span>
                </div>
                {f.error && (
                  <p className="mt-0.5 truncate text-muted-foreground">
                    {f.error}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
