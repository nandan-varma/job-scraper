/**
 * Buckets the verbatim, per-ATS `department` string into a small set of
 * broad categories for filtering — 8,502 companies each name their teams
 * differently ("Engineering" vs "R&D" vs "Software and Services"), and some
 * departments are literal noise (a company's internal campaign/cost-center
 * name, e.g. "Drive EMEA '26"). Matching is keyword-based against the raw
 * string, same discipline as workMode's 'inferred' tier: advisory only,
 * ordered so the most specific/distinctive signal wins first, and anything
 * that doesn't clearly match falls to `null` (shown as "Other") rather than
 * being forced into the nearest bucket. The raw department string is never
 * discarded — it stays in the `department` column for search and display;
 * this is purely an additional facet dimension.
 */

export type DepartmentCategory =
  | "engineering"
  | "product"
  | "design"
  | "data"
  | "sales"
  | "marketing"
  | "customer_success"
  | "operations"
  | "finance"
  | "legal"
  | "people"
  | "clinical"
  | "manufacturing"
  | "executive";

const RULES: Array<{ category: DepartmentCategory; pattern: RegExp }> = [
  // Order matters: more specific/distinctive patterns first, so e.g. "Data
  // Engineering" lands in Data (not Engineering) and "Product Marketing"
  // lands in Marketing (not Product).
  {
    category: "clinical",
    pattern:
      /\bclinical\b|nursing|patient|caregiver|behavior technician|medical\b/i,
  },
  {
    category: "data",
    pattern:
      /\bdata (science|engineering|analytics)\b|\bdata\b$|machine learning|\bml\b|analytics\b/i,
  },
  { category: "design", pattern: /\bdesign\b|\bux\b|\bui\b|creative\b/i },
  { category: "product", pattern: /\bproduct\b/i },
  {
    category: "people",
    pattern:
      /\bpeople\b|human resources|\bhr\b|talent\b|recruiting|recruitment/i,
  },
  { category: "legal", pattern: /\blegal\b|compliance|regulatory/i },
  {
    category: "finance",
    pattern: /\bfinance\b|accounting|treasury|\bfp&a\b|^tax$/i,
  },
  {
    category: "customer_success",
    pattern: /customer (success|support|experience|service)|\bsupport\b/i,
  },
  {
    category: "marketing",
    pattern: /marketing|\bbrand\b|communications|\bpr\b|content\b|\bgrowth\b/i,
  },
  {
    category: "sales",
    pattern:
      /\bsales\b|account executive|account management|business development|\bbd\b|\brevenue\b|partnerships|\bgtm\b|go.?to.?market|commercial\b/i,
  },
  {
    category: "engineering",
    // R&D forms stay engineering (tech R&D), but a bare "Research" is
    // overwhelmingly pharma/biotech/quant-lab science in this dataset (~1k
    // open rows, e.g. "Research", "Quantitative Research", "Investment
    // Research") and gets force-bucketed into software-engineering roles
    // today — dropping the standalone token sends those to "Other" (honest)
    // instead of a confident misbucket. "Research Engineer"-style groups
    // still match via `engineer`.
    pattern:
      /engineer|developer|\bswe\b|software (dev|engineering)|\br&d\b|research\s*(&|and)?\s*development|hardware\b|information technology|^it$|technology\b|dev.?ops|infrastructure|technical staff|\bsecurity\b|quality assurance/i,
  },
  {
    category: "manufacturing",
    pattern:
      /manufacturing|production|warehouse|supply chain|reconditioning|field operations|logistics|\bretail\b|\bstores?\b|in-store/i,
  },
  {
    category: "executive",
    pattern: /executive|leadership|\bc-suite\b|^chief\b|\bceo\b/i,
  },
  { category: "operations", pattern: /\boperations\b|\bops\b/i },
];

export function categorizeDepartment(
  department: string | null,
): DepartmentCategory | null {
  if (!department) return null;
  for (const { category, pattern } of RULES) {
    if (pattern.test(department)) return category;
  }
  return null;
}

export const DEPARTMENT_CATEGORY_LABELS: Record<DepartmentCategory, string> = {
  engineering: "Engineering",
  product: "Product",
  design: "Design",
  data: "Data & Analytics",
  sales: "Sales",
  marketing: "Marketing",
  customer_success: "Customer Success",
  operations: "Operations",
  finance: "Finance",
  legal: "Legal",
  people: "People & HR",
  clinical: "Clinical & Healthcare",
  manufacturing: "Manufacturing & Field",
  executive: "Executive",
};
