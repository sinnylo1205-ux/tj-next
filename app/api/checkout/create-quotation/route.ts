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

const bodySchema = z.object({
  who_receive: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  address: z.string().trim().min(1),
  shipping_way: z.enum(["自取", "黑貓宅配", "專件配送"]),
  email: z.union([z.string().email(), z.literal(""), z.null()]).optional(),
  notes: z.string().optional().nullable(),
  customer_source: z.string(),
  cart_item_ids: z.array(z.string().uuid()).min(1).max(50),
  coupon_code: z.string().trim().max(32).optional().nullable(),
});

/**
 * POST /api/checkout/create-quotation
 * 顧客從結帳頁預建報價單：由伺服器重新讀取／計價購物車後寫入 quotation_orders。
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

    const uniqueCartItemIds = [...new Set(body.cart_item_ids)];
    if (uniqueCartItemIds.length !== body.cart_item_ids.length) {
      return NextResponse.json({ error: "購物車項目不可重複" }, { status: 400 });
    }

    const { data: cartRows, error: cartError } = await auth.supabase
      .from("cart")
      .select(
        "id, product_id, quantity, total_price, preview_url, customizations_json, linked_item_id, is_package_design, expected_pickup_date",
      )
      .in("id", uniqueCartItemIds)
      .eq("user_id", auth.userId)
      .eq("is_submitted", false);
    if (cartError) {
      console.error("[checkout/create-quotation] cart query failed", cartError);
      return NextResponse.json({ error: "讀取購物車失敗" }, { status: 500 });
    }
    if (!cartRows || cartRows.length !== uniqueCartItemIds.length) {
      return NextResponse.json(
        { error: "部分購物車項目不存在、不屬於您或已送出，請重新整理購物車" },
        { status: 403 },
      );
    }

    const cartRowsById = new Map(cartRows.map((row) => [String(row.id), row]));
    const orderedCartRows = uniqueCartItemIds.map((id) => cartRowsById.get(id)!);
    const pickupDates = [
      ...new Set(
        orderedCartRows
          .filter((row) => !row.is_package_design)
          .map((row) => row.expected_pickup_date)
          .filter((date): date is string => typeof date === "string" && date.length > 0),
      ),
    ];
    if (pickupDates.length > 1) {
      return NextResponse.json({ error: "所選購物車項目的取貨日期必須一致" }, { status: 400 });
    }
    const expectedPickupDate = pickupDates[0];

    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
    if (!anonKey) {
      return NextResponse.json({ error: "伺服器未設定 NEXT_PUBLIC_SUPABASE_ANON_KEY" }, { status: 503 });
    }
    const calculationResponse = await fetch(`${auth.supabaseUrl}/functions/v1/calculate-checkout`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        apikey: anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cart_item_ids: uniqueCartItemIds,
        shipping_method: body.shipping_way,
        expected_pickup_date: expectedPickupDate,
        coupon_code: body.coupon_code || undefined,
      }),
    });
    const calculationPayload = (await calculationResponse.json().catch(() => null)) as {
      success?: boolean;
      error?: string;
      data?: {
        subtotal?: number;
        shipping_fee?: number;
        total_amount?: number;
      };
    } | null;
    if (!calculationResponse.ok || !calculationPayload?.success || !calculationPayload.data) {
      return NextResponse.json(
        { error: calculationPayload?.error || "購物車計價驗證失敗" },
        { status: calculationResponse.ok ? 400 : calculationResponse.status },
      );
    }
    const { subtotal, shipping_fee, total_amount } = calculationPayload.data;
    if (
      !Number.isFinite(subtotal) ||
      !Number.isFinite(shipping_fee) ||
      !Number.isFinite(total_amount) ||
      Number(total_amount) <= 0
    ) {
      return NextResponse.json({ error: "購物車計價結果無效" }, { status: 502 });
    }

    const productIds = [
      ...new Set(
        orderedCartRows
          .map((row) => row.product_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    ];
    let product_name_map: Record<string, string> = {};
    let product_category_map: Record<string, string> = {};
    if (productIds.length > 0) {
      const { data: products } = await auth.supabase
        .from("products")
        .select("id, name, category")
        .in("id", productIds);
      product_name_map = {};
      product_category_map = {};
      products?.forEach((p: { id: string; name: string; category: string | null }) => {
        product_name_map[p.id] = p.name || p.id;
        product_category_map[p.id] = p.category || "";
      });
    }

    const { quotation_order, quotation_order_items, pdf_input } = buildCartQuotationRows({
      user_id: auth.userId,
      email: body.email || null,
      who_receive: body.who_receive,
      phone: body.phone,
      address: body.address,
      shipping_way: body.shipping_way,
      expected_pickup_date: expectedPickupDate || null,
      notes: body.notes || null,
      customer_source: body.customer_source,
      subtotal: Number(subtotal),
      shipping_fee: Number(shipping_fee),
      total_amount: Number(total_amount),
      items: orderedCartRows.map((row) => ({
        cart_item_id: String(row.id),
        product_id: typeof row.product_id === "string" ? row.product_id : null,
        quantity: Number(row.quantity),
        total_price: Number(row.total_price),
        category:
          typeof row.product_id === "string" ? product_category_map[row.product_id] || null : null,
        is_package_design: Boolean(row.is_package_design),
        preview_url: typeof row.preview_url === "string" ? row.preview_url : null,
        customizations_json: row.customizations_json,
        linked_item_id: typeof row.linked_item_id === "string" ? row.linked_item_id : null,
      })),
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
