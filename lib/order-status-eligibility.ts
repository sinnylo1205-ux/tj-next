/**
 * Eligibility guards for customer-facing update-order-status actions.
 * Keep in sync with supabase/functions/update-order-status/index.ts
 */

export type OrderStatusEligibilitySnapshot = {
  order_status: string | null | undefined;
  payment_step: string | null | undefined;
  is_manual_order?: boolean | null;
  auto_cancel_exempt?: boolean | null;
  created_at: string | null | undefined;
};

const AUTO_CANCEL_TTL_MS = 24 * 60 * 60 * 1000;

export function isEligibleForUserAutoCancel(
  order: OrderStatusEligibilitySnapshot,
  newStatus: string,
  nowMs: number = Date.now(),
): boolean {
  const createdAtMs = new Date(order.created_at ?? "").getTime();
  const isExpired = Number.isFinite(createdAtMs) && createdAtMs < nowMs - AUTO_CANCEL_TTL_MS;
  return (
    newStatus === "canceled" &&
    order.order_status === "awaiting_payment" &&
    order.payment_step === "pending" &&
    order.is_manual_order === false &&
    order.auto_cancel_exempt === false &&
    isExpired
  );
}

export function isEligibleForUserPaymentSubmitted(
  order: OrderStatusEligibilitySnapshot,
  newStatus: string,
): boolean {
  return (
    newStatus === "awaiting_payment" &&
    order.order_status === "awaiting_payment" &&
    order.payment_step === "pending"
  );
}

export function autoCancelCreatedBeforeIso(nowMs: number = Date.now()): string {
  return new Date(nowMs - AUTO_CANCEL_TTL_MS).toISOString();
}
