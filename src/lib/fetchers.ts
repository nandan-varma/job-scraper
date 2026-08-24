import type { Job, Site, WorkMode } from "./types";
import type { FetchedJob } from "./db/types";
import { getJson, getText, pool, sleep } from "./http";
import { decodeEntities, htmlToText, unescapeOnce } from "./html";

/**
 * Every fetcher below returns `FetchedJob[]` — a superset of the public
 * `Job` type that also carries every structured field the API actually
 * exposes (requisition ids, explicit workplace-type flags, secondary
 * locations, etc.), not just what the interactive UI happens to render
 * today. Fields that aren't directly and unambiguously present on the
 * source are left null rather than guessed.
 *
 * `workMode` is only 'structured' when the platform gives an explicit field
 * (Ashby workplaceType/isRemote, Lever workplaceType, SmartRecruiters
 * location.remote/hybrid, HiringCafe JSON-LD). Anything derived by regex
 * over free text/metadata is 'inferred' and must never be used to exclude
 * data — see workMode() below for why.
 */

function makeFetchedJob(
  partial: Partial<FetchedJob> & { sourceId: string; title: string },
): FetchedJob {
  return {
    sourceId: partial.sourceId,
    title: partial.title.trim() || "Untitled",
    department: partial.department ?? null,
    departmentPath: partial.departmentPath ?? null,
    location: partial.location ?? null,
    secondaryLocations: partial.secondaryLocations ?? null,
    workMode: partial.workMode ?? null,
    workModeSource: partial.workModeSource ?? "inferred",
    employmentType: partial.employmentType ?? null,
    requisitionId: partial.requisitionId ?? null,
    postedDate: partial.postedDate ?? null,
    updatedAtSource: partial.updatedAtSource ?? null,
    applicationDeadline: partial.applicationDeadline ?? null,
    url: partial.url ?? null,
    applyUrl: partial.applyUrl ?? null,
    description: partial.description ?? null,
    compensationText: partial.compensationText ?? null,
    salaryMin: partial.salaryMin ?? null,
    salaryMax: partial.salaryMax ?? null,
    salaryCurrency: partial.salaryCurrency ?? null,
  };
}

/** Project a rich FetchedJob down to the lean public `Job` shape the UI consumes. */
export function toJob(site: Site, f: FetchedJob): Job {
  return {
    id: `${site.slug}:${f.sourceId}`,
    site: site.slug,
    company: site.name,
    platform: site.platform,
    source_id: f.sourceId,
    title: f.title,
    department: f.department,
    location: f.location,
    work_mode: f.workMode,
    posted_date: f.postedDate,
    url: f.url,
    apply_url: f.applyUrl,
    description: f.description,
    compensation: f.compensationText,
    fetched_at: new Date().toISOString(),
  };
}

/** Normalize a date to YYYY-MM-DD or null. Rejects anything not already a real date
 * (relative strings like "Posted Today" are intentionally left null, not guessed at). */
export function isoDate(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + "T00:00:00Z");
  if (isNaN(d.getTime())) return null;
  return s;
}

const NO_CAP = Infinity;

// --- Ashby ---------------------------------------------------------------

/** Ashby gives an explicit workplaceType/isRemote — no metadata guessing needed. */
function ashbyWorkMode(
  workplaceType: unknown,
  isRemote: unknown,
): { mode: WorkMode; source: "structured" | "inferred" } {
  if (typeof workplaceType === "string") {
    const v = workplaceType.toLowerCase();
    if (v.includes("remote")) return { mode: "remote", source: "structured" };
    if (v.includes("hybrid")) return { mode: "hybrid", source: "structured" };
    if (/on-?site|in.office/.test(v))
      return { mode: "onsite", source: "structured" };
  }
  // isRemote is a positive-only signal: false doesn't distinguish hybrid from onsite.
  if (isRemote === true) return { mode: "remote", source: "structured" };
  return { mode: null, source: "inferred" };
}

