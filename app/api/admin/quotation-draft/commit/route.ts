import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminQuotationApi } from "@/lib/quotation-draft-auth";
import { insertQuotationFromDraft } from "@/lib/quotation-draft-commit";

export const runtime = "nodejs";
export const maxDuration = 60;

const commitBodySchema = z.object({
  quotation_order: z.record(z.string(), z.unknown()),
  quotation_order_items: z.array(z.record(z.string(), z.unknown())).min(1),
});

/**
 * POST /api/admin/quotation-draft/commit
 * 將前一步「草稿 API」回傳的 quotation_order + quotation_order_items 寫入 Supabase。
 * 需管理員 JWT（與 /api/admin/quotation-draft 相同）。
 */
export async function POST(req: Request) {
  try {
    const auth = await assertAdminQuotationApi(req);
    if (auth instanceof Response) return auth;

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "無效的 JSON body" }, { status: 400 });
    }

    const parsed = commitBodySchema.safeParse(json);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("；");
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const { quotation_order_id } = await insertQuotationFromDraft(auth.supabase, parsed.data);

    console.log("[quotation-draft/commit] ok", { admin: auth.userId, quotation_order_id });

    return NextResponse.json({
      success: true,
      quotation_order_id,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "寫入失敗";
    console.error("[quotation-draft/commit]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
