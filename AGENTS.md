# AGENTS.md

## Project

EveryRole — database-free live job board streaming career opportunities from company ATS boards (Next.js App Router).

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS v4 + shadcn/ui (radix-ui, tw-animate-css)
- npm

## Commands

- `npm run dev` — next dev
- `npm run build` — next build
- `npm run start` — next start
- `npm run lint` — eslint

## Structure

- `src/app/` — routes and pages (`api/` holds server routes; `companies/[slug]` is a per-company view with tailored filters)
- `src/components/` — UI (job-browser, company-picker, company-view, filters, ui/)
- `src/lib/` — data layer: ATS fetchers, caching, types, formatting, platform capability map (`platforms.ts`)

## Architecture / Performance

- **Server-driven browse**: `/api/sites?q=` does instant company search over the ~8.5k registry; `/api/jobs` supports `q` (search), `platforms` (provider filter), and `page`/`perPage` (pagination) — the client never holds the whole registry or gigabytes of roles in memory.
- Company pages seed page 1 server-side, then paginate progressively.
- **Provider selector** (Sources chips) picks which job APIs are active; filters appear only when the source provides that field (see `platforms.ts`).

## Notes

- No database, no accounts — data is fetched live from public ATS APIs with an in-process 15-min cache.
- 7 platforms, 8,149 companies registered (Ashby · Greenhouse · Lever · Workday · Apple · SmartRecruiters · Roblox + HiringCafe scraping). Bulk-registered from the LastRound ATS Company Directory (public Greenhouse/Ashby/Lever board APIs), each entry live-verified via `scripts/verify-board.sh`.

> Global guidelines: ~/.pi/agent/AGENTS.md

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
