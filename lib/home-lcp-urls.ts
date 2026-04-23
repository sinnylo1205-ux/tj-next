/**
 * 首頁 Section 1：`layout` 預載須與 `SECTION1_BACKGROUND_URL`（桌機）／`SECTION1_MOBILE_BACKGROUND_URL`（手機）一致，
 * 否則 LCP 會多一次請求。
 */
const STORAGE =
  "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/home_page";

export const MOBILE_HERO_URL = `${STORAGE}/iphone_home_11zon.webp`;

/** 首頁 Section 1 桌機全寬背景（`app/page.tsx` fallback 與 layout 桌機預載需與此一致） */
export const SECTION1_BACKGROUND_URL = `${STORAGE}/home.webp`;

/** 首頁 Section 1 手機直式背景（`HomeSection1Mobile` 與 layout 行動預載需與此一致） */
export const SECTION1_MOBILE_BACKGROUND_URL = `${STORAGE}/awdeq-iiez2_11zon.webp`;

export const DESKTOP_HERO_FALLBACK_URL = SECTION1_BACKGROUND_URL;
