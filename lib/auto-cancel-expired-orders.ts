/**
 * Guards for 24h unpaid auto-cancel.
 * Cancel must re-check eligibility at UPDATE time: the SELECT snapshot can be
 * stale after ECPay/admin verifies payment (or after force-ship changes status)
 * while the cron walks a long expired-order list.
 */
export const AUTO_CANCEL_ELIGIBLE_PAYMENT_STEP = "pending" as const;
export const AUTO_CANCEL_ELIGIBLE_ORDER_STATUS = "awaiting_payment" as const;

export type AutoCancelEligibilitySnapshot = {
  payment_step?: string | null;
  order_status?: string | null;
  is_manual_order?: boolean | null;
  auto_cancel_exempt?: boolean | null;
};

/** True when a row should still be canceled (same predicates as the UPDATE filters). */
export function isStillEligibleForAutoCancel(row: AutoCancelEligibilitySnapshot): boolean {
  return (
    row.payment_step === AUTO_CANCEL_ELIGIBLE_PAYMENT_STEP &&
    row.order_status === AUTO_CANCEL_ELIGIBLE_ORDER_STATUS &&
    row.is_manual_order === false &&
    row.auto_cancel_exempt === false
  );
}

/** Patch applied when canceling; keep narrow to avoid clobbering payment_step. */
export function buildAutoCancelOrderPatch(): { is_hide: true; order_status: "canceled" } {
  return { is_hide: true, order_status: "canceled" };
}
