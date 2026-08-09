import type { SupabaseClient } from "@supabase/supabase-js";
import { generateCrmMessageDraft, type CrmInsights } from "@/lib/crm-customer-insights-ai";
import { fetchOrderIdsForCustomerKey, parseCustomerKey, customerKeyForOrder } from "@/lib/order-customer-contact";
import { isAdminLineUserId } from "@/lib/admin-line-ids";
import {
  interpretWakeupEmailN8nResponse,
  WAKEUP_SEND_CLAIMABLE_STATUSES,
  WAKEUP_SEND_IN_FLIGHT_STATUS,
  wakeupSendClaimStaleBefore,
} from "@/lib/wakeup-send-guards";

export const WAKEUP_OBJECTIVE = "訂後關懷喚醒";

export type WakeupChannel = "line" | "email";
export type WakeupDraftStatus =
  | "pending_review"
  | "approved"
  | "sending"
  | "sent"
  | "dismissed"
  | "failed";
export type WakeupSource = "backfill" | "cron_30d" | "cron_14d_pickup" | "admin_compose";

export const PONI_CARE_EMAILS = ["tjcookies99@gmail.com", "sinnylo1205@gmail.com"] as const;

export function isPoniCareEmail(email: string | null | undefined): boolean {
  const e = email?.trim().toLowerCase();
  if (!e) return false;
  return (PONI_CARE_EMAILS as readonly string[]).includes(e);
}

