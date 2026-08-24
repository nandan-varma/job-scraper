import type { Job, Site, WorkMode } from "./types";
import { getJson, getText, pool, sleep } from "./http";
import { decodeEntities, htmlToText, unescapeOnce } from "./html";

/** Helper to build a normalized Job with stable id. */
function makeJob(
  site: Site,
  sourceId: string,
  partial: Partial<Job> & { title?: string },
): Job {
  return {
    id: `${site.slug}:${sourceId}`,
    site: site.slug,
    company: site.name,
    platform: site.platform,
    source_id: sourceId,
    title: partial.title ?? "Untitled",
    department: partial.department ?? null,
    location: partial.location ?? null,
    work_mode: partial.work_mode ?? null,
    posted_date: partial.posted_date ?? null,
    url: partial.url ?? null,
    apply_url: partial.apply_url ?? null,
    description: partial.description ?? null,
    compensation: partial.compensation ?? null,
    fetched_at: new Date().toISOString(),
    ...partial,
  };
}

/** Normalize a date to YYYY-MM-DD or null. */
export function isoDate(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + "T00:00:00Z");
  if (isNaN(d.getTime())) return null;
  return s;
}

// --- Ashby ---------------------------------------------------------------

export async function fetchAshby(site: Site): Promise<Job[]> {
  const slug = site.ashby_slug || site.slug;
  const board = await getJson<{
    jobs?: Array<{
      id?: string;
      title?: string;
      department?: string;
      location?: string | null;
      address?: { postalAddress?: string | null };
      publishedAt?: string | number;
      jobUrl?: string;
      applyUrl?: string;
      descriptionHtml?: string;
      compensation?: { compensationTierSummary?: string } | string | null;
    }>;
  }>(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);
  return (board.jobs ?? []).map((j) =>
    makeJob(site, String(j.id ?? ""), {
      title: j.title,
      department: j.department ?? null,
      location: j.location ?? j.address?.postalAddress ?? null,
      work_mode: null,
      posted_date: isoDate(j.publishedAt),
      url: j.jobUrl ?? null,
      apply_url: j.applyUrl ?? null,
      description: htmlToText(j.descriptionHtml),
      compensation:
        typeof j.compensation === "string"
          ? j.compensation
          : typeof j.compensation === "object" && j.compensation
            ? (j.compensation.compensationTierSummary ?? null)
            : null,
    }),
  );
}

// --- Greenhouse ----------------------------------------------------------

const _WORK_MODE_NAME = /work|remote|hybrid|onsite|office|site/i;
const _WORK_MODE_EXCLUDE =
  /position id|position number|req id|job id|cost center|team|department/i;
const _WORK_MODE_VALUE = /remote|hybrid|on-?site|in office/i;

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

export async function fetchGreenhouse(site: Site, cap = 60): Promise<Job[]> {
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
    return makeJob(site, String(j.id ?? ""), {
      title: j.title,
      department:
        detail.departments?.[0]?.name ?? j.departments?.[0]?.name ?? null,
      location: locName(j.location) ?? locName(detail.location),
      work_mode: workMode(j.metadata),
      posted_date: isoDate(detail.updated_at ?? j.updated_at),
      url: j.absolute_url ?? detail.absolute_url ?? null,
      apply_url:
        ((j.absolute_url ?? "").replace("gh_jid", "gh_src") ||
          j.absolute_url) ??
        null,
      description: htmlToText(content),
    });
  });
}

// --- Lever ---------------------------------------------------------------

export async function fetchLever(site: Site): Promise<Job[]> {
  const postings = await getJson<
    Array<{
      id?: string;
      text?: string;
      hostedUrl?: string;
      applyUrl?: string;
      createdAt?: string | number;
      descriptionPlain?: string;
      categories?: { team?: string; location?: string; allLocations?: string };
    }>
  >(`https://api.lever.co/v0/postings/${site.slug}?mode=json`);
  return postings.map((p) =>
    makeJob(site, String(p.id ?? ""), {
      title: p.text,
      department: p.categories?.team ?? null,
      location: p.categories?.location || p.categories?.allLocations || null,
      work_mode: null,
      posted_date: isoDate(p.createdAt),
      url: p.hostedUrl ?? null,
      apply_url: p.applyUrl ?? null,
      description: p.descriptionPlain || p.text || null,
    }),
  );
}

