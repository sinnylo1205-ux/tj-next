/**
 * 購買事件商品明細快照。
 * 綠界付款導回時只帶得到 RtnCode/TradeAmt/MerchantTradeNo，拿不到商品明細，
 * 因此在「發起付款」當下先把明細存進 localStorage，導回後再讀回，
 * 讓 Meta Purchase 與 GA4 purchase 都能帶完整 items。
 */

import type { GA4Item } from "@/lib/ga4";

const SNAPSHOT_KEY_PREFIX = "tj_purchase_snapshot:";

export interface PurchaseSnapshot {
  value: number;
  contentIds: string[];
  items: GA4Item[];
}

/** MerchantTradeNo 前 10 碼 = order_id 去連字號後前 10 碼，用來對應快照 */
function snapshotKeyFromTradeKey(tradeKey: string): string {
  return `${SNAPSHOT_KEY_PREFIX}${tradeKey.replace(/-/g, "").substring(0, 10)}`;
}

export function savePurchaseSnapshot(orderId: string, snapshot: PurchaseSnapshot) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(snapshotKeyFromTradeKey(orderId), JSON.stringify(snapshot));
  } catch {}
}

export function readPurchaseSnapshot(merchantTradeNo: string): PurchaseSnapshot | null {
  if (typeof window === "undefined" || !merchantTradeNo) return null;
  try {
    const raw = localStorage.getItem(snapshotKeyFromTradeKey(merchantTradeNo));
    return raw ? (JSON.parse(raw) as PurchaseSnapshot) : null;
  } catch {
    return null;
  }
}

export function clearPurchaseSnapshot(merchantTradeNo: string) {
  if (typeof window === "undefined" || !merchantTradeNo) return;
  try {
    localStorage.removeItem(snapshotKeyFromTradeKey(merchantTradeNo));
  } catch {}
}