export type WakeupDraftRow = {
  id: string;
  customer_key: string;
  trigger_order_id: string | null;
  last_purchase_at: string | null;
  channel: WakeupChannel;
  line_user_id: string | null;
  email: string | null;
  draft_text: string;
  status: WakeupDraftStatus;
  source: WakeupSource;
  admin_notified_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  sent_at: string | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type OrderCustomerRollupLite = {
  customer_key: string;
  customer_name: string | null;
  last_purchase_at: string | null;
  /** 觸發用：最近一筆有效訂單的取件日 */
  expected_pickup_date?: string | null;
  primary_email: string | null;
  line_user_id: string | null;
  has_line: boolean;
  has_email: boolean;
  trigger_order_id?: string | null;
};

export type CustomerOrderSummary = {
  id: string;
  created_at: string | null;
  order_status: string | null;
  payment_step: string | null;
  total_amount: number | null;
  who_receive: string | null;
  items_summary: string;
};

const N8N_ADMIN_REPLY_URL = "https://tjcookies.app.n8n.cloud/webhook/admin-reply";
const N8N_WAKEUP_EMAIL_URL = "https://tjcookies.app.n8n.cloud/webhook/crm-wakeup-email";
const N8N_LINE_NOTIFY_URL = "https://tjcookies.app.n8n.cloud/webhook/line";

const DAY_MS = 24 * 60 * 60 * 1000;

export function resolveWakeupChannel(row: {
  line_user_id?: string | null;
  has_line?: boolean;
  primary_email?: string | null;
  has_email?: boolean;
}): { channel: WakeupChannel; line_user_id: string | null; email: string | null } | null {
  const line = row.line_user_id?.trim() || null;
  if (line && !isAdminLineUserId(line) && (row.has_line !== false)) {
    return { channel: "line", line_user_id: line, email: row.primary_email?.trim() || null };
  }
  const email = row.primary_email?.trim() || null;
  if (email && (row.has_email !== false || Boolean(email))) {
    return { channel: "email", line_user_id: null, email };
  }
  return null;
}

export async function fetchOrdersForCustomerKey(
  supabase: SupabaseClient,
  customerKey: string,
): Promise<CustomerOrderSummary[]> {
  const orderIds = await fetchOrderIdsForCustomerKey(supabase, customerKey);
  if (orderIds.length === 0) return [];

  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, created_at, order_status, payment_step, total_amount, who_receive")
    .in("id", orderIds)
    .not("order_status", "in", "(canceled,returned)")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const ids = (orders ?? []).map((o) => o.id as string);
  const itemsByOrder = new Map<string, string[]>();
  if (ids.length > 0) {
    const { data: items } = await supabase
      .from("order_items")
      .select("order_id, product_name, quantity")
      .in("order_id", ids);
    for (const item of items ?? []) {
      const oid = item.order_id as string;
      const name = (item.product_name as string | null)?.trim() || "品項";
      const qty = Number(item.quantity ?? 1);
      const list = itemsByOrder.get(oid) ?? [];
      list.push(`${name}×${qty}`);
      itemsByOrder.set(oid, list);
    }
  }

  return (orders ?? []).map((o) => ({
    id: o.id as string,
    created_at: (o.created_at as string | null) ?? null,
    order_status: (o.order_status as string | null) ?? null,
    payment_step: (o.payment_step as string | null) ?? null,
    total_amount: o.total_amount != null ? Number(o.total_amount) : null,
    who_receive: (o.who_receive as string | null) ?? null,
    items_summary: (itemsByOrder.get(o.id as string) ?? []).slice(0, 4).join("、") || "—",
  }));
}

async function fetchLatestOrderProducts(
  supabase: SupabaseClient,
  orderId: string | null,
): Promise<string[]> {
  if (!orderId) return [];
  const { data: items } = await supabase
    .from("order_items")
    .select("product_name")
    .eq("order_id", orderId)
    .limit(12);
  const names: string[] = [];
  const seen = new Set<string>();
  for (const i of items ?? []) {
    const name = (i.product_name as string | null)?.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

/** 從客人訊息粗抓活動／場合關鍵（規則 fallback；AI 仍以完整對話為準） */
export function extractMentionedOccasions(userTexts: string[]): string[] {
  const blob = userTexts.join("\n");
  const patterns: { re: RegExp; label: string }[] = [
    { re: /生日|生辰|壽星/i, label: "生日" },
    { re: /婚禮|結婚|婚宴|喜宴/i, label: "婚禮" },
    { re: /收涎|滿月|彌月|寶寶/i, label: "收涎／彌月" },
    { re: /畢業|謝師宴/i, label: "畢業／謝師" },
    { re: /開幕|開業|喬遷/i, label: "開幕／喬遷" },
    { re: /耶誕|聖誕|交換禮物/i, label: "耶誕" },
    { re: /中秋|端午|過年|春節|新年/i, label: "節慶" },
    { re: /公司|企業|員工|福委|尾牙|春酒/i, label: "公司活動" },
    { re: /活動|派對|派對|聚會|慶生|慶祝/i, label: "活動聚會" },
    { re: /送禮|禮物|伴手禮/i, label: "送禮" },
  ];
  const found: string[] = [];
  for (const p of patterns) {
    if (p.re.test(blob) && !found.includes(p.label)) found.push(p.label);
  }
  return found.slice(0, 4);
}

async function fetchLineLogsForInsights(
  supabase: SupabaseClient,
  lineUserId: string | null,
): Promise<{ received_at: string | null; user_text: string | null; ai_reply: string | null; admin_reply: string | null }[]> {
  if (!lineUserId) return [];
  const { data } = await supabase
    .from("line_log")
    .select("received_at, user_text, ai_reply, admin_reply")
    .eq("user_id", lineUserId)
    .order("received_at", { ascending: false })
    .limit(80);
  return (data ?? []).reverse();
}

function buildFallbackWakeupText(params: {
  customerName: string | null;
  products: string[];
  lastPurchaseAt: string | null;
  occasions?: string[];
}): string {
  const rawName = params.customerName?.trim() || "";
  const greeting = rawName && rawName !== "您好" ? `${rawName}您好～` : "您好～";
  const productBit = params.products.slice(0, 3).join("、") || "甜點";
  const occasionBit =
    params.occasions && params.occasions.length > 0
      ? `還記得您提到的${params.occasions.join("、")}，希望一切順利！`
      : "";
  return (
    `${greeting}感謝您上次選擇我們的${productBit}！${occasionBit}` +
    `若近期有需要，歡迎再跟我們說，我們很樂意協助安排。`
  );
}

export async function generateWakeupDraftText(params: {
  supabase: SupabaseClient;
  customerKey: string;
  customerName: string | null;
  lineUserId: string | null;
  lastPurchaseAt: string | null;
  triggerOrderId: string | null;
}): Promise<{ draftText: string; model: string; products: string[] }> {
  const products = await fetchLatestOrderProducts(params.supabase, params.triggerOrderId);
  const chatLogs = await fetchLineLogsForInsights(params.supabase, params.lineUserId);
  const customerMessages = chatLogs
    .map((l) => l.user_text?.trim())
    .filter((v): v is string => Boolean(v));
  const mentionedOccasions = extractMentionedOccasions(customerMessages);

  const insights: CrmInsights = {
    interested_products: products.slice(0, 3),
    last_ordered_products: products.slice(0, 3),
    purchase_motivation: mentionedOccasions.join("、") || "再次關懷與邀請回購",
    usage_occasion: mentionedOccasions.join("、") || "送禮／自用回訪",
    confidence: 0.6,
    rationale_zh: "依最近訂單與 LINE 對話中客人提及的活動產訂後關懷文案",
    suggested_tag: "中意願",
    recommended_products: products.slice(0, 2),
    suggested_send_window: "平日白天",
  };

  const orderFact = {
    order_count: 1,
    lifetime_value: 0,
    last_pickup_date: params.lastPurchaseAt,
    recent_products: products,
  };

  try {
    const { draft, model } = await generateCrmMessageDraft({
      lineUserId: params.lineUserId || params.customerKey,
      insights,
      orderFact,
      objective: WAKEUP_OBJECTIVE,
      extraContext: {
        customer_name: params.customerName,
        must_cover: [
          "提及上次訂單（只說品項名稱，不要數量）",
          "感謝時必須用「感謝您上次選擇我們的{品項}」這類含「上次」的說法",
          "若對話有提到活動／場合，自然帶入關心",
          "邀請再次訂購",
        ],
        greeting_format: "{姓名}您好～",
        thank_you_format: "感謝您上次選擇我們的{品項}",
        forbid: [
          "親愛的",
          "訂購數量",
          "幾個",
          "幾盒",
          "×",
          "x份",
          "數量",
          "希望您喜歡這些美味的產品",
          "期待聽到您的回饋",
          "若有任何回饋我們都很珍惜",
          "不知道實際體驗如何",
        ],
        mentioned_occasions_hint: mentionedOccasions,
        // 優先給客人原話，方便 AI 抓活動內容
        customer_line_messages: customerMessages.slice(-24),
        chat_logs_sample: chatLogs.slice(-16).map((l) => ({
          user: l.user_text,
          admin: l.admin_reply,
        })),
      },
    });
    return { draftText: draft.draft_text, model, products };
  } catch {
    return {
      draftText: buildFallbackWakeupText({
        customerName: params.customerName,
        products,
        lastPurchaseAt: params.lastPurchaseAt,
        occasions: mentionedOccasions,
      }),
      model: "fallback-rule",
      products,
    };
  }
}

export async function isWakeupOptOut(supabase: SupabaseClient, customerKey: string): Promise<boolean> {
  const { data } = await supabase
    .from("order_customer_crm")
    .select("wakeup_opt_out")
    .eq("customer_key", customerKey)
    .maybeSingle();
  return Boolean(data?.wakeup_opt_out);
}

export async function setWakeupOptOut(
  supabase: SupabaseClient,
  customerKey: string,
  optOut: boolean,
  updatedBy?: string | null,
): Promise<void> {
  if (!parseCustomerKey(customerKey)) throw new Error("無效的客戶鍵");
  const { data: existing } = await supabase
    .from("order_customer_crm")
    .select("customer_key, company_name")
    .eq("customer_key", customerKey)
    .maybeSingle();

  if (!existing && !optOut) {
    return;
  }

  const { error } = await supabase.from("order_customer_crm").upsert(
    {
      customer_key: customerKey,
      company_name: existing?.company_name ?? null,
      wakeup_opt_out: optOut,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy ?? null,
    },
    { onConflict: "customer_key" },
  );
  if (error) throw error;
}

export async function hasPendingDraft(supabase: SupabaseClient, customerKey: string): Promise<boolean> {
  const { data } = await supabase
    .from("customer_wakeup_drafts")
    .select("id")
    .eq("customer_key", customerKey)
    .eq("status", "pending_review")
    .maybeSingle();
  return Boolean(data?.id);
}

export async function hasSentForTriggerOrder(
  supabase: SupabaseClient,
  triggerOrderId: string | null,
): Promise<boolean> {
  if (!triggerOrderId) return false;
  const { data } = await supabase
    .from("customer_wakeup_drafts")
    .select("id")
    .eq("trigger_order_id", triggerOrderId)
    .eq("status", "sent")
    .maybeSingle();
  return Boolean(data?.id);
}

export async function resolveTriggerOrderId(
  supabase: SupabaseClient,
  customerKey: string,
  lastPurchaseAt: string | null,
): Promise<string | null> {
  const orders = await fetchOrdersForCustomerKey(supabase, customerKey);
  if (orders.length === 0) return null;
  if (lastPurchaseAt) {
    const match = orders.find((o) => o.created_at && o.created_at.slice(0, 19) === lastPurchaseAt.slice(0, 19));
    if (match) return match.id;
    const byDay = orders.find((o) => o.created_at && o.created_at.slice(0, 10) === lastPurchaseAt.slice(0, 10));
    if (byDay) return byDay.id;
  }
  return orders[0]?.id ?? null;
}

export type CreateDraftResult =
  | { ok: true; draft: WakeupDraftRow; skipped?: false }
  | { ok: true; skipped: true; reason: string }
  | { ok: false; error: string };

export async function createWakeupDraftForCustomer(
  supabase: SupabaseClient,
  row: OrderCustomerRollupLite,
  source: Exclude<WakeupSource, "admin_compose">,
): Promise<CreateDraftResult> {
  if (await isWakeupOptOut(supabase, row.customer_key)) {
    return { ok: true, skipped: true, reason: "opt_out" };
  }
  if (await hasPendingDraft(supabase, row.customer_key)) {
    return { ok: true, skipped: true, reason: "pending_exists" };
  }

  const channelInfo = resolveWakeupChannel(row);
  if (!channelInfo) {
    return { ok: true, skipped: true, reason: "no_contact" };
  }

  const triggerOrderId =
    row.trigger_order_id ??
    (await resolveTriggerOrderId(supabase, row.customer_key, row.last_purchase_at));
  if (await hasSentForTriggerOrder(supabase, triggerOrderId)) {
    return { ok: true, skipped: true, reason: "already_sent_for_order" };
  }

  const pickupOrPurchase = row.expected_pickup_date || row.last_purchase_at;

  const { draftText, model, products } = await generateWakeupDraftText({
    supabase,
    customerKey: row.customer_key,
    customerName: row.customer_name,
    lineUserId: channelInfo.line_user_id,
    lastPurchaseAt: pickupOrPurchase,
    triggerOrderId,
  });

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("customer_wakeup_drafts")
    .insert({
      customer_key: row.customer_key,
      trigger_order_id: triggerOrderId,
      last_purchase_at: pickupOrPurchase,
      channel: channelInfo.channel,
      line_user_id: channelInfo.line_user_id,
      email: channelInfo.email,
      draft_text: draftText,
      status: "pending_review",
      source,
      metadata: {
        model,
        products,
        customer_name: row.customer_name,
        expected_pickup_date: row.expected_pickup_date ?? null,
      },
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: true, skipped: true, reason: "pending_exists" };
    }
    return { ok: false, error: error.message };
  }

  return { ok: true, draft: data as WakeupDraftRow };
}

export function daysSince(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return (now - t) / DAY_MS;
}

/** 取件日 YYYY-MM-DD → 當地中午時間戳 */
export function parsePickupDateMs(pickup: string | null | undefined): number | null {
  if (!pickup) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(pickup.trim());
  if (!m) {
    const t = new Date(pickup).getTime();
    return Number.isNaN(t) ? null : t;
  }
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0).getTime();
}

export function daysSincePickup(pickup: string | null | undefined, now = Date.now()): number | null {
  const t = parsePickupDateMs(pickup);
  if (t == null) return null;
  return (now - t) / DAY_MS;
}

/** 回填：取件日已滿 ≥ 14 天 */
export function isBackfillEligible(pickupDate: string | null, now = Date.now()): boolean {
  const d = daysSincePickup(pickupDate, now);
  return d != null && d >= 14;
}

/** 每日窗口：取件日落在 14–15 天前 */
export function isCronWindowEligible(pickupDate: string | null, now = Date.now()): boolean {
  const d = daysSincePickup(pickupDate, now);
  return d != null && d >= 14 && d < 15;
}

type OrderForWakeupKey = {
  id: string;
  created_at: string | null;
  expected_pickup_date: string | null;
  Email: string | null;
  phone: string | null;
  line_user_id: string | null;
  user_id: string | null;
  who_receive: string | null;
  orderer_name: string | null;
  is_manual_order: boolean | null;
  is_from_quotation: boolean | null;
  order_status: string | null;
  is_hide: boolean | null;
};

/**
 * 依「最近一筆有效訂單的取件日」篩選可產喚醒草稿的客戶。
 * backfill：取件日 ≥ 14 天前；cron_window：恰好落在 14–15 天前。
 */
export async function listEligibleRollupCustomers(
  supabase: SupabaseClient,
  mode: "backfill" | "cron_window",
): Promise<OrderCustomerRollupLite[]> {
  const { data: roleRows } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
  const adminUserIds = new Set((roleRows ?? []).map((r) => r.user_id as string).filter(Boolean));

  const { data: orders, error } = await supabase
    .from("orders")
    .select(
      "id,created_at,expected_pickup_date,Email,phone,line_user_id,user_id,who_receive,orderer_name,is_manual_order,is_from_quotation,order_status,is_hide",
    )
    .not("order_status", "in", "(canceled,returned)")
    .not("expected_pickup_date", "is", null)
    .order("expected_pickup_date", { ascending: false })
    .limit(5000);
  if (error) throw error;

  const now = Date.now();
  // customer_key → 最近取件日符合條件的訂單
  const bestByKey = new Map<
    string,
    { order: OrderForWakeupKey; pickup: string; pickupMs: number }
  >();

  for (const raw of (orders as OrderForWakeupKey[]) ?? []) {
    if (raw.is_hide) continue;
    const pickup = raw.expected_pickup_date?.trim() || null;
    if (!pickup) continue;
    const eligible =
      mode === "backfill" ? isBackfillEligible(pickup, now) : isCronWindowEligible(pickup, now);
    if (!eligible) continue;

    const key = customerKeyForOrder(raw, adminUserIds);
    if (!key || key === "name:") continue;
    const pickupMs = parsePickupDateMs(pickup);
    if (pickupMs == null) continue;

    const prev = bestByKey.get(key);
    if (!prev || pickupMs > prev.pickupMs) {
      bestByKey.set(key, { order: raw, pickup, pickupMs });
    }
  }

  if (bestByKey.size === 0) return [];

  const keys = [...bestByKey.keys()];
  const { data: rollups } = await supabase
    .from("order_customer_rollup")
    .select("customer_key,customer_name,last_purchase_at,primary_email,line_user_id,has_line,has_email")
    .in("customer_key", keys);

  const rollupByKey = new Map(
    ((rollups as OrderCustomerRollupLite[]) ?? []).map((r) => [r.customer_key, r]),
  );

  const result: OrderCustomerRollupLite[] = [];
  for (const [key, best] of bestByKey) {
    const rollup = rollupByKey.get(key);
    const orderEmail = best.order.Email?.trim() || null;
    const orderLine = best.order.line_user_id?.trim() || null;
    const primary_email = rollup?.primary_email?.trim() || orderEmail;
    const line_user_id = rollup?.line_user_id?.trim() || orderLine;
    const has_line = Boolean(line_user_id) || Boolean(rollup?.has_line);
    const has_email = Boolean(primary_email) || Boolean(rollup?.has_email);
    if (!has_line && !has_email) continue;

    result.push({
      customer_key: key,
      customer_name:
        rollup?.customer_name ||
        best.order.who_receive ||
        best.order.orderer_name ||
        null,
      last_purchase_at: rollup?.last_purchase_at ?? best.order.created_at,
      expected_pickup_date: best.pickup,
      primary_email,
      line_user_id,
      has_line,
      has_email,
      trigger_order_id: best.order.id,
    });
  }

  result.sort((a, b) => {
    const am = parsePickupDateMs(a.expected_pickup_date) ?? 0;
    const bm = parsePickupDateMs(b.expected_pickup_date) ?? 0;
    return am - bm;
  });
  return result;
}

export async function sendLineMessageViaAdminReply(params: {
  lineUserId: string;
  messageText: string;
  authHeader: string;
}): Promise<{ ok: true; line_log_id?: string } | { ok: false; error: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!supabaseUrl) {
    return { ok: false, error: "缺少 NEXT_PUBLIC_SUPABASE_URL" };
  }

  // 走與 CRM「手動回覆」相同的 Edge → n8n admin-reply → LINE Push + line_log
  const res = await fetch(`${supabaseUrl}/functions/v1/admin-line-reply`, {
    method: "POST",
    headers: {
      Authorization: params.authHeader,
      apikey: anonKey || "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      line_user_id: params.lineUserId,
      message_text: params.messageText,
    }),
  });

  const bodyText = await res.text().catch(() => "");
  let json: { error?: string; line_log_id?: string; warning?: string } = {};
  try {
    json = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    /* ignore */
  }

  if (!res.ok) {
    return {
      ok: false,
      error: json.error || `LINE 推送失敗 (${res.status}): ${bodyText.slice(0, 300)}`,
    };
  }
  return { ok: true, line_log_id: json.line_log_id };
}

