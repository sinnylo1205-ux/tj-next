/**
 * 特殊報價單（多訂單組合）：all_requirement 結構與品項 combo_id 串聯。
 * 與計畫書一致：quotation_kind + special_quotation；品項列見 quotation_order_items.customizations_json.combo_id。
 */

export const QUOTATION_KIND_SPECIAL = "special" as const;

export type QuotationStatus = "price_asked" | "price_reply" | "order_created";

export const QUOTATION_STATUS_ORDER: Record<QuotationStatus, number> = {
  price_asked: 0,
  price_reply: 1,
  order_created: 2,
};

export const QUOTATION_STATUS_LABELS: Record<QuotationStatus, string> = {
  price_asked: "詢價中",
  price_reply: "已報價",
  order_created: "已建立訂單",
};

export type SpecialQuotationContact = {
  email?: string | null;
  phone?: string | null;
  line_user_id?: string | null;
};

/** 寫入 all_requirement.special_quotation.combos[]，與品項 combo_id 對齊 */
export type SpecialQuotationComboPayload = {
  id: string;
  expected_pickup_date?: string | null;
  pickup_location?: string | null;
  pickup_contact_name?: string | null;
  pickup_contact_phone?: string | null;
  /** 該組運費；未約定時以 0 */
  shipping_fee: number;
  /** 品項皆具單價時為 Σ(單價×數量)；否則 null（禁止臆測） */
  line_subtotal: number | null;
  line_total: number | null;
};

export type SpecialQuotationRoot = {
  orderer_name: string;
  contact: SpecialQuotationContact;
  combos: SpecialQuotationComboPayload[];
  /** 轉訂單成功後寫入各筆 orders.id */
  converted_order_ids?: string[];
};

export type SpecialQuotationItemLike = {
  id: string;
  unit_price?: number | null;
  quantity?: number | null;
  customizations_json?: unknown;
};

export type GroupedSpecialItems<T extends SpecialQuotationItemLike> = {
  byComboId: Map<string, T[]>;
  unassigned: T[];
};

export function isSpecialQuotation(all_requirement: unknown): boolean {
  const ar = all_requirement as Record<string, unknown> | null | undefined;
  if (!ar || typeof ar !== "object") return false;
  return ar.quotation_kind === QUOTATION_KIND_SPECIAL && ar.special_quotation != null;
}

export function getSpecialQuotationRoot(all_requirement: unknown): SpecialQuotationRoot | null {
  if (!isSpecialQuotation(all_requirement)) return null;
  const sq = (all_requirement as Record<string, unknown>).special_quotation;
  if (!sq || typeof sq !== "object") return null;
  return sq as SpecialQuotationRoot;
}

export function getSpecialConvertedOrderCount(all_requirement: unknown): number {
  return getSpecialQuotationRoot(all_requirement)?.converted_order_ids?.length ?? 0;
}

export function parseComboIdFromQuotationItem(customizations_json: unknown): string | null {
  if (customizations_json == null) return null;
  let o: unknown = customizations_json;
  if (typeof customizations_json === "string") {
    try {
      o = JSON.parse(customizations_json);
    } catch {
      return null;
    }
  }
  if (!o || typeof o !== "object") return null;
  const id = (o as Record<string, unknown>).combo_id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

export function parseSpecialQuotationAllRequirement(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) return { ...(raw as Record<string, unknown>) };
  if (typeof raw === "string") {
    try {
      const o = JSON.parse(raw) as unknown;
      if (o && typeof o === "object" && !Array.isArray(o)) return { ...(o as Record<string, unknown>) };
    } catch {
      return null;
    }
  }
  return null;
}

export function buildSpecialQuotationAllRequirement(
  root: SpecialQuotationRoot,
  existingAr?: Record<string, unknown> | null,
): Record<string, unknown> {
  const base = existingAr ? { ...existingAr } : {};
  const orderer = root.orderer_name.trim();
  const email = root.contact.email?.trim() || "";
  const phone = root.contact.phone?.trim() || "";
  const lineUserId = root.contact.line_user_id?.trim() || null;

  const customerProfile =
    base.customer_profile && typeof base.customer_profile === "object" && !Array.isArray(base.customer_profile)
      ? { ...(base.customer_profile as Record<string, unknown>) }
      : {};
  customerProfile.name = orderer;
  customerProfile.email = email;

  const delivery =
    base.delivery && typeof base.delivery === "object" && !Array.isArray(base.delivery)
      ? { ...(base.delivery as Record<string, unknown>) }
      : {};
  delivery.receiver = orderer;
  delivery.phone = phone;

  const special_quotation: SpecialQuotationRoot = {
    orderer_name: orderer,
    contact: {
      email: email || null,
      phone: phone || null,
      line_user_id: lineUserId,
    },
    combos: root.combos,
    ...(root.converted_order_ids?.length ? { converted_order_ids: root.converted_order_ids } : {}),
  };

  return {
    ...base,
    quotation_kind: QUOTATION_KIND_SPECIAL,
    customer_profile: customerProfile,
    delivery,
    special_quotation,
  };
}

