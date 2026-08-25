# CLAUDE.md

EveryRole — a job board (Next.js App Router) backed by a Turso/libSQL database
that's kept fresh by a scheduled sync engine, not by live per-request ATS calls.
Full product docs exist in `README.md` and `AGENTS.md`, but both still describe
the old "database-free, live-fetch, in-process 15-min cache" architecture — that
was fully replaced by the Drizzle/Turso sync engine; trust this file and the code
over those two for anything related to data flow.

## Commands
- Dev server: `npm run dev` (Turbopack, http://localhost:3000)
- Build: `npm run build`
- Start (prod): `npm run start`
- Lint: `npm run lint` (eslint flat config, `eslint-config-next`)
- Typecheck: `npx tsc --noEmit` (no separate script defined)
- No test suite/framework is configured in this repo.
- DB schema changes: edit `src/lib/db/schema.ts`, then `npx drizzle-kit generate`
  (writes to `drizzle/`) and `npx drizzle-kit migrate` — `drizzle.config.ts` reads
  `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` from `.env.local` via `dotenv`.
- Manual sync run: `npx tsx scripts/sync.ts --platform=<ashby|greenhouse|...>`
  (same code path GH Actions cron and the "refresh this company" API route use —
  see `src/lib/db/sync-core.ts`).

## Architecture
- **Not database-free anymore.** Reads (`src/lib/jobs.ts`, `src/lib/db/queries.ts`)
  come from Turso; writes happen only through `src/lib/db/sync-core.ts`
  (`syncSite` / `upsertSiteJobs` / `sweepClosed`), invoked by `scripts/sync.ts` on
  a GH Actions cron (`.github/workflows/sync.yml`) and by the on-demand
  "refresh this company" path (`refreshSite` in `jobs.ts`). There is deliberately
  one write path — don't add a second one that calls the ATS fetchers directly.
- `src/lib/db/schema.ts` — Drizzle `sqlite-core` schema (`jobs`, `sync_state`,
  `sync_log`). No `raw_json`/`raw_html` columns — dropped during the Neon→Turso
  migration since they were unused by the UI and were the majority of row
  storage. `jobs.isUs`, `departmentCategory`, `employmentTypeCategory` are
  precomputed/indexed at sync time (see below), not derived at query time.
- Mark-and-sweep closure: `sweepClosed` only runs after a **clean, non-empty**
  `syncSite` success — a failed or empty fetch must never touch `closed_at`, or
  a transient ATS outage would look like every role at that company closing.
- `src/lib/geo.ts` (`isUSLocation`), `src/lib/department-category.ts`
  (`categorizeDepartment`), `src/lib/employment-type.ts`
  (`categorizeEmploymentType`) are keyword-based and deliberately conservative —
  they leave a value uncategorized rather than force an uncertain match. They're
  called from `toRow()` in `sync-core.ts` at write time, not in read queries.
- `src/lib/db/cache.ts` — module-scoped TTL cache on top of `lru-cache`,
  storing the in-flight `Promise` (not the resolved value) per key so
  concurrent requests for the same key share one `compute()` call instead of
  stampeding it; `queries.ts` wraps `browseJobs`/`browseFacets` in it
  (`FACETS_TTL_MS`), `status-queries.ts` wraps platform/status queries in it
  (`STATUS_TTL_MS`). This is what keeps Turso HTTP round-trip counts down —
  don't bypass it by querying the db client directly from a new route without
  checking whether `queries.ts`/`status-queries.ts` already has (or should
  have) a cached accessor.
- Filter state (`src/components/job-browser.tsx`) lives in the URL via
  `nuqs`'s `useQueryStates`, not `useState` — makes filtered views shareable
  and back/forward-navigable. `Filters` itself still uses `Set<string>` for
  multi-value fields (matches `db/queries.ts`/`api-client.ts` everywhere
  else); `toFilters`/`fromFilters` in `job-browser.tsx` convert at the URL
  (array) boundary. Add a new multi-value filter to `filterParsers` there,
  not as a fresh `useState`.
- **`PAGE_SIZE` lives in `src/lib/filtering.ts`, not in a `"use client"` file.**
  A Server Component importing a plain constant from a client-boundary module
  can silently get `undefined` across that boundary; that exact bug once made
  `browseJobs()` drop its `LIMIT` and serialize the entire ~200k-row table on
  every homepage request. Keep any constant a Server Component needs to import
  in a plain (non-`"use client"`) module.
- `src/lib/filtering.ts` no longer contains matching/counting logic (no
  `jobMatches`/`facetCounts` here) — it's just the shared `Filters` type/UI
  constants. The actual filter application and facet counting is server-side in
  `src/lib/db/queries.ts` (`computeBrowseJobs`, `computeBrowseFacets`) — that's
  the single source of truth now. Adding a filter dimension means updating
  `Filters`/`DEFAULT_FILTERS` (`filtering.ts`), `BrowseFilters`/`FacetCounts`
  (`db/queries.ts`), `browseParams` (`api-client.ts`), the API route parsing
  (`app/api/jobs/route.ts`), and the UI (`components/filters.tsx`).
- `src/lib/sites.ts` is a **generated** registry (~8.5k companies) — don't
  hand-edit entries; regenerate/extend per sourcing notes in commit history for
  `sites.ts` (LastRound ATS directory, outscal/OpenJobs).
- `src/lib/featured.ts` — `FEATURED` + `STARTER_PACKS` (curated company slugs per
  category). Slugs are resolved by exact match against `sites.ts`; when adding
  companies, verify the slug/name pair actually refers to the intended company
  (registry has near-miss collisions, e.g. "Wiz" the security co. vs. an
  unrelated "Wizard").
- Scrapers in `src/lib/fetchers.ts` are a TS port of a sibling repo's
  `job-fetcher/fetch.py` reference implementation (`../job-fetcher` if present
  alongside this repo) — keep field normalization/work-mode inference in sync
  with that contract when touching a fetcher.
- `src/lib/platforms.ts` (`PLATFORM_META`) declares which fields each ATS
  actually provides (department, salary, work_mode, etc.) — the UI conditionally
  shows filters based on this instead of assuming every source has every field.

## Conventions
- `@/*` → `src/*` (see `tsconfig.json` paths).
- shadcn/ui config is `style: radix-nova` (`components.json`); use the existing
  `cn()` util and Tailwind v4 CSS variables in `globals.css` rather than new ad hoc
  color values.
- `AGENTS.md` has an auto-generated block (`BEGIN:nextjs-agent-rules`) that
  `next dev` rewrites on every run — leave it in place and commit it as-is; don't
  hand-edit that block.
- ESLint's `react-hooks/set-state-in-effect` rule fires on `setState` inside a
  `useEffect` that reads previous state via a conditional updater (e.g.
  `prev.x === y ? ... : prev`). Guard one-time effect-driven state changes with a
  `useRef` flag instead of a conditional functional updater.
- `.npmrc` has `allow-scripts` pinned for native deps (`@swc/core`, `sharp`,
  `@tailwindcss/oxide`, etc.) — if `npm install` skips a postinstall step you need,
  check there first before disabling script blocking globally.
- SQLite/libSQL (Turso) constraints that matter when touching queries: no regex
  operator, a ~100-deep expression tree limit (a wide OR chain can blow this —
  use an indexed column or `IN`/`substr` instead), `IS NOT` for null-safe
  distinctness (Postgres `IS DISTINCT FROM` equivalent), no `now()`/`interval`
  (bind JS `Date` objects), partial indexes need an explicit `WHERE`.
- Any DB write path (sync scripts especially) should treat secondary writes
  (logging a sync attempt/failure) as best-effort — wrap in something like
  `sync.ts`'s `safely()` helper. A prior incident: a failed job write triggered a
  failure-log write that *also* failed (DB out of space), and the unhandled
  second failure crashed the whole batch instead of just skipping that site.
