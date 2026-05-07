/**
 * 部落格文章 HTML 內圖片：可改寫為 Supabase `render/image`（需 Pro + 啟用轉圖 +
 * `NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORM=true`），並加上 `srcset`／`sizes` 以改善 LCP／節省流量。
 * 非 Supabase `object/public` 網址一律不修改。
 */
import {
  isSupabaseImageTransformEnabled,
  isSupabaseStoragePublicObjectUrl,
  optimizeSupabaseStorageImage,
} from "@/lib/supabase-image-url";

/** `<img … src="https://…supabase…/storage/v1/object/public/…" …>` */
const IMG_TAG_OBJECT_SRC =
  /<img(\s[^>]*?\ssrc=")(https:\/\/[^"]*\.supabase\.co\/storage\/v1\/object\/public\/[^"]+)(")([^>]*>)/gi;

/** 移除既有 srcset／sizes，避免改寫後重複 */
function stripSrcsetAndSizes(attrs: string): string {
  return attrs
    .replace(/\s+srcset\s*=\s*"[^"]*"/gi, "")
    .replace(/\s+srcset\s*=\s*'[^']*'/gi, "")
    .replace(/\s+sizes\s*=\s*"[^"]*"/gi, "")
    .replace(/\s+sizes\s*=\s*'[^']*'/gi, "");
}

function escapeAttrDoubleQuoted(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/**
 * 將文章 HTML 中 Supabase Storage **公開原圖**（`object/public`）改為 `render/image` 並附帶寬度參數。
 * 未開 `NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORM` 時**不修改** HTML。
 */
export function rewriteSupabaseImgSrcInArticleHtml(html: string): string {
  if (!html) return html;
  if (!isSupabaseImageTransformEnabled()) return html;

  const quality = 78;
  const widths = [480, 720, 1200] as const;
  const defaultW = 800;

  return html.replace(
    IMG_TAG_OBJECT_SRC,
    (_full, beforeSrc: string, src: string, quote: string, tail: string) => {
      const trimmed = src.trim();
      if (!isSupabaseStoragePublicObjectUrl(trimmed)) {
        return `<img${beforeSrc}${escapeAttrDoubleQuoted(trimmed)}${quote}${tail ?? ""}`;
      }

      const newSrc = optimizeSupabaseStorageImage(trimmed, { width: defaultW, quality });
      const srcSet = widths
        .map((w) => `${optimizeSupabaseStorageImage(trimmed, { width: w, quality })} ${w}w`)
        .join(", ");
      const sizesAttr = "(max-width: 768px) 100vw, 680px";
      const cleanTail = stripSrcsetAndSizes(tail ?? "");

      return `<img${beforeSrc}${escapeAttrDoubleQuoted(newSrc)}${quote} srcset="${escapeAttrDoubleQuoted(srcSet)}" sizes="${escapeAttrDoubleQuoted(sizesAttr)}"${cleanTail}`;
    },
  );
}

/** 保留函式簽名供呼叫端相容；直接回傳原 URL。 */
export function nextImageProxyUrl(remoteUrl: string, _width?: number, _quality?: number): string {
  return remoteUrl.trim();
}