export async function fetchAshby(site: Site): Promise<FetchedJob[]> {
  const slug = site.ashby_slug || site.slug;
  const board = await getJson<{
    jobs?: Array<{
      id?: string;
      title?: string;
      department?: string;
      location?: string | null;
      address?: { postalAddress?: string | null };
      secondaryLocations?: unknown;
      employmentType?: string;
      workplaceType?: string;
      isRemote?: boolean;
      publishedAt?: string | number;
      jobUrl?: string;
      applyUrl?: string;
      descriptionHtml?: string;
      compensation?: { compensationTierSummary?: string } | string | null;
    }>;
  }>(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);

  return (board.jobs ?? []).map((j) => {
    const wm = ashbyWorkMode(j.workplaceType, j.isRemote);
    return makeFetchedJob({
      sourceId: String(j.id ?? ""),
      title: j.title ?? "",
      department: j.department ?? null,
      location: j.location ?? j.address?.postalAddress ?? null,
      secondaryLocations: j.secondaryLocations ?? null,
      workMode: wm.mode,
      workModeSource: wm.source,
      employmentType: j.employmentType ?? null,
      postedDate: isoDate(j.publishedAt),
      url: j.jobUrl ?? null,
      applyUrl: j.applyUrl ?? null,
      description: htmlToText(j.descriptionHtml ?? ""),
      compensationText:
        typeof j.compensation === "string"
          ? j.compensation
          : typeof j.compensation === "object" && j.compensation
            ? (j.compensation.compensationTierSummary ?? null)
            : null,
    });
  });
}

// --- Greenhouse ------------------------------------------------------------

const _WORK_MODE_NAME = /work|remote|hybrid|onsite|office|site/i;
const _WORK_MODE_EXCLUDE =
  /position id|position number|req id|job id|cost center|team|department/i;
const _WORK_MODE_VALUE = /remote|hybrid|on-?site|in office/i;

/** No explicit workplace-type field exists on Greenhouse — this stays 'inferred'. */
function workMode(metadata: unknown): WorkMode {
  const meta = Array.isArray(metadata) ? metadata : [];
  for (const m of meta) {
    if (!m || typeof m !== "object") continue;
    const mm = m as Record<string, unknown>;
    const name = String(mm.name ?? "");
    const v = mm.value;
    if (typeof v === "string" && v.trim()) {
      const lv = v.toLowerCase();
      const named =
        !!_WORK_MODE_NAME.test(name) && !_WORK_MODE_EXCLUDE.test(name);
      if (named || _WORK_MODE_VALUE.test(lv)) {
        if (lv.includes("remote")) return "remote";
        if (lv.includes("hybrid")) return "hybrid";
        if (/on-?site|in office/.test(lv)) return "onsite";
      }
    } else if (
      typeof v === "boolean" &&
      _WORK_MODE_NAME.test(name) &&
      !_WORK_MODE_EXCLUDE.test(name)
    ) {
      return v ? "remote" : "onsite";
    }
  }
  return null;
}

interface GreenhouseJob {
  id?: number;
  title?: string;
  departments?: Array<{ name?: string }>;
  location?: { name?: string } | Array<{ name?: string }> | string | null;
  absolute_url?: string;
  metadata?: unknown[];
  updated_at?: string;
}
interface GreenhouseDetail extends GreenhouseJob {
  content?: string;
  departments?: Array<{ name?: string }>;
  requisition_id?: string;
  first_published?: string;
  application_deadline?: string;
}

function locName(v: unknown): string | null {
  if (Array.isArray(v))
    return (
      v
        .map((x) =>
          x && typeof x === "object" ? (x as { name?: string }).name : null,
        )
        .filter((x): x is string => !!x)
        .join(", ") || null
    );
  if (v && typeof v === "object") return (v as { name?: string }).name ?? null;
  return typeof v === "string" ? v : null;
}

function deptPath(depts: Array<{ name?: string }> | undefined): string | null {
  const names = (depts ?? []).map((d) => d.name).filter((n): n is string => !!n);
  return names.length ? names.join(", ") : null;
}

