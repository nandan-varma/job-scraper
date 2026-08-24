# CLAUDE.md

EveryRole — database-free live job board (Next.js App Router) that streams roles
directly from company ATS APIs. Full architecture/data-flow docs already exist in
`README.md` and `AGENTS.md` — read those first; this file only covers what they don't.

## Commands
- Dev server: `npm run dev` (Turbopack, http://localhost:3000)
- Build: `npm run build`
- Start (prod): `npm run start`
- Lint: `npm run lint` (eslint flat config, `eslint-config-next`)
- Typecheck: `npx tsc --noEmit` (no separate script defined)
- No test suite/framework is configured in this repo.

## Architecture
- No database: everything is fetched live from public ATS APIs
  (`src/lib/fetchers.ts`) and cached in-process for 15 min (`src/lib/jobs.ts`).
- `src/lib/sites.ts` is a **generated** registry (~8.5k companies) — don't hand-edit
  entries; regenerate/extend per the sourcing notes in memory / commit history
  (LastRound ATS directory, outscal/OpenJobs — see commit history for `sites.ts`).
- Scrapers in `src/lib/fetchers.ts` are a TS port of a sibling repo's
  `job-fetcher/fetch.py` reference implementation (`../job-fetcher` if present
  alongside this repo) — keep field normalization/work-mode inference in sync with
  that contract when touching a fetcher.
- Filtering/faceting logic lives in `src/lib/filtering.ts`, not in the components —
  `jobMatches` / `jobMatchesRelaxed` / `facetCounts` are the single source of truth
  for how a filter dimension is applied and counted. Adding a new filter means
  updating all three plus `Filters`/`DEFAULT_FILTERS`, not just the UI.
- `src/lib/platforms.ts` (`PLATFORM_META`) declares which fields each ATS actually
  provides (department, salary, work_mode, etc.) — the UI conditionally shows
  filters based on this instead of assuming every source has every field.

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
