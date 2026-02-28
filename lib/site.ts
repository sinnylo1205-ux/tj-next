/**
 * Site config and helpers for canonical URLs, used by pages and metadata.
 * 正式站請在 Vercel/環境變數設定 NEXT_PUBLIC_SITE_URL=https://tjcookies.com.tw
 */
const BASE_URL =
  typeof window !== "undefined"
    ? window.location.origin
    : process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://tjcookies.com.tw");

/** 是否對所有會員開放信用卡付款（否則僅管理員） */
export const CREDIT_CARD_ENABLED_FOR_ALL = true;

export const SITE_CONFIG = {
  SITE_NAME: "T&J 客製化甜點",
  LOGO_URL:
    "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/brand_logo1.png",
  OG_IMAGE:
    "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/og.png",
  CONTACT: {
    phone: "02-2918-3981",
    email: "tj.tjump@gmail.com",
  },
} as const;

export function getFullUrl(path = "") {
  const base = BASE_URL.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}
