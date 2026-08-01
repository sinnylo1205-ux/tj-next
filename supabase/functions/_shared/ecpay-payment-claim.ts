/**
 * ECPay 付款成功回呼的訂單認領規則。
 * Keep in sync with lib/ecpay-payment-claim.ts
 */

export const ECPAY_BLOCKED_ORDER_STATUSES = [
  "cancelled",
  "canceled",
  "closed",
  "completed",
  "refunded",
] as const;

export const ECPAY_CLAIMABLE_PAYMENT_STEPS = ["pending", "submitted"] as const;

export const ECPAY_FULFILLMENT_STATUSES_TO_PRESERVE = [
  "processing",
  "shipped",
  "delivered",
] as const;

export type EcpayClaimOrderSnapshot = {
  payment_step: string | null | undefined;
  order_status: string | null | undefined;
  is_hide?: boolean | null | undefined;
};

export type EcpayClaimDecision =
  | { action: "already_verified" }
  | { action: "ineligible"; reason: string }
  | { action: "claim" };

export function normalizeStatus(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

/**
 * Decide whether a signed ECPay success callback may advance this order.
 * Canceled / soft-hidden / terminal orders must not be silently resurrected
 * into fulfillment; those late captures need human reconciliation.
 */
export function evaluateEcpayPaymentClaim(order: EcpayClaimOrderSnapshot): EcpayClaimDecision {
  const paymentStep = normalizeStatus(order.payment_step);
  if (paymentStep === "verified") {
    return { action: "already_verified" };
  }

  if (!(ECPAY_CLAIMABLE_PAYMENT_STEPS as readonly string[]).includes(paymentStep)) {
    return { action: "ineligible", reason: `payment_step=${order.payment_step ?? "null"}` };
  }

  const orderStatus = normalizeStatus(order.order_status);
  if ((ECPAY_BLOCKED_ORDER_STATUSES as readonly string[]).includes(orderStatus)) {
    return { action: "ineligible", reason: `order_status=${order.order_status ?? "null"}` };
  }

  if (order.is_hide === true) {
    return { action: "ineligible", reason: "is_hide=true" };
  }

  return { action: "claim" };
}

/**
 * Build the verified-payment patch. Never regress fulfillment status
 * (e.g. force-ship / already shipped unpaid orders).
 */
export function buildEcpayVerifiedOrderPatch(
  currentOrderStatus: string | null | undefined,
  nowIso: string,
): {
  payment_step: "verified";
  payment_method: "credit_card";
  admin_verified_at: string;
  order_status?: "processing";
} {
  const status = normalizeStatus(currentOrderStatus);
  const patch: {
    payment_step: "verified";
    payment_method: "credit_card";
    admin_verified_at: string;
    order_status?: "processing";
  } = {
    payment_step: "verified",
    payment_method: "credit_card",
    admin_verified_at: nowIso,
  };

  if (!(ECPAY_FULFILLMENT_STATUSES_TO_PRESERVE as readonly string[]).includes(status)) {
    patch.order_status = "processing";
  }

  return patch;
}