/** @deprecated 請改用 sendLineMessageViaAdminReply，保留僅作 fallback */
export async function sendLineMessageViaN8n(params: {
  lineUserId: string;
  messageText: string;
  userName?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const payload = {
    source: "admin",
    event_type: "admin_reply",
    ref_id: params.lineUserId,
    line_user_id: params.lineUserId,
    status_message: params.messageText,
    action_type: "admin_reply",
    user_name: params.userName || "顧客",
    reply_mode: "human",
    notification_channel: "line",
    to: params.lineUserId,
    messages: [{ type: "text", text: params.messageText }],
    // 與 admin-line-reply 對齊：n8n 可能讀 nested payload
    payload: {
      line_user_id: params.lineUserId,
      status_message: params.messageText,
      action_type: "admin_reply",
      user_name: params.userName || "顧客",
      reply_mode: "human",
      notification_channel: "line",
      to: params.lineUserId,
      messages: [{ type: "text", text: params.messageText }],
    },
  };

  const res = await fetch(N8N_ADMIN_REPLY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: `LINE 推送失敗 (${res.status}): ${body.slice(0, 300)}` };
  }
  return { ok: true };
}

export async function sendEmailViaN8n(params: {
  email: string;
  messageText: string;
  customerName?: string | null;
  subject?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const sharedSecret = process.env.N8N_WAKEUP_EMAIL_SECRET?.trim();
  if (sharedSecret) {
    headers["x-wakeup-secret"] = sharedSecret;
  }

  const res = await fetch(N8N_WAKEUP_EMAIL_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      source: "crm_wakeup",
      event_type: "customer_wakeup_email",
      customer_email: params.email,
      user_email: params.email,
      message_text: params.messageText,
      customer_name: params.customerName || "顧客",
      subject: params.subject || "T&J 關心您上次的訂購",
      ...(sharedSecret ? { webhook_secret: sharedSecret } : {}),
    }),
  });
  const bodyText = await res.text().catch(() => "");
  return interpretWakeupEmailN8nResponse({ httpStatus: res.status, bodyText });
}

