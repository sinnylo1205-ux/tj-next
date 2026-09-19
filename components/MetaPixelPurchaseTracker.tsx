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
    const reportVerifiedPurchase = async () => {
      const pendingPayment = readPendingCreditCardPayment();
      if (!pendingPayment?.isFresh) return;

      const isVerified = await waitForCreditCardOrderVerification(pendingPayment.orderId);
      if (cancelled || !isVerified) return;

      // 以訂單 id 去重，避免重整或返回時重複回報 Purchase。
      const dedupeKey = `${FIRED_KEY_PREFIX}${pendingPayment.orderId}`;
      if (typeof sessionStorage !== "undefined") {
        if (sessionStorage.getItem(dedupeKey)) return;
        sessionStorage.setItem(dedupeKey, "1");
      }

      const snapshot = readPurchaseSnapshot(pendingPayment.orderId);
      const value = snapshot?.value ?? Number(searchParams.get("TradeAmt")) ?? 0;

      trackPurchase({ value, orderId: pendingPayment.orderId, contentIds: snapshot?.contentIds });
      ga4Purchase({ value, transactionId: pendingPayment.orderId, items: snapshot?.items });

      if (snapshot) clearPurchaseSnapshot(pendingPayment.orderId);
    };

    reportVerifiedPurchase();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  return null;
}

/** 偵測綠界付款成功導回，並在訂單已驗證後回報 Meta 像素 Purchase 與 GA4 purchase 事件。 */
export function MetaPixelPurchaseTracker() {
  return (
    <Suspense fallback={null}>
      <PurchaseTrackerInner />
    </Suspense>
  );
}
