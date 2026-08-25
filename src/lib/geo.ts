/** Lightweight, dependency-free heuristics for "is this role US-based?" —
 * there's no structured country field on `Job`, only free-text `location`. */

/** Exported so the server-side region filter (db/queries.ts) can build the
 * exact same rule as a SQL regex — one definition of "US location", not two
 * that can drift apart. */
export const US_STATE_ABBRS = [
 "al",
 "ak",
 "az",
 "ar",
 "ca",
 "co",
 "ct",
 "de",
 "fl",
 "ga",
 "hi",
 "id",
 "il",
 "in",
 "ia",
 "ks",
 "ky",
 "la",
 "me",
 "md",
 "ma",
 "mi",
 "mn",
 "ms",
 "mo",
 "mt",
 "ne",
 "nv",
 "nh",
 "nj",
 "nm",
 "ny",
 "nc",
 "nd",
 "oh",
 "ok",
 "or",
 "pa",
 "ri",
 "sc",
 "sd",
 "tn",
 "tx",
 "ut",
 "vt",
 "va",
 "wa",
 "wv",
 "wi",
 "wy",
 "dc",
];

export const US_KEYWORDS = [
 "united states",
 "usa",
 "u.s.",
 "remote - us",
 "remote (us)",
 "remote, us",
 "us remote",
 "district of columbia",
 // "Washington DC" without comma/dots — the 2-letter-abbreviation rule
 // requires a comma before the code, and WASHINGTON_DC_RE requires "d.c.".
 "washington dc",
];

const US_STATE_ABBR_SET = new Set(US_STATE_ABBRS);

/** Full state names, spelled out (as opposed to the 2-letter codes above) —
 * catches postings like "Austin, Texas" that never use the abbreviation.
 * Georgia is deliberately omitted: it's also a country name, and there's no
 * cheap way to tell "Atlanta, Georgia" from "Tbilisi, Georgia" from the
 * string alone — stays uncategorized rather than guess (see module note). */
const US_STATE_NAMES = [
 "alabama",
 "alaska",
 "arizona",
 "arkansas",
 "california",
 "colorado",
 "connecticut",
 "delaware",
 "florida",
 "hawaii",
 "idaho",
 "illinois",
 "indiana",
 "iowa",
 "kansas",
 "kentucky",
 "louisiana",
 "maine",
 "maryland",
 "massachusetts",
 "michigan",
 "minnesota",
 "mississippi",
 "missouri",
 "montana",
 "nebraska",
 "nevada",
 "new hampshire",
 "new jersey",
 "new mexico",
 "new york",
 "north carolina",
 "north dakota",
 "ohio",
 "oklahoma",
 "oregon",
 "pennsylvania",
 "rhode island",
 "south carolina",
 "south dakota",
 "tennessee",
 "texas",
 "utah",
 "vermont",
 "virginia",
 "washington",
 "west virginia",
 "wisconsin",
 "wyoming",
];
const US_STATE_NAME_RE = new RegExp(
 US_STATE_NAMES.map((n) => `\\b${n}\\b`).join("|"),
);

/** "Washington, D.C." and its common punctuation/spacing variants — kept
 * separate from US_STATE_NAMES because bare "d.c." also matches Bogotá's
 * Distrito Capital ("Bogotá, D.C., Colombia"), so it must require the word
 * "washington" alongside it. */
const WASHINGTON_DC_RE = /washington,?\s*d\.c\.?/;

/** Countries that show up often enough in this dataset to collide with a US
 * state's 2-letter abbreviation (e.g. "Madrid, MD, Spain", "Chennai, TN,
 * India", "Perth, WA, Australia") — checked as a hard veto before the
 * abbreviation match below. Deliberately excludes "china" ("China Lake, CA"
 * is a real California town) and "georgia" (see US_STATE_NAMES) since those
 * would cause more false negatives on real US locations than they'd fix. */
const NON_US_COUNTRIES = [
 "spain",
 "india",
 "netherlands",
 "brazil",
 "australia",
 "italy",
 "canada",
 "united kingdom",
 "germany",
 "france",
 "ireland",
 "portugal",
 "poland",
 "philippines",
 "singapore",
 "japan",
 "south korea",
 "colombia",
 "argentina",
 "new zealand",
 "sweden",
 "switzerland",
 "austria",
 "belgium",
 "israel",
 "pakistan",
 "indonesia",
 "vietnam",
 "ukraine",
 "romania",
 "south africa",
 "nigeria",
 "kenya",
 "egypt",
 "malaysia",
 "thailand",
 "united arab emirates",
 "costa rica",
 "chile",
 "peru",
 "hong kong",
 "taiwan",
 "mexico",
 "denmark",
 "norway",
 "finland",
];
const NON_US_COUNTRY_RE = new RegExp(
 NON_US_COUNTRIES.map((c) => `\\b${c}\\b`).join("|"),
);

export function isUSLocation(location?: string | null): boolean {
 if (!location) return false;
 const l = location.toLowerCase();
 if (US_KEYWORDS.some((k) => l.includes(k))) return true;
 if (WASHINGTON_DC_RE.test(l)) return true;
 // Checked before the country veto so "Albuquerque, New Mexico" resolves as
 // the US state, not a false hit on "mexico" below.
 if (US_STATE_NAME_RE.test(l)) return true;
 if (NON_US_COUNTRY_RE.test(l)) return false;
 const stateMatch = l.match(/,\s*([a-z]{2})\b/);
 if (stateMatch && US_STATE_ABBR_SET.has(stateMatch[1])) return true;
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
