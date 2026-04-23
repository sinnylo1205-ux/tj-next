import { articleTocSlugId } from "@/lib/article-toc-slug";

/** 伺服端輸出的 HTML 為每個 <h2> 加上與前台目錄一致的 id（避免僅依賴 client 掛 id 時序／與 React innerHTML 不同步） */
export function injectH2AnchorIdsIntoHtml(html: string): string {
  let idx = 0;
  return html.replace(/<h2([^>]*)>([\s\S]*?)<\/h2>/gi, (full, attrs: string, inner: string) => {
    if (/\bid\s*=\s*["']/.test(attrs)) return full;
    const plain = inner.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    const id = articleTocSlugId(idx, plain || `section-${idx}`);
    idx++;
    const safeId = id.replace(/"/g, "&quot;");
    return `<h2${attrs} id="${safeId}">${inner}</h2>`;
  });
}