export async function fetchGreenhouse(
  site: Site,
  cap = 60,
): Promise<FetchedJob[]> {
  const slug = site.slug;
  const listing = await getJson<{ jobs?: GreenhouseJob[] }>(
    `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`,
  );
  const listed = (listing.jobs ?? []).slice(0, cap);

  const { results: details } = await pool(listed, 8, (j: GreenhouseJob) =>
    getJson<GreenhouseDetail>(
      `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs/${j.id}?content=true`,
    ),
  );

  return listed.map((j, i) => {
    const detail = details[i] ?? ({} as GreenhouseDetail);
    const content = unescapeOnce(detail.content ?? "");
    const departments = detail.departments ?? j.departments;
    return makeFetchedJob({
      sourceId: String(j.id ?? ""),
      title: j.title ?? "",
      department: departments?.[0]?.name ?? null,
      departmentPath: deptPath(departments),
      location: locName(j.location) ?? locName(detail.location),
      workMode: workMode(j.metadata),
      workModeSource: "inferred",
      requisitionId: detail.requisition_id ?? null,
      // first_published is the true "posted" date; updated_at drifts on every
      // edit and is kept separately rather than conflated with posting date.
      postedDate: isoDate(detail.first_published),
      updatedAtSource: isoDate(detail.updated_at ?? j.updated_at),
      applicationDeadline: isoDate(detail.application_deadline),
      url: j.absolute_url ?? detail.absolute_url ?? null,
      applyUrl:
        ((j.absolute_url ?? "").replace("gh_jid", "gh_src") ||
          j.absolute_url) ??
        null,
      description: htmlToText(content),
    });
  });
}

// --- Lever -----------------------------------------------------------------

/** Lever's own workplaceType field — structured, distinct from `commitment`
 * (which is employment type, not work-site, and must never feed work_mode). */
function leverWorkMode(v: unknown): {
  mode: WorkMode;
  source: "structured" | "inferred";
} {
  if (typeof v === "string") {
    const lv = v.toLowerCase();
    if (lv.includes("remote")) return { mode: "remote", source: "structured" };
    if (lv.includes("hybrid")) return { mode: "hybrid", source: "structured" };
    if (/on-?site/.test(lv)) return { mode: "onsite", source: "structured" };
  }
  return { mode: null, source: "inferred" };
}

export async function fetchLever(site: Site): Promise<FetchedJob[]> {
  const postings = await getJson<
    Array<{
      id?: string;
      text?: string;
      hostedUrl?: string;
      applyUrl?: string;
      createdAt?: string | number;
      descriptionPlain?: string;
      workplaceType?: string;
      categories?: {
        team?: string;
        location?: string;
        allLocations?: string[];
        commitment?: string;
      };
    }>
  >(`https://api.lever.co/v0/postings/${site.slug}?mode=json`);

  return postings.map((p) => {
    const wm = leverWorkMode(p.workplaceType);
    return makeFetchedJob({
      sourceId: String(p.id ?? ""),
      title: p.text ?? "",
      department: p.categories?.team ?? null,
      location: p.categories?.location || null,
      secondaryLocations: p.categories?.allLocations ?? null,
      workMode: wm.mode,
      workModeSource: wm.source,
      employmentType: p.categories?.commitment ?? null,
      postedDate: isoDate(p.createdAt),
      url: p.hostedUrl ?? null,
      applyUrl: p.applyUrl ?? null,
      description: p.descriptionPlain || p.text || null,
    });
  });
}

// --- Workday -----------------------------------------------------------------

interface WorkdayPosting {
  title?: string;
  locationsText?: string;
  jobFamily?: { title?: string };
  postedOn?: string;
  externalPath?: string;
  bulletFields?: string[];
}
interface WorkdayDetail {
  jobPostingInfo?: {
    jobDescription?: string | { externalContent?: string };
    startDate?: string;
    timeType?: string;
    jobReqId?: string;
    country?: { descriptor?: string };
  };
  jobPosting?: { jobDescription?: string | { externalContent?: string } };
}

