/**
 * 特殊報價單（多訂單組合）：all_requirement 結構與品項 combo_id 串聯。
 * 與計畫書一致：quotation_kind + special_quotation；品項列見 quotation_order_items.customizations_json.combo_id。
 */

export const QUOTATION_KIND_SPECIAL = "special" as const;

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
  shipping_fee: number;
  line_subtotal: number;
  line_total: number;
};

export type SpecialQuotationRoot = {
  orderer_name: string;
  contact: SpecialQuotationContact;
  combos: SpecialQuotationComboPayload[];
  /** 轉訂單成功後寫入各筆 orders.id */
  converted_order_ids?: string[];
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
