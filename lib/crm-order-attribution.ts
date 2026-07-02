import type { SupabaseClient } from "@supabase/supabase-js";

const CRM_ORDER_SELECT =
  "id,created_at,expected_pickup_date,total_amount,order_status,payment_step,is_manual_order";

export type CrmAttributedOrder = {
  id: string;
  created_at: string;
  expected_pickup_date: string | null;
  total_amount: number | null;
  order_status: string | null;
  payment_step: string | null;
  is_manual_order?: boolean | null;
};

/** 取得管理員 LINE ID 集合，避免手動單誤歸到管理員 */
async function fetchAdminLineUserIds(supabase: SupabaseClient): Promise<Set<string>> {
  const { data: roleRows } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
  const adminUserIds = (roleRows ?? []).map((r) => r.user_id as string).filter(Boolean);
  if (adminUserIds.length === 0) return new Set();

  const { data: users } = await supabase.from("user_log_in").select("line_user_id").in("id", adminUserIds);
  const ids = new Set<string>();
  (users ?? []).forEach((u) => {
    const id = (u.line_user_id as string | null)?.trim();
    if (id) ids.add(id);
  });
  return ids;
}

function mergeOrdersDedup<T extends { id: string }>(lists: T[][]): T[] {
  const map = new Map<string, T>();
  lists.flat().forEach((o) => map.set(o.id, o));
  return Array.from(map.values()).sort((a, b) => {
    const aTime = (a as { created_at?: string }).created_at ?? "";
    const bTime = (b as { created_at?: string }).created_at ?? "";
    return bTime.localeCompare(aTime);
  });
}

/**
 * 彙整 CRM 客戶訂單：
 * 1) orders.line_user_id 直接匹配
 * 2) 會員 user_id 的非手動單
 * 3) 手動單依 who_receive / orderer_name 對應 chat_state.display_name（拆分歸屬）
 */
export async function fetchCrmOrdersForLineUser(
  supabase: SupabaseClient,
  lineUserId: string,
  opts?: { limit?: number },
): Promise<CrmAttributedOrder[]> {
  const limit = opts?.limit ?? 120;

  const [{ data: cs }, { data: userRows }, adminLineIds] = await Promise.all([
    supabase.from("chat_state").select("display_name").eq("line_user_id", lineUserId).maybeSingle(),
    supabase.from("user_log_in").select("id").eq("line_user_id", lineUserId),
    fetchAdminLineUserIds(supabase),
  ]);

  const displayName = (cs?.display_name as string | null)?.trim() ?? "";
  const userIds = (userRows ?? []).map((r) => r.id as string);

  const [byLineRes, byUserRes, byManualRecvRes, byManualOrdererRes] = await Promise.all([
    supabase
      .from("orders")
      .select(CRM_ORDER_SELECT)
      .eq("line_user_id", lineUserId)
      .order("created_at", { ascending: false })
      .limit(limit),
    userIds.length > 0
      ? supabase
          .from("orders")
          .select(CRM_ORDER_SELECT)
          .in("user_id", userIds)
          .eq("is_manual_order", false)
          .order("created_at", { ascending: false })
          .limit(limit)
      : Promise.resolve({ data: [] as CrmAttributedOrder[], error: null }),
    displayName
      ? supabase
          .from("orders")
          .select(CRM_ORDER_SELECT)
          .eq("is_manual_order", true)
          .eq("who_receive", displayName)
          .order("created_at", { ascending: false })
          .limit(limit)
      : Promise.resolve({ data: [] as CrmAttributedOrder[], error: null }),
    displayName
      ? supabase
          .from("orders")
          .select(CRM_ORDER_SELECT)
          .eq("is_manual_order", true)
          .eq("orderer_name", displayName)
          .order("created_at", { ascending: false })
          .limit(limit)
      : Promise.resolve({ data: [] as CrmAttributedOrder[], error: null }),
  ]);

  if (byLineRes.error) throw byLineRes.error;
  if (byUserRes.error) throw byUserRes.error;
  if (byManualRecvRes.error) throw byManualRecvRes.error;
  if (byManualOrdererRes.error) throw byManualOrdererRes.error;

  const byLineRaw = (byLineRes.data as CrmAttributedOrder[]) ?? [];
  const byLine = adminLineIds.has(lineUserId)
    ? byLineRaw.filter((o) => !o.is_manual_order)
    : byLineRaw;

  return mergeOrdersDedup([
    byLine,
    (byUserRes.data as CrmAttributedOrder[]) ?? [],
    (byManualRecvRes.data as CrmAttributedOrder[]) ?? [],
    (byManualOrdererRes.data as CrmAttributedOrder[]) ?? [],
  ]).slice(0, limit);
}
