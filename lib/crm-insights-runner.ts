import type { SupabaseClient } from "@supabase/supabase-js";
import { generateCrmInsights, type CrmInsights } from "./crm-customer-insights-ai";
import { fetchCrmOrdersForLineUser } from "./crm-order-attribution";
import { isCrmVerifiedOrder } from "./crm-order-scope";

type LogRow = {
  id: string;
  received_at: string | null;
  user_text: string | null;
  ai_reply: string | null;
  admin_reply: string | null;
};

export type CustomerContext = {
  orderFact: {
    order_count: number;
    lifetime_value: number;
    last_pickup_date: string | null;
    recent_products: string[];
  };
  logs: LogRow[];
  sourceIds: string[];
};

/** 蒐集單一客戶的訂單事實＋對話紀錄（單人與批次共用） */
export async function gatherCustomerContext(
  supabase: SupabaseClient,
  lineUserId: string,
): Promise<CustomerContext> {
  const [mergedOrders, logsRes] = await Promise.all([
    fetchCrmOrdersForLineUser(supabase, lineUserId, { limit: 120 }),
    supabase
      .from("line_log")
      .select("id,received_at,user_text,ai_reply,admin_reply")
      .eq("user_id", lineUserId)
      .order("received_at", { ascending: false })
      .limit(80),
  ]);

  const validOrders = mergedOrders.filter(isCrmVerifiedOrder);

  const orderIds = validOrders.map((o) => o.id);
  const productSummary =
    orderIds.length === 0
      ? []
      : (await supabase.from("order_items").select("product_name,quantity").in("order_id", orderIds)).data ?? [];

  const recent_products = productSummary
    .map((i) => `${i.product_name ?? "品項"} x${i.quantity ?? 1}`)
    .slice(0, 10);

  const orderFact = {
    order_count: validOrders.length,
    lifetime_value: validOrders.reduce((s, o) => s + Number(o.total_amount ?? 0), 0),
    last_pickup_date:
      validOrders
        .map((o) => o.expected_pickup_date)
        .filter((v): v is string => Boolean(v))
        .sort((a, b) => b.localeCompare(a))[0] ?? null,
    recent_products,
  };

  const logs = ((logsRes.data as LogRow[]) ?? []).slice().reverse();
  const sourceIds = logs.map((r) => r.id).filter((id): id is string => typeof id === "string");

  return { orderFact, logs, sourceIds };
}

export type RunInsightsResult = {
  lineUserId: string;
  insights: CrmInsights;
  model: string;
  orderFact: CustomerContext["orderFact"];
  tagWritten: boolean;
};

/**
 * 產生並儲存單一客戶的 AI 洞察。
 * - 永遠 upsert 到 customer_ai_insights
 * - 只有 writeTag=true 且 confidence>=門檻 時，才把意願標籤寫回 chat_state，
 *   且不會覆蓋人工確認過的標籤（tag_source='manual'）。
 */
export async function runAndStoreInsights(
  supabase: SupabaseClient,
  lineUserId: string,
  opts?: { writeTag?: boolean; minConfidenceForTag?: number },
): Promise<RunInsightsResult> {
  const writeTag = opts?.writeTag ?? false;
  const minConfidence = opts?.minConfidenceForTag ?? 0.5;

  const { orderFact, logs, sourceIds } = await gatherCustomerContext(supabase, lineUserId);
  const { insights, model } = await generateCrmInsights({ lineUserId, chatLogs: logs, orderFact });

  const nowIso = new Date().toISOString();
  const { error: upsertErr } = await supabase.from("customer_ai_insights").upsert(
    {
      line_user_id: lineUserId,
      insights,
      suggested_tag: insights.suggested_tag,
      recommended_products: insights.recommended_products,
      suggested_send_window: insights.suggested_send_window,
      source_line_log_ids: sourceIds,
      model,
      generated_at: nowIso,
      updated_at: nowIso,
    },
    { onConflict: "line_user_id" },
  );
  if (upsertErr) throw new Error(`儲存 AI 洞察失敗：${upsertErr.message}`);

  let tagWritten = false;
  if (writeTag && insights.suggested_tag && insights.confidence >= minConfidence) {
    // 人工標籤優先：只更新 tag_source 為 null 或 ai 的列
    const { error: tagErr } = await supabase
      .from("chat_state")
      .update({ tag: insights.suggested_tag, tag_source: "ai" })
      .eq("line_user_id", lineUserId)
      .or("tag_source.is.null,tag_source.eq.ai");
    if (tagErr) throw new Error(`寫入意願標籤失敗：${tagErr.message}`);
    tagWritten = true;
  }

  return { lineUserId, insights, model, orderFact, tagWritten };
}
