/**
 * 取件日後 14 天喚醒草稿（每日 cron）
 * - 找出「取件日」恰好落在 14–15 天前的客戶訂單
 * - AI／規則產草稿（pending_review），不直接對顧客發送
 * - 彙總推播管理員 LINE
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const N8N_LINE_URL = "https://tjcookies.app.n8n.cloud/webhook/line";
const DAY_MS = 24 * 60 * 60 * 1000;

type RollupRow = {
  customer_key: string;
  customer_name: string | null;
  last_purchase_at: string | null;
  primary_email: string | null;
  line_user_id: string | null;
  has_line: boolean;
  has_email: boolean;
};

function daysSince(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  const t = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0).getTime()
    : new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return (now - t) / DAY_MS;
}

function resolveChannel(row: RollupRow): { channel: "line" | "email"; line_user_id: string | null; email: string | null } | null {
  const line = row.line_user_id?.trim() || null;
  if (line && row.has_line) return { channel: "line", line_user_id: line, email: row.primary_email?.trim() || null };
  const email = row.primary_email?.trim() || null;
  if (email && row.has_email) return { channel: "email", line_user_id: null, email };
  return null;
}

function fallbackDraft(
  name: string | null,
  products: string[],
  lastPurchaseAt: string | null,
  occasions: string[] = [],
): string {
  const rawName = name?.trim() || "";
  const greeting = rawName && rawName !== "您好" ? `${rawName}您好～` : "您好～";
  const productBit = products.slice(0, 3).join("、") || "甜點";
  const occasionBit = occasions.length > 0 ? `還記得您提到的${occasions.join("、")}，希望一切順利！` : "";
  return (
    `${greeting}感謝您上次選擇我們的${productBit}！${occasionBit}` +
    `若近期有需要，歡迎再跟我們說，我們很樂意協助安排。`
  );
}

function extractOccasionsFromSnippets(snippets: string[]): string[] {
  const blob = snippets.join("\n");
  const patterns: { re: RegExp; label: string }[] = [
    { re: /生日|生辰|壽星/i, label: "生日" },
    { re: /婚禮|結婚|婚宴|喜宴/i, label: "婚禮" },
    { re: /收涎|滿月|彌月|寶寶/i, label: "收涎／彌月" },
    { re: /畢業|謝師宴/i, label: "畢業／謝師" },
    { re: /開幕|開業|喬遷/i, label: "開幕／喬遷" },
    { re: /耶誕|聖誕|交換禮物/i, label: "耶誕" },
    { re: /中秋|端午|過年|春節|新年/i, label: "節慶" },
    { re: /公司|企業|員工|福委|尾牙|春酒/i, label: "公司活動" },
    { re: /活動|派對|聚會|慶生|慶祝/i, label: "活動聚會" },
    { re: /送禮|禮物|伴手禮/i, label: "送禮" },
  ];
  const found: string[] = [];
  for (const p of patterns) {
    if (p.re.test(blob) && !found.includes(p.label)) found.push(p.label);
  }
  return found.slice(0, 4);
}

async function openaiDraft(params: {
  name: string | null;
  products: string[];
  lastPurchaseAt: string | null;
  chatSnippets: string[];
  customerMessages: string[];
}): Promise<{ text: string; model: string }> {
  const occasions = extractOccasionsFromSnippets(params.customerMessages);
  const key = Deno.env.get("OPENAI_API_KEY")?.trim();
  if (!key) {
    return {
      text: fallbackDraft(params.name, params.products, params.lastPurchaseAt, occasions),
      model: "fallback-rule",
    };
  }
  const model = Deno.env.get("OPENAI_CRM_MODEL")?.trim() || "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "你是品牌 CRM 文案助理。回傳 JSON：{draft_text}。語氣真誠。" +
            "開頭「{姓名}您好～」，禁止「親愛的」。" +
            "閱讀客人 LINE 原話：若提到生日／婚禮／收涎／公司活動等場合，自然融入關心。" +
            "感謝時必須帶「上次」，例如「感謝您上次選擇我們的{品項}」（取件約 14 天後關心）。" +
            "可提品項名稱，禁止提到訂購數量（幾個、幾盒、×N）。" +
            "帶入感謝、邀請再次訂購。" +
            "禁止「希望您喜歡這些美味的產品」「期待聽到您的回饋」「若有任何回饋」「不知道實際體驗如何」這類套話。" +
            "繁體中文，約 240 字內。",
        },
        {
          role: "user",
          content: JSON.stringify({
            customer_name: params.name,
            products: params.products,
            last_purchase_at: params.lastPurchaseAt,
            customer_line_messages: params.customerMessages,
            chat_snippets: params.chatSnippets,
            mentioned_occasions_hint: occasions,
            greeting_format: "{姓名}您好～",
            thank_you_format: "感謝您上次選擇我們的{品項}",
            forbid: [
              "親愛的",
              "訂購數量",
              "幾個",
              "幾盒",
              "×",
              "數量",
              "希望您喜歡這些美味的產品",
              "期待聽到您的回饋",
              "若有任何回饋",
              "不知道實際體驗如何",
            ],
          }),
        },
      ],
    }),
  });
  if (!res.ok) {
    return {
      text: fallbackDraft(params.name, params.products, params.lastPurchaseAt, occasions),
      model: "fallback-rule",
    };
  }
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(content);
    const text = String(parsed.draft_text || "").trim();
    if (text) return { text, model };
  } catch {
    /* fallthrough */
  }
  return {
    text: fallbackDraft(params.name, params.products, params.lastPurchaseAt, occasions),
    model: "fallback-rule",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = Deno.env.get("CRON_SECRET");
  if (!expectedSecret || cronSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const now = Date.now();
  const { data: roleRows } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
  const adminUserIds = new Set((roleRows ?? []).map((r) => r.user_id as string).filter(Boolean));

  const { data: pickupOrders, error: orderErr } = await supabase
    .from("orders")
    .select(
      "id,created_at,expected_pickup_date,Email,phone,line_user_id,user_id,who_receive,orderer_name,is_manual_order,is_from_quotation,order_status,is_hide",
    )
    .not("order_status", "in", "(canceled,returned)")
    .not("expected_pickup_date", "is", null)
    .order("expected_pickup_date", { ascending: false })
    .limit(5000);

  if (orderErr) {
    return new Response(JSON.stringify({ error: orderErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  type OrderRow = {
    id: string;
    created_at: string | null;
    expected_pickup_date: string | null;
    Email: string | null;
    line_user_id: string | null;
    user_id: string | null;
    who_receive: string | null;
    orderer_name: string | null;
    is_manual_order: boolean | null;
    is_from_quotation: boolean | null;
    is_hide: boolean | null;
  };

  const customerKeyFor = (o: OrderRow): string => {
    if (o.is_manual_order || o.is_from_quotation) {
      return `name:${(o.who_receive || o.orderer_name || "").trim()}`;
    }
    if (o.user_id && !adminUserIds.has(o.user_id)) return `user:${o.user_id}`;
    return `name:${(o.who_receive || o.orderer_name || "").trim()}`;
  };

  const bestByKey = new Map<string, { order: OrderRow; pickup: string; pickupMs: number }>();
  for (const o of (pickupOrders as OrderRow[]) ?? []) {
    if (o.is_hide) continue;
    const pickup = o.expected_pickup_date?.trim() || null;
    if (!pickup) continue;
    const d = daysSince(pickup, now);
    if (d == null || d < 14 || d >= 15) continue;
    const key = customerKeyFor(o);
    if (!key || key === "name:") continue;
    const pickupMs = daysSince(pickup, 0) != null
      ? (() => {
          const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(pickup);
          return m
            ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0).getTime()
            : new Date(pickup).getTime();
        })()
      : 0;
    const prev = bestByKey.get(key);
    if (!prev || pickupMs > prev.pickupMs) {
      bestByKey.set(key, { order: o, pickup, pickupMs });
    }
  }

  const keys = [...bestByKey.keys()];
  const { data: rollups } = keys.length
    ? await supabase
        .from("order_customer_rollup")
        .select("customer_key,customer_name,last_purchase_at,primary_email,line_user_id,has_line,has_email")
        .in("customer_key", keys)
    : { data: [] as RollupRow[] };

  const rollupByKey = new Map(((rollups as RollupRow[]) ?? []).map((r) => [r.customer_key, r]));

  type Eligible = RollupRow & {
    trigger_order_id: string;
    expected_pickup_date: string;
  };
  const eligible: Eligible[] = [];
  for (const [key, best] of bestByKey) {
    const rollup = rollupByKey.get(key);
    const primary_email = rollup?.primary_email?.trim() || best.order.Email?.trim() || null;
    const line_user_id = rollup?.line_user_id?.trim() || best.order.line_user_id?.trim() || null;
    const has_line = Boolean(line_user_id) || Boolean(rollup?.has_line);
    const has_email = Boolean(primary_email) || Boolean(rollup?.has_email);
    if (!has_line && !has_email) continue;
    eligible.push({
      customer_key: key,
      customer_name:
        rollup?.customer_name || best.order.who_receive || best.order.orderer_name || null,
      last_purchase_at: rollup?.last_purchase_at ?? best.order.created_at,
      primary_email,
      line_user_id,
      has_line,
      has_email,
      trigger_order_id: best.order.id,
      expected_pickup_date: best.pickup,
    });
  }

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of eligible) {
    try {
      const { data: crm } = await supabase
        .from("order_customer_crm")
        .select("wakeup_opt_out")
        .eq("customer_key", row.customer_key)
        .maybeSingle();
      if (crm?.wakeup_opt_out) {
        skipped += 1;
        continue;
      }

      const { data: pending } = await supabase
        .from("customer_wakeup_drafts")
        .select("id")
        .eq("customer_key", row.customer_key)
        .eq("status", "pending_review")
        .maybeSingle();
      if (pending?.id) {
        skipped += 1;
        continue;
      }

      const channel = resolveChannel(row);
      if (!channel) {
        skipped += 1;
        continue;
      }

      const triggerOrderId = row.trigger_order_id;

      const { data: sent } = await supabase
        .from("customer_wakeup_drafts")
        .select("id")
        .eq("trigger_order_id", triggerOrderId)
        .eq("status", "sent")
        .maybeSingle();
      if (sent?.id) {
        skipped += 1;
        continue;
      }

      let products: string[] = [];
      {
        const { data: items } = await supabase
          .from("order_items")
          .select("product_name")
          .eq("order_id", triggerOrderId)
          .limit(8);
        products = [
          ...new Set(
            (items ?? [])
              .map((i) => (i.product_name as string | null)?.trim() || null)
              .filter((v): v is string => Boolean(v)),
          ),
        ];
      }

      let chatSnippets: string[] = [];
      let customerMessages: string[] = [];
      if (channel.line_user_id) {
        const { data: logs } = await supabase
          .from("line_log")
          .select("user_text, admin_reply")
          .eq("user_id", channel.line_user_id)
          .order("received_at", { ascending: false })
          .limit(40);
        const chronological = [...(logs ?? [])].reverse();
        customerMessages = chronological
          .map((l) => (l.user_text as string | null)?.trim())
          .filter((v): v is string => Boolean(v))
          .slice(-24);
        chatSnippets = chronological
          .map((l) => [l.user_text, l.admin_reply].filter(Boolean).join(" / "))
          .filter(Boolean) as string[];
      }

      const { text, model } = await openaiDraft({
        name: row.customer_name,
        products,
        lastPurchaseAt: row.expected_pickup_date,
        chatSnippets,
        customerMessages,
      });

      const ts = new Date().toISOString();
      const { error: insertErr } = await supabase.from("customer_wakeup_drafts").insert({
        customer_key: row.customer_key,
        trigger_order_id: triggerOrderId,
        last_purchase_at: row.expected_pickup_date,
        channel: channel.channel,
        line_user_id: channel.line_user_id,
        email: channel.email,
        draft_text: text,
        status: "pending_review",
        source: "cron_14d_pickup",
        metadata: {
          model,
          products,
          customer_name: row.customer_name,
          expected_pickup_date: row.expected_pickup_date,
        },
        created_at: ts,
        updated_at: ts,
      });

      if (insertErr) {
        if (insertErr.code === "23505") {
          skipped += 1;
        } else {
          failed += 1;
          console.error("[wakeup-draft-cron] insert", row.customer_key, insertErr);
        }
        continue;
      }
      created += 1;
    } catch (e) {
      failed += 1;
      console.error("[wakeup-draft-cron] row error", row.customer_key, e);
    }
  }

  if (created > 0) {
    const message =
      `🍰 今日新增 ${created} 筆「取件後 14 天」喚醒草稿待審（略過 ${skipped}、失敗 ${failed}）。請至後台「AI喚醒客戶草稿」審核後再發送。`;
    const { data: adminRows } = await supabase.from("admin_line_user_ids").select("line_user_id");
    const adminIds = [
      ...new Set(
        (adminRows ?? [])
          .map((r) => (r.line_user_id as string | null)?.trim())
          .filter((v): v is string => Boolean(v)),
      ),
    ];
    const targets = adminIds.length > 0 ? adminIds : ["Ue6499ae132e994266ea500b976a3277c"];

    for (const lineUserId of targets) {
      try {
        await fetch(N8N_LINE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: "crm_wakeup",
            event_type: "wakeup_draft_admin_notify",
            line_user_id: lineUserId,
            to: lineUserId,
            notification_channel: "line",
            status_message: message,
            messages: [{ type: "text", text: message }],
          }),
        });
      } catch (e) {
        console.error("[wakeup-draft-cron] admin notify failed", e);
      }
    }

    const notifiedAt = new Date().toISOString();
    await supabase
      .from("customer_wakeup_drafts")
      .update({ admin_notified_at: notifiedAt, updated_at: notifiedAt })
      .eq("status", "pending_review")
      .eq("source", "cron_14d_pickup")
      .is("admin_notified_at", null);
  }

  return new Response(
    JSON.stringify({
      success: true,
      eligible: eligible.length,
      created,
      skipped,
      failed,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
