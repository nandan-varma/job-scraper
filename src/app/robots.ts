import type { MetadataRoute } from "next";

// Filters live in URL query params (nuqs) — every combination is a distinct,
// linkable URL. Nothing previously stopped a crawler from walking that
// combinatorial space, each hit an uncached computeBrowseFacets/computeBrowseJobs
// call. The canonical "/" (default, unfiltered) and company pages stay
// crawlable; query-string permutations of the browse view don't need
// indexing anyway — they're not distinct content, just filtered views of it.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/?*",
    },
  };
}
