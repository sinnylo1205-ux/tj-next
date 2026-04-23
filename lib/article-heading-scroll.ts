/**
 * 使用瀏覽器原生 scrollIntoView，讓 .article-readable-zone h2 的 scroll-margin-top（globals.css）
 * 與頂部 Nav 對齊；避免手算 window.scrollY 與捲動根不一致。
 */
export function scrollToArticleHeading(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
      try {
        history.replaceState(null, "", `#${id}`);
      } catch {
        /* ignore */
      }
    });
  });
}
