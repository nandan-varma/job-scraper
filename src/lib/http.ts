const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

async function raw(
  url: string,
  init: RequestInit = {},
  timeoutMs = 30000,
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
    if (!res.ok)
      throw new HttpError(res.status, `HTTP ${res.status} for ${url}`);
    return res;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new Error(`network error for ${url}: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
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
