/**
 * 設計後單價（甜點客製後單價，不含包裝）。
 * 優先用入車時寫入的 price／DB unit_price；舊資料才從 customizations 回推。
 * 結帳金額仍以 total_price／後端 calculate-checkout 為準。
 */

type CustEntry = {
  group?: string;
  details?: {
    totalPrice?: number;
    fee?: number;
    customFeeAmount?: number;
  };
};

/** 從 customizations 拆出非甜點費用（與 cart 頁 getPriceBreakdown 一致） */
export function getNonDessertFeesFromCustomizations(customizations: unknown): number {
  const cust = (Array.isArray(customizations) ? customizations : []) as CustEntry[];
  let fees = 0;
  for (const c of cust) {
    if (c.group === "package_style" && c.details?.totalPrice) fees += Number(c.details.totalPrice) || 0;
    if (c.group === "package_decoration" && c.details?.totalPrice) fees += Number(c.details.totalPrice) || 0;
    if (c.group === "conditional_fee" && c.details?.fee) fees += Number(c.details.fee) || 0;
    if (c.group === "macaron_mode" && c.details?.customFeeAmount) {
      fees += Number(c.details.customFeeAmount) || 0;
    }
  }
  return fees;
}

export function getCartItemUnitPrice(item: {
  price?: number | null;
  total_price?: number | null;
  quantity?: number | null;
  customizations?: unknown;
}): number {
  // null／undefined 不算已存單價（Number(null)===0 會誤判）
  if (item.price !== null && item.price !== undefined) {
    const stored = Number(item.price);
    if (Number.isFinite(stored) && stored >= 0) {
      return Math.round(stored * 100) / 100;
    }
  }

  const qty = Math.max(1, Number(item.quantity) || 1);
  const total = Number(item.total_price);
  if (Number.isFinite(total) && total > 0) {
    const nonDessert = getNonDessertFeesFromCustomizations(item.customizations);
    const dessertSubtotal = Math.max(0, total - nonDessert);
    return Math.round((dessertSubtotal / qty) * 100) / 100;
  }

  return 0;
}
