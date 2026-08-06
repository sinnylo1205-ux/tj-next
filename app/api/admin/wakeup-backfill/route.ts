import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminQuotationApi } from "@/lib/quotation-draft-auth";
import {
  createWakeupDraftForCustomer,
  listEligibleRollupCustomers,
  notifyAdminsWakeupDrafts,
} from "@/lib/customer-wakeup";

export const runtime = "nodejs";
export const maxDuration = 300;

const bodySchema = z.object({
  confirm: z.literal(true),
  /** 限制處理筆數，避免一次過長；預設 50 */
  limit: z.number().int().min(1).max(200).optional(),
});

export async function POST(req: Request) {
  const auth = await assertAdminQuotationApi(req);
  if (auth instanceof Response) return auth;

  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "請傳入 { confirm: true } 以執行回填", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const limit = parsed.data.limit ?? 50;
    const eligible = await listEligibleRollupCustomers(auth.supabase, "backfill");
    const batch = eligible.slice(0, limit);

    let created = 0;
    let skipped = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const row of batch) {
      const result = await createWakeupDraftForCustomer(auth.supabase, row, "backfill");
      if (!result.ok) {
        failed += 1;
        errors.push(`${row.customer_key}: ${result.error}`);
        continue;
      }
      if (result.skipped) {
        skipped += 1;
        continue;
      }
      created += 1;
    }

    if (created > 0) {
      await notifyAdminsWakeupDrafts({
        supabase: auth.supabase,
        message: `🍰 取件後 14 天喚醒草稿回填：新增 ${created} 筆待審（略過 ${skipped}、失敗 ${failed}）。請至後台「AI喚醒客戶草稿」審核。`,
      });
      const now = new Date().toISOString();
      await auth.supabase
        .from("customer_wakeup_drafts")
        .update({ admin_notified_at: now, updated_at: now })
        .eq("status", "pending_review")
        .eq("source", "backfill")
        .is("admin_notified_at", null);
    }

    return NextResponse.json({
      ok: true,
      eligible_total: eligible.length,
      processed: batch.length,
      created,
      skipped,
      failed,
      errors: errors.slice(0, 20),
      remaining: Math.max(0, eligible.length - batch.length),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "回填失敗", details: msg }, { status: 500 });
  }
}
