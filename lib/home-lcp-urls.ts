/**
 * 首頁 Section 1 hero：layout preload 與 `app/page.tsx` 必須使用同一 URL，否則行動 LCP 會多一次無效預載。
 *
 * **目標 &lt;100KiB（資產流程）**：以寬約 390–430px、品質約 75–82 輸出 WebP，上傳至同路徑或新檔名後，
 * 只更新 `MOBILE_HERO_URL`（並保留 layout preload 與此常數一致）。行動首屏圖以 `SafeImage`（直連）+ `sizes` 等控制。
 */
const STORAGE =
  "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/home_page";

export const MOBILE_HERO_URL = `${STORAGE}/iphone_home_11zon.webp`;

export const DESKTOP_HERO_FALLBACK_URL = `${STORAGE}/home.webp`;
