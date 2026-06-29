/**
 * GA4 電商事件輔助工具。
 * GA4 本體（gtag.js + config）在 app/layout.tsx 載入，此處只負責送出事件。
 * 事件規格參考 GA4 建議的 ecommerce 結構：add_to_cart / begin_checkout / purchase。
 */

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

export const GA4_CURRENCY = "TWD";

export interface GA4Item {
  item_id: string;
  item_name: string;
  quantity: number;
  price: number;
}

function sendGtagEvent(event: string, params: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  if (typeof window.gtag === "function") {
    window.gtag("event", event, params);
    return;
  }
  // gtag.js 尚未載入完成時，直接推入 dataLayer 佇列，待載入後會被處理
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(["event", event, params]);
}

interface CartLikeItem {
  name?: string;
  product_id?: string;
  quantity?: number;
  total_price?: number;
  price?: number;
}

function toGA4Item(item: CartLikeItem): GA4Item {
  const quantity = item.quantity ?? 1;
  const lineTotal = item.total_price ?? item.price ?? 0;
  return {
    item_id: item.product_id ?? "",
    item_name: item.name ?? "",
    quantity,
    price: quantity > 0 ? Math.round((lineTotal / quantity) * 100) / 100 : lineTotal,
  };
}

/** 加入購物車 */
export function ga4AddToCart(item: CartLikeItem) {
  sendGtagEvent("add_to_cart", {
    currency: GA4_CURRENCY,
    value: item.total_price ?? item.price ?? 0,
    items: [toGA4Item(item)],
  });
}

/** 開始結帳 */
export function ga4BeginCheckout(items: CartLikeItem[], value: number) {
  sendGtagEvent("begin_checkout", {
    currency: GA4_CURRENCY,
    value,
    items: items.map(toGA4Item),
  });
}

/** 完成購買 */
export function ga4Purchase(params: { value: number; transactionId?: string; items?: GA4Item[] }) {
  sendGtagEvent("purchase", {
    transaction_id: params.transactionId,
    currency: GA4_CURRENCY,
    value: params.value,
    items: params.items ?? [],
  });
}
