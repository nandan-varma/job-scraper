/**
 * Convert HTML to readable plain text. Used to normalize job descriptions
 * coming from ATS sources into a clean, safely-renderable text form (avoiding
 * XSS from untrusted boards). Mirrors the reference fetch.py behavior.
 */

const BLOCK_TAGS =
 /<\s*(p|div|li|h1|h2|h3|h4|h5|h6|tr|section|article|ul|ol|table|br|hr)[^>]*>/gi;
const ANY_TAG = /<[^>]+>/g;
const ENTITY: Record<string, string> = {
 amp: "&",
 lt: "<",
 gt: ">",
 quot: '"',
 apos: "'",
 nbsp: " ",
 ndash: "\u2013",
 mdash: "\u2014",
 hellip: "\u2026",
 rsquo: "\u2019",
 lsquo: "\u2018",
 ldquo: "\u201c",
 rdquo: "\u201d",
};

export function decodeEntities(s: string): string {
 return s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
  .replace(/&([a-z]+);/gi, (m, name) => ENTITY[name.toLowerCase()] ?? m);
}

/** Collapse runs of whitespace to a single space (except newlines). */
function squeeze(s: string): string {
 return s
  .split("\n")
  .map((line) => line.replace(/[ \t\u00a0]+/g, " ").trim())
  .join("\n");
}

/**
 * html_to_text(html) -> readable multi-line plain text.
 * Block-level tags become newlines; other tags are dropped; entities decoded.
 */
export function htmlToText(html: string | null | undefined): string | null {
 if (!html) return null;
 // Insert a newline marker before block tags so their boundaries survive
 // after tag removal.
 let s = html.replace(BLOCK_TAGS, "\n");
 s = s.replace(ANY_TAG, "");
 s = decodeEntities(s);
 s = squeeze(s);
 // Fold 3+ newlines into 2 (paragraph separation).
 s = s.replace(/\n{3,}/g, "\n\n").trim();
 return s || null;
}

export function unescapeOnce(s: string | null | undefined): string {
 // Greenhouse serves JD HTML double-escaped (&lt;div&gt;...); decode once so
 // htmlToText sees real tags.
 return decodeEntities(s ?? "");
}
