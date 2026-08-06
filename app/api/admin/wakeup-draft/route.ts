import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminQuotationApi } from "@/lib/quotation-draft-auth";
import {
  generateWakeupDraftText,
  resolveTriggerOrderId,
  resolveWakeupChannel,
  WAKEUP_OBJECTIVE,
  type OrderCustomerRollupLite,
} from "@/lib/customer-wakeup";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  customer_key: z.string().min(1),
});

/** 為單一客戶產生喚醒文案（僅回傳，不寫入草稿表；寫入由回填／cron／審核流程負責） */
export async function POST(req: Request) {
  const auth = await assertAdminQuotationApi(req);
  if (auth instanceof Response) return auth;

  try {
    const raw = await req.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "參數錯誤", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { data: rollup, error } = await auth.supabase
      .from("order_customer_rollup")
      .select("customer_key,customer_name,last_purchase_at,primary_email,line_user_id,has_line,has_email")
      .eq("customer_key", parsed.data.customer_key)
      .maybeSingle();

    if (error) throw error;
    if (!rollup) {
      return NextResponse.json({ error: "找不到客戶" }, { status: 404 });
    }

    const row = rollup as OrderCustomerRollupLite;
    const channelInfo = resolveWakeupChannel(row);
    if (!channelInfo) {
      return NextResponse.json({ error: "此客戶沒有 LINE 或 Email" }, { status: 400 });
    }

    const triggerOrderId = await resolveTriggerOrderId(
      auth.supabase,
      row.customer_key,
      row.last_purchase_at,
    );

    const { draftText, model, products } = await generateWakeupDraftText({
      supabase: auth.supabase,
      customerKey: row.customer_key,
      customerName: row.customer_name,
      lineUserId: channelInfo.line_user_id,
      lastPurchaseAt: row.last_purchase_at,
      triggerOrderId,
    });

    return NextResponse.json({
      ok: true,
      objective: WAKEUP_OBJECTIVE,
      draft_text: draftText,
      channel: channelInfo.channel,
      line_user_id: channelInfo.line_user_id,
      email: channelInfo.email,
      model,
      products,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "產草稿失敗", details: msg }, { status: 500 });
  }
}