/** 依品項單價×數量重算 combo 金額 */
export function recomputeComboAmounts(
  combo: Pick<SpecialQuotationComboPayload, "shipping_fee">,
  items: SpecialQuotationItemLike[],
): { line_subtotal: number | null; line_total: number | null } {
  if (items.length === 0) {
    const ship = Number(combo.shipping_fee) || 0;
    return { line_subtotal: 0, line_total: ship };
  }
  let subtotal = 0;
  let hasAllPrices = true;
  for (const it of items) {
    const price = it.unit_price;
    const qty = Math.max(1, Math.floor(Number(it.quantity ?? 1)) || 1);
    if (price == null || !Number.isFinite(Number(price))) {
      hasAllPrices = false;
      break;
    }
    subtotal += Number(price) * qty;
  }
  const ship = Number(combo.shipping_fee) || 0;
  if (!hasAllPrices) {
    return { line_subtotal: null, line_total: null };
  }
  return { line_subtotal: subtotal, line_total: subtotal + ship };
}

export function groupItemsByComboId<T extends SpecialQuotationItemLike>(items: T[]): GroupedSpecialItems<T> {
  const byComboId = new Map<string, T[]>();
  const unassigned: T[] = [];
  for (const it of items) {
    const comboId = parseComboIdFromQuotationItem(it.customizations_json);
    if (!comboId) {
      unassigned.push(it);
      continue;
    }
    const list = byComboId.get(comboId) ?? [];
    list.push(it);
    byComboId.set(comboId, list);
  }
  return { byComboId, unassigned };
}

export function sumSpecialQuotationTotals(combos: SpecialQuotationComboPayload[]): {
  subtotal: number | null;
  shipping_fee: number;
  total_amount: number | null;
} {
  let subtotal = 0;
  let shipping = 0;
  let hasNull = false;
  for (const c of combos) {
    shipping += Number(c.shipping_fee) || 0;
    if (c.line_subtotal == null) {
      hasNull = true;
    } else {
      subtotal += c.line_subtotal;
    }
  }
  if (hasNull) {
    return { subtotal: null, shipping_fee: shipping, total_amount: null };
  }
  return { subtotal, shipping_fee: shipping, total_amount: subtotal + shipping };
}

export function validateSpecialQuotationRoot(
  root: SpecialQuotationRoot,
  itemsByCombo: Map<string, SpecialQuotationItemLike[]>,
): string | null {
  if (!root.orderer_name?.trim()) return "請填寫訂購人（單位）";
  if (!root.combos.length) return "至少需要一個訂單組合";
  const seenComboIds = new Set<string>();
  for (let i = 0; i < root.combos.length; i += 1) {
    const combo = root.combos[i];
    if (!combo.id?.trim()) return `訂單組合 ${i + 1} 缺少 id`;
    const comboId = combo.id.trim();
    if (seenComboIds.has(comboId)) {
      return `訂單組合 id 重複（${comboId}）：每個組合必須有唯一 id，否則轉單會合併為一筆並遺失取件點`;
    }
    seenComboIds.add(comboId);
    const comboItems = itemsByCombo.get(comboId) ?? [];
    if (comboItems.length === 0) {
      return `訂單組合 ${i + 1}（${combo.pickup_location || combo.pickup_contact_name || comboId}）尚無對應品項`;
    }
    for (const it of comboItems) {
      const qty = Math.floor(Number(it.quantity ?? 1)) || 0;
      if (qty <= 0) return `品項數量需大於 0`;
    }
  }
  return null;
}

export function isQuotationStatusBackward(current: string, next: string): boolean {
  const cur = QUOTATION_STATUS_ORDER[current as QuotationStatus];
  const nxt = QUOTATION_STATUS_ORDER[next as QuotationStatus];
  if (cur === undefined || nxt === undefined) return false;
  return nxt < cur;
}

/** 從 DB all_requirement 建立編輯用 root（深拷貝 combos） */
export function specialRootFromAllRequirement(all_requirement: unknown): SpecialQuotationRoot | null {
  const root = getSpecialQuotationRoot(all_requirement);
  if (!root) return null;
  return {
    orderer_name: root.orderer_name ?? "",
    contact: {
      email: root.contact?.email ?? null,
      phone: root.contact?.phone ?? null,
      line_user_id: root.contact?.line_user_id ?? null,
    },
    combos: (root.combos ?? []).map((c) => ({
      id: c.id,
      expected_pickup_date: c.expected_pickup_date ?? null,
      pickup_location: c.pickup_location ?? null,
      pickup_contact_name: c.pickup_contact_name ?? null,
      pickup_contact_phone: c.pickup_contact_phone ?? null,
      shipping_fee: Number(c.shipping_fee) || 0,
      line_subtotal: c.line_subtotal ?? null,
      line_total: c.line_total ?? null,
    })),
    converted_order_ids: root.converted_order_ids ? [...root.converted_order_ids] : undefined,
  };
}
