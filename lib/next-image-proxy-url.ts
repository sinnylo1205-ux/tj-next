/**
 * 過去曾將文章 HTML 內 Supabase 圖改寫為 `/_next/image`；現改為**一律直連原始網址**，
 * 避免依賴 Vercel Image Optimization。
 */
const IMG_SUPABASE_SRC = /<img(\s[^>]*?)\ssrc="(https:\/\/[^"]*\.supabase\.co[^"]*)"/gi;

/** 保留函式簽名供呼叫端相容；直接回傳原 URL。 */
export function nextImageProxyUrl(remoteUrl: string, _width?: number, _quality?: number): string {
  return remoteUrl.trim();
}

/** 若 HTML 內曾含 proxy URL，可逐步淘汰；目前等同不修改（直連）。 */
export function rewriteSupabaseImgSrcInArticleHtml(html: string): string {
  if (!html) return html;
  return html.replace(IMG_SUPABASE_SRC, (_full, attrs: string, src: string) => {
    return `<img${attrs} src="${src.trim()}"`;
  });
}
