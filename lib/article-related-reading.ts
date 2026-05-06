/** 與 product_articles.related_reading（JSON）一致 */
export interface ArticleRelatedLink {
  href: string;
  label: string;
}

export function normalizeArticleRelatedReadingJson(raw: unknown): ArticleRelatedLink[] {
  if (!Array.isArray(raw)) return [];
  const out: ArticleRelatedLink[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const href = typeof o.href === "string" ? o.href : "";
    const label = typeof o.label === "string" ? o.label : "";
    if (!href.trim() && !label.trim()) continue;
    out.push({ href, label });
  }
  return out;
}