async function claimWakeupDraftForSend(params: {
  supabase: SupabaseClient;
  draftId: string;
  customerKey: string;
  messageText: string;
  reviewedBy?: string | null;
}): Promise<WakeupDraftRow> {
  const now = new Date().toISOString();
  const patch = {
    status: WAKEUP_SEND_IN_FLIGHT_STATUS,
    draft_text: params.messageText,
    reviewed_by: params.reviewedBy ?? null,
    reviewed_at: now,
    updated_at: now,
    error_message: null,
  };

  const { data: claimed, error } = await params.supabase
    .from("customer_wakeup_drafts")
    .update(patch)
    .eq("id", params.draftId)
    .eq("customer_key", params.customerKey)
    .in("status", [...WAKEUP_SEND_CLAIMABLE_STATUSES])
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (claimed) return claimed as WakeupDraftRow;

  const staleBefore = wakeupSendClaimStaleBefore();
  const { data: staleClaimed, error: staleErr } = await params.supabase
    .from("customer_wakeup_drafts")
    .update(patch)
    .eq("id", params.draftId)
    .eq("customer_key", params.customerKey)
    .eq("status", WAKEUP_SEND_IN_FLIGHT_STATUS)
    .lt("updated_at", staleBefore)
    .select("*")
    .maybeSingle();
  if (staleErr) throw staleErr;
  if (!staleClaimed) {
    throw new Error("草稿狀態已變更或正在發送中，請勿重複核准");
  }
  return staleClaimed as WakeupDraftRow;
}

