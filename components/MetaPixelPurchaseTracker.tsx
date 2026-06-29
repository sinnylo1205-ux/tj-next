"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { trackPurchase } from "@/lib/meta-pixel";
import { ga4Purchase } from "@/lib/ga4";
import { readPurchaseSnapshot, clearPurchaseSnapshot } from "@/lib/purchase-snapshot";

const FIRED_KEY_PREFIX = "tj_meta_purchase_fired:";

function PurchaseTrackerInner() {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("RtnCode") !== "1") return;

    const merchantTradeNo = searchParams.get("MerchantTradeNo") ?? "";
    // 以訂單交易編號去重，避免重整或返回時重複回報 Purchase
    const dedupeKey = `${FIRED_KEY_PREFIX}${merchantTradeNo}`;
    if (merchantTradeNo && typeof sessionStorage !== "undefined") {
      if (sessionStorage.getItem(dedupeKey)) return;
      sessionStorage.setItem(dedupeKey, "1");
    }

    const snapshot = readPurchaseSnapshot(merchantTradeNo);
    // 金額以快照為主、綠界 TradeAmt 為輔
    const value = snapshot?.value ?? Number(searchParams.get("TradeAmt")) ?? 0;

    trackPurchase({ value, orderId: merchantTradeNo || undefined, contentIds: snapshot?.contentIds });
    ga4Purchase({ value, transactionId: merchantTradeNo || undefined, items: snapshot?.items });

    if (snapshot) clearPurchaseSnapshot(merchantTradeNo);
  }, [searchParams]);

  return null;
}

/** 偵測綠界付款成功導回（RtnCode=1）並回報 Meta 像素 Purchase 與 GA4 purchase 事件。 */
export function MetaPixelPurchaseTracker() {
  return (
    <Suspense fallback={null}>
      <PurchaseTrackerInner />
    </Suspense>
  );
}
