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

- `src/app/` — routes and pages (`api/` holds server routes, e.g. `/api/jobs/[slug]`)
- `src/components/` — UI components (job-browser, filters, command-menu, ui/)
- `src/lib/` — data layer: ATS fetchers, caching, types, formatting

## Notes

- No database, no accounts — data is fetched live from public ATS APIs with an in-process 15-min cache.
- 7 platforms, 131 companies registered (Ashby · Greenhouse · Lever · Workday · Apple · SmartRecruiters · Roblox + HiringCafe scraping).

> Global guidelines: ~/.pi/agent/AGENTS.md
