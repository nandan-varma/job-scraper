/**
 * One-time backfill for jobs.is_us on rows written before that column
 * existed (migration 0002) — pure local computation over data already in
 * the DB (location text), no ATS API calls, no rate-limit exposure.
 *
 * Uses the same substr/instr SQL expression the hot-path query used to run
 * on every request (removed in favor of the precomputed indexed column) —
 * fine to run once as a single UPDATE, not fine as a per-request cost.
 * Run with `tsx scripts/backfill-is-us.ts`.
 */
import "./_env";

import { sql } from "drizzle-orm";
import { db } from "../src/lib/db/client";
import { jobs } from "../src/lib/db/schema";
import { US_KEYWORDS, US_STATE_ABBRS } from "../src/lib/geo";

async function main() {
  const keywordConds = US_KEYWORDS.map(
    (k) => sql`${jobs.location} like ${"%" + k + "%"}`,
  );
  const rest = sql`trim(substr(${jobs.location}, instr(${jobs.location}, ',') + 1))`;
  const stateToken = sql`lower(substr(${rest}, 1, 2))`;
  const tokenIsWholeWord = sql`(length(${rest}) = 2 or substr(${rest}, 3, 1) = ',')`;
  const stateList = sql.join(
    US_STATE_ABBRS.map((abbr) => sql`${abbr}`),
    sql.raw(", "),
  );
  const stateCond = sql`(
    instr(${jobs.location}, ',') > 0
    and ${tokenIsWholeWord}
    and ${stateToken} in (${stateList})
  )`;
  const keywordOr = sql.join(keywordConds, sql.raw(" or "));
  const isUsExpr = sql`(${jobs.location} is not null and (${keywordOr} or ${stateCond}))`;

  console.log("backfilling is_us for all rows...");
  const t0 = Date.now();
  await db.update(jobs).set({ isUs: isUsExpr });
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

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
