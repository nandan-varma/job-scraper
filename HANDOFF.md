# Handoff — expanding the company registry (2026-08-24/25)

Session goal: find major companies missing from `src/lib/sites.ts` and add
them, reverse-engineering their ATS where needed. ~50 companies added this
session. Picking this back up: delete this file once its content is no
longer needed, don't let it go stale.

## What shipped

**New platform: Oracle Cloud Recruiting** (Fusion HCM "Candidate
Experience"). Added `fetchOracleCloud` in `src/lib/fetchers.ts`, the
`oraclecloud` entry in `src/lib/platforms.ts`, and `OracleCloudConfig` /
`Site.oracleCloud` in `src/lib/types.ts`. Confirmed end-to-end (real fetcher
call, not just curl) for: Oracle, JPMorgan Chase, Dell, Honeywell, Kroger,
Hilton, Molina Healthcare, Tenet Healthcare.

**~42 new Workday entries** — Target, Samsung, Bank of America, Citi, AT&T,
Comcast, Boeing, Nike, Pfizer, Merck, Home Depot, HPE, Palo Alto Networks,
Capital One, State Street, Elevance Health, Cisco, Southwest Airlines,
Procter & Gamble, CVS Health, Lowe's, Travelers, USAA, General Mills,
Barclays, Cigna, Stryker, BD, Abbott, Gilead, Amgen, Bristol Myers Squibb,
Nordstrom, Gap, Clorox, Kohl's, VF Corporation, Tapestry, KLA, Adient, U.S.
Bank, KeyBank.

All additions were verified two ways before landing in `sites.ts`: (1) a raw
curl POST to the vendor's own jobs API returning a real `total`/`title`, and
(2) an actual call through the project's own fetcher function
(`fetchWorkday`/`fetchOracleCloud`) from a throwaway script — not just "the
API responds," but "our code parses it correctly." Throwaway scripts were
always deleted after use; no debug scaffolding left in the repo.

## The discovery technique (reusable for the next batch)

1. Check if the company name/slug is already in `sites.ts` — by **name
   substring**, not slug guessing. Some existing entries use non-obvious
   slugs (Box → `boxinc`, DoorDash → `doordashusa`, TikTok's parent →
   `bytedance`).
2. `curl -sL -A "Mozilla/5.0" <careers-url> | grep -oiE
   "myworkdayjobs\.com|\.fa\.[a-z0-9]*\.oraclecloud\.com|boards\.greenhouse\.io|jobs\.lever\.co|smartrecruiters\.com|jobs\.ashbyhq\.com"`
   against the company's real careers page. Cheap, reliable for
   server-rendered pages; **returns nothing for heavy client-side SPAs**
   (Walmart, IBM, VMware, Shopify, Atlassian, Google/Meta/Microsoft/Amazon/
   Netflix/Tesla all fell into this bucket and are still unconfirmed).
3. For a Workday hit: re-curl the page and grep for the full URL pattern
   `[a-zA-Z0-9_.-]*\.wd[0-9]+\.myworkdayjobs\.com/[a-zA-Z0-9_/-]*` to get
   `tenant`/`wd`/`site`. Verify with a direct POST to
   `https://{tenant}.{wd}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs`.
4. For an Oracle Cloud hit: grep for `*.fa.*.oraclecloud.com` (native) or
   follow a **custom domain** that proxies the same product (Dell's
   `enterpriseplatform.dell.com` never shows a raw oraclecloud.com string —
   its own domain *is* the API host). Get `siteNumber` from a `sites/`
   fragment in an href, then verify with:
   `https://{host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList&finder=findReqs;siteNumber={siteNumber},limit=2,offset=0,keyword=manager`
   — **must include `expand=requisitionList`** or `TotalJobsCount` won't
   show up in the response the way you expect. `sitePath` (used in public
   job URLs, `/hcmUI/CandidateExperience/en/sites/{sitePath}/job/{id}`) is
   **not always equal to `siteNumber`** — Oracle itself uses `jobsearch`,
   Dell uses `careers`, but JPMC/Kroger/Hilton/Molina/Tenet all happen to
   reuse the siteNumber as the path too. Confirm both independently; don't
   assume.
5. **A branded "career site" front end doesn't imply a custom backend.**
   Cisco's site is skinned with Phenom People, but its actual apply links
   resolve to `cisco.wd5.myworkdayjobs.com` — plain Workday underneath. This
   was the single highest-leverage discovery this session: instead of
   reverse-engineering Phenom's widget POST API (rabbit-holed on this for a
   while — minified Vue bundles, SSR-only JSON blobs), just grep the
   rendered HTML for `"applyUrl":"..."` and see what ATS it actually points
   to. Found Warner Bros Discovery, Southwest, P&G, CVS Health, and Lowe's
   this way too, all "Phenom-skinned but Workday underneath."