export async function fetchWorkday(
  site: Site,
  cap = 40,
): Promise<FetchedJob[]> {
  const { tenant, wd, site: wsite } = site.workday!;
  const base = `https://${tenant}.${wd}.myworkdayjobs.com/wday/cxs/${tenant}/${wsite}`;
  const rows: WorkdayPosting[] = [];
  let offset = 0;
  while (offset < cap) {
    const resp = await getJson<{ jobPostings?: WorkdayPosting[] }>(
      `${base}/jobs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 20, offset, searchText: "" }),
      },
    );
    const batch = resp.jobPostings ?? [];
    rows.push(...batch);
    if (batch.length < 20) break;
    offset += 20;
  }
  const listed = cap === NO_CAP ? rows : rows.slice(0, cap);

  const { results: details } = await pool(listed, 8, (p: WorkdayPosting) =>
    getJson<WorkdayDetail>(`${base}${p.externalPath ?? ""}`),
  );

  return listed.map((p, i) => {
    const detail = details[i] ?? {};
    const info = detail.jobPostingInfo;
    const posting = info ?? detail.jobPosting ?? {};
    let descHtml = posting.jobDescription ?? "";
    if (typeof descHtml === "object") descHtml = descHtml.externalContent ?? "";
    // bulletFields[0] is the requisition id on the listing; jobReqId confirms
    // it on the detail payload — prefer the detail when both are present.
    const jid = info?.jobReqId ?? p.bulletFields?.[0] ?? "";
    const sourceId = jid || (p.externalPath ?? "").split("/").pop() || "";
    const publicUrl = `https://${tenant}.${wd}.myworkdayjobs.com/en-US/${wsite}${p.externalPath ?? ""}`;
    return makeFetchedJob({
      sourceId,
      title: p.title ?? "",
      department: p.jobFamily?.title ?? null,
      location: p.locationsText ?? null,
      requisitionId: jid || null,
      employmentType: info?.timeType ?? null,
      // startDate on the detail payload is a real ISO date; the listing's
      // postedOn ("Posted Today"/"Posted 30+ Days Ago") is relative text and
      // deliberately never parsed as a date.
      postedDate: isoDate(info?.startDate),
      url: publicUrl,
      applyUrl: publicUrl,
      description: htmlToText(descHtml as string),
    });
  });
}

// --- Apple -------------------------------------------------------------------

