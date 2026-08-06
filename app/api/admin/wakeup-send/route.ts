import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminQuotationApi } from "@/lib/quotation-draft-auth";
import { sendWakeupMessage } from "@/lib/customer-wakeup";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  customer_key: z.string().min(1),
  message_text: z.string().min(1).max(5000),
  draft_id: z.string().uuid().optional().nullable(),
  customer_name: z.string().optional().nullable(),
  line_user_id: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
});

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

    const result = await sendWakeupMessage({
      supabase: auth.supabase,
      customerKey: parsed.data.customer_key,
      messageText: parsed.data.message_text,
      customerName: parsed.data.customer_name,
      lineUserId: parsed.data.line_user_id,
      email: parsed.data.email,
      draftId: parsed.data.draft_id,
      source: parsed.data.draft_id ? undefined : "admin_compose",
      reviewedBy: auth.userId,
      authHeader: req.headers.get("Authorization"),
    });

    return NextResponse.json({
      ok: true,
      channel: result.channel,
      draft_id: result.draftId,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "發送失敗", details: msg }, { status: 500 });
  }
}
