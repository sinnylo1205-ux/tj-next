import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { z } from "https://esm.sh/zod@3.22.4";

// ========== Origin 白名單 ==========
const ALLOWED_ORIGINS = [
  "https://tjcookies.com.tw",
  "https://www.tjcookies.com.tw",
  "https://tj-dessert-hub.lovable.app",
];

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.includes(origin) || origin.endsWith(".lovable.app") || origin.endsWith(".lovableproject.com");
}

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : "https://tjcookies.com.tw",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

// ========== Zod Schema 驗證（移除 user_id，改由 JWT 取得） ==========
const CreatePaymentRequestSchema = z.object({
  order_id: z.string().uuid("訂單 ID 格式錯誤"),
});

// ECPay 正式環境
const ECPAY_API_URL = "https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5";
const BLOCKED_ORDER_STATUS = new Set(["cancelled", "canceled", "closed", "completed", "refunded"]);

// 非同步版本的 SHA256
async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

async function generateCheckMacValueAsync(
  params: Record<string, string>,
  hashKey: string,
  hashIV: string,
): Promise<string> {
  const sortedKeys = Object.keys(params).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  let rawString = `HashKey=${hashKey}`;
  for (const key of sortedKeys) {
    rawString += `&${key}=${params[key]}`;
  }
  rawString += `&HashIV=${hashIV}`;

  let encoded = encodeURIComponent(rawString);
  encoded = encoded.toLowerCase();

  encoded = encoded
    .replace(/%2d/g, "-")
    .replace(/%5f/g, "_")
    .replace(/%2e/g, ".")
    .replace(/%21/g, "!")
    .replace(/%2a/g, "*")
    .replace(/%28/g, "(")
    .replace(/%29/g, ")")
    .replace(/%20/g, "+");

  return await sha256(encoded);
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ========== Origin 驗證 ==========
    const origin = req.headers.get("origin") || "";
    if (!isAllowedOrigin(origin)) {
      console.error("❌ 不允許的 Origin:", origin);
      return new Response(JSON.stringify({ error: "Forbidden: 不允許的來源" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ========== JWT 驗證 ==========
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("❌ 缺少 Authorization header");
      return new Response(JSON.stringify({ error: "未登入，請先登入後再進行付款" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const merchantId = Deno.env.get("ECPAY_MERCHANT_ID")!;
    const hashKey = Deno.env.get("ECPAY_HASH_KEY")!;
    const hashIV = Deno.env.get("ECPAY_HASH_IV")!;

    // 用使用者的 JWT 建立 client，驗證身分
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      console.error("❌ JWT 驗證失敗:", authError?.message);
      return new Response(JSON.stringify({ error: "身分驗證失敗，請重新登入" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("✅ JWT 驗證成功, user_id:", user.id);

    // ========== 輸入驗證 ==========
    const rawData = await req.json();
    const parseResult = CreatePaymentRequestSchema.safeParse(rawData);

    if (!parseResult.success) {
      console.error("❌ Validation error:", parseResult.error.flatten());
      return new Response(JSON.stringify({ error: "參數驗證失敗", details: parseResult.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { order_id } = parseResult.data;

    // 用 service role key 操作資料庫
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 取得訂單資訊 — 同時驗證訂單屬於登入者
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .eq("user_id", user.id)
      .single();

    if (orderError || !order) {
      console.error("❌ 訂單不存在或不屬於登入者:", order_id, "user:", user.id);
      return new Response(JSON.stringify({ error: "訂單不存在或不屬於該用戶" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 檢查訂單是否已付款
    if (order.payment_step === "verified") {
      return new Response(JSON.stringify({ error: "此訂單已完成付款" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const roundedAmount = Math.round(Number(order.total_amount));
    if (!Number.isFinite(roundedAmount) || roundedAmount <= 0) {
      console.error("❌ 訂單金額異常，拒絕建立付款:", { order_id, total_amount: order.total_amount, user_id: user.id });
      return new Response(JSON.stringify({ error: "訂單金額異常，無法建立付款" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedOrderStatus = String(order.order_status || "").toLowerCase();
    if (BLOCKED_ORDER_STATUS.has(normalizedOrderStatus)) {
      console.error("❌ 訂單狀態不可付款:", { order_id, order_status: order.order_status, user_id: user.id });
      return new Response(JSON.stringify({ error: "訂單狀態不可付款" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 取得訂單項目 + 產品中文名稱
    const { data: orderItems, error: itemsError } = await supabase
      .from("order_items")
      .select("product_id, product_name, quantity")
      .eq("order_id", order_id);

    if (itemsError) {
      return new Response(JSON.stringify({ error: "無法取得訂單項目" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 批次查詢 products 表取得中文名稱
    const productIds = [...new Set(orderItems.map((item: any) => item.product_id))];
    const { data: products } = await supabase.from("products").select("id, name").in("id", productIds);

    const productNameMap: Record<string, string> = {};
    if (products) {
      products.forEach((p: any) => {
        productNameMap[p.id] = p.name || p.id;
      });
    }

    // 更新付款方式為信用卡
    await supabase.from("orders").update({ payment_method: "credit_card" }).eq("id", order_id);

    // 組成 ItemName - 使用產品中文名稱
    let itemName = orderItems
      .map((item: any) => {
        const displayName = productNameMap[item.product_id] || item.product_name || item.product_id;
        return `${displayName} x${item.quantity}`;
      })
      .join("#");
    if (itemName.length > 400) {
      itemName = itemName.substring(0, 397) + "...";
    }

    // 格式化交易日期
    const now = new Date();
    const tradeDate = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

    // MerchantTradeNo: order_id 前 10 碼 + timestamp 後 10 碼 (確保唯一)
    const orderIdClean = order_id.replace(/-/g, "").substring(0, 10);
    const timestamp = String(Date.now()).slice(-10);
    const merchantTradeNo = orderIdClean + timestamp;

    // 從 request header 取得 origin（已驗證為白名單內）
    // OrderResultURL 必須接受 POST（綠界以 POST 導回），改為專用 API 再由該 API 302 導向首頁帶 RtnCode/RtnMsg
    const orderResultUrl = `${origin}/api/ecpay-order-result`;
    const clientBackUrl = `${origin}/`;

    // 組裝綠界參數
    const returnUrl = `${supabaseUrl}/functions/v1/ecpay-payment-callback`;

    const params: Record<string, string> = {
      MerchantID: merchantId,
      MerchantTradeNo: merchantTradeNo,
      MerchantTradeDate: tradeDate,
      PaymentType: "aio",
      TotalAmount: String(roundedAmount),
      TradeDesc: "T&J Dessert Order",
      ItemName: itemName,
      ReturnURL: returnUrl,
      OrderResultURL: orderResultUrl,
      ClientBackURL: clientBackUrl,
      ChoosePayment: "Credit",
      EncryptType: "1",
      NeedExtraPaidInfo: "N",
      CustomField1: order_id,
    };

    const checkMacValue = await generateCheckMacValueAsync(params, hashKey, hashIV);
    params.CheckMacValue = checkMacValue;

    const formInputs = Object.entries(params)
      .map(([key, value]) => `<input type="hidden" name="${key}" value="${value.replace(/"/g, "&quot;")}" />`)
      .join("\n");

    const html = `
      <form id="ecpay-form" method="POST" action="${ECPAY_API_URL}">
        ${formInputs}
      </form>
      <script>document.getElementById('ecpay-form').submit();</script>
    `;

    console.log("✅ ECPay payment created:", {
      merchantTradeNo,
      orderId: order_id,
      totalAmount: order.total_amount,
      userId: user.id,
    });

    return new Response(JSON.stringify({ html, merchantTradeNo }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const corsHeaders = getCorsHeaders(req);
    console.error("ECPay create payment error:", error);
    return new Response(JSON.stringify({ error: "伺服器處理請求時發生錯誤" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
