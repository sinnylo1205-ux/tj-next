/**
 * 伺服端預測文章是否會出現「目錄」側欄，與前台 ArticleTocSidebar 掃描 h2 的結果對齊，
 * 讓首屏即用雙欄 grid，避免 client hydration 後才插入側欄造成 CLS。
 */
export function expectsArticleToc(
  article: {
    content_mode?: string | null;
    why_custom?: string;
    custom_options?: unknown[] | null;
    use_cases?: unknown[] | null;
    faq?: unknown[] | null;
  },
  richBodyHtml: string | null | undefined,
): boolean {
  if (article.content_mode === "richtext" && richBodyHtml && /<h2\b/i.test(richBodyHtml)) {
    return true;
  }
  if (article.content_mode === "richtext") {
    return false;
  }
  return !!(
    (article.why_custom && article.why_custom.trim()) ||
    (article.custom_options?.length ?? 0) > 0 ||
    (article.use_cases?.length ?? 0) > 0 ||
    (article.faq?.length ?? 0) > 0
  );
}
