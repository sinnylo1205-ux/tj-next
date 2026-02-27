/**
 * 集中管理「訂購須知」與「客製化編輯器」路徑，便於全站替換與 SEO。
 * slug = product_id（與 DB product_notice.product_id、products.id 一致）。
 */
export function productNoticeUrl(productId: string): string {
  return `/product/${productId}`;
}

/** 有訂購須知的商品 id 列表（用於 JSON-LD、sitemap、重定向）。與 layout itemListElement 一致。 */
export const PRODUCT_IDS_WITH_NOTICE = [
  "cotton",
  "macaron",
  "cupcake_cream",
  "cookie",
  "fortune_cookie",
  "longcake",
  "ice",
  "donut",
  "cakeball",
  "cupcake_choco",
  "popcorn",
  "giftbox_big",
  "giftbox_midium",
  "giftbox_small",
  "box_6",
  "box_3",
] as const;

/** 幸運籤餅乾在 DB 可能為 luck */
export const FORTUNE_COOKIE_IDS = ["fortune_cookie", "luck"] as const;

/** 客製化編輯器路徑：product_id -> /customizer/... 或 /meal-box-customizer/... */
export const CUSTOMIZER_PATHS: Record<string, string> = {
  cupcake_cream: "/customizer/cupcake_cream",
  cupcake_choco: "/customizer/cupcake_choco",
  longcake: "/customizer/longcake",
  donut: "/customizer/donut",
  macaron: "/customizer/macaron",
  cotton: "/customizer/cotton",
  ice: "/customizer/ice",
  cookie: "/customizer/cookie",
  popcorn: "/customizer/popcorn",
  luck: "/customizer/luck",
  cakeball: "/customizer/cakeball",
  giftbox_big: "/customizer/giftbox_big",
  giftbox_midium: "/customizer/giftbox_midium",
  giftbox_small: "/customizer/giftbox_small",
  box_3: "/meal-box-customizer/box_3",
  box_6: "/meal-box-customizer/box_6",
};
