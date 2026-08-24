/** Curated starter set loaded on first paint for a fast, impressive landing. */
export const FEATURED: string[] = [
  "openai",
  "anthropic",
  "stripe",
  "databricks",
  "vercel",
  "linear",
  "cursor",
  "notion",
  "perplexity",
  "xai",
  "nvidia",
  "apple",
  "palantir",
  "cloudflare",
  "figma",
  "roblox",
];

export interface StarterPack {
  id: string;
  label: string;
  slugs: string[];
}

/** Quick-add company bundles by category — shown on onboarding and in the
 * toolbar so users don't have to hand-search the 8.5k-company registry. */
export const STARTER_PACKS: StarterPack[] = [
  { id: "popular", label: "Popular picks", slugs: FEATURED },
  {
    id: "fintech",
    label: "Fintech & Crypto",
    slugs: [
      "coinbase",
      "robinhood",
      "plaid",
      "chime",
      "affirm",
      "ramp",
      "block",
      "wise",
    ],
  },
  {
    id: "gaming",
    label: "Gaming & Media",
    slugs: ["riotgames", "epicgames", "discord", "twitch", "spotify"],
  },
  {
    id: "devtools",
    label: "Dev Tools & Infra",
    slugs: [
      "gitlab",
      "mongodb",
      "datadog",
      "elastic",
      "supabase",
      "netlify",
      "docker",
      "circleci",
    ],
  },
  {
    id: "enterprise",
    label: "Enterprise Tech",
    slugs: ["salesforce", "adobe", "intel", "uber", "airbnb"],
  },
];
