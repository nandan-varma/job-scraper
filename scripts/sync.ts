/**
 * Sync engine entrypoint — run via `tsx scripts/sync.ts --platform=<x>`.
 *
 * Pulls the sites of one platform that are due (sync_state.next_due_at <=
 * now), fetches each one's COMPLETE listing (FULL_SYNC_CAP — no interactive
 * caps here, since the mark-and-sweep closure logic depends on the fetch
 * being genuinely exhaustive), upserts, and sweeps closed postings — but
 * only on a clean success. A failed fetch never touches closed_at.
 *
 * One code path, shared with the interactive "refresh this company" route:
 * this script and src/app/api/jobs/[slug]/refresh (if added) both call
 * upsertSiteJobs/sweepClosed from src/lib/db/sync-core.ts — there is no
 * second, divergent write path.
 */
import "./_env";

import { randomUUID } from "node:crypto";
import { and, asc, eq, lte } from "drizzle-orm";
import { db } from "../src/lib/db/client";
import { syncState } from "../src/lib/db/schema";
import { syncSite, logSyncAttempt, markSyncSuccess, markSyncFailure } from "../src/lib/db/sync-core";
import { FETCHERS } from "../src/lib/fetchers";
import { SITES } from "../src/lib/sites";

// --- CLI args ----------------------------------------------------------------

function argValue(name: string, fallback?: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const platform = argValue("platform");
if (!platform || !FETCHERS[platform]) {
  console.error(
    `Usage: tsx scripts/sync.ts --platform=<${Object.keys(FETCHERS).join("|")}> [--limit=N] [--concurrency=N] [--force]`,
  );
  process.exit(1);
}
const limit = Number(argValue("limit", "100"));
const concurrency = Number(argValue("concurrency", "4"));
const force = flag("force");

// --- tiering / backoff intervals ---------------------------------------------

const TIER_INTERVAL_MS: Record<number, number> = {
  1: 45 * 60 * 1000, // hot: 45 min
  2: 6 * 60 * 60 * 1000, // normal: 6h
  3: 24 * 60 * 60 * 1000, // cold: 24h
};

function backoffMs(consecutiveFailures: number): number {
  const base = 30 * 60 * 1000; // 30 min
  const capped = Math.min(consecutiveFailures, 8); // cap growth at 2^8
  return Math.min(base * 2 ** capped, 7 * 24 * 60 * 60 * 1000); // cap at 7 days
}

const siteBySlug = new Map(SITES.map((s) => [s.slug, s]));

/**
 * Bookkeeping writes (sync_log/sync_state) must never take down the batch —
 * if the DB itself is the problem (e.g. out of storage), the *next* site's
 * fetch will likely fail too and get logged/skipped on its own turn, but a
 * write failure here must not throw past this point and kill every
 * remaining site in the run.
 */
async function safely(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    console.error(`  !!    ${label} failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// --- one site --------------------------------------------------------------

async function syncOneSite(runId: string, slug: string) {
  const site = siteBySlug.get(slug);
  const startedAt = new Date();
  const t0 = Date.now();

  if (!site) {
    await safely("log", () =>
      logSyncAttempt({
        runId,
        siteSlug: slug,
        platform: platform!,
        startedAt,
        durationMs: Date.now() - t0,
        status: "parse_error",
        error: "site no longer in registry",
      }),
    );
    await safely("mark-failure", () => markSyncFailure(slug));
    return { status: "parse_error" as const, jobsUpserted: 0, jobsClosed: 0 };
  }

  const outcome = await syncSite(site, startedAt);
  const durationMs = Date.now() - t0;

  await safely("log", () =>
    logSyncAttempt({
      runId,
      siteSlug: slug,
      platform: platform!,
      startedAt,
      durationMs,
      status: outcome.status,
      httpStatus: outcome.httpStatus,
      jobsFound: outcome.jobsFound,
      jobsUpserted: outcome.jobsUpserted,
      jobsClosed: outcome.jobsClosed,
      error: outcome.error?.slice(0, 500),
    }),
  );

  if (outcome.ok) {
    await safely("mark-success", () => markSyncSuccess(slug, outcome.jobsFound));
    console.log(
      `  ok    ${slug.padEnd(28)} found=${outcome.jobsFound} upserted=${outcome.jobsUpserted} closed=${outcome.jobsClosed} (${durationMs}ms)`,
    );
  } else {
    await safely("mark-failure", () => markSyncFailure(slug));
    console.log(
      `  FAIL  ${slug.padEnd(28)} ${outcome.status}${outcome.httpStatus ? ` (${outcome.httpStatus})` : ""}: ${(outcome.error ?? "").slice(0, 120)}`,
    );
  }
  return outcome;
}

async function rescheduleSite(slug: string, tier: number, consecutiveFailures: number, ok: boolean) {
  const intervalMs = ok ? (TIER_INTERVAL_MS[tier] ?? TIER_INTERVAL_MS[2]) : backoffMs(consecutiveFailures + 1);
  const nextDueAt = new Date(Date.now() + intervalMs);
  await safely("reschedule", async () => {
    await db.update(syncState).set({ nextDueAt }).where(eq(syncState.siteSlug, slug));
  });
}

// --- main --------------------------------------------------------------------

async function main() {
  const runId = randomUUID();
  const t0 = Date.now();

  const due = await db
    .select()
    .from(syncState)
    .where(
      force
        ? eq(syncState.platform, platform!)
        : and(eq(syncState.platform, platform!), lte(syncState.nextDueAt, new Date())),
    )
    .orderBy(asc(syncState.nextDueAt))
    .limit(limit);

  console.log(
    `sync run ${runId} — platform=${platform} due=${due.length}/${limit} concurrency=${concurrency}${force ? " (forced)" : ""}`,
  );

  if (!due.length) {
    console.log("nothing due — exiting");
    return;
  }

  let idx = 0;
  let okCount = 0;
  let failCount = 0;
  let totalUpserted = 0;
  let totalClosed = 0;

  async function worker() {
    while (idx < due.length) {
      const row = due[idx++];
      const outcome = await syncOneSite(runId, row.siteSlug);
      await rescheduleSite(row.siteSlug, row.tier, row.consecutiveFailures, outcome.status === "ok");
      if (outcome.status === "ok") {
        okCount++;
        totalUpserted += outcome.jobsUpserted;
        totalClosed += outcome.jobsClosed;
      } else {
        failCount++;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, due.length) }, worker));

  const durationMs = Date.now() - t0;
  console.log(
    `sync run ${runId} done — ok=${okCount} failed=${failCount} upserted=${totalUpserted} closed=${totalClosed} (${(durationMs / 1000).toFixed(1)}s)`,
  );

  if (failCount > 0 && okCount === 0) {
    // Every attempted site failed — likely a systemic issue (network, schema
    // drift, credential problem) rather than N unrelated site outages.
    // Exit non-zero so the GH Actions job (and its failure notification) fires.
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error("sync run crashed:", e);
    process.exitCode = 1;
  })
  .finally(() => {
    process.exit(process.exitCode ?? 0);
  });