export async function fetchApple(
  site: Site,
  cap = 50,
): Promise<FetchedJob[]> {
  const url = "https://jobs.apple.com/api/v1/search";

  async function page(n: number): Promise<{
    res?: {
      searchResults?: Array<Record<string, unknown>>;
      totalRecords?: number;
    };
  }> {
    return getJson(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://jobs.apple.com",
        Referer: "https://jobs.apple.com/en-us/search",
      },
      body: JSON.stringify({
        query: "",
        filters: {},
        page: n,
        locale: "en-us",
        sort: "newest",
        format: { longDate: "MMMM D, YYYY", mediumDate: "MMM D, YYYY" },
      }),
    });
  }

  interface AppleRow {
    positionId?: string;
    id?: string;
    postingTitle?: string;
    title?: string;
    team?: { teamName?: string; name?: string };
    teamName?: string;
    location?: { fullLocation?: string; name?: string };
    locationName?: string;
    transformedPostingTitle?: string;
    postDateInGMT?: string;
    homeOffice?: boolean;
  }

  const rows: AppleRow[] = [];
  let n = 1;
  let total = 0;
  while (true) {
    const d = await page(n);
    const batch = (d.res?.searchResults ?? []) as AppleRow[];
    total = d.res?.totalRecords ?? total;
    if (!batch.length) break;
    rows.push(...batch);
    if (cap !== NO_CAP && rows.length >= cap) {
      rows.length = cap;
      break;
    }
    if (total && rows.length >= total) break;
    if (batch.length < 20) break;
    n += 1;
    await sleep(300);
  }

  const hydRe =
    /window\.__staticRouterHydrationData = JSON\.parse\("([\s\S]*?)"\);<\/script>/;
  const decodeJsString = (inner: string): string => {
    // inner is the JS double-quoted string literal body between the outer
    // quotes. JSON.parse handles the JSON-string case; fall back to a JS
    // string-literal decode (Function) for JS-escaped payloads. Runs
    // server-side only on a trusted board's page.
    try {
      return JSON.parse(`"${inner}"`) as string;
    } catch {
      try {
        return Function(`return "${inner}"`)() as string;
      } catch {
        return inner;
      }
    }
  };

  function jdFor(r: AppleRow): Promise<Record<string, unknown>> {
    const pid = r.positionId ?? r.id ?? "";
    const jnum = String(pid).startsWith("PIPE-") ? String(pid).slice(5) : pid;
    const slug = r.transformedPostingTitle ?? "";
    const u = `https://jobs.apple.com/en-us/details/${jnum}${slug ? `/${slug}` : ""}`;
    return getText(u, {}, 40000)
      .then((html) => {
        const m = hydRe.exec(html);
        if (!m) return {};
        try {
          const parsed = JSON.parse(decodeJsString(m[1])) as {
            loaderData?: {
              jobDetails?: { jobsData?: Record<string, unknown> };
            };
          };
          return parsed.loaderData?.jobDetails?.jobsData ?? {};
        } catch {
          return {};
        }
      })
      .catch(() => ({}));
  }

  const { results: details } = await pool(rows, 8, jdFor);
  const jdByPid = new Map<string, Record<string, unknown>>();
  rows.forEach((r, i) => {
    const pid = r.positionId ?? r.id ?? "";
    if (details[i] && Object.keys(details[i]).length)
      jdByPid.set(String(pid), details[i]);
  });

  return rows.map((r) => {
    const pid = r.positionId ?? r.id ?? "";
    const jd = jdByPid.get(String(pid)) as
      | (Record<string, unknown> & {
          description?: string;
          minimumQualifications?: string;
          preferredQualifications?: string;
          postDateInGMT?: string;
          employmentType?: string;
        })
      | undefined;
    const jnum = String(pid).startsWith("PIPE-") ? String(pid).slice(5) : pid;
    const slug = r.transformedPostingTitle ?? "";
    const u = `https://jobs.apple.com/en-us/details/${jnum}${slug ? `/${slug}` : ""}`;
    const team = (r.team ?? {}) as { teamName?: string; name?: string };
    const loc = (r.location ?? {}) as { fullLocation?: string; name?: string };
    const parts = [
      jd?.description,
      jd?.minimumQualifications,
      jd?.preferredQualifications,
    ]
      .filter((x): x is string => !!x)
      .map((x) => x.trim());
    // homeOffice is Apple's own remote-eligibility flag — structured, not guessed.
    const wm: WorkMode = r.homeOffice === true ? "remote" : null;
    return makeFetchedJob({
      sourceId: String(pid),
      title: r.postingTitle ?? r.title ?? "",
      department: team.teamName ?? team.name ?? r.teamName ?? null,
      location: loc.fullLocation ?? loc.name ?? r.locationName ?? null,
      workMode: wm,
      workModeSource: wm ? "structured" : "inferred",
      employmentType: jd?.employmentType ?? null,
      postedDate: isoDate(jd?.postDateInGMT ?? r.postDateInGMT),
      url: u,
      applyUrl: u,
      description: parts.length ? parts.join("\n\n") : null,
    });
  });
}

// --- SmartRecruiters ---------------------------------------------------------

