/**
 * 結帳送單時的購物車權威來源：
 * 金額來自 calculate-checkout（DB cart），品項也必須來自同一批 DB cart 列，
 * 不可信任 sessionStorage / React state 中的 quantity、total_price 或額外假品項。
 */

export type CheckoutCartRow = {
  id: string;
  product_id: string | null;
  quantity: number | string | null;
  total_price: number | string | null;
  preview_url?: string | null;
  customizations_json?: unknown;
  is_package_design?: boolean | null;
  linked_item_id?: string | null;
  expected_pickup_date?: string | null;
};

export type CheckoutCartMatchResult =
  | { ok: true; rows: CheckoutCartRow[]; cartItemIds: string[] }
  | { ok: false; error: string };

/** 去重並保留首次出現順序；過濾空字串。 */
export function normalizeSelectedCartIds(ids: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    if (typeof raw !== "string") continue;
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * 確認 DB 回傳的未送出購物車列與使用者勾選 IDs 完全一致（數量與集合）。
 * 多出的 sessionStorage 假品項、或已不存在／已送出的列都會被拒絕。
 */
export function matchCheckoutCartRows(
  selectedIds: unknown[],
  rows: CheckoutCartRow[] | null | undefined,
): CheckoutCartMatchResult {
  const cartItemIds = normalizeSelectedCartIds(selectedIds);
  if (cartItemIds.length === 0) {
    return { ok: false, error: "找不到可結帳的購物車品項，請返回購物車重新選擇" };
  }

  const list = Array.isArray(rows) ? rows : [];
  if (list.length !== cartItemIds.length) {
    return {
      ok: false,
      error: "購物車內容已變更或不一致，請返回購物車重新結帳",
    };
  }

  const byId = new Map<string, CheckoutCartRow>();
  for (const row of list) {
    if (!row || typeof row.id !== "string" || !row.id) {
      return { ok: false, error: "購物車資料異常，請返回購物車重新結帳" };
    }
    if (byId.has(row.id)) {
      return { ok: false, error: "購物車資料異常，請返回購物車重新結帳" };
    }
    byId.set(row.id, row);
  }

  const ordered: CheckoutCartRow[] = [];
  for (const id of cartItemIds) {
    const row = byId.get(id);
    if (!row) {
      return {
        ok: false,
        error: "購物車內容已變更或不一致，請返回購物車重新結帳",
      };
    }
    ordered.push(row);
  }

  return { ok: true, rows: ordered, cartItemIds };
}

export function cartRowQuantity(row: CheckoutCartRow): number {
  const qty = Math.floor(Number(row.quantity));
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

export function cartRowUnitPrice(row: CheckoutCartRow): number {
  const qty = cartRowQuantity(row);
  const total = Number(row.total_price ?? 0);
  if (!Number.isFinite(total)) return 0;
  return total / qty;
}

export function buildOrderItemInsertFromCartRow(
  row: CheckoutCartRow,
  orderId: string,
  productName: string,
): {
  order_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  preview_url: string | null;
  customizations_json: unknown;
  is_package_design: boolean;
  linked_item_id: null;
  quantity_description: string | null;
} {
  const quantity = cartRowQuantity(row);
  const isPackage = Boolean(row.is_package_design) || productName.includes("包裝設計");
  return {
    order_id: orderId,
    product_id: row.product_id ? String(row.product_id) : null,
    product_name: productName,
    quantity,
    unit_price: cartRowUnitPrice(row),
    preview_url: row.preview_url ?? null,
    customizations_json: row.customizations_json ?? null,
    is_package_design: isPackage,
    linked_item_id: null,
    quantity_description: isPackage
      ? "與訂購之甜點數量一致，如有加購盒子，則與禮盒數量一致。"
      : null,
  };
}