// --- Workday -------------------------------------------------------------

interface WorkdayPosting {
  title?: string;
  locationsText?: string;
  jobFamily?: { title?: string };
  postedOn?: string;
  externalPath?: string;
}
interface WorkdayDetail {
  jobPostingInfo?: { jobDescription?: string | { externalContent?: string } };
  jobPosting?: { jobDescription?: string | { externalContent?: string } };
}

export async function fetchWorkday(site: Site, cap = 40): Promise<Job[]> {
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
  const listed = rows.slice(0, cap);

  const { results: details } = await pool(listed, 8, (p: WorkdayPosting) =>
    getJson<WorkdayDetail>(`${base}${p.externalPath ?? ""}`),
  );

  return listed.map((p, i) => {
    const detail = details[i] ?? {};
    const posting = detail.jobPosting ?? detail.jobPostingInfo ?? {};
    let descHtml = posting.jobDescription ?? "";
    if (typeof descHtml === "object") descHtml = descHtml.externalContent ?? "";
    const jid = (p.externalPath ?? "").split("/").pop() ?? "";
    const publicUrl = `https://${tenant}.${wd}.myworkdayjobs.com/en-US/${wsite}${p.externalPath ?? ""}`;
    return makeJob(site, jid, {
      title: p.title,
      department: p.jobFamily?.title ?? null,
      location: p.locationsText ?? null,
      work_mode: null,
      posted_date: isoDate(p.postedOn),
      url: publicUrl,
      apply_url: publicUrl,
      description: htmlToText(descHtml as string),
    });
  });
}

// --- Apple ---------------------------------------------------------------

export async function fetchApple(site: Site, cap = 50): Promise<Job[]> {
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
    if (cap && rows.length >= cap) {
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
    return makeJob(site, String(pid), {
      title: (r.postingTitle ?? r.title ?? "").trim() || undefined,
      department: team.teamName ?? team.name ?? r.teamName ?? null,
      location: loc.fullLocation ?? loc.name ?? r.locationName ?? null,
      work_mode: null,
      posted_date: isoDate(jd?.postDateInGMT ?? r.postDateInGMT),
      url: u,
      apply_url: u,
      description: parts.length ? parts.join("\n\n") : null,
    });
  });
}

// --- SmartRecruiters -----------------------------------------------------

export async function fetchSmartRecruiters(
  site: Site,
  cap = 60,
): Promise<Job[]> {
  const slug = site.slug;
  const rows: Array<Record<string, unknown>> = [];
  let offset = 0;
  while (true) {
    const resp = await getJson<{ content?: Array<Record<string, unknown>> }>(
      `https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100&offset=${offset}`,
    );
    const batch = resp.content ?? [];
    rows.push(...batch);
    if (rows.length >= cap) break;
    if (batch.length < 100) break;
    offset += 100;
  }

  const { results: details } = await pool(
    rows.slice(0, cap),
    8,
    (p: Record<string, unknown>) =>
      getJson<Record<string, unknown>>(
        `https://api.smartrecruiters.com/v1/companies/${slug}/postings/${p.id}`,
      ),
  );

  return rows.slice(0, cap).map((p, i) => {
    const detail = details[i] ?? ({} as Record<string, unknown>);
    const ja = (detail.jobAd ?? {}) as {
      sections?: Record<string, { text?: string }>;
    };
    const secs = ja.sections ?? {};
    const parts = ["jobDescription", "qualifications", "additionalInformation"]
      .map((k) => secs[k]?.text ?? "")
      .filter((t) => t);
    const loc = (p.location ?? {}) as Record<string, unknown>;
    let wm: WorkMode = null;
    if (loc.remote) wm = "remote";
    else if (loc.hybrid) wm = "hybrid";
    const url = (detail.postingUrl ?? detail.applyUrl ?? p.ref) as string;
    return makeJob(site, String(p.id ?? ""), {
      title: (p.name as string) ?? undefined,
      department:
        (p.department as { label?: string })?.label ??
        (p.function as { label?: string })?.label ??
        null,
      location:
        (loc.fullLocation as string) ??
        ([loc.city, loc.region].filter(Boolean).join(", ") || null),
      work_mode: wm,
      posted_date: isoDate(p.releasedDate ?? detail.releasedDate),
      url,
      apply_url: (detail.applyUrl as string) || url,
      description: parts.length ? parts.map(htmlToText).join("\n\n") : null,
    });
  });
}

