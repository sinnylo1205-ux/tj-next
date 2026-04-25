/**
 * Site config and helpers for canonical URLs, used by pages and metadata.
 * 正式站請在 Vercel/環境變數設定 NEXT_PUBLIC_SITE_URL=https://tjcookies.com.tw
 * 伺服器端不採用 VERCEL_URL，避免 sitemap/metadata 使用預覽網址；未設定時預設為正式網域。
 */
const BASE_URL =
  typeof window !== "undefined"
    ? window.location.origin
    : process.env.NEXT_PUBLIC_SITE_URL || "https://tjcookies.com.tw";

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

/** JSON-LD `@id`：與根 layout LocalBusiness 一致 */
export function getJsonLdBusinessId(): string {
  return getFullUrl("/#local-business");
}

/** JSON-LD `@id`：與根 layout WebSite 一致 */
export function getJsonLdWebsiteId(): string {
  return getFullUrl("/#website");
}

const DEFAULT_INSTAGRAM = "https://www.instagram.com/tjcookies99/";
const DEFAULT_FACEBOOK = "https://www.facebook.com/TjFortuneCookies/";
const DEFAULT_LINE = "https://lin.ee/Tp9U5bf";

/** IG／FB／LINE 官網連結（Footer、JSON-LD sameAs 共用） */
export function getSocialProfileUrls(): { instagram: string; facebook: string; line: string } {
  const raw = process.env.NEXT_PUBLIC_SAME_AS_URLS;
  const fromEnv =
    typeof raw === "string" && raw.trim()
      ? raw.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
  const pick = (test: (u: string) => boolean, fallback: string) =>
    fromEnv.find(test) ?? fallback;
  return {
    instagram: pick((u) => /instagram\.com/i.test(u), DEFAULT_INSTAGRAM),
    facebook: pick((u) => /facebook\.com/i.test(u), DEFAULT_FACEBOOK),
    line: pick((u) => /lin\.ee|line\.me/i.test(u), DEFAULT_LINE),
  };
}

/**
 * 官網對外社群（schema.org sameAs，不重複、固定順序）。
 * 可設 `NEXT_PUBLIC_SAME_AS_URLS` 為逗號分隔 URL；會依網域對應至 IG／FB／LINE，缺項用預設補齊。
 */
export function getSameAsProfileUrls(): string[] {
  const { instagram, facebook, line } = getSocialProfileUrls();
  return [...new Set([instagram, facebook, line])];
}
