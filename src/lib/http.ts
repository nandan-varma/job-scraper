const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfterMs?: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** Rate-limit/transient-outage responses — worth a short retry, unlike a
 * genuine 404 (board doesn't exist) or 401 (bad auth). Seen in practice: a
 * sustained full-registry sync trips Greenhouse/CloudFront's rate limiter
 * (403) and Workday's (429) for a handful of sites per run, even though the
 * board is fine seconds later. */
const RETRYABLE_STATUS = new Set([403, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

function retryDelayMs(retryAfterMs: number | undefined, attemptNum: number): number {
  if (retryAfterMs != null) return Math.min(retryAfterMs, 10_000);
  const base = 500 * 2 ** (attemptNum - 1); // 500ms, 1000ms, ...
  return base + Math.random() * base * 0.5; // + up to 50% jitter
}

async function attempt(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        "User-Agent": UA,
        Accept: "application/json, text/html, */*",
        ...init.headers,
      },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      const retryAfter = res.headers.get("retry-after");
      const retryAfterMs = retryAfter && Number.isFinite(Number(retryAfter))
        ? Number(retryAfter) * 1000
        : undefined;
      throw new HttpError(res.status, `HTTP ${res.status} for ${url}`, retryAfterMs);
    }
    return res;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new Error(`network error for ${url}: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

async function raw(
  url: string,
  init: RequestInit = {},
  timeoutMs = 30000,
): Promise<Response> {
  for (let n = 1; n <= MAX_ATTEMPTS; n++) {
    try {
      return await attempt(url, init, timeoutMs);
    } catch (e) {
      const retryable = e instanceof HttpError && RETRYABLE_STATUS.has(e.status);
      if (!retryable || n === MAX_ATTEMPTS) throw e;
      await sleep(retryDelayMs(e instanceof HttpError ? e.retryAfterMs : undefined, n));
    }
  }
  throw new Error("unreachable");
}

export async function getJson<T = unknown>(
  url: string,
  init?: RequestInit,
  timeoutMs?: number,
): Promise<T> {
  const res = await raw(url, init, timeoutMs);
  // A non-2xx that slipped through (e.g. Cloudflare 200-with-error markup) is
  // caught by JSON.parse below.
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`non-JSON response from ${url} (${text.slice(0, 80)})`);
  }
}

export async function getText(
  url: string,
  init?: RequestInit,
  timeoutMs?: number,
): Promise<string> {
  const res = await raw(url, init, timeoutMs);
  return res.text();
}

/** Tiny concurrency pool — run `tasks` with `limit` workers, preserving order. */
export async function pool<A, B>(
  items: A[],
  limit: number,
  fn: (item: A) => Promise<B>,
): Promise<{ results: B[]; fails: number }> {
  const results: B[] = new Array(items.length);
  let fails = 0;
  let idx = 0;

  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      try {
        results[i] = await fn(items[i]);
      } catch {
        fails++;
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    worker(),
  );
  await Promise.all(workers);
  return { results, fails };
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
