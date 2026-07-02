/** 手動訂單顯示用欄位（列表／詳情共用） */
export type ManualOrderDisplayFields = {
  who_receive?: string | null;
  orderer_name?: string | null;
  is_manual_order?: boolean;
};

/** 手動單主體姓名：收件人優先，無則訂購人 */
export function getManualOrderDisplayName(order: ManualOrderDisplayFields): string {
  const recipient = order.who_receive?.trim();
  if (recipient) return recipient;
  const orderer = order.orderer_name?.trim();
  if (orderer) return orderer;
  return "未填寫";
}

/** 手動單訂購人（orderer_name） */
export function getManualOrderBuyerName(order: ManualOrderDisplayFields): string {
  return order.orderer_name?.trim() || order.who_receive?.trim() || "未填寫";
}

/** 傳入 AdminOrderDetailPanel 的 buyerName：手動單用 orderer_name，否則用會員名 */
export function getOrderBuyerNameForDetail(
  order: ManualOrderDisplayFields,
  memberBuyerName: string,
): string {
  if (order.is_manual_order) return getManualOrderBuyerName(order);
  return memberBuyerName || "—";
}

/** Popover／全文顯示用手動單文字 */
export function formatManualOrderFullText(order: ManualOrderDisplayFields): string {
  const display = getManualOrderDisplayName(order);
  const orderer = order.orderer_name?.trim();
  const recipient = order.who_receive?.trim();
  const lines: string[] = [display];
  if (orderer && recipient && orderer !== recipient) {
    lines.push(`訂購：${orderer}`);
  }
  lines.push("（手動建立）");
  return lines.join("\n");
}

/** 手機列表姓名（手動單附註） */
export function getMobileOrderListName(
  order: ManualOrderDisplayFields & { is_from_quotation?: boolean },
  memberBuyerName: string,
): string {
  if (order.is_from_quotation) {
    return order.who_receive?.trim() || "（報價單）";
  }
  if (order.is_manual_order) {
    return getManualOrderDisplayName(order);
  }
  if (order.who_receive?.trim()) {
    return order.who_receive.trim();
  }
  return memberBuyerName || "未填寫";
}
