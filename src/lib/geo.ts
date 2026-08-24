/** Lightweight, dependency-free heuristics for "is this role US-based?" —
 * there's no structured country field on `Job`, only free-text `location`. */

const US_STATE_ABBRS = new Set([
  "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga", "hi", "id",
  "il", "in", "ia", "ks", "ky", "la", "me", "md", "ma", "mi", "mn", "ms",
  "mo", "mt", "ne", "nv", "nh", "nj", "nm", "ny", "nc", "nd", "oh", "ok",
  "or", "pa", "ri", "sc", "sd", "tn", "tx", "ut", "vt", "va", "wa", "wv",
  "wi", "wy", "dc",
]);

const US_KEYWORDS = [
  "united states",
  "usa",
  "u.s.",
  "remote - us",
  "remote (us)",
  "remote, us",
  "us remote",
];

export function isUSLocation(location?: string | null): boolean {
  if (!location) return false;
  const l = location.toLowerCase();
  if (US_KEYWORDS.some((k) => l.includes(k))) return true;
  const stateMatch = l.match(/,\s*([a-z]{2})\b/);
  if (stateMatch && US_STATE_ABBRS.has(stateMatch[1])) return true;
  return false;
}

/** Continental/common US IANA timezones — used only to pick a sane default
 * for the Region filter, never to hide anything without an explicit chip. */
const US_TIMEZONES = new Set([
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Boise",
  "America/Detroit",
  "America/Indianapolis",
]);

export function isLikelyUSVisitor(): boolean {
  try {
    return US_TIMEZONES.has(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return false;
  }
}