async function markWakeupDraftSendResult(params: {
  supabase: SupabaseClient;
  draftId: string;
  customerKey: string;
  ok: boolean;
  channel: WakeupChannel;
  lineUserId: string | null;
  email: string | null;
  reviewedBy?: string | null;
  errorMessage?: string | null;
}): Promise<void> {
  const now = new Date().toISOString();
  if (params.ok) {
    const { data, error } = await params.supabase
      .from("customer_wakeup_drafts")
      .update({
        status: "sent",
        channel: params.channel,
        line_user_id: params.lineUserId,
        email: params.email,
        sent_at: now,
        reviewed_at: now,
        reviewed_by: params.reviewedBy ?? null,
        updated_at: now,
        error_message: null,
      })
      .eq("id", params.draftId)
      .eq("customer_key", params.customerKey)
      .eq("status", WAKEUP_SEND_IN_FLIGHT_STATUS)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data?.id) {
      throw new Error("草稿狀態已變更，無法標記為已發送");
    }
    return;
  }

  const { error } = await params.supabase
    .from("customer_wakeup_drafts")
    .update({
      status: "failed",
      channel: params.channel,
      line_user_id: params.lineUserId,
      email: params.email,
      reviewed_at: now,
      reviewed_by: params.reviewedBy ?? null,
      updated_at: now,
      error_message: params.errorMessage?.slice(0, 500) ?? "發送失敗",
    })
    .eq("id", params.draftId)
    .eq("customer_key", params.customerKey)
    .eq("status", WAKEUP_SEND_IN_FLIGHT_STATUS);
  if (error) throw error;
}

