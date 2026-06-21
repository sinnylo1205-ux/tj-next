import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const N8N_WEBHOOK_URL = "https://tjcookies.app.n8n.cloud/webhook/line";

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { orderId, userId, skipped } = await req.json();

    console.log("[verify-line-friendship] Received request:", { orderId, userId, skipped });

    if (!orderId || !userId) {
      return new Response(JSON.stringify({ error: "Missing orderId or userId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
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
    const {
      data: { user: authUser },
      error: authError,
    } = await supabaseAuth.auth.getUser();
    if (authError || !authUser || authUser.id !== userId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 取得用戶資料（包含 line_user_id）
    const { data: userData, error: userError } = await supabase
      .from("user_log_in")
      .select("name, line_user_id")
      .eq("id", userId)
      .single();

    if (userError || !userData) {
      console.error("[verify-line-friendship] Failed to fetch user:", userError);
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lineUserId = userData.line_user_id;

    if (!lineUserId) {
      console.error("[verify-line-friendship] User has no line_user_id");
      return new Response(JSON.stringify({ error: "LINE not linked" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 查詢訂單資料
    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .select(
        "id, order_status, payment_step, subtotal, expected_pickup_date, notes, total_amount, shipping_fee, shipping_way, who_receive, Email",
      )
      .eq("id", orderId)
      .eq("user_id", userId)
      .single();

    if (orderError || !orderData) {
      console.error("[verify-line-friendship] Failed to fetch order:", orderError);
      return new Response(JSON.stringify({ error: "Order not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 查詢訂單品項
    const { data: orderItems, error: itemsError } = await supabase
      .from("order_items")
      .select("product_id, product_name, quantity")
      .eq("order_id", orderId);

    if (itemsError) {
      console.error("[verify-line-friendship] Failed to fetch order items:", itemsError);
    }

    // 取得產品中文名稱
    const productIds = Array.from(new Set((orderItems ?? []).map((i) => i.product_id).filter(Boolean)));

    const productNameById = new Map<string, string>();

    if (productIds.length > 0) {
      const { data: productsData, error: productsError } = await supabase
        .from("products")
        .select("id, name")
        .in("id", productIds);

      if (productsError) {
        console.error("[verify-line-friendship] Failed to fetch products:", productsError);
      }

      (productsData ?? []).forEach((p: any) => {
        if (p?.id) productNameById.set(p.id, p.name ?? "");
      });
    }

    const productSummary = (orderItems ?? [])
      .map((item) => {
        const displayName = productNameById.get(item.product_id) || item.product_name || item.product_id;
        return `${displayName} x${item.quantity}`;
      })
      .join("、");

    console.log("[verify-line-friendship] Product summary:", productSummary);

    // 建立 system_events 記錄
    const systemEventPayload = {
      order_id: orderId,
      order_status: orderData.order_status || "awaiting_payment",
      payment_step: orderData.payment_step || "pending",
      line_user_id: lineUserId,
      user_name: userData.name || "顧客",
      product_summary: productSummary,
      product_summury: productSummary, // 兼容舊拼寫
      expected_pickup_date: orderData.expected_pickup_date,
      notes: orderData.notes,
      subtotal: orderData.subtotal,
      total_amount: orderData.total_amount,
      shipping_fee: orderData.shipping_fee,
      shipping_way: orderData.shipping_way,
      who_receive: orderData.who_receive,
      customer_email: orderData.Email || null,
      action_type: "new_order",
      status_message: skipped ? "訂單已建立（用戶略過加好友）" : "訂單已建立，等待付款",
      friend_added: !skipped,
    };

    const { data: eventData, error: eventError } = await supabase
      .from("system_events")
      .insert({
        source: "system",
        event_type: "order_status_update",
        ref_id: orderId,
        payload: systemEventPayload,
        sent_to_n8n: false,
      })
      .select()
      .single();

    if (eventError) {
      console.error("[verify-line-friendship] Failed to create system_event:", eventError);
    } else {
      console.log("[verify-line-friendship] Created system_event:", eventData?.id);

      // 發送 n8n webhook
      try {
        console.log("[verify-line-friendship] Sending n8n webhook...");
        const n8nPayload = {
          source: "system",
          event_type: "order_status_update",
          ref_id: orderId,
          payload: systemEventPayload,
          ...systemEventPayload,
        };

        const n8nResponse = await fetch(N8N_WEBHOOK_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(n8nPayload),
        });

        console.log("[verify-line-friendship] n8n response status:", n8nResponse.status);

        // 更新 system_events
        await supabase
          .from("system_events")
          .update({
            sent_to_n8n: true,
            n8n_response_status: n8nResponse.status,
          })
          .eq("id", eventData?.id);
      } catch (n8nError) {
        console.error("[verify-line-friendship] n8n webhook error:", n8nError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: skipped ? "Skipped, notification sent" : "Friend verified, notification sent",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[verify-line-friendship] Unexpected error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
