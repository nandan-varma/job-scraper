# EveryRole — Live job board

A premium, database-free job browser built with **Next.js (App Router)**, **Tailwind CSS v4**, and **shadcn/ui**. It streams career opportunities **live from company ATS boards** — the source is the source. No database, no accounts.

Look and feel is modeled after the best modern careers sites: a glass hero, a Linear/Anthropic-style **master–detail** browse pane, a global **⌘K** command palette, and full filtering/sorting with dark mode.

## Features

- **Live source data** — fetches directly from public ATS APIs on request (in-process 15-min cache, no DB).
- **7 platforms**, 131 companies registered:
  Ashby · Greenhouse · Lever · Workday · Apple · SmartRecruiters · Roblox (+ HiringCafe HTML scraping).
- **Master–detail UX** — job list on the left, full description/apply pane on the right (desktop), swipe sheet on mobile.
- **Powerful filters** — keyword search, work-mode (Remote / Hybrid / On-site), company picker (load-on-demand), department, sort (newest / company / title), active-filter chips.
- **Paginated + infinite-scroll list** — only ~20 roles render at a time (with auto “load more”), so even 10k+ role sets never freeze the browser; pagination resets on filter change.
- **On-demand descriptions** — list payloads are compact (no megabyte-scale JDs); a role’s full description is fetched via `/api/jobs/[slug]` only when selected, then cached client-side. `Cache-Control` allows 60s edge freshness + stale-while-revalidate.
- **Debounced search** — the expensive filter/sort runs 250ms after you stop typing.
- **⌘K command palette** — instant search across every loaded role.
- **Streaming loads** — the featured set loads progressively in chunks; skeletons and a live role counter tick up.
- **Dark / light / system** theme, deterministic gradient company logos, relative timestamps, salary + location display.

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
```

Production:

```bash
npm run build && npm start
```

> npm scripts may require adding entries to `.npmrc` `allow-scripts` (e.g. `@swc/core`, `sharp`) depending on your npm security config.

## How it works

```
src/
  app/
    page.tsx            # hero + <JobBrowser>
    layout.tsx          # fonts, providers, header/footer
    api/jobs/route.ts   # GET /api/jobs?featured=1 | ?sites=a,b | ?all=1 | &fresh=1
    api/sites/route.ts  # GET /api/sites — the 131-company registry
  lib/
    sites.ts            # generated registry (slug / name / platform / config)
    fetchers.ts         # per-platform scrapers (numbered port of ref fetch.py)
    jobs.ts             # orchestrator + in-memory cache + concurrency pool
    http.ts             # fetch helpers (UA, JSON, text, worker pool)
    html.ts             # HTML -> safe plain text (+ entity decoding)
    format.ts           # timeAgo, initials, gradients, dedupe
    types.ts            # Job / Site / payload types
  components/
    job-browser.tsx     # the browse experience (state, filtering, layout)
    job-card.tsx        # list row
    job-detail.tsx      # description pane / sheet body
    job-meta.tsx        # work-mode · location · posted · salary row
    filters.tsx         # search, work-mode, sort, company & department pickers
    command-menu.tsx    # ⌘K palette
    ...                 # shadcn/ui primitives in components/ui
```

### Data flow (no DB)

1. `JobBrowser` mounts and requests the curated **featured** set in 4-company chunks.
2. Each chunk hits `GET /api/jobs?sites=...`, which resolves to a per-company fetcher
   (`FETCHERS[platform]`) hitting the platform's public API over HTTP.
3. Results are normalized to a single `Job` shape, merged client-side with dedupe,
   filtered/sorted in memory.
4. The server keeps an in-process `Map` cache (15-min TTL) and de-dupes concurrent
   in-flight requests, so repeated loads are instant.
5. `?fresh=1` bypasses the cache (used by the Refresh button).

### Reference

The scrapers are a TypeScript port of
[`job-fetcher/fetch.py`](../job-fetcher/fetch.py) — normalized fields, work-mode
inference, double-escaped Greenhouse HTML handling, Apple hydration-JSON parsing,
and HiringCafe SSR/JSON-LD extraction all follow that reference contract.
Companies are sourced from `job-fetcher/sites.json`.

## Conventions

- `@/*` import alias → `src/*`
- shadcn/ui components, `cn()` util, Tailwind v4 CSS variables in `globals.css`
- Data-shape safety: every recorded job is normalized to `Job` (see `types.ts`)
