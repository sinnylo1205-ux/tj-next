import { asOrderCustomizationsList } from "@/lib/order-item-customizations";
import { FORTUNE_COOKIE_IDS } from "@/lib/product-notice-url";

const FORTUNE_COOKIE_ID_SET = new Set<string>(FORTUNE_COOKIE_IDS);
const CUSTOMIZER_UPLOADS_BUCKET = "customizer_uploads";

export type LuckLayoutStatus = "pending" | "ready" | "failed" | "skipped" | null;

export function isFortuneCookieProductId(productId: string | null | undefined): boolean {
  return Boolean(productId && FORTUNE_COOKIE_ID_SET.has(productId));
}

/** 從 customizations_json 取出純文字模式上傳的 CSV URL */
export function getLuckTextCsvUrl(customizationsJson: unknown): string | null {
  const list = asOrderCustomizationsList(customizationsJson);
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as Record<string, unknown>;
    if (c.group !== "text") continue;
    const value = c.value;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const url = (value as { url?: unknown }).url;
      if (typeof url === "string" && url.trim()) return url.trim();
    }
  }
  return null;
}

export function isLuckTextCsvItem(item: {
  product_id?: string | null;
  customizations_json?: unknown;
}): boolean {
  if (!isFortuneCookieProductId(item.product_id)) return false;
  const url = getLuckTextCsvUrl(item.customizations_json);
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (supabaseUrl && parsed.origin !== new URL(supabaseUrl).origin) return false;
    const prefix = `/storage/v1/object/public/${CUSTOMIZER_UPLOADS_BUCKET}/`;
    if (!parsed.pathname.startsWith(prefix)) return false;
    const objectPath = decodeURIComponent(parsed.pathname.slice(prefix.length));
    return Boolean(objectPath && !objectPath.includes("..") && objectPath.toLowerCase().endsWith(".csv"));
  } catch {
    return false;
  }
}
