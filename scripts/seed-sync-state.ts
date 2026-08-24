/**
 * Seed/refresh sync_state from sites.ts — the static, git-versioned company
 * registry stays the single source of truth for which companies exist;
 * this just keeps the scheduler's per-site rows in sync with it.
 *
 * Idempotent: re-running after sites.ts changes updates tier/platform for
 * existing rows without touching their last_success_at/consecutive_failures/
 * next_due_at history, and inserts fresh rows (due immediately) for any new
 * site. Run with `tsx scripts/seed-sync-state.ts`.
 */
import "./_env";

import { sql } from "drizzle-orm";
import { db } from "../src/lib/db/client";
import { syncState } from "../src/lib/db/schema";
import { FEATURED, STARTER_PACKS } from "../src/lib/featured";
import { SITES } from "../src/lib/sites";

const TIER1 = new Set<string>([
  ...FEATURED,
  ...STARTER_PACKS.flatMap((p) => p.slugs),
]);

const BATCH = 500;

async function main() {
  // sites.ts has one known slug collision (springernature: smartrecruiters +
  // workday, two distinct companies) — dedupe defensively so a generated-file
  // data bug can't crash the seed. First occurrence wins; see AGENTS.md/commit
  // history for sites.ts regeneration if this needs a real fix upstream.
  const bySlug = new Map<string, (typeof SITES)[number]>();
  for (const s of SITES) if (!bySlug.has(s.slug)) bySlug.set(s.slug, s);
  if (bySlug.size !== SITES.length) {
    console.warn(
      `warning: sites.ts has ${SITES.length - bySlug.size} duplicate slug(s) — kept first occurrence only`,
    );
  }

  const rows = [...bySlug.values()].map((s) => ({
    siteSlug: s.slug,
    platform: s.platform,
    tier: TIER1.has(s.slug) ? 1 : 2,
  }));

  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    await db
      .insert(syncState)
      .values(chunk)
      .onConflictDoUpdate({
        target: syncState.siteSlug,
        set: {
          platform: sql`excluded.platform`,
          tier: sql`excluded.tier`,
        },
      });
    inserted += chunk.length;
    console.log(`  seeded ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }

  const [{ count: tier1 }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(syncState)
    .where(sql`tier = 1`);
  const [{ count: total }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(syncState);

  console.log(`done — ${inserted} sites processed, ${total} total in sync_state (${tier1} tier-1)`);
  process.exit(0);
}

main().catch((e) => {
  console.error("seed failed:", e);
  process.exit(1);
});
