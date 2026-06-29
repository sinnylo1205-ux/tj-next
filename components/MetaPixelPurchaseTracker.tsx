"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { trackPurchase } from "@/lib/meta-pixel";
import { ga4Purchase } from "@/lib/ga4";
import { readPurchaseSnapshot, clearPurchaseSnapshot } from "@/lib/purchase-snapshot";
import {
  getCreditCardReturnSignal,
  readPendingCreditCardPayment,
  waitForCreditCardOrderVerification,
} from "@/lib/credit-card-payment-status";

const FIRED_KEY_PREFIX = "tj_meta_purchase_fired:";

function PurchaseTrackerInner() {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (getCreditCardReturnSignal(searchParams) !== "success") return;

    let cancelled = false;
    const merchantTradeNo = searchParams.get("MerchantTradeNo") ?? "";
    const pendingPayment = readPendingCreditCardPayment();
    const trackingOrderKey = merchantTradeNo || pendingPayment?.orderId || "";
    if (!pendingPayment?.isFresh || !trackingOrderKey) return;

    // 以訂單交易編號去重，避免重整或返回時重複回報 Purchase
    const dedupeKey = `${FIRED_KEY_PREFIX}${trackingOrderKey}`;
    if (typeof sessionStorage !== "undefined") {
      if (sessionStorage.getItem(dedupeKey)) return;
    }

    const sendPurchaseEvent = async () => {
      const isVerified = await waitForCreditCardOrderVerification(pendingPayment.orderId);
      if (cancelled || !isVerified) return;
      if (typeof sessionStorage !== "undefined") {
        if (sessionStorage.getItem(dedupeKey)) return;
        sessionStorage.setItem(dedupeKey, "1");
      }

      const snapshot = readPurchaseSnapshot(trackingOrderKey);
      const value = snapshot?.value ?? 0;

      trackPurchase({ value, orderId: trackingOrderKey, contentIds: snapshot?.contentIds });
      ga4Purchase({ value, transactionId: trackingOrderKey, items: snapshot?.items });

      if (snapshot) clearPurchaseSnapshot(trackingOrderKey);
    };

    sendPurchaseEvent();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  return null;
}

/** 偵測綠界付款成功導回，確認訂單已付款後才回報 Meta 像素 Purchase 與 GA4 purchase 事件。 */
export function MetaPixelPurchaseTracker() {
  return (
    <Suspense fallback={null}>
      <PurchaseTrackerInner />
    </Suspense>
  );
}
