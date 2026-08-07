import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminQuotationApi } from "@/lib/quotation-draft-auth";
import { sendWakeupMessage, setWakeupOptOut } from "@/lib/customer-wakeup";

export const runtime = "nodejs";
export const maxDuration = 60;

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update_text"),
    draft_id: z.string().uuid(),
    draft_text: z.string().min(1).max(5000),
  }),
  z.object({
    action: z.literal("approve_send"),
    draft_id: z.string().uuid(),
    draft_text: z.string().min(1).max(5000).optional(),
  }),
  z.object({
    action: z.literal("resend"),
    draft_id: z.string().uuid(),
    draft_text: z.string().min(1).max(5000).optional(),
  }),
  z.object({
    action: z.literal("dismiss"),
    draft_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal("opt_out"),
    customer_key: z.string().min(1),
    wakeup_opt_out: z.boolean(),
  }),
]);

export async function GET(req: Request) {
  const auth = await assertAdminQuotationApi(req);
  if (auth instanceof Response) return auth;

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "pending_review";
  const customerKey = url.searchParams.get("customer_key");

  let q = auth.supabase.from("customer_wakeup_drafts").select("*").limit(100);

  if (status !== "all") {
    q = q.eq("status", status);
  }
  if (customerKey) {
    q = q.eq("customer_key", customerKey);
  }
  // 已發送依 sent_at；其餘依建立時間
  q = status === "sent" ? q.order("sent_at", { ascending: false, nullsFirst: false }) : q.order("created_at", { ascending: false });

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, drafts: data ?? [] });
}

export async function POST(req: Request) {
  const auth = await assertAdminQuotationApi(req);
  if (auth instanceof Response) return auth;

  try {
    const raw = await req.json();
    const parsed = patchSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "參數錯誤", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const body = parsed.data;
    const now = new Date().toISOString();

    if (body.action === "opt_out") {
      await setWakeupOptOut(auth.supabase, body.customer_key, body.wakeup_opt_out, auth.userId);
      return NextResponse.json({ ok: true, customer_key: body.customer_key, wakeup_opt_out: body.wakeup_opt_out });
    }

    const { data: draft, error: fetchErr } = await auth.supabase
      .from("customer_wakeup_drafts")
      .select("*")
      .eq("id", body.draft_id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!draft) {
      return NextResponse.json({ error: "找不到草稿" }, { status: 404 });
    }

    if (body.action === "update_text") {
      const { data: updated, error } = await auth.supabase
        .from("customer_wakeup_drafts")
        .update({ draft_text: body.draft_text, updated_at: now })
        .eq("id", body.draft_id)
        .eq("status", "pending_review")
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!updated?.id) {
        return NextResponse.json({ error: "僅待審草稿可編輯" }, { status: 409 });
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "dismiss") {
      const { data: updated, error } = await auth.supabase
        .from("customer_wakeup_drafts")
        .update({
          status: "dismissed",
          reviewed_by: auth.userId,
          reviewed_at: now,
          updated_at: now,
        })
        .eq("id", body.draft_id)
        .eq("status", "pending_review")
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!updated?.id) {
        return NextResponse.json({ error: "僅待審草稿可略過" }, { status: 409 });
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "approve_send") {
      if (draft.status === "sent") {
        return NextResponse.json({ error: "此草稿已發送，請改用「重新發送」" }, { status: 400 });
      }
      if (draft.status !== "pending_review" && draft.status !== "approved" && draft.status !== "failed") {
        return NextResponse.json({ error: "此草稿狀態不可核准發送" }, { status: 400 });
      }
    }

    if (body.action === "resend" && draft.status !== "sent") {
      return NextResponse.json({ error: "僅已發送草稿可重新發送" }, { status: 400 });
    }

    const text = (body.draft_text ?? (draft.draft_text as string)).trim();
    const metaName =
      draft.metadata && typeof draft.metadata === "object" && "customer_name" in draft.metadata
        ? String((draft.metadata as { customer_name?: unknown }).customer_name ?? "")
        : null;

    // resend：再推一次，另存一筆 sent 紀錄；聯絡仍凍結自原草稿，避免 rollup MAX 改寄
    const result = await sendWakeupMessage({
      supabase: auth.supabase,
      customerKey: draft.customer_key as string,
      messageText: text,
      customerName: metaName,
      draftId: body.action === "resend" ? null : (draft.id as string),
      contactSourceDraftId: body.action === "resend" ? (draft.id as string) : null,
      source: body.action === "resend" ? "admin_compose" : undefined,
      reviewedBy: auth.userId,
      authHeader: req.headers.get("Authorization"),
    });

    return NextResponse.json({ ok: true, channel: result.channel, draft_id: result.draftId });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "操作失敗", details: msg }, { status: 500 });
  }
}
