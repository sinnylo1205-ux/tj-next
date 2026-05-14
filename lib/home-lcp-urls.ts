/**
 * 首頁 Section 1 hero：layout preload 與 `HomeSection1Mobile` 必須使用同一 URL，否則行動 LCP 會多一次無效預載。
 *
 * 手機全幅背景圖：換檔時只更新 `MOBILE_HERO_URL` 檔名，並維持 `app/layout.tsx` preload 與此常數一致。
 */
const STORAGE =
  "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/home_page";

export const MOBILE_HERO_URL = `${STORAGE}/iphone.webp`;

export const DESKTOP_HERO_FALLBACK_URL = `${STORAGE}/home.webp`;
