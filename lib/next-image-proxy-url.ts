/**
 * 將文章 HTML 內 Supabase Storage 的 <img src="https://…supabase.co/…"> 改為 Next 圖片最佳化 URL，
 * 讓存在資料庫／Storage、經 Tiptap 輸出的圖片也能走 Vercel `/_next/image`（無需在程式碼寫死每張網址）。
 * 非 Supabase 的 src 保持不變（若走 `/_next/image` 且網域未列入 next.config，請求會失敗）。
 */
const IMG_SUPABASE_SRC = /<img(\s[^>]*?)\ssrc="(https:\/\/[^"]*\.supabase\.co[^"]*)"/gi;

/** Next 圖片 API 支援的寬度之一，見 next/image 文件 */
const DEFAULT_ARTICLE_W = 828;

export function nextImageProxyUrl(remoteUrl: string, width = DEFAULT_ARTICLE_W, quality = 75): string {
  const trimmed = remoteUrl.trim();
  try {
    const u = new URL(trimmed);
    if (!u.hostname.endsWith(".supabase.co")) return trimmed;
  } catch {
    return trimmed;
  }
  const q = Math.min(100, Math.max(1, Math.round(quality)));
  const w = Math.min(3840, Math.max(16, Math.round(width)));
  return `/_next/image?url=${encodeURIComponent(trimmed)}&w=${w}&q=${q}`;
}

export function rewriteSupabaseImgSrcInArticleHtml(html: string): string {
  if (!html) return html;
  return html.replace(IMG_SUPABASE_SRC, (_full, attrs: string, src: string) => {
    const proxied = nextImageProxyUrl(src, DEFAULT_ARTICLE_W, 75);
    return `<img${attrs} src="${proxied}"`;
  });
}
