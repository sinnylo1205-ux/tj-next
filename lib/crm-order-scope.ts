/** CRM 訂單納入範圍（與 customer_360 view 一致） */

export const CRM_EXCLUDED_ORDER_STATUSES = ["canceled", "returned"] as const;

export type CrmOrderScopeFields = {
  order_status?: string | null;
  payment_step?: string | null;
  is_hide?: boolean | null;
};

/** 納入 CRM 連結的訂單（含未付款；排除取消、退貨、隱藏） */
export function isCrmLinkedOrder(order: CrmOrderScopeFields): boolean {
  const status = String(order.order_status ?? "");
  if (CRM_EXCLUDED_ORDER_STATUSES.includes(status as (typeof CRM_EXCLUDED_ORDER_STATUSES)[number])) {
    return false;
  }
  if (order.is_hide === true) return false;
  return true;
}

/** 已確認到帳的有效訂單（LTV、回購、AI 營收事實用） */
export function isCrmVerifiedOrder(order: CrmOrderScopeFields): boolean {
  if (!isCrmLinkedOrder(order)) return false;
  const status = String(order.order_status ?? "");
  if (!["processing", "shipped", "delivered"].includes(status)) return false;
  return String(order.payment_step ?? "") === "verified";
}

/** 待付款／待確認匯款 */
export function isCrmUnpaidOrder(order: CrmOrderScopeFields): boolean {
  if (!isCrmLinkedOrder(order)) return false;
  const step = String(order.payment_step ?? "");
  return step === "pending" || step === "submitted";
}
