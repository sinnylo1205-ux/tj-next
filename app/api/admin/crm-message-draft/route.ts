import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminQuotationApi } from "@/lib/quotation-draft-auth";
import { crmInsightsSchema, generateCrmMessageDraft } from "@/lib/crm-customer-insights-ai";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  line_user_id: z.string().min(1, "缺少 line_user_id"),
  objective: z.string().optional(),
});

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
    const { line_user_id, objective } = parsed.data;

    const [insightsRes, orderRes] = await Promise.all([
      supabase
        .from("customer_ai_insights")
        .select("insights")
        .eq("line_user_id", line_user_id)
        .maybeSingle(),
      supabase
        .from("customer_360")
        .select("order_count,lifetime_value,last_pickup_date")
        .eq("line_user_id", line_user_id)
        .maybeSingle(),
    ]);

    if (insightsRes.error || orderRes.error) {
      return NextResponse.json(
        { error: "讀取草稿資料失敗", details: insightsRes.error?.message || orderRes.error?.message },
        { status: 500 },
      );
    }

    const insights = crmInsightsSchema.parse(
      insightsRes.data?.insights ?? {
        interested_products: [],
        last_ordered_products: [],
        purchase_motivation: "",
        usage_occasion: "",
        confidence: 0.5,
        rationale_zh: "尚未產生洞察，使用預設草稿。",
        suggested_tag: null,
        recommended_products: [],
        suggested_send_window: "",
      },
    );

    const orderFact = {
      order_count: Number(orderRes.data?.order_count ?? 0),
      lifetime_value: Number(orderRes.data?.lifetime_value ?? 0),
      last_pickup_date: orderRes.data?.last_pickup_date ?? null,
      recent_products: insights.last_ordered_products ?? [],
    };

    const { draft, model } = await generateCrmMessageDraft({
      lineUserId: line_user_id,
      insights,
      orderFact,
      objective,
    });

    return NextResponse.json({ ok: true, line_user_id, draft, model });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "crm-message-draft 失敗", details: msg }, { status: 500 });
  }
}
