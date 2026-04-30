/**
 * Supabase Storage 公開圖網址 → 圖片轉換 API（render/image）
 *
 * 原始：`…/storage/v1/object/public/{bucket}/{path}`
 * 轉換：`…/storage/v1/render/image/public/{bucket}/{path}?width=…&quality=…`
 *
 * **免費方案**：Supabase **不提供** Storage 雲端縮圖／轉 WebP（Image Transformation 為 **Pro 以上**）。
 * 本檔預設**不會**改寫網址（避免免費專案誤用 `render/image` 得到錯誤或額外計費預期）。
 * 若日後升級 Pro 並啟用轉圖：在 `.env.local` 設 `NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORM=true` 後，`optimizeImage` 才會改寫成 `render/image`。
 *
 * 免費專案建議：上傳前壓縮（專案內已有 `convertToWebP` 等）、控制長邊解析度、列表用較小檔。
 * @see https://supabase.com/docs/guides/storage/serving/image-transformations
 */

const OBJECT_PUBLIC = "/storage/v1/object/public/";
const RENDER_PUBLIC = "/storage/v1/render/image/public/";

/** 僅在明確開啟時才改寫為 `render/image`（Pro 方案） */
export function isSupabaseImageTransformEnabled(): boolean {
  if (typeof process === "undefined") return false;
  const v = process.env.NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORM;
  return v === "true" || v === "1";
}

function clampQuality(q: number): number {
  return Math.min(100, Math.max(20, Math.round(q)));
}

function isSupabaseHost(hostname: string): boolean {
  return hostname.endsWith(".supabase.co") || hostname === "supabase.co";
}

/** 是否為可轉成 render/image 的 object 公開網址 */
export function isSupabaseStoragePublicObjectUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return isSupabaseHost(u.hostname) && u.pathname.includes(OBJECT_PUBLIC);
  } catch {
    return false;
  }
}

export type OptimizeSupabaseImageOptions = {
  width?: number;
  height?: number;
  /** 20–100，預設 80（與 Supabase 文件一致） */
  quality?: number;
  resize?: "cover" | "contain" | "fill";
  /** 強制原圖格式；不傳則由 Storage 依瀏覽器自動最佳化（多為 WebP） */
  format?: "origin";
};

/**
 * 將 Supabase `object/public` 或已是 `render/image/public` 的網址加上縮圖／品質參數。
 * 非 Supabase Storage 公開物件網址則**原樣回傳**（不破壞外部 CDN、相對路徑等）。
 * 未設定 `NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORM=true` 時，Supabase 網址也**原樣回傳**（適用免費方案）。
 */
export function optimizeSupabaseStorageImage(
  url: string | null | undefined,
  options: OptimizeSupabaseImageOptions = {},
): string {
  if (url == null || typeof url !== "string") return "";
  const trimmed = url.trim();
  if (!trimmed) return "";

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return trimmed;
  }

  if (!isSupabaseHost(parsed.hostname)) return trimmed;

  if (!isSupabaseImageTransformEnabled()) {
    return trimmed;
  }

  let path = parsed.pathname;
  if (path.includes(OBJECT_PUBLIC)) {
    path = path.replace(OBJECT_PUBLIC, RENDER_PUBLIC);
  } else if (!path.includes(RENDER_PUBLIC)) {
    return trimmed;
  }

  const params = new URLSearchParams(parsed.search);
  const { width, height, quality = 80, resize, format } = options;
  if (width != null && width > 0) params.set("width", String(Math.min(2500, Math.round(width))));
  if (height != null && height > 0) params.set("height", String(Math.min(2500, Math.round(height))));
  params.set("quality", String(clampQuality(quality)));
  if (resize) params.set("resize", resize);
  if (format) params.set("format", format);

  parsed.pathname = path;
  // URL.search 賦值時不需加「?」，空字串會清除 query
  parsed.search = params.toString();
  return parsed.toString();
}

/**
 * 簡寫：給 `<img src={optimizeImage(url, 400)} />` 用。
 * 第三參數為 quality（20–100），預設 80。
 * 免費方案未開 env 時等同不處理，請以上傳小圖為主。
 */
export function optimizeImage(url: string | null | undefined, width = 500, quality = 80): string {
  return optimizeSupabaseStorageImage(url, { width, quality });
}