export async function notifyAdminsWakeupDrafts(params: {
  supabase: SupabaseClient;
  message: string;
}): Promise<void> {
  const { data: adminRows } = await params.supabase.from("admin_line_user_ids").select("line_user_id");
  const ids = [
    ...new Set(
      (adminRows ?? [])
        .map((r) => (r.line_user_id as string | null)?.trim())
        .filter((v): v is string => Boolean(v)),
    ),
  ];
  // fallback to static if view empty
  const targets = ids.length > 0 ? ids : ["Ue6499ae132e994266ea500b976a3277c"];

  await Promise.all(
    targets.map(async (lineUserId) => {
      try {
        await fetch(N8N_LINE_NOTIFY_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: "crm_wakeup",
            event_type: "wakeup_draft_admin_notify",
            line_user_id: lineUserId,
            to: lineUserId,
            notification_channel: "line",
            status_message: params.message,
            messages: [{ type: "text", text: params.message }],
            payload: {
              line_user_id: lineUserId,
              status_message: params.message,
              notification_channel: "line",
            },
          }),
        });
      } catch {
        // best-effort
      }
    }),
  );
}

export async function sendWakeupMessage(params: {
  supabase: SupabaseClient;
  customerKey: string;
  messageText: string;
  customerName?: string | null;
  lineUserId?: string | null;
  email?: string | null;
  draftId?: string | null;
  source?: WakeupSource;
  reviewedBy?: string | null;
  /** 管理員 JWT（Bearer …），LINE 通道必須帶入以呼叫 admin-line-reply */
  authHeader?: string | null;
}): Promise<{ channel: WakeupChannel; draftId: string | null }> {
  const text = params.messageText.trim();
  if (!text) throw new Error("訊息不可為空");

  // 有草稿時先互斥 claim，避免兩位管理員同時核准造成雙重推送
  if (params.draftId) {
    await claimWakeupDraftForSend({
      supabase: params.supabase,
      draftId: params.draftId,
      customerKey: params.customerKey,
      messageText: text,
      reviewedBy: params.reviewedBy,
    });
  }

  // 一律以 rollup 為準（避免前端傳錯／過期聯絡）
  const { data: rollup } = await params.supabase
    .from("order_customer_rollup")
    .select("customer_key,customer_name,primary_email,line_user_id,has_line,has_email")
    .eq("customer_key", params.customerKey)
    .maybeSingle();
  if (!rollup) {
    if (params.draftId) {
      await markWakeupDraftSendResult({
        supabase: params.supabase,
        draftId: params.draftId,
        customerKey: params.customerKey,
        ok: false,
        channel: "email",
        lineUserId: null,
        email: null,
        reviewedBy: params.reviewedBy,
        errorMessage: "找不到客戶",
      });
    }
    throw new Error("找不到客戶");
  }

  const channelInfo = resolveWakeupChannel(rollup as OrderCustomerRollupLite);
  if (!channelInfo) {
    if (params.draftId) {
      await markWakeupDraftSendResult({
        supabase: params.supabase,
        draftId: params.draftId,
        customerKey: params.customerKey,
        ok: false,
        channel: "email",
        lineUserId: null,
        email: null,
        reviewedBy: params.reviewedBy,
        errorMessage: "此客戶沒有 LINE 或 Email，無法發送",
      });
    }
    throw new Error("此客戶沒有 LINE 或 Email，無法發送");
  }

  const customerName =
    params.customerName || (rollup as OrderCustomerRollupLite).customer_name || null;

  let sendError: string | null = null;
  try {
    if (channelInfo.channel === "line" && channelInfo.line_user_id) {
      if (!params.authHeader) {
        throw new Error("缺少授權，無法經 LINE 發送");
      }
      const sent = await sendLineMessageViaAdminReply({
        lineUserId: channelInfo.line_user_id,
        messageText: text,
        authHeader: params.authHeader,
      });
      if (!sent.ok) throw new Error(sent.error);
    } else if (channelInfo.channel === "email" && channelInfo.email) {
      const sent = await sendEmailViaN8n({
        email: channelInfo.email,
        messageText: text,
        customerName,
      });
      if (!sent.ok) throw new Error(sent.error);
    } else {
      throw new Error("無法決定發送通道");
    }
  } catch (err) {
    sendError = err instanceof Error ? err.message : String(err);
  }

  if (params.draftId) {
    await markWakeupDraftSendResult({
      supabase: params.supabase,
      draftId: params.draftId,
      customerKey: params.customerKey,
      ok: !sendError,
      channel: channelInfo.channel,
      lineUserId: channelInfo.line_user_id,
      email: channelInfo.email,
      reviewedBy: params.reviewedBy,
      errorMessage: sendError,
    });
    if (sendError) throw new Error(sendError);
    return { channel: channelInfo.channel, draftId: params.draftId };
  }

  if (sendError) throw new Error(sendError);

  const now = new Date().toISOString();
  const triggerOrderId = await resolveTriggerOrderId(params.supabase, params.customerKey, null);
  const alreadySent = await hasSentForTriggerOrder(params.supabase, triggerOrderId);
  const { data, error } = await params.supabase
    .from("customer_wakeup_drafts")
    .insert({
      customer_key: params.customerKey,
      trigger_order_id: alreadySent ? null : triggerOrderId,
      channel: channelInfo.channel,
      line_user_id: channelInfo.line_user_id,
      email: channelInfo.email,
      draft_text: text,
      status: "sent",
      source: params.source ?? "admin_compose",
      sent_at: now,
      reviewed_at: now,
      reviewed_by: params.reviewedBy ?? null,
      metadata: { customer_name: customerName },
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { channel: channelInfo.channel, draftId: (data?.id as string) ?? null };
}
