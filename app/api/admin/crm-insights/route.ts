import { NextResponse } from "next/server";
import { assertAdminQuotationApi } from "@/lib/quotation-draft-auth";
import { generateCrmInsights } from "@/lib/crm-customer-insights-ai";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  line_user_id: z.string().min(1, "缺少 line_user_id"),
});

type OrderRow = {
  id: string;
  total_amount: number | null;
  expected_pickup_date: string | null;
  order_status: string | null;
  payment_step: string | null;
};

export async function POST(req: Request) {
  const auth = await assertAdminQuotationApi(req);
  if (auth instanceof Response) return auth;

  const { supabase } = auth;
  try {
    const raw = await req.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "參數錯誤", details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const { line_user_id } = parsed.data;
    const { data: userRows } = await supabase
      .from("user_log_in")
      .select("id")
      .eq("line_user_id", line_user_id);
    const userIds = (userRows ?? []).map((r) => r.id);

    const [ordersByLineRes, ordersByUserRes, logsRes] = await Promise.all([
      supabase
        .from("orders")
        .select("id,total_amount,expected_pickup_date,order_status,payment_step")
        .eq("line_user_id", line_user_id)
        .order("created_at", { ascending: false })
        .limit(120),
      userIds.length > 0
        ? supabase
            .from("orders")
            .select("id,total_amount,expected_pickup_date,order_status,payment_step")
            .in("user_id", userIds)
            .order("created_at", { ascending: false })
            .limit(120)
        : Promise.resolve({ data: [] as OrderRow[], error: null }),
      supabase
        .from("line_log")
        .select("id,received_at,user_text,ai_reply,admin_reply")
        .eq("user_id", line_user_id)
        .order("received_at", { ascending: false })
        .limit(80),
    ]);

    if (ordersByLineRes.error || ordersByUserRes.error || logsRes.error) {
      return NextResponse.json(
        {
          error: "讀取資料失敗",
          details:
            ordersByLineRes.error?.message || ordersByUserRes.error?.message || logsRes.error?.message || "unknown",
        },
        { status: 500 },
      );
    }

    const dedup = new Map<string, OrderRow>();
    [...(ordersByLineRes.data ?? []), ...(ordersByUserRes.data ?? [])].forEach((o) => dedup.set(o.id, o as OrderRow));
    const validOrders = Array.from(dedup.values()).filter(
      (o) =>
        ["processing", "shipped", "delivered"].includes(String(o.order_status ?? "")) &&
        String(o.payment_step ?? "") === "verified",
    );

    const orderIds = validOrders.map((o) => o.id);
    const productSummary =
      orderIds.length === 0
        ? []
        : (
            await supabase
              .from("order_items")
              .select("product_name,quantity")
              .in("order_id", orderIds)
          ).data ?? [];

    const productNames = productSummary
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
      recent_products: productNames,
    };

    const logs = (logsRes.data ?? []).reverse();
    const { insights, model } = await generateCrmInsights({
      lineUserId: line_user_id,
      chatLogs: logs,
      orderFact,
    });

    const sourceIds = logs
      .map((r) => r.id)
      .filter((id): id is string => typeof id === "string");

    const { error: upsertErr } = await supabase.from("customer_ai_insights").upsert(
      {
        line_user_id,
        insights,
        suggested_tag: insights.suggested_tag,
        recommended_products: insights.recommended_products,
        suggested_send_window: insights.suggested_send_window,
        source_line_log_ids: sourceIds,
        model,
        generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "line_user_id" },
    );
    if (upsertErr) {
      return NextResponse.json({ error: "儲存 AI 洞察失敗", details: upsertErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, line_user_id, insights, model, order_fact: orderFact });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "crm-insights 失敗", details: msg }, { status: 500 });
  }
}
