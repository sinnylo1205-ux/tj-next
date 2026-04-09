// ======================================================================
// calculate-checkout Edge Function — 結帳運費與總金額計算
// ======================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { z } from "https://esm.sh/zod@3.22.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ========== Zod Schema 驗證 ==========
const CheckoutRequestSchema = z.object({
  cart_item_ids: z.array(z.string().uuid()).min(1, "購物車不能為空"),
  shipping_method: z.enum(["自取", "黑貓宅配", "專件配送"]),
  expected_pickup_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式錯誤").optional(),
  coupon_code: z.string().optional(),
  user_id: z.string().uuid().optional(),
});

// ========== 硬編碼優惠碼 ==========
const COUPON_DEFINITIONS: Record<string, { type: "free_shipping" | "discount"; discount_rate?: number }> = {
  TJNOSHIP2011: { type: "free_shipping" },
  TJ9992011: { type: "discount", discount_rate: 0.9 },
  TJ8582011: { type: "discount", discount_rate: 0.85 },
  TJ88888888: { type: "discount", discount_rate: 0.8 },
};

const FREE_SHIPPING_THRESHOLD = 10000;

interface ShippingMethod {
  id: "自取" | "黑貓宅配" | "專件配送";
  name: string;
  fee: number;
  available: boolean;
  description?: string;
}

// 運費定義
const SHIPPING_FEES: Record<string, number> = {
  "自取": 0,
  "黑貓宅配": 240,
  "專件配送": 650,
};

