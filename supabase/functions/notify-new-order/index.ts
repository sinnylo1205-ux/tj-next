import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.22.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const N8N_WEBHOOK_URL = "https://tjcookies.app.n8n.cloud/webhook/line";
const N8N_CALENDAR_WEBHOOK_URL = "https://tjcookies.app.n8n.cloud/webhook/order-processing-to-calendar";

// ========== Zod Schema 驗證 ==========
const NotifyNewOrderRequestSchema = z.object({
  order_id: z.string().uuid("訂單 ID 格式錯誤"),
  user_id: z.string().uuid("用戶 ID 格式錯誤"),
});

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ========== 輸入驗證 ==========
    const rawData = await req.json();
    const parseResult = NotifyNewOrderRequestSchema.safeParse(rawData);

    if (!parseResult.success) {
      console.error("[notify-new-order] Validation error:", parseResult.error.flatten());
      return new Response(JSON.stringify({ error: "參數驗證失敗", details: parseResult.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { order_id, user_id } = parseResult.data;
    console.log("[notify-new-order] Received request for order:", order_id, "user:", user_id);

    // ========== JWT 驗證：僅允許訂單所屬用戶（或建立該手動訂單的後台帳號）觸發 ==========
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "未登入，請先登入" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: authUser }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: "身分驗證失敗，請重新登入" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (authUser.id !== user_id) {
      return new Response(JSON.stringify({ error: "只能觸發本人訂單的通知" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user info
    const { data: userData, error: userError } = await supabase
      .from("user_log_in")
      .select("name, email, line_user_id")
      .eq("id", user_id)
      .single();

    if (userError) {
      console.error("[notify-new-order] Failed to fetch user:", userError);
    }

    // Get order details
    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .select(
        "id, order_status, payment_step, subtotal, expected_pickup_date, notes, total_amount, shipping_fee, shipping_way, Email, shipping_address_text, is_manual_order, who_receive, phone, line_user_id",
      )
      .eq("id", order_id)
      .single();

    if (orderError || !orderData) {
      console.error("[notify-new-order] Failed to fetch order:", orderError);
      return new Response(JSON.stringify({ error: "Failed to fetch order" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get order items
    const { data: orderItems, error: itemsError } = await supabase
      .from("order_items")
      .select("product_id, product_name, quantity")
      .eq("order_id", order_id);

    if (itemsError) {
      console.error("[notify-new-order] Failed to fetch order items:", itemsError);
    }

    // Fetch products.name (Chinese) from products table
    const productIds = Array.from(new Set((orderItems ?? []).map((i) => i.product_id).filter(Boolean)));

    const productNameById = new Map<string, string>();

    if (productIds.length > 0) {
      const { data: productsData, error: productsError } = await supabase
        .from("products")
        .select("id, name")
        .in("id", productIds);

      if (productsError) {
        console.error("[notify-new-order] Failed to fetch products:", productsError);
      }

      (productsData ?? []).forEach((p) => {
        if (p?.id) productNameById.set(p.id, p.name ?? "");
      });
    }

    // Build product summary
    const productSummary = (orderItems ?? [])
      .map((item) => {
        const displayName = productNameById.get(item.product_id) || item.product_name || item.product_id;
        return `${displayName} x${item.quantity}`;
      })
      .join("、");

    console.log("[notify-new-order] Product summary:", productSummary);

    // 判斷是否為手動訂單
    const isManualOrder = orderData.is_manual_order === true;
    console.log("[notify-new-order] Is manual order:", isManualOrder);

    // Build system event payload
    const systemEventPayload: Record<string, any> = {
      order_id: order_id,
      order_status: orderData.order_status || "awaiting_payment",
      payment_step: orderData.payment_step || "pending",
      user_name: userData?.name || "顧客",
      user_email: userData?.email || null,
      customer_email: orderData.Email || null,
      product_summary: productSummary,
      product_summury: productSummary,
      expected_pickup_date: orderData.expected_pickup_date,
      notes: orderData.notes,
      subtotal: orderData.subtotal,
      total_amount: orderData.total_amount,
      shipping_fee: orderData.shipping_fee,
      shipping_way: orderData.shipping_way,
      who_receive: orderData.who_receive,
      phone: orderData.phone,
      shipping_address_text: orderData.shipping_address_text,
      action_type: "new_order",
    };

    // 根據是否為手動訂單設定不同的通知方式
    if (isManualOrder) {
      systemEventPayload.is_manual_order = true;
      // 手動訂單：優先使用訂單上的 line_user_id，否則使用 email
      const orderLineUserId = orderData.line_user_id;
      if (orderLineUserId) {
        systemEventPayload.notification_channel = "line";
        systemEventPayload.line_user_id = orderLineUserId;
        systemEventPayload.status_message = "手動訂單已建立";
        console.log("[notify-new-order] Manual order - using order-level LINE ID:", orderLineUserId);
      } else {
        systemEventPayload.notification_channel = "email";
        systemEventPayload.line_user_id = null;
        systemEventPayload.status_message = "手動訂單已建立";
        console.log("[notify-new-order] Manual order - using email notification");
      }
    } else {
      systemEventPayload.is_manual_order = false;
      systemEventPayload.notification_channel = "line";
      systemEventPayload.line_user_id = userData?.line_user_id || null;
      systemEventPayload.status_message = "訂單已建立，請於24小時內付款，否則訂單將會取消";
      console.log("[notify-new-order] System order - using LINE notification");
    }

    // Insert system_events record
    const { data: eventData, error: eventError } = await supabase
      .from("system_events")
      .insert({
        source: "system",
        event_type: isManualOrder ? "manual_order_created" : "new_order",
        ref_id: order_id,
        payload: systemEventPayload,
        sent_to_n8n: false,
      })
      .select()
      .single();

    if (eventError) {
      console.error("[notify-new-order] Failed to create system_event:", eventError);
    } else {
      console.log("[notify-new-order] Created system_event:", eventData?.id);
    }

    // Send n8n webhook
    try {
      console.log("[notify-new-order] Sending n8n webhook...");
      const n8nPayload = {
        source: "system",
        event_type: isManualOrder ? "manual_order_created" : "new_order",
        ref_id: order_id,
        payload: systemEventPayload,
      };

      console.log("[notify-new-order] n8n payload:", JSON.stringify(n8nPayload, null, 2));

      const n8nResponse = await fetch(N8N_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(n8nPayload),
      });

      const responseStatus = n8nResponse.status;
      console.log("[notify-new-order] n8n response status:", responseStatus);

      // Update system_events with n8n response
      if (eventData?.id) {
        await supabase
          .from("system_events")
          .update({
            sent_to_n8n: responseStatus >= 200 && responseStatus < 300,
            n8n_response_status: responseStatus,
          })
          .eq("id", eventData.id);
      }
    } catch (n8nError) {
      console.error("[notify-new-order] Failed to send n8n webhook:", n8nError);
    }

    // ========== 手動訂單建立時，發送到 Google 日曆 ==========
    if (isManualOrder) {
      try {
        console.log("[notify-new-order] Sending manual order to Google Calendar webhook...");

        const calendarPayload = {
          order_id: order_id,
          order_status: "processing",
          member_name: userData?.name || null,
          recipient_name: orderData.who_receive || null,
          pickup_date: orderData.expected_pickup_date,
          order_items_text: productSummary,
          pickup_method: orderData.shipping_way || null,
        };

        console.log("[notify-new-order] Calendar payload:", JSON.stringify(calendarPayload));

        const calendarResponse = await fetch(N8N_CALENDAR_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(calendarPayload),
        });

        console.log("[notify-new-order] Calendar webhook status:", calendarResponse.status);
      } catch (calendarError) {
        console.error("[notify-new-order] Calendar webhook error:", calendarError);
      }
    }

    return new Response(JSON.stringify({ success: true, event_id: eventData?.id, is_manual_order: isManualOrder }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("[notify-new-order] Error:", error);
    return new Response(JSON.stringify({ error: "伺服器處理請求時發生錯誤" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
