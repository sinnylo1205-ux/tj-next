/**
 * ⚠️ 管理員專用 Function — 已停用
 * 此 function 供後台將報價單轉訂單使用，前端用戶流程不依賴。
 * 若需啟用，請移除下方 early return。
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const N8N_QUOTATION_WEBHOOK_URL = "https://tjcookies.app.n8n.cloud/webhook/quotation";
const N8N_LINE_WEBHOOK_URL = "https://tjcookies.app.n8n.cloud/webhook/line";
const N8N_CALENDAR_WEBHOOK_URL = "https://tjcookies.app.n8n.cloud/webhook/order-processing-to-calendar";

const _DISABLED_PROCESS_QUOTATION = false;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ⚠️ 管理員專用 — 已停用
  if (_DISABLED_PROCESS_QUOTATION) {
    return new Response(
      JSON.stringify({ error: "此功能為管理員專用，已停用" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify JWT - get user from auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "未授權" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "認證失敗" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "權限不足" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action } = body;

    console.log(`[process-quotation] Action: ${action}, User: ${user.id}`);

    if (action === "send_quote") {
      return await handleSendQuote(supabase, body);
    } else if (action === "convert_to_order") {
      return await handleConvertToOrder(supabase, body);
    } else {
      return new Response(JSON.stringify({ error: "未知的 action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (error: unknown) {
    console.error("[process-quotation] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "伺服器錯誤" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ========== Action: Send Quote ==========
async function handleSendQuote(supabase: any, body: any) {
  const { quotation_order_id, items, shipping_fee, line_user_id } = body;

  if (!quotation_order_id || !items || !Array.isArray(items)) {
    return new Response(JSON.stringify({ error: "缺少必要參數" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log("[process-quotation/send_quote] Processing quotation:", quotation_order_id);

  // 1. Fetch quotation order
  const { data: quotation, error: qError } = await supabase
    .from("quotation_orders")
    .select("*")
    .eq("id", quotation_order_id)
    .single();

  if (qError || !quotation) {
    console.error("[process-quotation/send_quote] Quotation not found:", qError);
    return new Response(JSON.stringify({ error: "報價單不存在" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 2. Update each item's unit_price, preview_url
  let subtotal = 0;
  const updatedItems: any[] = [];

  for (const itemData of items) {
    const { id: itemId, unit_price, preview_url, why_price } = itemData;

    // Fetch the item to get quantity
    const { data: existingItem, error: itemFetchError } = await supabase
      .from("quotation_order_items")
      .select("*")
      .eq("id", itemId)
      .single();

    if (itemFetchError || !existingItem) {
      console.error("[process-quotation/send_quote] Item not found:", itemId);
      continue;
    }

    const lineTotal = (unit_price || 0) * (existingItem.quantity || 0);
    subtotal += lineTotal;

    // Build customizations_json for this item
    const customizationsJson = {
      product_name: existingItem.product_name,
      unit_price: unit_price,
      quantity: existingItem.quantity,
      preview_url: preview_url || "",
      why_price: why_price || "",
    };

    const { error: updateError } = await supabase
      .from("quotation_order_items")
      .update({
        unit_price: unit_price,
        preview_url: preview_url || null,
        customizations_json: customizationsJson,
      })
      .eq("id", itemId);

    if (updateError) {
      console.error("[process-quotation/send_quote] Failed to update item:", updateError);
    }

    updatedItems.push({
      ...existingItem,
      unit_price,
      preview_url: preview_url || null,
      customizations_json: customizationsJson,
    });
  }

  const totalAmount = subtotal + (shipping_fee || 0);

  // 3. Update quotation order（保留 user_id，不覆蓋）
  const { error: orderUpdateError } = await supabase
    .from("quotation_orders")
    .update({
      subtotal,
      shipping_fee: shipping_fee || 0,
      total_amount: totalAmount,
      status: "price_reply",
      line_user_id: line_user_id || quotation.line_user_id || null,
      user_id: quotation.user_id || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", quotation_order_id);

  if (orderUpdateError) {
    console.error("[process-quotation/send_quote] Failed to update quotation:", orderUpdateError);
    return new Response(JSON.stringify({ error: "更新報價單失敗" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 4. Build webhook payload
  const allReq = quotation.all_requirement || {};
  const customerProfile = allReq.customer_profile || {};
  const delivery = allReq.delivery || {};

  // Key translation for readable webhook output
  const KEY_ZH_MAP: Record<string, string> = {
    customization: "客製化需求",
    note: "備註",
    budget_range: "預算範圍",
    design_concept: "設計概念",
    items_required: "需求品項",
    reference_files: "參考檔案",
    services_required: "需要的服務",
    budget_per_box: "每盒預算",
    contents: "內容物",
    customization_options: "客製化選項",
  };

  // Format items string with all_requirement (iterate all non-empty keys)
  const formatItemWithRequirement = (item: any) => {
    const req = item.all_requirement || {};
    const parts: string[] = [];
    
    for (const [key, value] of Object.entries(req)) {
      if (!value || key === "reference_images") continue;
      const label = KEY_ZH_MAP[key] || key;
      if (Array.isArray(value)) {
        if ((value as any[]).length > 0) parts.push(`${label}: ${(value as string[]).join(", ")}`);
      } else if (typeof value === "string" && value.trim()) {
        parts.push(`${label}: ${value}`);
      }
    }
    
    const reqText = parts.length > 0 ? `（${parts.join(", ")}）` : "";
    return `${item.product_name} x${item.quantity}${reqText}`;
  };

  const itemsString = updatedItems.map(formatItemWithRequirement).join(", ");

  const webhookPayload = {
    email: quotation.email || customerProfile.email || "",
    line_user_id: line_user_id || quotation.line_user_id || "",
    customer_profile: {
      name: customerProfile.name || "",
      email: quotation.email || customerProfile.email || "",
      shipping_way: quotation.shipping_way || delivery.method || "",
      expected_pickup_date: quotation.expected_pickup_date || "",
      shipping_address_text: quotation.shipping_address_text || delivery.address || "",
      who_receive: quotation.who_receive || delivery.receiver || "",
      notes: quotation.notes || "",
    },
    service_order: {
      category: allReq.service_order?.service_type || "custom_design",
      items: itemsString,
    },
    quote: {
      subtotal,
      shipping_fee: shipping_fee || 0,
      total_amount: totalAmount,
    },
    customizations_json: updatedItems.map((item) => ({
      product_name: item.product_name,
      unit_price: item.unit_price,
      quantity: item.quantity,
      preview_url: item.preview_url || "",
      why_price: item.customizations_json?.why_price || "",
    })),
  };

  console.log("[process-quotation/send_quote] Webhook payload:", JSON.stringify(webhookPayload, null, 2));

  // 5. Send n8n webhook
  try {
    const webhookResponse = await fetch(N8N_QUOTATION_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(webhookPayload),
    });
    console.log("[process-quotation/send_quote] Webhook response status:", webhookResponse.status);
  } catch (webhookError) {
    console.error("[process-quotation/send_quote] Webhook error:", webhookError);
  }

  // 6. Insert system_event
  try {
    await supabase.from("system_events").insert({
      source: "admin",
      event_type: "quotation_sent",
      ref_id: quotation_order_id,
      payload: webhookPayload,
      sent_to_n8n: true,
    });
  } catch (eventError) {
    console.error("[process-quotation/send_quote] System event error:", eventError);
  }

  return new Response(
    JSON.stringify({ success: true, subtotal, shipping_fee: shipping_fee || 0, total_amount: totalAmount }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// ========== Action: Convert to Order ==========
async function handleConvertToOrder(supabase: any, body: any) {
  const { quotation_order_id, payment_method, payment_step, transfer_last5, user_id: bodyUserId, line_user_id: bodyLineUserId } = body;

  if (!quotation_order_id || !payment_method) {
    return new Response(JSON.stringify({ error: "缺少必要參數" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log("[process-quotation/convert_to_order] Processing:", quotation_order_id);

  // 1. Fetch quotation order
  const { data: quotation, error: qError } = await supabase
    .from("quotation_orders")
    .select("*")
    .eq("id", quotation_order_id)
    .single();

  if (qError || !quotation) {
    return new Response(JSON.stringify({ error: "報價單不存在" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 2. Fetch quotation items
  const { data: qItems, error: qItemsError } = await supabase
    .from("quotation_order_items")
    .select("*")
    .eq("quotation_order_id", quotation_order_id);

  if (qItemsError) {
    console.error("[process-quotation/convert_to_order] Failed to fetch items:", qItemsError);
    return new Response(JSON.stringify({ error: "載入品項失敗" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const allReq = quotation.all_requirement || {};
  const delivery = allReq.delivery || {};
  const customerProfile = allReq.customer_profile || {};

  // 3. Create order（優先使用 body 傳入的 user_id、line_user_id，否則用報價單上的）
  const userId = bodyUserId || quotation.user_id || "91a0caff-31ae-460c-87e7-4b3a5d167cc1"; // fallback to admin user
  const lineUserId = bodyLineUserId || quotation.line_user_id || null;
  const { data: orderData, error: orderError } = await supabase
    .from("orders")
    .insert({
      user_id: userId,
      Email: quotation.email || customerProfile.email || null,
      who_receive: quotation.who_receive || delivery.receiver || customerProfile.name || null,
      phone: delivery.phone || null,
      shipping_way: quotation.shipping_way || delivery.method || null,
      shipping_address_text: quotation.shipping_address_text || delivery.address || null,
      expected_pickup_date: quotation.expected_pickup_date || null,
      subtotal: quotation.subtotal || 0,
      shipping_fee: quotation.shipping_fee || 0,
      total_amount: quotation.total_amount || 0,
      notes: quotation.notes || null,
      line_user_id: lineUserId,
      is_manual_order: true,
      is_from_quotation: true,
      payment_method: payment_method,
      payment_step: payment_step || "verified",
      order_status: "processing",
      transfer_last5: transfer_last5 || null,
    })
    .select()
    .single();

  if (orderError || !orderData) {
    console.error("[process-quotation/convert_to_order] Failed to create order:", orderError);
    return new Response(JSON.stringify({ error: "建立訂單失敗" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log("[process-quotation/convert_to_order] Order created:", orderData.id);

  // 4. Create order items
  for (const item of qItems || []) {
    const { error: itemError } = await supabase.from("order_items").insert({
      order_id: orderData.id,
      product_name: item.product_name || "未命名商品",
      quantity: item.quantity || 1,
      unit_price: item.unit_price || 0,
      preview_url: item.preview_url || null,
      customizations_json: item.customizations_json || null,
      category: item.category || "custom_design",
    });

    if (itemError) {
      console.error("[process-quotation/convert_to_order] Failed to create order item:", itemError);
    }
  }

  // 5. Update quotation status（保留 user_id、line_user_id）
  const { error: statusError } = await supabase
    .from("quotation_orders")
    .update({
      status: "order_created",
      payment_method,
      payment_step: payment_step || "verified",
      transfer_last5: transfer_last5 || null,
      user_id: bodyUserId || quotation.user_id || null,
      line_user_id: bodyLineUserId || quotation.line_user_id || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", quotation_order_id);

  if (statusError) {
    console.error("[process-quotation/convert_to_order] Failed to update status:", statusError);
  }

  // 6. Build product summary for notifications
  const productSummary = (qItems || [])
    .map((item: any) => `${item.product_name} x${item.quantity}`)
    .join("、");

  // 7. Send n8n LINE notification (reuse notify-new-order logic)
  try {
    const linePayload: Record<string, any> = {
      source: "system",
      event_type: "manual_order_created",
      ref_id: orderData.id,
      payload: {
        order_id: orderData.id,
        order_status: "processing",
        payment_step: payment_step || "verified",
        user_name: customerProfile.name || "客戶",
        user_email: quotation.email || null,
        product_summary: productSummary,
        expected_pickup_date: quotation.expected_pickup_date || null,
        notes: quotation.notes || null,
        subtotal: quotation.subtotal || 0,
        total_amount: quotation.total_amount || 0,
        shipping_fee: quotation.shipping_fee || 0,
        shipping_way: quotation.shipping_way || null,
        who_receive: quotation.who_receive || delivery.receiver || null,
        phone: delivery.phone || null,
        shipping_address_text: quotation.shipping_address_text || delivery.address || null,
        action_type: "new_order",
        is_manual_order: true,
        notification_channel: lineUserId ? "line" : "email",
        line_user_id: lineUserId || null,
        status_message: "報價單已轉為正式訂單",
      },
    };

    console.log("[process-quotation/convert_to_order] Sending LINE notification...");
    const lineResponse = await fetch(N8N_LINE_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(linePayload),
    });
    console.log("[process-quotation/convert_to_order] LINE webhook status:", lineResponse.status);

    // Insert system event
    await supabase.from("system_events").insert({
      source: "admin",
      event_type: "quotation_converted",
      ref_id: orderData.id,
      payload: linePayload.payload,
      sent_to_n8n: true,
    });
  } catch (notifyError) {
    console.error("[process-quotation/convert_to_order] Notification error:", notifyError);
  }

  // 8. Send to Google Calendar
  try {
    const calendarPayload = {
      order_id: orderData.id,
      order_status: "processing",
      member_name: customerProfile.name || null,
      recipient_name: quotation.who_receive || delivery.receiver || null,
      pickup_date: quotation.expected_pickup_date || null,
      order_items_text: productSummary,
      pickup_method: quotation.shipping_way || delivery.method || null,
    };

    console.log("[process-quotation/convert_to_order] Sending to Google Calendar...");
    const calendarResponse = await fetch(N8N_CALENDAR_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(calendarPayload),
    });
    console.log("[process-quotation/convert_to_order] Calendar webhook status:", calendarResponse.status);
  } catch (calendarError) {
    console.error("[process-quotation/convert_to_order] Calendar error:", calendarError);
  }

  return new Response(
    JSON.stringify({ success: true, order_id: orderData.id }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
