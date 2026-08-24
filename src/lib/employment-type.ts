/**
 * Canonicalizes the verbatim employment_type string each ATS provides into
 * a small, filterable set. Unlike department categorization, this isn't
 * inferring meaning from ambiguous free text — it's normalizing formatting
 * variants of a field the platform already gave as an explicit, unambiguous
 * value ("FullTime" / "Full-time" / "Full Time" / "Full-Time" are the exact
 * same fact, just spelled differently across 8,502 companies' ATS configs).
 * A value that doesn't match any known variant stays uncategorized (null)
 * rather than guessed — e.g. some boards put a work-mode value like
 * "Remote" in this field by mistake, which is honestly not an employment
 * type and must not be forced into one.
 */

export type EmploymentTypeCategory =
  | "full_time"
  | "part_time"
  | "contract"
  | "internship"
  | "temporary";

// Order matters: check the most specific commitment level first so e.g.
// "Contract Full time" lands in contract (the distinguishing fact), not
// full_time.
const RULES: Array<{ category: EmploymentTypeCategory; pattern: RegExp }> = [
  { category: "internship", pattern: /intern/i },
  { category: "contract", pattern: /contract|freelance/i },
  { category: "temporary", pattern: /seasonal|\btemp\b|temporary/i },
  { category: "part_time", pattern: /part.?time/i },
  {
    category: "full_time",
    // Includes a handful of unambiguous non-English equivalents seen in the
    // data (CDI = French "permanent full-time contract", 正社員 = Japanese
    // "full-time regular employee", Tiempo Completo = Spanish "full-time")
    // — translating an exact known term isn't a guess the way inferring
    // semantics from an ambiguous phrase would be.
    pattern: /full.?time|^standard$|^permanent$|^cdi$|正社員|tiempo completo/i,
  },
];

export function categorizeEmploymentType(
  employmentType: string | null,
): EmploymentTypeCategory | null {
  if (!employmentType) return null;
  for (const { category, pattern } of RULES) {
    if (pattern.test(employmentType)) return category;
  }
  return null;
}

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentTypeCategory, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
  temporary: "Temporary/Seasonal",
};
