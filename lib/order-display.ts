import { isAdminLineUserId } from "@/lib/admin-line-ids";

/** 手動訂單／報價單轉訂單 — 列表、詳情共用顯示邏輯 */

export type ManualOrderDisplayFields = {
  who_receive?: string | null;
  orderer_name?: string | null;
  is_manual_order?: boolean;
  is_from_quotation?: boolean;
  line_user_id?: string | null;
};

/** 手動／報價單轉訂單 — 黃色標籤樣式（統一） */
export const SPECIAL_ORDER_BADGE_CLASS =
  "text-[10px] px-1.5 py-0 h-5 bg-amber-50 text-amber-700 border-amber-300";

/** LINE 用戶名稱強調色 */
export const LINE_LINKED_BUYER_CLASS = "font-medium text-emerald-700";

export function isSpecialSourceOrder(order: {
  is_manual_order?: boolean;
  is_from_quotation?: boolean;
}): boolean {
  return Boolean(order.is_manual_order || order.is_from_quotation);
}

export function getSpecialSourceBadgeLabel(order: {
  is_manual_order?: boolean;
  is_from_quotation?: boolean;
}): "手動" | "報價單" | null {
  if (order.is_manual_order) return "手動";
  if (order.is_from_quotation) return "報價單";
  return null;
}

/** 解析訂單有效 LINE id；手動／報價單若為管理員 LINE 則視同未綁定 */
export function resolveOrderLineUserId(
  order: ManualOrderDisplayFields,
  memberLineUserId?: string | null,
): string | null {
  const fromOrder = order.line_user_id?.trim();
  if (isSpecialSourceOrder(order)) {
    if (fromOrder && !isAdminLineUserId(fromOrder)) return fromOrder;
    return null;
  }
  if (fromOrder && !isAdminLineUserId(fromOrder)) return fromOrder;
  const fromMember = memberLineUserId?.trim();
  if (fromMember && !isAdminLineUserId(fromMember)) return fromMember;
  return null;
}

export type OrderBuyerDisplay = {
  /** 搜尋／單行摘要用 */
  name: string;
  /** 網站會員註冊名 */
  memberName: string | null;
  /** LINE display_name */
  lineName: string | null;
  /** 網站會員：同時顯示註冊名 + LINE 名 */
  showMemberAndLine: boolean;
  /** 手動／報價單：LINE 名為訂購人主體（綠色） */
  linePrimary: boolean;
  badge: "手動" | "報價單" | null;
};

/**
 * 手動／報價單：LINE 名稱優先；無 LINE 則收件人姓名。
 */
function getSpecialOrderBuyerDisplay(
  order: ManualOrderDisplayFields,
  resolvedLineUserId: string | null | undefined,
  lineDisplayName: string | null | undefined,
): OrderBuyerDisplay {
  const lineName = lineDisplayName?.trim() || null;
  if (resolvedLineUserId?.trim() && lineName) {
    return {
      name: lineName,
      memberName: null,
      lineName,
      showMemberAndLine: false,
      linePrimary: true,
      badge: getSpecialSourceBadgeLabel(order),
    };
  }
  const recipient = order.who_receive?.trim();
  const orderer = order.orderer_name?.trim();
  const fallback = recipient || orderer || "未填寫";
  return {
    name: fallback,
    memberName: null,
    lineName: null,
    showMemberAndLine: false,
    linePrimary: false,
    badge: getSpecialSourceBadgeLabel(order),
  };
}

/**
 * 網站會員：未綁 LINE → 註冊名；已綁 LINE → 註冊名 + LINE 名。
 */
function getMemberOrderBuyerDisplay(
  memberBuyerName: string,
  resolvedLineUserId: string | null | undefined,
  lineDisplayName: string | null | undefined,
): OrderBuyerDisplay {
  const memberName = memberBuyerName?.trim() || "—";
  const lineName = lineDisplayName?.trim() || null;
  if (resolvedLineUserId?.trim() && lineName) {
    return {
      name: `${memberName} · ${lineName}`,
      memberName,
      lineName,
      showMemberAndLine: true,
      linePrimary: false,
      badge: null,
    };
  }
  return {
    name: memberName,
    memberName,
    lineName: null,
    showMemberAndLine: false,
    linePrimary: false,
    badge: null,
  };
}

/** 手動單主體姓名：收件人優先（收件人欄位用） */
export function getManualOrderDisplayName(order: ManualOrderDisplayFields): string {
  const recipient = order.who_receive?.trim();
  if (recipient) return recipient;
  const orderer = order.orderer_name?.trim();
  if (orderer) return orderer;
  return "未填寫";
}

export function getManualOrderBuyerName(order: ManualOrderDisplayFields): string {
  return order.orderer_name?.trim() || order.who_receive?.trim() || "未填寫";
}

/** 訂單列表／詳情「訂購人」欄 */
export function getOrderBuyerDisplay(
  order: ManualOrderDisplayFields,
  memberBuyerName: string,
  memberLineUserId: string | null | undefined,
  lineDisplayName: string | null | undefined,
): OrderBuyerDisplay {
  const lineId = resolveOrderLineUserId(order, memberLineUserId);
  if (isSpecialSourceOrder(order)) {
    return getSpecialOrderBuyerDisplay(order, lineId, lineDisplayName);
  }
  return getMemberOrderBuyerDisplay(memberBuyerName, lineId, lineDisplayName);
}

export function formatOrderBuyerFullText(
  buyer: OrderBuyerDisplay,
  opts?: {
    userEmail?: string | null;
    hasLineLink?: boolean;
    isSpecial?: boolean;
    ordererFieldName?: string | null;
    recipientName?: string | null;
  },
): string {
  const lines: string[] = [];
  if (buyer.showMemberAndLine && buyer.memberName && buyer.lineName) {
    lines.push(`網站註冊：${buyer.memberName}`);
    lines.push(`LINE：${buyer.lineName}`);
  } else if (buyer.linePrimary && buyer.lineName) {
    lines.push(`${buyer.lineName}（LINE 訂購人）`);
  } else {
    lines.push(buyer.name);
  }
  if (buyer.badge === "報價單") lines.push("報價單轉訂單");
  else if (buyer.badge === "手動") lines.push("手動建立");
  if (
    opts?.isSpecial &&
    !buyer.linePrimary &&
    opts.ordererFieldName &&
    opts.recipientName &&
    opts.ordererFieldName !== opts.recipientName
  ) {
    lines.push(`訂購人欄位：${opts.ordererFieldName}`);
    lines.push(`收件人：${opts.recipientName}`);
  }
  if (opts?.userEmail?.trim()) lines.push(opts.userEmail.trim());
  if (opts?.isSpecial && !opts?.hasLineLink) lines.push("尚未串聯 LINE");
  return lines.join("\n");
}

/** 手機列表姓名 */
export function getMobileOrderListName(
  order: ManualOrderDisplayFields,
  memberBuyerName: string,
  memberLineUserId?: string | null,
  lineDisplayName?: string | null,
): string {
  return getOrderBuyerDisplay(order, memberBuyerName, memberLineUserId, lineDisplayName).name;
}
