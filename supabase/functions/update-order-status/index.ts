/**
 * 訂單狀態更新 — 混合使用（用戶 + 管理員）
 * - 用戶：user_payment_submitted（匯款末五碼）、auto_cancel_expired（24h 逾時取消）
 * - 管理員：verify_payment、confirm_shipment、mark_delivered、return
 * 此 function 保持啟用，因會員中心依賴 user_payment_submitted / auto_cancel_expired。
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.22.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const N8N_WEBHOOK_URL = "https://tjcookies.app.n8n.cloud/webhook/line";
const N8N_CALENDAR_WEBHOOK_URL = "https://tjcookies.app.n8n.cloud/webhook/order-processing-to-calendar";
const N8N_TAX_WEBHOOK_URL = "https://tjcookies.app.n8n.cloud/webhook/TAX_id";

// ========== 中文大寫金額轉換 ==========
function toChineseUppercase(num: number): string {
  const units = ["", "拾", "佰", "仟"];
  const bigUnits = ["", "萬", "億"];
  const nums = ["零", "壹", "貳", "參", "肆", "伍", "陸", "柒", "捌", "玖"];
  let str = Math.floor(num).toString();
  let result = "";
  let bigUnitPos = 0;
  let zero = false;
  while (str.length > 0) {
    const section = str.slice(-4);
    str = str.slice(0, -4);
    let sectionStr = "";
    for (let i = 0; i < section.length; i++) {
      const digit = parseInt(section[section.length - 1 - i]);
      if (digit === 0) {
        if (!zero) { zero = true; sectionStr = nums[0] + sectionStr; }
      } else {
        zero = false;
        sectionStr = nums[digit] + units[i] + sectionStr;
      }
    }
    if (sectionStr !== "") { sectionStr += bigUnits[bigUnitPos]; }
    result = sectionStr + result;
    bigUnitPos++;
  }
  result = result.replace(/零+/g, "零").replace(/零$/, "");
  return result + "元整";
}

// ========== Zod Schema 驗證 ==========
const OrderStatusUpdateRequestSchema = z.object({
  order_id: z.string().uuid("訂單 ID 格式錯誤"),
  new_status: z.string().min(1, "狀態不能為空"),
  action_type: z.enum(
    ["verify_payment", "confirm_shipment", "mark_delivered", "return", "auto_cancel_expired", "user_payment_submitted"],
    {
      errorMap: () => ({ message: "無效的操作類型" }),
    },
  ),
});

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("[update-order-status] Missing authorization header");
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Initialize Supabase clients
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Client with user's JWT for authentication
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Service role client for database operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.error("[update-order-status] Auth error:", authError);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 預先解析 request body 來檢查 action_type
    const rawData = await req.json();
    const isAutoCancel = rawData.action_type === "auto_cancel_expired";
    const isUserPaymentSubmitted = rawData.action_type === "user_payment_submitted";

    // 對於 auto_cancel_expired / user_payment_submitted，只需驗證用戶已登入且是訂單擁有者
    // 對於其他操作，需要驗證是否為 admin
    if (!isAutoCancel && !isUserPaymentSubmitted) {
      // Check if user is admin
      const { data: roleData, error: roleError } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .single();

      if (roleError || !roleData) {
        console.error("[update-order-status] User is not admin:", user.id);
        return new Response(JSON.stringify({ error: "Forbidden - Admin access required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ========== 輸入驗證 ==========
    const parseResult = OrderStatusUpdateRequestSchema.safeParse(rawData);

    if (!parseResult.success) {
      console.error("[update-order-status] Validation error:", parseResult.error.flatten());
      return new Response(JSON.stringify({ error: "參數驗證失敗", details: parseResult.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { order_id, new_status, action_type } = parseResult.data;
    console.log("[update-order-status] Processing:", { order_id, new_status, action_type });

    // Get current order status and user info
    const { data: orderData, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("*, user_log_in:user_id(id, name, email, line_user_id)")
      .eq("id", order_id)
      .single();

    if (orderError || !orderData) {
      console.error("[update-order-status] Order not found:", orderError);
      return new Response(JSON.stringify({ error: "Order not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 對於 auto_cancel_expired / user_payment_submitted，驗證訂單擁有者
    if ((isAutoCancel || isUserPaymentSubmitted) && orderData.user_id !== user.id) {
      console.error("[update-order-status] User is not order owner:", user.id, orderData.user_id);
      return new Response(JSON.stringify({ error: "Forbidden - Not order owner" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action_type === "auto_cancel_expired") {
      const createdAtMs = new Date(orderData.created_at).getTime();
      const isExpired = Number.isFinite(createdAtMs) && createdAtMs < Date.now() - 24 * 60 * 60 * 1000;
      const canAutoCancel =
        new_status === "canceled" &&
        orderData.order_status === "awaiting_payment" &&
        orderData.payment_step === "pending" &&
        orderData.is_manual_order === false &&
        orderData.auto_cancel_exempt === false &&
        isExpired;

      if (!canAutoCancel) {
        console.error("[update-order-status] Auto-cancel rejected for non-expired or ineligible order:", {
          order_id,
          order_status: orderData.order_status,
          payment_step: orderData.payment_step,
          is_manual_order: orderData.is_manual_order,
          auto_cancel_exempt: orderData.auto_cancel_exempt,
        });
        return new Response(JSON.stringify({ error: "Order is not eligible for auto-cancel" }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (action_type === "user_payment_submitted") {
      const canSubmitPayment =
        new_status === "awaiting_payment" &&
        orderData.order_status === "awaiting_payment" &&
        orderData.payment_step === "pending";

      if (!canSubmitPayment) {
        console.error("[update-order-status] Payment submission rejected for ineligible order:", {
          order_id,
          order_status: orderData.order_status,
          payment_step: orderData.payment_step,
        });
        return new Response(JSON.stringify({ error: "Order is not eligible for payment submission" }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Query order items
    const { data: orderItems, error: itemsError } = await supabaseAdmin
      .from("order_items")
      .select("product_id, product_name, quantity")
      .eq("order_id", order_id);

    if (itemsError) {
      console.error("[update-order-status] Failed to fetch order items:", itemsError);
    }

    // Fetch products.name (Chinese) from products table
    const productIds = Array.from(new Set((orderItems ?? []).map((i) => i.product_id).filter(Boolean)));

    const productNameById = new Map<string, string>();

    if (productIds.length > 0) {
      const { data: productsData, error: productsError } = await supabaseAdmin
        .from("products")
        .select("id, name")
        .in("id", productIds);

      if (productsError) {
        console.error("[update-order-status] Failed to fetch products:", productsError);
      }

      (productsData ?? []).forEach((p) => {
        if (p?.id) productNameById.set(p.id, p.name ?? "");
      });
    }

    const productSummary = (orderItems ?? [])
      .map((item) => {
        const displayName = productNameById.get(item.product_id) || item.product_name || item.product_id;
        return `${displayName} x${item.quantity}`;
      })
      .join("、");

    console.log("[update-order-status] Product summary:", productSummary);

    const previousStatus = orderData.order_status;
    const previousPaymentStep = orderData.payment_step;

    // Prepare update based on action type
    let updateData: Record<string, any> = {};
    let statusMessage = "";

    switch (action_type) {
      case "verify_payment":
        updateData = {
          payment_step: "verified",
          order_status: "processing",
          admin_verified_at: new Date().toISOString(),
        };
        statusMessage = "付款已確認，訂單處理中";
        break;
      case "confirm_shipment":
        updateData = {
          order_status: "shipped",
          shipped_at: new Date().toISOString(),
        };
        statusMessage = "已出貨/可自取貨";
        break;
      case "mark_delivered":
        updateData = {
          order_status: "delivered",
          delivered_at: new Date().toISOString(),
        };
        statusMessage = "已送達/已自取貨";
        break;
      case "return":
        updateData = {
          order_status: "returned",
        };
        statusMessage = "已退貨";
        break;
      case "auto_cancel_expired":
        updateData = {
          is_hide: true,
          order_status: "canceled",
        };
        statusMessage = "訂單因超過 24 小時未付款已自動取消";
        console.log("[update-order-status] Auto-canceling expired order:", order_id);
        break;
      case "user_payment_submitted":
        updateData = {
          payment_step: "submitted",
        };
        statusMessage = "用戶已匯款，等待查帳";
        break;
    }

    // Update order status with the same eligibility predicates used above to avoid races.
    let updateQuery = supabaseAdmin.from("orders").update(updateData).eq("id", order_id);
    if (action_type === "auto_cancel_expired") {
      updateQuery = updateQuery
        .eq("order_status", "awaiting_payment")
        .eq("payment_step", "pending")
        .eq("is_manual_order", false)
        .eq("auto_cancel_exempt", false)
        .lt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    } else if (action_type === "user_payment_submitted") {
      updateQuery = updateQuery.eq("order_status", "awaiting_payment").eq("payment_step", "pending");
    }

    const { data: updatedRows, error: updateError } = await updateQuery.select("id");

    if (updateError) {
      console.error("[update-order-status] Update failed:", updateError);
      return new Response(JSON.stringify({ error: "Failed to update order status" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!updatedRows || updatedRows.length === 0) {
      console.error("[update-order-status] Update matched no eligible rows:", { order_id, action_type });
      return new Response(JSON.stringify({ error: "Order state changed; update was not applied" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[update-order-status] Order updated successfully");

    // Determine LINE User ID: 優先使用訂單層級的 line_user_id（手動訂單），否則用 user_log_in 的
    const userLogIn = orderData.user_log_in as any;
    const orderLineUserId = orderData.line_user_id;
    const userLineUserId = userLogIn?.line_user_id;
    const effectiveLineUserId = orderLineUserId || userLineUserId || null;

    // Create system event payload
    const systemEvent = {
      source: "system",
      event_type: "order_status_update",
      ref_id: order_id,
      payload: {
        order_id: order_id,
        order_status: updateData.order_status || orderData.order_status,
        previous_status: previousStatus,
        previous_payment_step: previousPaymentStep,
        payment_step: updateData.payment_step || orderData.payment_step,
        payment_method: orderData.payment_method,
        product_summary: productSummary,
        product_summury: productSummary,
        total_amount: orderData.total_amount,
        subtotal: orderData.subtotal,
        shipping_fee: orderData.shipping_fee,
        shipping_way: orderData.shipping_way,
        expected_pickup_date: orderData.expected_pickup_date,
        who_receive: orderData.who_receive,
        phone: orderData.phone,
        shipping_address_text: orderData.shipping_address_text,
        line_user_id: effectiveLineUserId,
        user_name: userLogIn?.name || null,
        user_email: userLogIn?.email || null,
        customer_email: orderData.Email || null,
        action_type: action_type,
        status_message: statusMessage,
        is_manual_order: orderData.is_manual_order || false,
      },
    };

    // Insert into system_events table
    const { data: eventData, error: eventError } = await supabaseAdmin
      .from("system_events")
      .insert({
        source: systemEvent.source,
        event_type: systemEvent.event_type,
        ref_id: systemEvent.ref_id,
        payload: systemEvent.payload,
        sent_to_n8n: false,
      })
      .select()
      .single();

    if (eventError) {
      console.error("[update-order-status] Failed to create system event:", eventError);
    } else {
      console.log("[update-order-status] System event created:", eventData?.id);
    }

    // Send to n8n webhook
    let n8nSuccess = false;
    let n8nStatus = 0;

    try {
      console.log("[update-order-status] Sending to n8n webhook...");
      const n8nResponse = await fetch(N8N_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(systemEvent),
      });

      n8nStatus = n8nResponse.status;
      n8nSuccess = n8nResponse.ok;

      if (n8nSuccess) {
        console.log("[update-order-status] n8n webhook success");
      } else {
        const n8nError = await n8nResponse.text();
        console.error("[update-order-status] n8n webhook failed:", n8nStatus, n8nError);
      }
    } catch (n8nError) {
      console.error("[update-order-status] n8n webhook error:", n8nError);
    }

    // Update system_events with n8n result
    if (eventData?.id) {
      await supabaseAdmin
        .from("system_events")
        .update({
          sent_to_n8n: n8nSuccess,
          n8n_response_status: n8nStatus,
        })
        .eq("id", eventData.id);
    }

    // ========== 訂單轉為 processing 時，發送到 Google 日曆 ==========
    if (action_type === "verify_payment") {
      try {
        console.log("[update-order-status] Sending to Google Calendar webhook...");

        const calendarPayload = {
          order_id: order_id,
          order_status: "processing",
          member_name: userLogIn?.name || null,
          recipient_name: orderData.who_receive || null,
          pickup_date: orderData.expected_pickup_date,
          order_items_text: productSummary,
          pickup_method: orderData.shipping_way || null,
        };

        console.log("[update-order-status] Calendar payload:", JSON.stringify(calendarPayload));

        const calendarResponse = await fetch(N8N_CALENDAR_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(calendarPayload),
        });

        console.log("[update-order-status] Calendar webhook status:", calendarResponse.status);
      } catch (calendarError) {
        console.error("[update-order-status] Calendar webhook error:", calendarError);
      }

      // ========== 發送發票/統編 webhook ==========
      try {
        console.log("[update-order-status] Sending tax invoice webhook...");

        // 查詢 order_items 取得品項明細（含 unit_price）
        const { data: taxItems, error: taxItemsError } = await supabaseAdmin
          .from("order_items")
          .select("product_name, quantity, unit_price")
          .eq("order_id", order_id);

        if (taxItemsError) {
          console.error("[update-order-status] Failed to fetch tax items:", taxItemsError);
        }

        const itemsPayload = (taxItems ?? []).map((item) => ({
          product_name: item.product_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          subtotal: item.quantity * item.unit_price,
        }));

        const taxPayload = {
          "updated_at(status.processing)": new Date().toISOString().slice(0, 10),
          tax_title: orderData.TAX_title || null,
          tax_id: orderData.TAX_id ? String(orderData.TAX_id) : null,
          items: itemsPayload,
          total_amount: orderData.total_amount,
          total_amount_chinese: toChineseUppercase(orderData.total_amount || 0),
          email: orderData.Email || userLogIn?.email || null,
          line_user_id: effectiveLineUserId,
          shipping_fee: orderData.shipping_fee || 0,
        };

        console.log("[update-order-status] Tax payload:", JSON.stringify(taxPayload));

        const taxResponse = await fetch(N8N_TAX_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(taxPayload),
        });

        console.log("[update-order-status] Tax webhook status:", taxResponse.status);
      } catch (taxError) {
        console.error("[update-order-status] Tax webhook error:", taxError);
      }
    }

    // Return success response
    // 使用 effectiveLineUserId 判斷是否有 LINE ID
    const hasLineId = !!effectiveLineUserId;
    return new Response(
      JSON.stringify({
        success: true,
        message: statusMessage,
        notification_sent: n8nSuccess && hasLineId,
        line_linked: hasLineId,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[update-order-status] Unexpected error:", error);
    return new Response(JSON.stringify({ error: "伺服器處理請求時發生錯誤" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
