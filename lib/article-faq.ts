/** 與 product_articles.faq（JSON）及前台 Accordion 一致 */
export interface ArticleFaqItem {
  question: string;
  answer: string;
}

export function normalizeArticleFaqJson(raw: unknown): ArticleFaqItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ArticleFaqItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const question = typeof o.question === "string" ? o.question : "";
    const answer = typeof o.answer === "string" ? o.answer : "";
    if (!question.trim() && !answer.trim()) continue;
    out.push({ question, answer });
  }
  return out;
}