// --- Roblox --------------------------------------------------------------

export async function fetchRoblox(site: Site): Promise<Job[]> {
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
    return makeJob(site, String(j.id ?? ""), {
      title: j.title,
      department:
        (j.groups ?? []).join(", ") || (j.department ?? []).join(", ") || null,
      location: j.location ?? null,
      work_mode: null,
      posted_date: null,
      url,
      apply_url: url,
      description: null,
    });
  });
}

// --- HiringCafe (HTML/SSR + JSON-LD scraping) ---------------------------

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

function parseHiringCafeDetail(page: string): Record<string, string | null> {
  const out: Record<string, string | null> = {
    title: null,
    description: null,
    company: null,
    location: null,
    posted_date: null,
    salary_text: null,
    apply_url: null,
    work_mode: null,
    commitment: null,
  };
  const jd = ldJsonBlocks(page).find((o) => o["@type"] === "JobPosting") as
    | (Record<string, unknown> & {
        hiringOrganization?: { name?: string };
        jobLocation?: { address?: Record<string, unknown> };
        baseSalary?: {
          currency?: string;
          value?: { minValue?: unknown; maxValue?: unknown };
        };
      })
    | undefined;
  if (jd) {
    out.title = jd.title ? String(jd.title) : null;
    out.company = jd.hiringOrganization?.name ?? null;
    out.posted_date = isoDate(jd.datePosted);
    out.description = jd.description
      ? htmlToText(String(jd.description))
      : null;
    const addr = jd.jobLocation?.address ?? {};
    out.location =
      [addr.addressLocality, addr.addressRegion, addr.addressCountry]
        .filter((x) => x)
        .join(", ") || null;
    const val = jd.baseSalary?.value ?? {};
    if (val.minValue || val.maxValue) {
      out.salary_text =
        `${val.minValue}-${val.maxValue} ${jd.baseSalary?.currency ?? ""}`.trim();
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
      if (toks.length >= 2) out.commitment = toks[1];
      if (toks.length >= 3 && !out.salary_text) out.salary_text = toks[2];
    }
  }
  return out;
}

export async function fetchHiringCafe(site: Site, cap = 30): Promise<Job[]> {
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
  const todo = slugs.slice(0, cap);
  if (!todo.length) return [];

  const { results } = await pool(todo, 3, async (slug: string) => {
    const html = await getText(`${base}/job/${slug}`, {}, 25000);
    return parseHiringCafeDetail(html);
  });

  const jobs: Job[] = [];
  todo.forEach((slug, i) => {
    const d = results[i];
    if (!d || !d.title) return;
    jobs.push(
      makeJob(site, slug.includes("-") ? slug.split("-").pop()! : slug, {
        title: d.title,
        department: null,
        location: d.location,
        work_mode: d.work_mode as WorkMode,
        posted_date: d.posted_date,
        url: `${base}/job/${slug}`,
        apply_url: d.apply_url || `${base}/job/${slug}`,
        description: d.description,
        compensation: d.salary_text,
      }),
    );
  });
  return jobs;
}

export type Fetcher = (site: Site) => Promise<Job[]>;

export const FETCHERS: Record<
  string,
  (site: Site, cap?: number) => Promise<Job[]>
> = {
  ashby: fetchAshby,
  greenhouse: fetchGreenhouse,
  lever: fetchLever,
  workday: fetchWorkday,
  apple: fetchApple,
  smartrecruiters: fetchSmartRecruiters,
  roblox: fetchRoblox,
  hiringcafe: fetchHiringCafe,
};
