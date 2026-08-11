/**
 * 24 小時未付款訂單自動取消 — 由 Cron 主動觸發
 * - 每分鐘執行，查詢逾時訂單並更新狀態
 * - 需傳入 x-cron-secret 與環境變數 CRON_SECRET 一致
 * - 不依賴用戶登入，訂單到達 24 小時即主動取消
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const N8N_WEBHOOK_URL = "https://tjcookies.app.n8n.cloud/webhook/line";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = Deno.env.get("CRON_SECRET");
  if (!expectedSecret || cronSecret !== expectedSecret) {
    console.error("[auto-cancel-expired-orders] Invalid or missing x-cron-secret");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Snapshot filter only — UPDATE must re-check the same predicates so a payment
  // (or force-ship status change) that lands while this cron walks the list cannot
  // cancel a no-longer-unpaid / in-fulfillment order.
  const { data: expiredOrders, error: fetchError } = await supabase
    .from("orders")
    .select(
      "id, user_id, created_at, order_status, payment_step, payment_method, total_amount, subtotal, shipping_fee, shipping_way, expected_pickup_date, who_receive, phone, shipping_address_text, line_user_id, Email, is_manual_order, auto_cancel_exempt"
    )
    .eq("payment_step", "pending")
    .eq("order_status", "awaiting_payment")
    .eq("is_manual_order", false)
    .eq("auto_cancel_exempt", false)
    .lt("created_at", twentyFourHoursAgo);

  if (fetchError) {
    console.error("[auto-cancel-expired-orders] Failed to fetch orders:", fetchError);
    return new Response(JSON.stringify({ error: "Failed to fetch orders" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!expiredOrders || expiredOrders.length === 0) {
    return new Response(JSON.stringify({ success: true, canceled: 0 }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let canceledCount = 0;
  for (const order of expiredOrders) {
    const { data: orderItems } = await supabase
      .from("order_items")
      .select("product_id, product_name, quantity")
      .eq("order_id", order.id);

    const productIds = Array.from(new Set((orderItems ?? []).map((i) => i.product_id).filter(Boolean)));
    let productNameById = new Map<string, string>();
    if (productIds.length > 0) {
      const { data: products } = await supabase.from("products").select("id, name").in("id", productIds);
      (products ?? []).forEach((p) => {
        if (p?.id) productNameById.set(p.id, p.name ?? "");
      });
    }

    const productSummary = (orderItems ?? [])
      .map((item) => {
        const displayName = productNameById.get(item.product_id) || item.product_name || item.product_id;
        return `${displayName} x${item.quantity}`;
      })
      .join("、");

    const effectiveLineUserId = order.line_user_id || null;
    const statusMessage = "訂單因超過 24 小時未付款已自動取消";

    const { data: canceledRows, error: updateError } = await supabase
      .from("orders")
      .update({ is_hide: true, order_status: "canceled" })
      .eq("id", order.id)
      .eq("payment_step", "pending")
      .eq("order_status", "awaiting_payment")
      .eq("is_manual_order", false)
      .eq("auto_cancel_exempt", false)
      .select("id");

    if (updateError) {
      console.error("[auto-cancel-expired-orders] Failed to update order:", order.id, updateError);
      continue;
    }
    if (!canceledRows?.length) {
      console.log(
        "[auto-cancel-expired-orders] Skipped (no longer unpaid awaiting_payment):",
        order.id,
      );
      continue;
    }

    const systemEvent = {
      source: "system",
      event_type: "order_status_update",
      ref_id: order.id,
      payload: {
        order_id: order.id,
        order_status: "canceled",
        previous_status: order.order_status,
        previous_payment_step: order.payment_step,
        payment_step: order.payment_step,
        payment_method: order.payment_method,
        product_summary: productSummary,
        product_summury: productSummary,
        total_amount: order.total_amount,
        subtotal: order.subtotal,
        shipping_fee: order.shipping_fee,
        shipping_way: order.shipping_way,
        expected_pickup_date: order.expected_pickup_date,
        who_receive: order.who_receive,
        phone: order.phone,
        shipping_address_text: order.shipping_address_text,
        line_user_id: effectiveLineUserId,
        user_name: null,
        user_email: null,
        customer_email: order.Email || null,
        action_type: "auto_cancel_expired",
        status_message: statusMessage,
        is_manual_order: order.is_manual_order || false,
      },
    };

    const { data: eventData, error: eventError } = await supabase
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

    if (!eventError && eventData?.id) {
      try {
        const n8nResponse = await fetch(N8N_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(systemEvent),
        });
        await supabase
          .from("system_events")
          .update({ sent_to_n8n: n8nResponse.ok, n8n_response_status: n8nResponse.status })
          .eq("id", eventData.id);
      } catch (e) {
        console.error("[auto-cancel-expired-orders] n8n webhook error:", e);
      }
    }

    canceledCount++;
    console.log("[auto-cancel-expired-orders] Canceled order:", order.id);
  }

  return new Response(JSON.stringify({ success: true, canceled: canceledCount }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