// 根據星期幾決定可用配送方式
function getAvailableShippingMethods(dateString?: string): ShippingMethod[] {
  const methods: ShippingMethod[] = [
    { id: "自取", name: "自取", fee: 0, available: true },
    { id: "黑貓宅配", name: "黑貓宅配", fee: 240, available: true },
    { id: "專件配送", name: "專件配送", fee: 650, available: true, description: "僅限雙北地區" },
  ];

  if (!dateString) return methods;

  const date = new Date(dateString);
  const dayOfWeek = date.getDay();

  if (dayOfWeek === 0) {
    return methods.map((m) => ({ ...m, available: m.id === "專件配送" }));
  } else if (dayOfWeek === 6) {
    return methods.map((m) => ({ ...m, available: m.id === "黑貓宅配" || m.id === "專件配送" }));
  }

  return methods;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ========== 輸入驗證 ==========
    const rawData = await req.json();
    const parseResult = CheckoutRequestSchema.safeParse(rawData);

    if (!parseResult.success) {
      console.error("❌ Validation error:", parseResult.error.flatten());
      return new Response(
        JSON.stringify({ success: false, error: "參數驗證失敗", details: parseResult.error.flatten().fieldErrors }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const { cart_item_ids, shipping_method, expected_pickup_date, coupon_code, user_id } = parseResult.data;
    console.log("📥 Checkout calculation request:", JSON.stringify(parseResult.data, null, 2));

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ========== 優惠碼重複使用檢查 ==========
    if (coupon_code && user_id) {
      const { data: userData, error: userError } = await supabase
        .from("user_log_in")
        .select("used_coupons")
        .eq("id", user_id)
        .single();

      if (!userError && userData?.used_coupons) {
        const usedCoupons: string[] = userData.used_coupons || [];
        if (usedCoupons.includes(coupon_code.toUpperCase())) {
          return new Response(
            JSON.stringify({ success: false, error: "此優惠碼已使用過，每人限用一次" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }
      }
    }

    // ========== 1. 載入購物車項目 ==========
    const { data: cartItems, error: cartError } = await supabase
      .from("cart")
      .select("id, total_price, quantity, product_id")
      .in("id", cart_item_ids)
      .eq("is_submitted", false);

    if (cartError) {
      console.error("❌ Cart query error:", cartError);
      return new Response(
        JSON.stringify({ success: false, error: "讀取購物車失敗" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    if (!cartItems || cartItems.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "購物車為空" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // ========== 2. 計算商品小計 ==========
    const subtotal = cartItems.reduce((sum, item) => sum + (item.total_price || 0), 0);

    // ========== 3. 優惠碼處理 ==========
    let couponDiscount = 0;
    let appliedCouponCode: string | null = null;
    let couponError: string | null = null;

    if (coupon_code) {
      const couponDef = COUPON_DEFINITIONS[coupon_code.toUpperCase()];
      if (!couponDef) {
        couponError = `無效的優惠碼：${coupon_code}`;
      } else if (couponDef.type === "discount" && couponDef.discount_rate) {
        // 折扣碼：套用在 subtotal
        couponDiscount = Math.round(subtotal * (1 - couponDef.discount_rate));
        appliedCouponCode = coupon_code.toUpperCase();
      } else if (couponDef.type === "free_shipping") {
        // 免運碼：稍後處理
        appliedCouponCode = coupon_code.toUpperCase();
      }
    }

    // ========== 4. 計算運費 ==========
    const availableMethods = getAvailableShippingMethods(expected_pickup_date);
    const selectedMethod = availableMethods.find((m) => m.id === shipping_method);

    let shippingFee = SHIPPING_FEES[shipping_method] || 0;
    const validation = { valid: true, errors: [] as string[], warnings: [] as string[] };

    if (couponError) {
      validation.valid = false;
      validation.errors.push(couponError);
    }

    if (selectedMethod && !selectedMethod.available) {
      validation.valid = false;
      validation.errors.push(`選擇的配送方式「${selectedMethod.name}」在該日期不可用`);
    }

    // ========== 5. 免運邏輯 ==========
    let freeShippingApplied = false;
    let freeShippingDiscount = 0;

    if (shipping_method !== "自取") {
      // 滿萬免運（基於原始 subtotal）
      if (subtotal >= FREE_SHIPPING_THRESHOLD) {
        freeShippingApplied = true;
        freeShippingDiscount = shippingFee;
        shippingFee = 0;

        // 如果同時使用免運優惠碼，提示不可疊加
        if (appliedCouponCode && COUPON_DEFINITIONS[appliedCouponCode]?.type === "free_shipping") {
          validation.warnings.push("訂單已達免運門檻，免運優惠碼不再額外折抵");
          appliedCouponCode = null; // 不套用免運碼
        }
      } else if (appliedCouponCode && COUPON_DEFINITIONS[appliedCouponCode]?.type === "free_shipping") {
        // 未達門檻但有免運碼
        freeShippingApplied = true;
        freeShippingDiscount = shippingFee;
        shippingFee = 0;
      }
    } else {
      // 自取不需要免運碼
      if (appliedCouponCode && COUPON_DEFINITIONS[appliedCouponCode]?.type === "free_shipping") {
        validation.warnings.push("自取無需運費，免運優惠碼無效");
        appliedCouponCode = null;
      }
    }

    // ========== 6. 檢查最小訂購量 ==========
    const productIds = [...new Set(cartItems.map((i) => i.product_id))];
    const { data: productNotices } = await supabase
      .from("product_notice")
      .select("product_id, min_order_qty")
      .in("product_id", productIds);

    if (productNotices) {
      for (const notice of productNotices) {
        const totalQty = cartItems
          .filter((i) => i.product_id === notice.product_id)
          .reduce((sum, i) => sum + (i.quantity || 0), 0);

        if (notice.min_order_qty && totalQty < notice.min_order_qty) {
          validation.valid = false;
          validation.errors.push(
            `${notice.product_id} 最小訂購量為 ${notice.min_order_qty}，目前只有 ${totalQty}`
          );
        }
      }
    }

    // ========== 7. 計算總金額 ==========
    const totalAmount = subtotal - couponDiscount + shippingFee;

    console.log("✅ Checkout calculation result:", {
      subtotal,
      couponDiscount,
      shippingFee,
      freeShippingApplied,
      freeShippingDiscount,
      totalAmount,
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          subtotal,
          shipping_fee: shippingFee,
          total_amount: totalAmount,
          available_shipping_methods: availableMethods,
          validation,
          free_shipping_applied: freeShippingApplied,
          free_shipping_discount: freeShippingDiscount,
          coupon_code: appliedCouponCode,
          coupon_discount: couponDiscount,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("❌ Checkout calculation error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "伺服器處理請求時發生錯誤" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