6. After adding entries: `npx tsx scripts/seed-sync-state.ts` (idempotent,
   safe to rerun — inserts fresh `sync_state` rows for new slugs without
   touching existing rows' history) then
   `npx tsx scripts/sync.ts --platform=<workday|oraclecloud>` to populate
   the DB. New sites won't sync until seeded — `sync.ts` only pulls from
   `sync_state`, not `sites.ts` directly.

## Known false positive

Meta (`metacareers.com`) showed a loose `myworkdayjobs.com` string hit in
one grep pass but **failed** the stricter full-URL-pattern check — don't
trust the loose signature alone, always confirm with the tenant-URL regex
and a live API call before adding anything.

## Not yet resolved — where to pick up next

- **Fully custom, no reusable vendor**: Walmart (`careers.walmart.com/api/graphql`,
  in-house Next.js/GraphQL — has its own `applyUrl` scheme too, not Workday).
- **JS-heavy SPAs, curl saw nothing** — need real browser network inspection
  (slow/flaky last time; see below): IBM, VMware, Shopify, Atlassian, Slack,
  EA, TikTok, Snap, Chase's own marketing wrapper (found via JPMC though),
  Goldman Sachs, Morgan Stanley, Marriott (Oracle Cloud only handles its
  sign-in, not job search — actual search backend still unknown).
- **Confirmed vendor, no fetcher built yet** (each is a real new-platform
  build, like Oracle Cloud was): SAP SuccessFactors (SAP, Under Armour),
  Avature (Intuit, also seen on BofA/Boeing/Nike as a secondary vendor —
  investigate why), Eightfold (American Express, Starbucks, Twilio,
  Capital One secondary), Taleo (United Airlines, UnitedHealth), gr8people
  (EA), iCIMS (AMD, Schwab, Pepsico secondary).
- **Fully custom, FAANG-scale, unattempted**: Google, Microsoft, Amazon,
  Netflix, Tesla. High effort, likely bot protection, no shared vendor to
  amortize the work across multiple companies (unlike Workday/Oracle Cloud).
- Raytheon/RTX and honeywell's *first-guessed* URL 404'd — Honeywell was
  found again correctly through `careers.honeywell.com` (no `www`) in a
  later pass; Raytheon's actual working careers URL was never found — retry
  with `careers.rtx.com` variations or search for it fresh.

Browser automation (`claude-in-chrome` tools) was tried for the SPA-heavy
list and repeatedly hit friction (batch timeouts, stalled navigations,
patches on `fetch`/`XMLHttpRequest` need to be installed **before** the
page's own hydration fires, which is hard to time from outside). The
curl-based technique above was far more productive — prefer it, and only
reach for the browser as a last resort with patience for re-tries.

## DB sync status as of handoff

Both `--platform=workday` and `--platform=oraclecloud` syncs were kicked off
in background shells after `seed-sync-state.ts`. Check they finished clean
(`sync run ... done — ok=N failed=0`) before assuming all new companies'
jobs are live — a handful of Workday sites hit transient 429s
(tmobile, sglottery, unisys, lnw, thales) and will just retry on the next
scheduled cron run, not a real problem.
