import { NextResponse } from "next/server";
import { assertAdminQuotationApi } from "@/lib/quotation-draft-auth";
import { runAndStoreInsights } from "@/lib/crm-insights-runner";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  line_user_id: z.string().min(1, "缺少 line_user_id"),
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

    const { line_user_id } = parsed.data;
    // 單人：只更新洞察，不自動寫標籤（標籤由人工或批次處理）
    const { insights, model, orderFact } = await runAndStoreInsights(supabase, line_user_id, { writeTag: false });

    return NextResponse.json({ ok: true, line_user_id, insights, model, order_fact: orderFact });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "crm-insights 失敗", details: msg }, { status: 500 });
  }
}
