import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminQuotationApi } from "@/lib/quotation-draft-auth";
import { fetchOrdersForCustomerKey } from "@/lib/customer-wakeup";

export const runtime = "nodejs";

const querySchema = z.object({
  customer_key: z.string().min(1),
});

export async function GET(req: Request) {
  const auth = await assertAdminQuotationApi(req);
  if (auth instanceof Response) return auth;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    customer_key: url.searchParams.get("customer_key"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "缺少 customer_key" }, { status: 400 });
  }

  try {
    const orders = await fetchOrdersForCustomerKey(auth.supabase, parsed.data.customer_key);
    const { data: crm } = await auth.supabase
      .from("order_customer_crm")
      .select("wakeup_opt_out, company_name")
      .eq("customer_key", parsed.data.customer_key)
      .maybeSingle();

    const { data: pending } = await auth.supabase
      .from("customer_wakeup_drafts")
      .select("*")
      .eq("customer_key", parsed.data.customer_key)
      .eq("status", "pending_review")
      .maybeSingle();

    return NextResponse.json({
      ok: true,
      orders,
      wakeup_opt_out: Boolean(crm?.wakeup_opt_out),
      pending_draft: pending ?? null,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "載入失敗", details: msg }, { status: 500 });
  }
}
