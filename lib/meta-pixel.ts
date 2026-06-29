/**
 * Meta（Facebook）像素事件輔助工具。
 * 像素本體在 app/layout.tsx 初始化（fbq init + PageView），此處只負責送出轉換事件。
 */

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

export const META_CURRENCY = "TWD";

type MetaContent = { id: string; quantity: number };

interface MetaEventParams {
  content_name?: string;
  content_ids?: string[];
  content_type?: string;
  contents?: MetaContent[];
  num_items?: number;
  value?: number;
  currency?: string;
}

/** 送出一個標準 Meta 像素事件（fbq 尚未載入時自動略過） */
export function trackMetaEvent(event: string, params?: MetaEventParams) {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return;
  window.fbq("track", event, params);
}

interface CartLikeItem {
  name?: string;
  product_id?: string;
  quantity?: number;
  total_price?: number;
  price?: number;
}

/** 加入購物車 */
export function trackAddToCart(item: CartLikeItem) {
  trackMetaEvent("AddToCart", {
    content_name: item.name,
    content_ids: item.product_id ? [item.product_id] : undefined,
    content_type: "product",
    contents: [{ id: item.product_id ?? "", quantity: item.quantity ?? 1 }],
    value: item.total_price ?? item.price ?? 0,
    currency: META_CURRENCY,
  });
}

/** 開始結帳 */
export function trackInitiateCheckout(items: CartLikeItem[], value: number) {
  trackMetaEvent("InitiateCheckout", {
    content_ids: items.map((i) => i.product_id ?? "").filter(Boolean),
    content_type: "product",
    contents: items.map((i) => ({ id: i.product_id ?? "", quantity: i.quantity ?? 1 })),
    num_items: items.reduce((sum, i) => sum + (i.quantity ?? 1), 0),
    value,
    currency: META_CURRENCY,
  });
}

/** 完成購買 */
export function trackPurchase(params: { value: number; orderId?: string; contentIds?: string[] }) {
  trackMetaEvent("Purchase", {
    content_ids: params.contentIds,
    content_type: "product",
    value: params.value,
    currency: META_CURRENCY,
  });
}
