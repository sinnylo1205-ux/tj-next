import { NextResponse } from "next/server";
import { assertAdminQuotationApi } from "@/lib/quotation-draft-auth";
import { generateCrmAggregateSummary } from "@/lib/crm-customer-insights-ai";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  days: z.coerce.number().int().min(1).max(3650).default(90),
});

type Customer360 = {
  line_user_id: string;
  display_name: string | null;
  tag: string | null;
  order_count: number | null;
  lifetime_value: number | null;
  has_orders: boolean | null;
  last_message_at: string | null;
  primary_email: string | null;
};

type InsightsRow = {
  line_user_id: string;
  insights: {
    interested_products?: string[];
    last_ordered_products?: string[];
    purchase_motivation?: string;
    usage_occasion?: string;
  } | null;
};

const INTENT_TAGS = ["高意願", "中意願", "低意願"] as const;

function topCounts(items: string[], topN: number): Array<{ name: string; count: number }> {
  const m = new Map<string, number>();
  items.forEach((raw) => {
    const name = raw.replace(/\s*x\d+$/i, "").trim();
    if (!name) return;
    m.set(name, (m.get(name) ?? 0) + 1);
  });
  return Array.from(m.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([name, count]) => ({ name, count }));
}

// GET：取最近一次已快取的報表
export async function GET(req: Request) {
  const auth = await assertAdminQuotationApi(req);
  if (auth instanceof Response) return auth;
  const { supabase } = auth;

  const { data, error } = await supabase
    .from("crm_analysis_reports")
    .select("id,scope_days,report,generated_at")
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "讀取報表失敗", details: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, report: data ?? null });
}

// POST：重新彙整 + 產生 AI 文字洞察 + 寫入快取
export async function POST(req: Request) {
  const auth = await assertAdminQuotationApi(req);
  if (auth instanceof Response) return auth;
  const { supabase, userId } = auth;

  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "參數錯誤", details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const { days } = parsed.data;
    const since = new Date(Date.now() - days * 86_400_000).toISOString();

    const [custRes, insightsRes] = await Promise.all([
      supabase
        .from("customer_360")
        .select("line_user_id,display_name,tag,order_count,lifetime_value,has_orders,last_message_at,primary_email")
        .gte("last_message_at", since),
      supabase.from("customer_ai_insights").select("line_user_id,insights"),
    ]);
    if (custRes.error) {
      return NextResponse.json({ error: "讀取客戶資料失敗", details: custRes.error.message }, { status: 500 });
    }
    if (insightsRes.error) {
      return NextResponse.json({ error: "讀取洞察失敗", details: insightsRes.error.message }, { status: 500 });
    }

    const customers = (custRes.data as Customer360[]) ?? [];
    const insightsMap = new Map<string, InsightsRow["insights"]>();
    ((insightsRes.data as InsightsRow[]) ?? []).forEach((r) => insightsMap.set(r.line_user_id, r.insights));

    const total = customers.length;
    const intent = { 高意願: 0, 中意願: 0, 低意願: 0, 未標: 0 };
    let highIntentTotal = 0;
    let highIntentOrdered = 0;
    const highIntentNotOrdered: Customer360[] = [];
    const productPool: string[] = [];
    const motivations: string[] = [];
    const occasions: string[] = [];

    customers.forEach((c) => {
      const t = (INTENT_TAGS as readonly string[]).includes(String(c.tag)) ? (c.tag as string) : "未標";
      intent[t as keyof typeof intent] += 1;
      if (t === "高意願") {
        highIntentTotal += 1;
        if (c.has_orders) highIntentOrdered += 1;
        else highIntentNotOrdered.push(c);
      }
      const ins = insightsMap.get(c.line_user_id);
      if (ins) {
        (ins.interested_products ?? []).forEach((p) => productPool.push(p));
        (ins.last_ordered_products ?? []).forEach((p) => productPool.push(p));
        if (ins.purchase_motivation?.trim()) motivations.push(ins.purchase_motivation.trim());
        if (ins.usage_occasion?.trim()) occasions.push(ins.usage_occasion.trim());
      }
    });

    const topProducts = topCounts(productPool, 5);
    const highIntentConversionRate = highIntentTotal > 0 ? highIntentOrdered / highIntentTotal : 0;

    const highIntentNotOrderedList = highIntentNotOrdered
      .sort((a, b) => Number(b.lifetime_value ?? 0) - Number(a.lifetime_value ?? 0))
      .slice(0, 50)
      .map((c) => ({
        line_user_id: c.line_user_id,
        display_name: c.display_name,
        lifetime_value: Number(c.lifetime_value ?? 0),
        last_message_at: c.last_message_at,
        primary_email: c.primary_email,
      }));

    // 丟給 AI 的精簡統計（不含原始對話，控成本）
    const statsForAi = {
      scope_days: days,
      total_customers: total,
      intent_distribution: intent,
      high_intent_total: highIntentTotal,
      high_intent_conversion_rate: Number(highIntentConversionRate.toFixed(3)),
      top_products: topProducts,
      sample_motivations: motivations.slice(0, 40),
      sample_occasions: occasions.slice(0, 40),
    };

    let aiSummary: { common_questions: string[]; best_lead_profile: string; weekly_actions: string[] };
    let aiModel = "fallback-rule";
    try {
      const { summary, model } = await generateCrmAggregateSummary({ stats: statsForAi });
      aiSummary = summary;
      aiModel = model;
    } catch (e) {
      aiSummary = {
        common_questions: [],
        best_lead_profile: `AI 文字洞察產生失敗：${e instanceof Error ? e.message : String(e)}`,
        weekly_actions: ["優先聯繫『高意願未成交』名單"],
      };
    }

    const report = {
      scope_days: days,
      generated_at: new Date().toISOString(),
      kpi: {
        total,
        intent,
        high_intent_total: highIntentTotal,
        high_intent_not_ordered: highIntentNotOrdered.length,
        high_intent_conversion_rate: Number(highIntentConversionRate.toFixed(3)),
      },
      top_products: topProducts,
      high_intent_not_ordered_list: highIntentNotOrderedList,
      ai: { ...aiSummary, model: aiModel },
    };

    const { error: insErr } = await supabase
      .from("crm_analysis_reports")
      .insert({ scope_days: days, report, generated_by: userId ?? null });
    if (insErr) {
      // 快取寫入失敗不阻擋回傳結果
      return NextResponse.json({ ok: true, report, warning: `報表未寫入快取：${insErr.message}` });
    }

    return NextResponse.json({ ok: true, report });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "crm-aggregate 失敗", details: msg }, { status: 500 });
  }
}
