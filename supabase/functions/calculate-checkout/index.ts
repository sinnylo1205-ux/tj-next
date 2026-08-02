// ======================================================================
// calculate-checkout Edge Function — 結帳運費與總金額計算
// ======================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { z } from "https://esm.sh/zod@3.22.4";
import { planCouponClaim } from "../_shared/coupon-claim.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 60;
const ipRequestBuckets = new Map<string, number[]>();

function getClientIp(req: Request): string {
  const xForwardedFor = req.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    return xForwardedFor.split(",")[0].trim();
  }
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown";
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const currentRequests = (ipRequestBuckets.get(ip) || []).filter((ts) => ts >= windowStart);
  currentRequests.push(now);
  ipRequestBuckets.set(ip, currentRequests);
  return currentRequests.length > RATE_LIMIT_MAX_REQUESTS;
}

// ========== Zod Schema 驗證（user_id 由 JWT 取得，不接受前端傳入） ==========
const CheckoutRequestSchema = z.object({
  cart_item_ids: z
    .array(z.string().uuid())
    .min(1, "購物車不能為空")
    .max(50, "一次最多結帳 50 筆購物車項目"),
  shipping_method: z.enum(["自取", "黑貓宅配", "專件配送"]),
  expected_pickup_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式錯誤").optional(),
  coupon_code: z.string().max(32).optional(),
  /** When true, atomically consume a one-time coupon before returning success. */
  claim_coupon: z.boolean().optional(),
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

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "Method Not Allowed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 405,
    });
  }

  const clientIp = getClientIp(req);
  if (isRateLimited(clientIp)) {
    console.error("❌ Rate limit exceeded:", clientIp);
    return new Response(JSON.stringify({ success: false, error: "請求過於頻繁，請稍後再試" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 429,
    });
  }

  try {
    // ========== JWT 驗證 ==========
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "未登入，請先登入後再結帳" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      console.error("❌ JWT 驗證失敗:", authError?.message);
      return new Response(JSON.stringify({ success: false, error: "身分驗證失敗，請重新登入" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    // ========== 輸入驗證 ==========
    const rawData = await req.json();
    const parseResult = CheckoutRequestSchema.safeParse(rawData);

    if (!parseResult.success) {
      console.error("❌ Validation error:", parseResult.error.flatten());
      return new Response(
        JSON.stringify({ success: false, error: "參數驗證失敗", details: parseResult.error.flatten().fieldErrors }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
      );
    }

    const { cart_item_ids, shipping_method, expected_pickup_date, coupon_code, claim_coupon } =
      parseResult.data;
    const uniqueCartIds = [...new Set(cart_item_ids)];
    if (uniqueCartIds.length !== cart_item_ids.length) {
      return new Response(JSON.stringify({ success: false, error: "購物車項目不可重複" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    console.log("📥 Checkout calculation request:", JSON.stringify({ ...parseResult.data, user_id: user.id }, null, 2));

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Preview path: reject already-used coupons early. Submit path (claim_coupon)
    // relies on the atomic RPC instead to avoid TOCTOU gaps.
    let usedCoupons: string[] = [];
    if (coupon_code && !claim_coupon) {
      const { data: userData, error: userError } = await supabase
        .from("user_log_in")
        .select("used_coupons")
        .eq("id", user.id)
        .single();

      if (!userError && userData?.used_coupons) {
        usedCoupons = userData.used_coupons || [];
      }
      const earlyPlan = planCouponClaim({
        appliedCouponCode: coupon_code,
        claimCoupon: false,
        usedCoupons,
      });
      if (earlyPlan.action === "reject_used") {
        return new Response(
          JSON.stringify({ success: false, error: "此優惠碼已使用過，每人限用一次" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
        );
      }
    }

    // ========== 1. 載入購物車項目（僅限登入者、未送出） ==========
    const { data: cartItems, error: cartError } = await supabase
      .from("cart")
      .select("id, total_price, quantity, product_id")
      .in("id", uniqueCartIds)
      .eq("user_id", user.id)
      .eq("is_submitted", false);

    if (cartError) {
      console.error("❌ Cart query error:", cartError);
      return new Response(
        JSON.stringify({ success: false, error: "讀取購物車失敗" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
      );
    }

    if (!cartItems || cartItems.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "購物車為空或項目不存在" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
      );
    }

    if (cartItems.length !== uniqueCartIds.length) {
      console.error("❌ Cart ownership/count mismatch:", {
        requested: uniqueCartIds.length,
        found: cartItems.length,
        user_id: user.id,
      });
      return new Response(
        JSON.stringify({ success: false, error: "部分購物車項目不存在或不屬於您" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 },
      );
    }

    const validation = { valid: true, errors: [] as string[], warnings: [] as string[] };

    for (const item of cartItems) {
      const qty = Number(item.quantity);
      if (!Number.isFinite(qty) || qty < 1) {
        validation.valid = false;
        validation.errors.push(`購物車品項 ${item.id} 數量異常`);
      }
      const lineTotal = Number(item.total_price);
      if (!Number.isFinite(lineTotal) || lineTotal < 0) {
        validation.valid = false;
        validation.errors.push(`購物車品項 ${item.id} 金額異常`);
      }
    }

    // ========== 2. 計算商品小計 ==========
    const subtotal = cartItems.reduce((sum, item) => sum + (Number(item.total_price) || 0), 0);

    if (subtotal <= 0) {
      validation.valid = false;
      validation.errors.push("商品小計必須大於 0");
    }

    // ========== 3. 優惠碼處理 ==========
    let couponDiscount = 0;
    let appliedCouponCode: string | null = null;
    let couponError: string | null = null;

    if (coupon_code) {
      const couponDef = COUPON_DEFINITIONS[coupon_code.toUpperCase()];
      if (!couponDef) {
        couponError = `無效的優惠碼：${coupon_code}`;
      } else if (couponDef.type === "discount" && couponDef.discount_rate) {
        couponDiscount = Math.round(subtotal * (1 - couponDef.discount_rate));
        appliedCouponCode = coupon_code.toUpperCase();
      } else if (couponDef.type === "free_shipping") {
        appliedCouponCode = coupon_code.toUpperCase();
      }
    }

    // ========== 4. 計算運費 ==========
    const availableMethods = getAvailableShippingMethods(expected_pickup_date);
    const selectedMethod = availableMethods.find((m) => m.id === shipping_method);

    let shippingFee = SHIPPING_FEES[shipping_method] || 0;

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
      if (subtotal >= FREE_SHIPPING_THRESHOLD && shipping_method === "黑貓宅配") {
        freeShippingApplied = true;
        freeShippingDiscount = shippingFee;
        shippingFee = 0;

        if (appliedCouponCode && COUPON_DEFINITIONS[appliedCouponCode]?.type === "free_shipping") {
          validation.warnings.push("訂單已達免運門檻，免運優惠碼不再額外折抵");
          appliedCouponCode = null;
        }
      } else if (appliedCouponCode && COUPON_DEFINITIONS[appliedCouponCode]?.type === "free_shipping") {
        freeShippingApplied = true;
        freeShippingDiscount = shippingFee;
        shippingFee = 0;
      }
    } else if (appliedCouponCode && COUPON_DEFINITIONS[appliedCouponCode]?.type === "free_shipping") {
      validation.warnings.push("自取無需運費，免運優惠碼無效");
      appliedCouponCode = null;
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
          .reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);

        if (notice.min_order_qty && totalQty < notice.min_order_qty) {
          validation.valid = false;
          validation.errors.push(
            `${notice.product_id} 最小訂購量為 ${notice.min_order_qty}，目前只有 ${totalQty}`,
          );
        }
      }
    }

    // ========== 7. 計算總金額 ==========
    const totalAmount = subtotal - couponDiscount + shippingFee;
    const roundedTotal = Math.round(totalAmount);

    if (!Number.isFinite(roundedTotal) || roundedTotal <= 0) {
      validation.valid = false;
      validation.errors.push("訂單總金額必須大於 0");
    }

    console.log("✅ Checkout calculation result:", {
      subtotal,
      couponDiscount,
      shippingFee,
      freeShippingApplied,
      freeShippingDiscount,
      totalAmount: roundedTotal,
      validation,
      user_id: user.id,
    });

    const responseData = {
      subtotal,
      shipping_fee: shippingFee,
      total_amount: roundedTotal,
      available_shipping_methods: availableMethods,
      validation,
      free_shipping_applied: freeShippingApplied,
      free_shipping_discount: freeShippingDiscount,
      coupon_code: appliedCouponCode,
      coupon_discount: couponDiscount,
    };

    if (!validation.valid) {
      return new Response(
        JSON.stringify({
          success: false,
          error: validation.errors[0] || "結帳驗證失敗",
          data: responseData,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
      );
    }

    // Submit-time one-time coupon consumption (service-role RPC). Preview never claims.
    const claimPlan = planCouponClaim({
      appliedCouponCode: appliedCouponCode,
      claimCoupon: Boolean(claim_coupon),
      usedCoupons,
    });
    if (claimPlan.action === "claim") {
      const { data: claimed, error: claimError } = await supabase.rpc("claim_user_coupon_for_user", {
        p_user_id: user.id,
        p_coupon_code: claimPlan.code,
      });
      if (claimError) {
        console.error("❌ Coupon claim RPC failed:", claimError);
        return new Response(
          JSON.stringify({ success: false, error: "優惠碼核銷失敗，請稍後再試" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
        );
      }
      if (claimed !== true) {
        return new Response(
          JSON.stringify({ success: false, error: "此優惠碼已使用過，每人限用一次" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: responseData,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("❌ Checkout calculation error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "伺服器處理請求時發生錯誤" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
