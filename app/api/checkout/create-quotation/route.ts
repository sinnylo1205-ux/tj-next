import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAuthenticatedUser } from "@/lib/checkout-auth";
import {
  buildCartQuotationRows,
  isCustomerSource,
} from "@/lib/checkout-create-quotation";
import { insertQuotationFromDraft } from "@/lib/quotation-draft-commit";

export const runtime = "nodejs";
export const maxDuration = 60;

const itemSchema = z.object({
  product_id: z.string().optional().nullable(),
  name: z.string().optional().nullable(),
  product_name: z.string().optional().nullable(),
  quantity: z.number().finite().positive(),
  price: z.number().finite().optional().nullable(),
  total_price: z.number().finite().optional().nullable(),
  category: z.string().optional().nullable(),
  is_package_design: z.boolean().optional().nullable(),
  preview_url: z.string().optional().nullable(),
  customizations: z.unknown().optional(),
  customizations_json: z.unknown().optional(),
});

const bodySchema = z.object({
  who_receive: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  address: z.string().trim().min(1),
  shipping_way: z.enum(["自取", "黑貓宅配", "專件配送"]),
  email: z.union([z.string().email(), z.literal(""), z.null()]).optional(),
  notes: z.string().optional().nullable(),
  expected_pickup_date: z.string().optional().nullable(),
  customer_source: z.string(),
  subtotal: z.number().finite().nonnegative(),
  shipping_fee: z.number().finite().nonnegative(),
  total_amount: z.number().finite().nonnegative(),
  items: z.array(itemSchema).min(1),
});

/**
 * POST /api/checkout/create-quotation
 * 顧客從結帳頁預建報價單：寫入 quotation_orders（price_reply）、帶入合成圖 preview_url、回傳 pdf_input。
 */
export async function POST(req: Request) {
  try {
    const auth = await assertAuthenticatedUser(req);
    if (auth instanceof Response) return auth;

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "無效的 JSON body" }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("；");
      return NextResponse.json({ error: msg || "參數錯誤" }, { status: 400 });
    }

    const body = parsed.data;
    if (!isCustomerSource(body.customer_source)) {
      return NextResponse.json({ error: "請選擇有效的顧客來源" }, { status: 400 });
    }

    const phoneDigits = body.phone.replace(/\D/g, "");
    if (phoneDigits.length !== 10) {
      return NextResponse.json({ error: "電話號碼必須為 10 碼" }, { status: 400 });
    }

    const productIds = [
      ...new Set(body.items.map((i) => i.product_id).filter((id): id is string => !!id)),
    ];
    let product_name_map: Record<string, string> = {};
    if (productIds.length > 0) {
      const { data: products } = await auth.supabase
        .from("products")
        .select("id, name")
        .in("id", productIds);
      product_name_map = {};
      products?.forEach((p: { id: string; name: string }) => {
        product_name_map[p.id] = p.name || p.id;
      });
    }

    const { quotation_order, quotation_order_items, pdf_input } = buildCartQuotationRows({
      user_id: auth.userId,
      email: body.email || null,
      who_receive: body.who_receive,
      phone: body.phone,
      address: body.address,
      shipping_way: body.shipping_way,
      expected_pickup_date: body.expected_pickup_date || null,
      notes: body.notes || null,
      customer_source: body.customer_source,
      subtotal: body.subtotal,
      shipping_fee: body.shipping_fee,
      total_amount: body.total_amount,
      items: body.items,
      product_name_map,
    });

    const { quotation_order_id } = await insertQuotationFromDraft(auth.supabase, {
      quotation_order,
      quotation_order_items,
    });

    console.log("[checkout/create-quotation] ok", {
      user: auth.userId,
      quotation_order_id,
    });

    return NextResponse.json({
      success: true,
      quotation_order_id,
      pdf_input,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "建立報價單失敗";
    console.error("[checkout/create-quotation]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
