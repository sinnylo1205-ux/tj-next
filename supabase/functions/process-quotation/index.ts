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

const QUOTATION_KIND_SPECIAL = "special";

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
    } else if (action === "send_quote_standalone") {
      return await handleSendQuoteStandalone(supabase, body);
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

type SendQuoteApplyOk = {
  quotation_order_id: string;
  subtotal: number;
  shipping_fee: number;
  total_amount: number;
  webhookPayload: Record<string, unknown>;
};

/** 合併更新報價品項 JSON，保留特殊報價的 combo_id／role／product_id 等欄位（send_quote 不可覆寫洗掉拆單依據） */
function mergeQuotationItemCustomizations(existing: unknown, patch: Record<string, unknown>): Record<string, unknown> {
  let base: Record<string, unknown> = {};
  if (existing != null) {
    if (typeof existing === "string") {
      try {
        const parsed: unknown = JSON.parse(existing);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          base = { ...(parsed as Record<string, unknown>) };
        }
      } catch {
        /* ignore */
      }
    } else if (typeof existing === "object" && !Array.isArray(existing)) {
      base = { ...(existing as Record<string, unknown>) };
    }
  }
  return { ...base, ...patch };
}

/** 轉訂單：將報價品項 customizations_json 與 all_requirement（客製／備註）合併寫入 order_items */
function orderItemCustomizationsJsonFromQuotationItem(item: any): unknown {
  const raw = item?.customizations_json;
  let base: Record<string, unknown> = {};
  if (raw != null) {
    if (typeof raw === "string") {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          base = { ...(parsed as Record<string, unknown>) };
        }
      } catch {
        /* ignore */
      }
    } else if (typeof raw === "object" && !Array.isArray(raw)) {
      base = { ...(raw as Record<string, unknown>) };
    }
  }
  const ar = item?.all_requirement;
  if (ar && typeof ar === "object" && !Array.isArray(ar)) {
    const a = ar as Record<string, unknown>;
    const cust = typeof a.customization === "string" ? a.customization.trim() : "";
    if (cust) base.customization = cust;
    const note = typeof a.note === "string" ? a.note.trim() : "";
    if (note) base.note = note;
  }
  return Object.keys(base).length > 0 ? base : null;
}

async function rollbackCreatedOrders(supabase: any, orderIds: string[]) {
  for (let i = orderIds.length - 1; i >= 0; i--) {
    const orderId = orderIds[i];
    await supabase.from("order_items").delete().eq("order_id", orderId);
    await supabase.from("orders").delete().eq("id", orderId);
  }
}

