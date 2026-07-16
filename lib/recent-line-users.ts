import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdminLineUserId } from "@/lib/admin-line-ids";

export type RecentLineUser = {
  line_user_id: string;
  display_name: string;
  updated: string;
};

/** 依 chat_state.updated 由新到舊取得最近 LINE 用戶（排除管理員 ID） */
export async function fetchRecentLineUsers(
  supabase: SupabaseClient,
  limit = 12,
): Promise<RecentLineUser[]> {
  const fetchLimit = Math.max(limit * 3, 24);
  const { data, error } = await supabase
    .from("chat_state")
    .select("line_user_id, display_name, updated")
    .order("updated", { ascending: false })
    .limit(fetchLimit);

  if (error) throw error;

  const seen = new Set<string>();
  const out: RecentLineUser[] = [];

  for (const row of data ?? []) {
    const line_user_id = String(row.line_user_id ?? "").trim();
    if (!line_user_id || seen.has(line_user_id) || isAdminLineUserId(line_user_id)) continue;
    seen.add(line_user_id);
    out.push({
      line_user_id,
      display_name: String(row.display_name ?? "").trim(),
      updated: String(row.updated ?? ""),
    });
    if (out.length >= limit) break;
  }

  return out;
}