export async function fetchSmartRecruiters(
  site: Site,
  cap = 60,
): Promise<FetchedJob[]> {
  const slug = site.slug;
  const rows: Array<Record<string, unknown>> = [];
  let offset = 0;
  while (true) {
    const resp = await getJson<{ content?: Array<Record<string, unknown>> }>(
      `https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100&offset=${offset}`,
    );
    const batch = resp.content ?? [];
    rows.push(...batch);
    if (cap !== NO_CAP && rows.length >= cap) break;
    if (batch.length < 100) break;
    offset += 100;
  }
  const listed = cap === NO_CAP ? rows : rows.slice(0, cap);

  const { results: details } = await pool(
    listed,
    8,
    (p: Record<string, unknown>) =>
      getJson<Record<string, unknown>>(
        `https://api.smartrecruiters.com/v1/companies/${slug}/postings/${p.id}`,
      ),
  );

  return listed.map((p, i) => {
    const detail = details[i] ?? ({} as Record<string, unknown>);
    const ja = (detail.jobAd ?? {}) as {
      sections?: Record<string, { text?: string }>;
    };
    const secs = ja.sections ?? {};
    const parts = ["jobDescription", "qualifications", "additionalInformation"]
      .map((k) => secs[k]?.text ?? "")
      .filter((t) => t);
    const loc = (p.location ?? {}) as Record<string, unknown>;
    // remote/hybrid are explicit booleans on SmartRecruiters — structured, not guessed.
    let wm: WorkMode = null;
    if (loc.remote) wm = "remote";
    else if (loc.hybrid) wm = "hybrid";
    const url = (detail.postingUrl ?? detail.applyUrl ?? p.ref) as string;
    const typeOfEmployment = (detail.typeOfEmployment ?? p.typeOfEmployment) as
      | { label?: string }
      | undefined;
    return makeFetchedJob({
      sourceId: String(p.id ?? ""),
      title: (p.name as string) ?? "",
      department:
        (p.department as { label?: string })?.label ??
        (p.function as { label?: string })?.label ??
        null,
      location:
        (loc.fullLocation as string) ??
        ([loc.city, loc.region].filter(Boolean).join(", ") || null),
      workMode: wm,
      workModeSource: "structured",
      employmentType: typeOfEmployment?.label ?? null,
      requisitionId: (p.refNumber as string) ?? null,
      postedDate: isoDate(p.releasedDate ?? detail.releasedDate),
      url,
      applyUrl: (detail.applyUrl as string) || url,
      description: parts.length ? parts.map(htmlToText).join("\n\n") : null,
    });
  });
}

// --- Roblox ------------------------------------------------------------------

export async function fetchRoblox(): Promise<FetchedJob[]> {
  const feed = await getJson<
    Array<{
      id?: string | number;
      title?: string;
      groups?: string[];
      department?: string[];
      location?: string;
    }>
  >("https://d32kbl9jppd7az.cloudfront.net/careers/jobs.json");
  return feed.map((j) => {
    const url = `https://careers.roblox.com/jobs/${j.id}`;
    return makeFetchedJob({
      sourceId: String(j.id ?? ""),
      title: j.title ?? "",
      department:
        (j.groups ?? []).join(", ") || (j.department ?? []).join(", ") || null,
      location: j.location ?? null,
      url,
      applyUrl: url,
    });
  });
}

// --- HiringCafe (HTML/SSR + JSON-LD scraping) --------------------------------

function ldJsonBlocks(html: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const re = /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      out.push(JSON.parse(m[1]));
    } catch {
      /* skip */
    }
  }
  return out;
}

interface HiringCafeParsed {
  title: string | null;
  description: string | null;
  company: string | null;
  location: string | null;
  posted_date: string | null;
  salary_text: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  apply_url: string | null;
  work_mode: string | null;
  employment_type: string | null;
  raw_ld: Record<string, unknown> | null;
}