/** 更新品項與報價單金額、狀態為已報價，並組出與 n8n 相同之 payload */
async function applySendQuoteDb(supabase: any, body: any): Promise<{ ok: true; data: SendQuoteApplyOk } | { ok: false; response: Response }> {
  const { quotation_order_id, items, shipping_fee, line_user_id } = body;

  if (!quotation_order_id || !items || !Array.isArray(items)) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "缺少必要參數" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }

  console.log("[process-quotation/applySendQuoteDb] Processing quotation:", quotation_order_id);

  const { data: quotation, error: qError } = await supabase
    .from("quotation_orders")
    .select("*")
    .eq("id", quotation_order_id)
    .single();

  if (qError || !quotation) {
    console.error("[process-quotation/applySendQuoteDb] Quotation not found:", qError);
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "報價單不存在" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }

  let subtotal = 0;
  const updatedItems: any[] = [];

  for (const itemData of items) {
    const { id: itemId, unit_price, preview_url, why_price } = itemData;

    const { data: existingItem, error: itemFetchError } = await supabase
      .from("quotation_order_items")
      .select("*")
      .eq("id", itemId)
      .single();

    if (itemFetchError || !existingItem) {
      console.error("[process-quotation/applySendQuoteDb] Item not found:", itemId);
      continue;
    }

    const lineTotal = (unit_price || 0) * (existingItem.quantity || 0);
    subtotal += lineTotal;

    const prevCombo = parseComboIdFromQuotationItemEdge(existingItem.customizations_json);
    const customizationsJson = mergeQuotationItemCustomizations(existingItem.customizations_json, {
      why_price: why_price ?? "",
    });
    if (prevCombo && !parseComboIdFromQuotationItemEdge(customizationsJson)) {
      (customizationsJson as Record<string, unknown>).combo_id = prevCombo;
      const role = (customizationsJson as Record<string, unknown>).role;
      if (role == null || role === "") {
        (customizationsJson as Record<string, unknown>).role = "special_quotation_line";
      }
    }

    const { error: updateError } = await supabase
      .from("quotation_order_items")
      .update({
        unit_price: unit_price,
        preview_url: preview_url || null,
        customizations_json: customizationsJson,
      })
      .eq("id", itemId);

    if (updateError) {
      console.error("[process-quotation/applySendQuoteDb] Failed to update item:", updateError);
    }

    updatedItems.push({
      ...existingItem,
      unit_price,
      preview_url: preview_url || null,
      customizations_json: customizationsJson,
    });
  }

  const totalAmount = subtotal + (shipping_fee || 0);

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
    console.error("[process-quotation/applySendQuoteDb] Failed to update quotation:", orderUpdateError);
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "更新報價單失敗" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }

  const allReq = quotation.all_requirement || {};
  const customerProfile = allReq.customer_profile || {};
  const delivery = allReq.delivery || {};

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
      why_price: customizationWhyPriceEdge(item.customizations_json),
      combo_id: parseComboIdFromQuotationItemEdge(item.customizations_json) ?? undefined,
      role: customizationRoleEdge(item.customizations_json),
    })),
  };

  const specialPdf = buildSpecialQuotationPdfAttachmentForEdge(
    quotation,
    allReq,
    updatedItems,
    subtotal,
    shipping_fee || 0,
    totalAmount,
  );
  if (specialPdf) {
    Object.assign(webhookPayload, specialPdf);
  }

  return {
    ok: true,
    data: {
      quotation_order_id,
      subtotal,
      shipping_fee: shipping_fee || 0,
      total_amount: totalAmount,
      webhookPayload,
    },
  };
}

