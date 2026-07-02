import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdminLineUserId } from "@/lib/admin-line-ids";

export type OrderCustomerContactPatch = {
  email?: string;
  phone?: string;
  line_user_id?: string;
};

type OrderRowForKey = {
  id: string;
  is_manual_order: boolean | null;
  is_from_quotation?: boolean | null;
  user_id: string | null;
  who_receive: string | null;
  orderer_name: string | null;
};

function isSpecialOrderRow(row: Pick<OrderRowForKey, "is_manual_order" | "is_from_quotation">): boolean {
  return Boolean(row.is_manual_order || row.is_from_quotation);
}

async function fetchAdminUserIds(supabase: SupabaseClient): Promise<Set<string>> {
  const { data: roleRows } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
  const ids = new Set((roleRows ?? []).map((r) => r.user_id as string).filter(Boolean));
  return ids;
}

function coalesceReceiveName(row: Pick<OrderRowForKey, "who_receive" | "orderer_name">): string {
  const who = row.who_receive?.trim();
  if (who) return who;
  return row.orderer_name?.trim() ?? "";
}

/** 與 order_customer_rollup view 相同的 customer_key 邏輯 */
export function customerKeyForOrder(
  row: Pick<OrderRowForKey, "is_manual_order" | "is_from_quotation" | "user_id" | "who_receive" | "orderer_name">,
  adminUserIds: Set<string>,
): string {
  if (isSpecialOrderRow(row)) {
    return `name:${coalesceReceiveName(row)}`;
  }
  if (row.user_id && !adminUserIds.has(row.user_id)) {
    return `user:${row.user_id}`;
  }
  return `name:${coalesceReceiveName(row)}`;
}

export function parseCustomerKey(customerKey: string): { type: "user" | "name"; value: string } | null {
  if (customerKey.startsWith("user:")) {
    const value = customerKey.slice(5).trim();
    return value ? { type: "user", value } : null;
  }
  if (customerKey.startsWith("name:")) {
    return { type: "name", value: customerKey.slice(5) };
  }
  return null;
}

/** 取得該客戶 rollup 鍵底下所有訂單 id（含非有效狀態，確保聯絡資訊一致） */
export async function fetchOrderIdsForCustomerKey(
  supabase: SupabaseClient,
  customerKey: string,
): Promise<string[]> {
  const parsed = parseCustomerKey(customerKey);
  if (!parsed) return [];

  const adminUserIds = await fetchAdminUserIds(supabase);

  if (parsed.type === "user") {
    const { data, error } = await supabase
      .from("orders")
      .select("id")
      .eq("user_id", parsed.value)
      .eq("is_manual_order", false);
    if (error) throw error;
    return (data ?? []).map((r) => r.id as string);
  }

  const name = parsed.value;
  const [byReceiveRes, byOrdererRes] = await Promise.all([
    supabase
      .from("orders")
      .select("id, is_manual_order, user_id, who_receive, orderer_name")
      .eq("who_receive", name),
    name
      ? supabase
          .from("orders")
          .select("id, is_manual_order, user_id, who_receive, orderer_name")
          .eq("orderer_name", name)
      : Promise.resolve({ data: [] as OrderRowForKey[], error: null }),
  ]);
  if (byReceiveRes.error) throw byReceiveRes.error;
  if (byOrdererRes.error) throw byOrdererRes.error;

  const merged = new Map<string, OrderRowForKey>();
  [...((byReceiveRes.data as OrderRowForKey[]) ?? []), ...((byOrdererRes.data as OrderRowForKey[]) ?? [])].forEach(
    (row) => merged.set(row.id, row),
  );

  return Array.from(merged.values())
    .filter((row) => customerKeyForOrder(row, adminUserIds) === customerKey)
    .map((row) => row.id);
}

function normalizePatch(patch: OrderCustomerContactPatch): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  if (patch.email !== undefined) {
    const v = patch.email.trim();
    out.Email = v || null;
  }
  if (patch.phone !== undefined) {
    const v = patch.phone.trim();
    out.phone = v || null;
  }
  if (patch.line_user_id !== undefined) {
    const v = patch.line_user_id.trim();
    if (v && isAdminLineUserId(v)) {
      throw new Error("不可寫入管理員 LINE user_id");
    }
    out.line_user_id = v || null;
  }
  return out;
}

/** 批次寫入 orders 聯絡欄位（Email / phone / line_user_id） */
export async function updateOrdersContactForCustomer(
  supabase: SupabaseClient,
  customerKey: string,
  patch: OrderCustomerContactPatch,
): Promise<{ updatedCount: number }> {
  const dbPatch = normalizePatch(patch);
  if (Object.keys(dbPatch).length === 0) {
    throw new Error("請至少填寫一項聯絡資訊");
  }

  const orderIds = await fetchOrderIdsForCustomerKey(supabase, customerKey);
  if (orderIds.length === 0) {
    throw new Error("找不到此客戶的訂單");
  }

  const { error } = await supabase.from("orders").update(dbPatch).in("id", orderIds);
  if (error) throw error;

  return { updatedCount: orderIds.length };
}
