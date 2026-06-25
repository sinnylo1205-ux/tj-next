import { NextResponse } from "next/server";
import { assertAdminQuotationApi } from "@/lib/quotation-draft-auth";
import { runAndStoreInsights } from "@/lib/crm-insights-runner";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * 批次分析：對「近 N 天有互動」的客戶逐一產生 AI 洞察並自動寫意願標籤。
 * 採分頁設計，前端以 offset 迴圈呼叫直到 done=true，避免單次逾時與 OpenAI 限流。
 */
const bodySchema = z.object({
  days: z.coerce.number().int().min(1).max(3650).default(90),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(25).default(10),
  min_confidence: z.coerce.number().min(0).max(1).default(0.6),
});

export async function POST(req: Request) {
  const auth = await assertAdminQuotationApi(req);
  if (auth instanceof Response) return auth;

  const { supabase } = auth;
  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "參數錯誤", details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const { days, offset, limit, min_confidence } = parsed.data;

    const since = new Date(Date.now() - days * 86_400_000).toISOString();

    const { count, error: countErr } = await supabase
      .from("chat_state")
      .select("line_user_id", { count: "exact", head: true })
      .gte("updated", since);
    if (countErr) {
      return NextResponse.json({ error: "讀取客戶數失敗", details: countErr.message }, { status: 500 });
    }
    const total = count ?? 0;

    const { data: rows, error: rowsErr } = await supabase
      .from("chat_state")
      .select("line_user_id")
      .gte("updated", since)
      .order("updated", { ascending: false })
      .range(offset, offset + limit - 1);
    if (rowsErr) {
      return NextResponse.json({ error: "讀取客戶清單失敗", details: rowsErr.message }, { status: 500 });
    }

    const ids = (rows ?? []).map((r) => r.line_user_id as string).filter(Boolean);

    const settled = await Promise.allSettled(
      ids.map((id) => runAndStoreInsights(supabase, id, { writeTag: true, minConfidenceForTag: min_confidence })),
    );

    const processed: Array<{ line_user_id: string; suggested_tag: string | null; tag_written: boolean }> = [];
    const failed: Array<{ line_user_id: string; error: string }> = [];
    settled.forEach((s, i) => {
      if (s.status === "fulfilled") {
        processed.push({
          line_user_id: s.value.lineUserId,
          suggested_tag: s.value.insights.suggested_tag,
          tag_written: s.value.tagWritten,
        });
      } else {
        failed.push({ line_user_id: ids[i], error: s.reason instanceof Error ? s.reason.message : String(s.reason) });
      }
    });

    const nextOffset = offset + ids.length;
    const done = ids.length === 0 || nextOffset >= total;

    return NextResponse.json({
      ok: true,
      total,
      offset,
      processed_count: processed.length,
      failed_count: failed.length,
      processed,
      failed,
      next_offset: nextOffset,
      done,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "crm-insights-batch 失敗", details: msg }, { status: 500 });
  }
}
