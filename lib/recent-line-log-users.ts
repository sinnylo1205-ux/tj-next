import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdminLineUserId } from "@/lib/admin-line-ids";

export type RecentLineLogUser = {
  line_user_id: string;
  display_name: string;
  reply_mode: "ai" | "human";
};

function normalizeReplyMode(raw: string | null | undefined): "ai" | "human" {
  return raw === "human" ? "human" : "ai";
}

/** 依 line_log.received_at 由新到舊取得最近對話的 LINE 用戶，並帶入 chat_state 顯示名稱與回覆模式 */
export async function fetchRecentLineLogUsers(
  supabase: SupabaseClient,
  limit = 24,
): Promise<RecentLineLogUser[]> {
  const fetchLimit = Math.max(limit * 4, 48);
  const { data: logs, error: logError } = await supabase
    .from("line_log")
    .select("user_id, received_at")
    .order("received_at", { ascending: false })
    .limit(fetchLimit);

  if (logError) throw logError;

  const orderedIds: string[] = [];
  const seen = new Set<string>();
  for (const row of logs ?? []) {
    const id = String(row.user_id ?? "").trim();
    if (!id || seen.has(id) || isAdminLineUserId(id)) continue;
    seen.add(id);
    orderedIds.push(id);
    if (orderedIds.length >= limit) break;
  }

  if (orderedIds.length === 0) return [];

  const { data: states, error: stateError } = await supabase
    .from("chat_state")
    .select("line_user_id, display_name, reply_mode")
    .in("line_user_id", orderedIds);

  if (stateError) throw stateError;

  const stateById = new Map<string, { display_name: string; reply_mode: "ai" | "human" }>();
  for (const row of states ?? []) {
    const id = String(row.line_user_id ?? "").trim();
    if (!id) continue;
    stateById.set(id, {
      display_name: String(row.display_name ?? "").trim(),
      reply_mode: normalizeReplyMode(row.reply_mode),
    });
  }

  return orderedIds.map((line_user_id) => {
    const state = stateById.get(line_user_id);
    return {
      line_user_id,
      display_name: state?.display_name || `${line_user_id.slice(0, 8)}…`,
      reply_mode: state?.reply_mode ?? "ai",
    };
  });
}

export async function toggleChatStateReplyMode(
  supabase: SupabaseClient,
  lineUserId: string,
  currentMode: "ai" | "human",
): Promise<"ai" | "human"> {
  const nextMode: "ai" | "human" = currentMode === "ai" ? "human" : "ai";
  const { error } = await supabase
    .from("chat_state")
    .update({ reply_mode: nextMode })
    .eq("line_user_id", lineUserId);
  if (error) throw error;
  return nextMode;
}
