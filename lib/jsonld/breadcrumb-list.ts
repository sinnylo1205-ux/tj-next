import { getFullUrl } from "@/lib/site";

export type BreadcrumbSegment = { name: string; path: string };

/** Schema.org BreadcrumbList（JSON-LD）。`path` 為站內路徑，例如 `"/"`、`"/order"`。 */
export function buildBreadcrumbListJsonLd(segments: readonly BreadcrumbSegment[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: segments.map((seg, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: seg.name,
      item: getFullUrl(seg.path.startsWith("/") ? seg.path : `/${seg.path}`),
    })),
  };
}