function parseHiringCafeDetail(page: string): HiringCafeParsed {
  const out: HiringCafeParsed = {
    title: null,
    description: null,
    company: null,
    location: null,
    posted_date: null,
    salary_text: null,
    salary_min: null,
    salary_max: null,
    salary_currency: null,
    apply_url: null,
    work_mode: null,
    employment_type: null,
    raw_ld: null,
  };
  const jd = ldJsonBlocks(page).find((o) => o["@type"] === "JobPosting") as
    | (Record<string, unknown> & {
        hiringOrganization?: { name?: string };
        jobLocation?: { address?: Record<string, unknown> };
        employmentType?: string;
        baseSalary?: {
          currency?: string;
          value?: { minValue?: unknown; maxValue?: unknown };
        };
      })
    | undefined;
  if (jd) {
    out.raw_ld = jd;
    out.title = jd.title ? String(jd.title) : null;
    out.company = jd.hiringOrganization?.name ?? null;
    out.posted_date = isoDate(jd.datePosted);
    out.employment_type = jd.employmentType ?? null;
    out.description = jd.description
      ? htmlToText(String(jd.description))
      : null;
    const addr = jd.jobLocation?.address ?? {};
    out.location =
      [addr.addressLocality, addr.addressRegion, addr.addressCountry]
        .filter((x) => x)
        .join(", ") || null;
    const val = jd.baseSalary?.value ?? {};
    // schema.org baseSalary is structured JSON-LD, not free text — safe to
    // parse as numbers directly (unlike a prose "$150k-200k" summary elsewhere).
    const min = Number(val.minValue);
    const max = Number(val.maxValue);
    if (Number.isFinite(min) || Number.isFinite(max)) {
      out.salary_min = Number.isFinite(min) ? min : null;
      out.salary_max = Number.isFinite(max) ? max : null;
      out.salary_currency = jd.baseSalary?.currency ?? null;
      out.salary_text =
        `${val.minValue ?? "?"}-${val.maxValue ?? "?"} ${jd.baseSalary?.currency ?? ""}`.trim();
    }
  }
  const am = /"apply_url":"([^"]+)"/.exec(page);
  if (am) out.apply_url = am[1];
  const dm =
    /<meta name="description" property="description" content="([^"]+)"/.exec(
      page,
    );
  if (dm) {
    const parts = decodeEntities(dm[1]).split(". ");
    if (parts.length >= 2) {
      const toks = parts[1].split(",").map((t) => t.trim());
      if (
        toks[0] &&
        ["remote", "hybrid", "onsite"].includes(toks[0].toLowerCase())
      )
        out.work_mode = toks[0].toLowerCase();
      if (toks.length >= 3 && !out.salary_text) out.salary_text = toks[2];
    }
  }
  return out;
}

export async function fetchHiringCafe(
  site: Site,
  cap = 30,
): Promise<FetchedJob[]> {
  const base = "https://hiringcafe.com";
  const queries = site.search_queries ?? ["software engineer new grad"];
  const slugs: string[] = [];
  for (const q of queries) {
    const state = JSON.stringify({ searchQuery: q });
    const url = `${base}/?searchState=${encodeURIComponent(state)}`;
    try {
      const page = await getText(url, {}, 25000);
      for (const s of page.matchAll(/href="\/job\/([^"]+)"/g)) {
        if (!slugs.includes(s[1])) slugs.push(s[1]);
      }
    } catch {
      /* skip query */
    }
  }
  const todo = cap === NO_CAP ? slugs : slugs.slice(0, cap);
  if (!todo.length) return [];

  const { results } = await pool(todo, 3, async (slug: string) => {
    const html = await getText(`${base}/job/${slug}`, {}, 25000);
    return parseHiringCafeDetail(html);
  });

  const jobs: FetchedJob[] = [];
  todo.forEach((slug, i) => {
    const d = results[i];
    if (!d || !d.title) return;
    // work_mode here comes from a regex over the meta description ("Remote,
    // Full-time, $150k") — structurally weaker than the JSON-LD fields above,
    // so it stays 'inferred' even though salary/employmentType are structured.
    jobs.push(
      makeFetchedJob({
        sourceId: slug.includes("-") ? slug.split("-").pop()! : slug,
        title: d.title ?? "",
        location: d.location,
        workMode: d.work_mode as WorkMode,
        workModeSource: "inferred",
        employmentType: d.employment_type,
        postedDate: d.posted_date,
        url: `${base}/job/${slug}`,
        applyUrl: d.apply_url || `${base}/job/${slug}`,
        description: d.description,
        compensationText: d.salary_text,
        salaryMin: d.salary_min,
        salaryMax: d.salary_max,
        salaryCurrency: d.salary_currency,
      }),
    );
  });
  return jobs;
}

export type Fetcher = (site: Site, cap?: number) => Promise<FetchedJob[]>;

export const FETCHERS: Record<string, Fetcher> = {
  ashby: fetchAshby,
  greenhouse: fetchGreenhouse,
  lever: fetchLever,
  workday: fetchWorkday,
  apple: fetchApple,
  smartrecruiters: fetchSmartRecruiters,
  roblox: fetchRoblox,
  hiringcafe: fetchHiringCafe,
};

/** Sentinel cap meaning "fetch the complete listing" — used by the sync engine;
 * interactive callers pass a finite cap (or nothing, for each fetcher's default). */
export const FULL_SYNC_CAP = NO_CAP;
