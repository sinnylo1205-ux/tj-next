/** 結帳／預建報價／Google 表單「如何認識我們」選項，值寫入 orders.customer_source 或 quotation_orders.customer_source */
export const CUSTOMER_SOURCE_OPTIONS = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram / IG" },
  { value: "facebook_ads", label: "FB廣告" },
  { value: "instagram_ads", label: "IG廣告" },
  { value: "threads", label: "Threads" },
  { value: "google", label: "Google 搜尋" },
  { value: "referral", label: "親友介紹" },
  { value: "repurchase", label: "再次回購" },
] as const;

export type CustomerSource = (typeof CUSTOMER_SOURCE_OPTIONS)[number]["value"];

const ALLOWED = new Set<string>(CUSTOMER_SOURCE_OPTIONS.map((o) => o.value));

export function isCustomerSource(v: unknown): v is CustomerSource {
  return typeof v === "string" && ALLOWED.has(v);
}

export function getCustomerSourceLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return CUSTOMER_SOURCE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

/**
 * 將 Google 表單「如何知道我們？」原文正規化為 DB enum。
 * 表單選項：IG / threads / google 搜尋 / 親友介紹 / 再次回購
 */
export function normalizeCustomerSource(raw: unknown): CustomerSource | null {
  if (raw == null || typeof raw !== "string") return null;
  const t = raw.trim().toLowerCase();
  if (!t) return null;

  if (ALLOWED.has(t)) return t as CustomerSource;

  // 廣告要先於一般社群
  if (
    (t.includes("facebook") || t.includes("fb")) &&
    (t.includes("廣告") || t.includes("ads"))
  ) {
    return "facebook_ads";
  }
  if (
    (t.includes("instagram") || /\big\b/.test(t) || t === "ig") &&
    (t.includes("廣告") || t.includes("ads"))
  ) {
    return "instagram_ads";
  }

  if (t.includes("再次回購") || t.includes("回購") || t.includes("repurchase") || t.includes("returning")) {
    return "repurchase";
  }
  if (t.includes("facebook") || t === "fb") return "facebook";
  if (t.includes("instagram") || t === "ig" || /\big\b/.test(t)) return "instagram";
  if (t.includes("threads")) return "threads";
  if (t.includes("google") || t.includes("搜尋")) return "google";
  if (t.includes("親友") || t.includes("介紹") || t.includes("referral")) return "referral";

  return null;
}
