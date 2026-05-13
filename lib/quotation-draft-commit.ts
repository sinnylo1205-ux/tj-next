import type { SupabaseClient } from "@supabase/supabase-js";

/** 允許寫入 quotation_orders 的欄位（防任意鍵插入） */
const ORDER_INSERT_KEYS = new Set([
  "status",
  "email",
  "who_receive",
  "recipient_name",
  "notes",
  "line_user_id",
  "user_id",
  "shipping_way",
  "shipping_address_text",
  "expected_pickup_date",
  "subtotal",
  "shipping_fee",
  "total_amount",
  "discount_amount",
  "all_requirement",
]);

const ITEM_INSERT_KEYS = new Set([
  "product_name",
  "quantity",
  "unit_price",
  "preview_url",
  "category",
  "all_requirement",
  "customizations_json",
  "quantity_description",
]);

const ALLOWED_STATUS = new Set(["price_asked", "price_reply", "order_created"]);

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export function pickQuotationOrderInsert(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (ORDER_INSERT_KEYS.has(k)) {
      out[k] = v;
    }
  }
  const st = typeof out.status === "string" ? out.status : "";
  if (!ALLOWED_STATUS.has(st)) {
    out.status = "price_asked";
  }
  if (out.all_requirement == null || typeof out.all_requirement !== "object") {
    out.all_requirement = {};
  }
  return out;
}

export function pickQuotationItemInsert(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (ITEM_INSERT_KEYS.has(k)) {
      out[k] = v;
    }
  }
  if (typeof out.product_name !== "string" || !out.product_name.trim()) {
    out.product_name = "待補充";
  }
  const q = Number(out.quantity);
  out.quantity = Number.isFinite(q) && q >= 1 ? Math.floor(q) : 1;
  if (out.unit_price !== null && out.unit_price !== undefined) {
    const up = Number(out.unit_price);
    out.unit_price = Number.isFinite(up) ? up : null;
  }
  if (typeof out.category !== "string" || !out.category.trim()) {
    out.category = "custom_design";
  } else {
    out.category = String(out.category).slice(0, 200);
  }
  if (out.preview_url !== null && out.preview_url !== undefined && typeof out.preview_url !== "string") {
    out.preview_url = null;
  }
  if (out.all_requirement == null || typeof out.all_requirement !== "object") {
    out.all_requirement = {};
  }
  if (out.customizations_json !== null && out.customizations_json !== undefined) {
    if (typeof out.customizations_json === "string") {
      try {
        out.customizations_json = JSON.parse(out.customizations_json);
      } catch {
        out.customizations_json = null;
      }
    }
  }
  return out;
}

export async function insertQuotationFromDraft(
  sb: SupabaseClient,
  params: {
    quotation_order: Record<string, unknown>;
    quotation_order_items: Record<string, unknown>[];
  },
): Promise<{ quotation_order_id: string }> {
  const orderInsert = pickQuotationOrderInsert(params.quotation_order);
  const { data: row, error: orderErr } = await sb
    .from("quotation_orders")
    .insert(orderInsert)
    .select("id")
    .single();

  if (orderErr || !row?.id) {
    throw new Error(orderErr?.message || "建立 quotation_orders 失敗");
  }

  const qid = row.id as string;
  const items = params.quotation_order_items.map((raw) => ({
    ...pickQuotationItemInsert(asRecord(raw) ?? {}),
    quotation_order_id: qid,
  }));

  if (items.length === 0) {
    throw new Error("quotation_order_items 不可為空");
  }

  const { error: itemsErr } = await sb.from("quotation_order_items").insert(items);
  if (itemsErr) {
    await sb.from("quotation_orders").delete().eq("id", qid);
    throw new Error(itemsErr.message || "建立 quotation_order_items 失敗");
  }

  return { quotation_order_id: qid };
}
