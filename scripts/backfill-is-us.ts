/**
 * One-time backfill for jobs.is_us after a geo.ts heuristic change — rows
 * are only recomputed on their next successful sync (toRow() in
 * sync-core.ts), so a heuristic fix doesn't reach rows belonging to sites
 * that sync infrequently or are currently failing without this.
 *
 * Recomputes in JS via the real isUSLocation(), not a hand-rolled SQL port
 * of it (the previous version of this script did that, duplicating the
 * logic — see geo.ts's "one definition of 'US location', not two that can
 * drift apart" note). Only issues an UPDATE for rows whose value actually
 * changes.
 *
 * Run with `tsx scripts/backfill-is-us.ts`.
 */
import "./_env";

import { eq, sql } from "drizzle-orm";
import { db } from "../src/lib/db/client";
import { jobs } from "../src/lib/db/schema";
import { isUSLocation } from "../src/lib/geo";

const PAGE_SIZE = 5000;
const UPDATE_BATCH = 500;

async function main() {
  let lastId = 0;
  let scanned = 0;
  let changed = 0;
  const t0 = Date.now();

  for (;;) {
    const page = await db
      .select({ id: jobs.id, location: jobs.location, isUs: jobs.isUs })
      .from(jobs)
      .where(sql`${jobs.id} > ${lastId}`)
      .orderBy(jobs.id)
      .limit(PAGE_SIZE);
    if (!page.length) break;

    const toUpdate = page.filter(
      (row) => isUSLocation(row.location) !== row.isUs,
    );
    for (let i = 0; i < toUpdate.length; i += UPDATE_BATCH) {
      const chunk = toUpdate.slice(i, i + UPDATE_BATCH);
      await Promise.all(
        chunk.map((row) =>
          db
            .update(jobs)
            .set({ isUs: isUSLocation(row.location) })
            .where(eq(jobs.id, row.id)),
        ),
      );
    }

    scanned += page.length;
    changed += toUpdate.length;
    lastId = page[page.length - 1].id;
    console.log(`scanned ${scanned}, changed ${changed}...`);
  }

  console.log(
    `done in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${changed}/${scanned} rows changed`,
  );

  const [{ us }] = await db
    .select({ us: sql<number>`count(*) filter (where ${jobs.isUs})` })
    .from(jobs);
  const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(jobs);
  console.log(`is_us=true: ${us} / ${total} rows`);
  process.exit(0);
}

main().catch((e) => {
  console.error("backfill failed:", e);
  process.exit(1);
});