// ========== Action: Send Quote ==========
async function handleSendQuote(supabase: any, body: any) {
  const applied = await applySendQuoteDb(supabase, body);
  if (!applied.ok) return applied.response;

  const { quotation_order_id, subtotal, shipping_fee, total_amount, webhookPayload } = applied.data;

  console.log("[process-quotation/send_quote] Webhook payload:", JSON.stringify(webhookPayload, null, 2));

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
    JSON.stringify({ success: true, subtotal, shipping_fee, total_amount }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

/** 僅寫入資料庫並回傳 pdf 用 payload，不呼叫 n8n（單獨開立報價單／自行寄送） */
async function handleSendQuoteStandalone(supabase: any, body: any) {
  const applied = await applySendQuoteDb(supabase, body);
  if (!applied.ok) return applied.response;

  const { quotation_order_id, subtotal, shipping_fee, total_amount, webhookPayload } = applied.data;

  try {
    await supabase.from("system_events").insert({
      source: "admin",
      event_type: "quotation_standalone_saved",
      ref_id: quotation_order_id,
      payload: webhookPayload,
      sent_to_n8n: false,
    });
  } catch (eventError) {
    console.error("[process-quotation/send_quote_standalone] System event error:", eventError);
  }

  return new Response(
    JSON.stringify({
      success: true,
      subtotal,
      shipping_fee,
      total_amount,
      pdf_input: webhookPayload,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

function parseComboIdFromQuotationItemEdge(customizations_json: unknown): string | null {
  if (customizations_json == null) return null;
  let o: unknown = customizations_json;
  if (typeof customizations_json === "string") {
    try {
      o = JSON.parse(customizations_json);
    } catch {
      return null;
    }
  }
  if (!o || typeof o !== "object") return null;
  const id = (o as Record<string, unknown>).combo_id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function customizationWhyPriceEdge(customizations_json: unknown): string {
  if (customizations_json == null) return "";
  let o: unknown = customizations_json;
  if (typeof customizations_json === "string") {
    try {
      o = JSON.parse(customizations_json);
    } catch {
      return "";
    }
  }
  if (!o || typeof o !== "object") return "";
  return String((o as Record<string, unknown>).why_price ?? "");
}

function customizationRoleEdge(customizations_json: unknown): string | undefined {
  if (customizations_json == null) return undefined;
  let o: unknown = customizations_json;
  if (typeof customizations_json === "string") {
    try {
      o = JSON.parse(customizations_json);
    } catch {
      return undefined;
    }
  }
  if (!o || typeof o !== "object") return undefined;
  const r = (o as Record<string, unknown>).role;
  return typeof r === "string" && r.trim() ? r.trim() : undefined;
}

/** PDF 品項列：從 all_requirement 或 customizations_json 讀取客製／備註（與後台儲存一致） */
function quotationItemPdfLineAllReqEdge(item: any): { customization: string; note: string } {
  const pick = (ar: unknown, key: string): string => {
    if (!ar || typeof ar !== "object" || Array.isArray(ar)) return "";
    const v = (ar as Record<string, unknown>)[key];
    return typeof v === "string" ? v.trim() : "";
  };
  let customization = pick(item?.all_requirement, "customization");
  let note = pick(item?.all_requirement, "note");
  const raw = item?.customizations_json;
  let o: Record<string, unknown> | null = null;
  if (raw != null) {
    if (typeof raw === "string") {
      try {
        const p = JSON.parse(raw) as unknown;
        if (p && typeof p === "object" && !Array.isArray(p)) o = p as Record<string, unknown>;
      } catch {
        /* ignore */
      }
    } else if (typeof raw === "object" && !Array.isArray(raw)) {
      o = raw as Record<string, unknown>;
    }
  }
  if (o) {
    if (!customization) {
      const v = o.customization;
      customization = typeof v === "string" ? v.trim() : "";
    }
    if (!note) {
      const v = o.note;
      note = typeof v === "string" ? v.trim() : "";
    }
  }
  return { customization, note };
}

/**
 * 特殊報價（多訂單組合）：併入 pdf_input／n8n payload，讓 buildQuotationPdfHtml 走訂單組合版面。
 * 邏輯需與 `lib/special-quotation-pdf.ts` 之結構對齊（Edge 無法 import Next 模組故內嵌）。
 */
function buildSpecialQuotationPdfAttachmentForEdge(
  quotation: any,
  allReq: any,
  updatedItems: any[],
  subtotal: number,
  shippingFee: number,
  totalAmount: number,
): Record<string, unknown> | null {
  if (allReq?.quotation_kind !== QUOTATION_KIND_SPECIAL) return null;
  const special = allReq?.special_quotation;
  if (!special || typeof special !== "object") return null;
  const combos: any[] = Array.isArray(special.combos) ? special.combos : [];
  if (combos.length === 0) return null;

  const byCombo = new Map<string, any[]>();
  for (const item of updatedItems) {
    const cid = parseComboIdFromQuotationItemEdge(item.customizations_json);
    if (!cid) continue;
    if (!byCombo.has(cid)) byCombo.set(cid, []);
    byCombo.get(cid)!.push(item);
  }

  const contact = special.contact || {};
  const customerProfile = allReq.customer_profile || {};
  const contactEmail =
    typeof contact.email === "string" && contact.email.trim()
      ? contact.email.trim()
      : String(quotation.email || customerProfile.email || "").trim();
  const contact_display = [
    contactEmail ? `Email：${contactEmail}` : "",
    contact.phone ? `電話：${String(contact.phone)}` : "",
    contact.line_user_id ? `LINE：${String(contact.line_user_id)}` : "",
  ]
    .filter(Boolean)
    .join("　") || "—";

  const orderer_name =
    String(special.orderer_name || "").trim() ||
    String(customerProfile.name || "").trim() ||
    "客戶";

  const sections = combos.map((combo: any, idx: number) => {
    const cid = String(combo?.id ?? "").trim();
    const rawItems = cid ? byCombo.get(cid) ?? [] : [];
    const lines = rawItems.map((it: any) => {
      const allReqLine = quotationItemPdfLineAllReqEdge(it);
      return {
        product_name: String(it.product_name || ""),
        unit_price: Number(it.unit_price) || 0,
        quantity: Number(it.quantity) || 0,
        preview_url: it.preview_url || "",
        why_price: customizationWhyPriceEdge(it.customizations_json),
        customization: allReqLine.customization || undefined,
        note: allReqLine.note || undefined,
      };
    });
    const lineSub = lines.reduce(
      (s: number, l: any) => s + (Number(l.unit_price) || 0) * (Number(l.quantity) || 0),
      0,
    );
    const ship = Number(combo?.shipping_fee) || 0;
    return {
      combo_index: idx + 1,
      pickup_date:
        typeof combo?.expected_pickup_date === "string"
          ? combo.expected_pickup_date.trim() || undefined
          : undefined,
      location:
        typeof combo?.pickup_location === "string" ? combo.pickup_location.trim() || undefined : undefined,
      receiver:
        typeof combo?.pickup_contact_name === "string"
          ? combo.pickup_contact_name.trim() || undefined
          : undefined,
      receiver_phone:
        typeof combo?.pickup_contact_phone === "string"
          ? combo.pickup_contact_phone.trim() || undefined
          : undefined,
      shipping_fee: ship,
      subtotal: lineSub,
      total: lineSub + ship,
      lines,
    };
  });

  return {
    quotation_pdf_mode: "special",
    special_quotation_pdf: {
      orderer_name,
      contact_display,
      sections,
      grand: {
        subtotal,
        shipping_fee: shippingFee,
        total_amount: totalAmount,
      },
    },
  };
}

/** 特殊報價單：依 combo_id 拆成多筆 orders，各自通知 */
async function handleConvertSpecialQuotationToOrders(
  supabase: any,
  body: any,
  quotation: any,
  qItems: any[],
  allReq: any,
) {
  const {
    quotation_order_id,
    payment_method,
    payment_step,
    order_status,
    auto_cancel_exempt,
    transfer_last5,
    user_id: bodyUserId,
    line_user_id: bodyLineUserId,
  } = body;

  const special = allReq.special_quotation;
  if (!special || typeof special !== "object") {
    return new Response(JSON.stringify({ error: "特殊報價資料不完整" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const existingConverted = special.converted_order_ids;
  if (quotation.status === "order_created" || (Array.isArray(existingConverted) && existingConverted.length > 0)) {
    return new Response(JSON.stringify({ error: "此特殊報價單已轉過訂單，請勿重複操作" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!qItems?.length) {
    return new Response(JSON.stringify({ error: "無品項可轉單" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const byCombo = new Map<string, any[]>();
  for (const item of qItems) {
    const cid = parseComboIdFromQuotationItemEdge(item.customizations_json);
    if (!cid) {
      return new Response(JSON.stringify({ error: "特殊報價品項缺少 combo_id，無法拆單" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!byCombo.has(cid)) byCombo.set(cid, []);
    byCombo.get(cid)!.push(item);
  }

  const combosMeta: any[] = Array.isArray(special.combos) ? special.combos : [];
  const comboMetaById = new Map<string, any>();
  for (const c of combosMeta) {
    if (c && typeof c.id === "string") comboMetaById.set(c.id, c);
  }

  const userId = bodyUserId || quotation.user_id || "91a0caff-31ae-460c-87e7-4b3a5d167cc1";
  const lineUserId = bodyLineUserId || quotation.line_user_id || special.contact?.line_user_id || null;
  const ordererName = String(special.orderer_name || "").trim() || "客戶";
  const contactEmail = quotation.email || special.contact?.email || null;

  const createdOrderIds: string[] = [];
  const deferredNotifications: Array<{
    orderId: string;
    linePayload: Record<string, any>;
    calendarPayload: Record<string, any>;
  }> = [];

  try {
    for (const [comboId, comboItems] of byCombo.entries()) {
      const meta = comboMetaById.get(comboId) || {};
      const lineSubtotal = comboItems.reduce((sum: number, it: any) => {
        const up = Number(it.unit_price) || 0;
        const q = Number(it.quantity) || 0;
        return sum + up * q;
      }, 0);
      const shipFee = Number(meta.shipping_fee) || 0;
      const lineTotal = lineSubtotal + shipFee;

      const orderInsert = {
        user_id: userId,
        Email: contactEmail,
        who_receive: String(meta.pickup_contact_name || "").trim() || ordererName,
        phone: String(meta.pickup_contact_phone || "").trim() || null,
        shipping_way: quotation.shipping_way || "特殊報價",
        shipping_address_text: String(meta.pickup_location || "").trim() || null,
        expected_pickup_date: meta.expected_pickup_date || null,
        subtotal: lineSubtotal,
        shipping_fee: shipFee,
        total_amount: lineTotal,
        notes: quotation.notes || null,
        line_user_id: lineUserId,
        is_manual_order: true,
        is_from_quotation: true,
        is_from_special_quotation: true,
        orderer_name: ordererName,
        auto_cancel_exempt: !!auto_cancel_exempt,
        payment_method: payment_method,
        payment_step: payment_step || "verified",
        order_status: order_status || "processing",
        transfer_last5: transfer_last5 || null,
      };

      let orderData: any = null;
      let orderError: any = null;
      {
        const first = await supabase.from("orders").insert(orderInsert).select().single();
        orderData = first.data;
        orderError = first.error;
        const msg = String(orderError?.message || "");
        if (orderError && (msg.includes("is_from_special_quotation") || msg.includes("schema cache"))) {
          const { is_from_special_quotation: _omit, ...fallbackInsert } = orderInsert as Record<string, unknown>;
          const second = await supabase.from("orders").insert(fallbackInsert).select().single();
          orderData = second.data;
          orderError = second.error;
          if (!orderError) {
            console.warn(
              "[process-quotation/special_convert] orders 缺少 is_from_special_quotation 欄位，已略過該欄建立訂單；請執行 migration 20260508140000_orders_is_from_special_quotation.sql",
            );
          }
        }
      }

      if (orderError || !orderData) {
        console.error("[process-quotation/special_convert] order insert failed:", orderError);
        throw new Error(orderError?.message || "建立訂單失敗");
      }

      createdOrderIds.push(orderData.id);

      for (const item of comboItems) {
        const { error: itemError } = await supabase.from("order_items").insert({
          order_id: orderData.id,
          product_name: item.product_name || "未命名商品",
          quantity: item.quantity || 1,
          unit_price: item.unit_price || 0,
          preview_url: item.preview_url || null,
          customizations_json: orderItemCustomizationsJsonFromQuotationItem(item),
          category: item.category || "custom_design",
        });
        if (itemError) {
          console.error("[process-quotation/special_convert] order_item insert failed:", itemError);
          throw new Error(itemError.message || "建立訂單品項失敗");
        }
      }

      const productSummary = comboItems
        .map((it: any) => `${it.product_name} x${it.quantity}`)
        .join("、");

      const linePayload: Record<string, any> = {
        source: "system",
        event_type: "manual_order_created",
        ref_id: orderData.id,
        payload: {
          order_id: orderData.id,
          order_status: "processing",
          payment_step: payment_step || "verified",
          user_name: ordererName,
          user_email: contactEmail,
          product_summary: productSummary,
          expected_pickup_date: meta.expected_pickup_date || null,
          notes: quotation.notes || null,
          subtotal: lineSubtotal,
          total_amount: lineTotal,
          shipping_fee: shipFee,
          shipping_way: orderInsert.shipping_way,
          who_receive: orderInsert.who_receive,
          phone: orderInsert.phone,
          shipping_address_text: orderInsert.shipping_address_text,
          action_type: "new_order",
          is_manual_order: true,
          notification_channel: lineUserId ? "line" : "email",
          line_user_id: lineUserId || null,
          status_message: "特殊報價單已轉為正式訂單",
        },
      };

      deferredNotifications.push({
        orderId: orderData.id,
        linePayload,
        calendarPayload: {
          order_id: orderData.id,
          order_status: "processing",
          member_name: ordererName,
          recipient_name: orderInsert.who_receive,
          pickup_date: meta.expected_pickup_date || null,
          order_items_text: productSummary,
          pickup_method: orderInsert.shipping_way,
        },
      });
    }

    const nextAllReq = {
      ...allReq,
      special_quotation: {
        ...special,
        converted_order_ids: createdOrderIds,
      },
    };

    const { data: updatedQuotation, error: statusError } = await supabase
      .from("quotation_orders")
      .update({
        status: "order_created",
        payment_method,
        payment_step: payment_step || "verified",
        transfer_last5: transfer_last5 || null,
        user_id: bodyUserId || quotation.user_id || null,
        line_user_id: bodyLineUserId || quotation.line_user_id || null,
        all_requirement: nextAllReq,
        updated_at: new Date().toISOString(),
      })
      .eq("id", quotation_order_id)
      .neq("status", "order_created")
      .select("id")
      .maybeSingle();

    if (statusError || !updatedQuotation) {
      console.error("[process-quotation/special_convert] quotation update failed:", statusError);
      throw new Error(statusError?.message || "此特殊報價單已轉過訂單，已取消本次建立的訂單");
    }

    for (const notification of deferredNotifications) {
      try {
        const lineResponse = await fetch(N8N_LINE_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(notification.linePayload),
        });
        console.log("[process-quotation/special_convert] LINE status:", lineResponse.status);

        await supabase.from("system_events").insert({
          source: "admin",
          event_type: "quotation_converted",
          ref_id: notification.orderId,
          payload: notification.linePayload.payload,
          sent_to_n8n: true,
        });
      } catch (notifyError) {
        console.error("[process-quotation/special_convert] Notification error:", notifyError);
      }

      try {
        const calendarResponse = await fetch(N8N_CALENDAR_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(notification.calendarPayload),
        });
        console.log("[process-quotation/special_convert] Calendar status:", calendarResponse.status);
      } catch (calendarError) {
        console.error("[process-quotation/special_convert] Calendar error:", calendarError);
      }
    }

    return new Response(
      JSON.stringify({ success: true, order_id: createdOrderIds[0], order_ids: createdOrderIds }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "轉單失敗";
    console.error("[process-quotation/special_convert] rollback:", msg);
    await rollbackCreatedOrders(supabase, createdOrderIds);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

// ========== Action: Convert to Order ==========
async function handleConvertToOrder(supabase: any, body: any) {
  const {
    quotation_order_id,
    payment_method,
    payment_step,
    order_status,
    auto_cancel_exempt,
    transfer_last5,
    user_id: bodyUserId,
    line_user_id: bodyLineUserId,
  } = body;

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

  if (quotation.status === "order_created") {
    return new Response(JSON.stringify({ error: "此報價單已轉過訂單，請勿重複操作" }), {
      status: 400,
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

  const quotationItems = qItems || [];
  if (quotationItems.length === 0) {
    return new Response(JSON.stringify({ error: "無品項可轉單" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const allReq =
    quotation.all_requirement && typeof quotation.all_requirement === "object" && !Array.isArray(quotation.all_requirement)
      ? quotation.all_requirement
      : {};
  if (allReq.quotation_kind === QUOTATION_KIND_SPECIAL && allReq.special_quotation) {
    return await handleConvertSpecialQuotationToOrders(supabase, body, quotation, quotationItems, allReq);
  }

  const delivery = allReq.delivery || {};
  const customerProfile = allReq.customer_profile || {};

  // 3. Create order（優先使用 body 傳入的 user_id、line_user_id，否則用報價單上的）
  const userId = bodyUserId || quotation.user_id || "91a0caff-31ae-460c-87e7-4b3a5d167cc1"; // fallback to admin user
  const lineUserId = bodyLineUserId || quotation.line_user_id || null;
  const orderInsert = {
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
    auto_cancel_exempt: !!auto_cancel_exempt,
    payment_method: payment_method,
    payment_step: payment_step || "verified",
    order_status: order_status || "processing",
    transfer_last5: transfer_last5 || null,
  };

  console.log(
    "[process-quotation/convert_to_order] orderInsert:",
    JSON.stringify(
      {
        quotation_order_id,
        user_id: orderInsert.user_id,
        who_receive: orderInsert.who_receive,
        is_from_quotation: orderInsert.is_from_quotation,
        is_manual_order: orderInsert.is_manual_order,
        auto_cancel_exempt: orderInsert.auto_cancel_exempt,
        payment_method: orderInsert.payment_method,
        payment_step: orderInsert.payment_step,
        order_status: orderInsert.order_status,
      },
      null,
      2,
    ),
  );

  const { data: orderData, error: orderError } = await supabase
    .from("orders")
    .insert(orderInsert)
    .select()
    .single();

  if (orderError || !orderData) {
    console.error("[process-quotation/convert_to_order] Failed to create order:", orderError);
    return new Response(JSON.stringify({ error: "建立訂單失敗" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log(
    "[process-quotation/convert_to_order] Order created:",
    JSON.stringify(
      {
        order_id: orderData.id,
        is_from_quotation: (orderData as any)?.is_from_quotation,
        user_id: (orderData as any)?.user_id,
      },
      null,
      2,
    ),
  );

  const createdOrderIds = [orderData.id];

  try {
    // 4. Create order items
    for (const item of quotationItems) {
      const { error: itemError } = await supabase.from("order_items").insert({
        order_id: orderData.id,
        product_name: item.product_name || "未命名商品",
        quantity: item.quantity || 1,
        unit_price: item.unit_price || 0,
        preview_url: item.preview_url || null,
        customizations_json: orderItemCustomizationsJsonFromQuotationItem(item),
        category: item.category || "custom_design",
      });

      if (itemError) {
        console.error("[process-quotation/convert_to_order] Failed to create order item:", itemError);
        throw new Error(itemError.message || "建立訂單品項失敗");
      }
    }

    const nextAllReq = { ...allReq, converted_order_id: orderData.id };

    // 5. Update quotation status（保留 user_id、line_user_id）
    const { data: updatedQuotation, error: statusError } = await supabase
      .from("quotation_orders")
      .update({
        status: "order_created",
        payment_method,
        payment_step: payment_step || "verified",
        transfer_last5: transfer_last5 || null,
        user_id: bodyUserId || quotation.user_id || null,
        line_user_id: bodyLineUserId || quotation.line_user_id || null,
        all_requirement: nextAllReq,
        updated_at: new Date().toISOString(),
      })
      .eq("id", quotation_order_id)
      .neq("status", "order_created")
      .select("id")
      .maybeSingle();

    if (statusError || !updatedQuotation) {
      console.error("[process-quotation/convert_to_order] Failed to update status:", statusError);
      throw new Error(statusError?.message || "此報價單已轉過訂單，已取消本次建立的訂單");
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "轉單失敗";
    console.error("[process-quotation/convert_to_order] rollback:", msg);
    await rollbackCreatedOrders(supabase, createdOrderIds);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 6. Build product summary for notifications
  const productSummary = quotationItems
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
