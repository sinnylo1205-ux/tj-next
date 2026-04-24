/**
 * 管理後台報告 — 依排程 POST JSON 至 n8n webhook
 *
 * 觸發方式（擇一）：
 * 1. Supabase Dashboard → Edge Functions → 建立 Cron（或 Database → pg_cron + net.http_post）
 * 2. 手動：curl -H "x-cron-secret: $CRON_SECRET" "$SUPABASE_URL/functions/v1/admin-reports"
 * 3. Query：?force=monthly|yearly|both&year=2026&month=3&dryRun=1
 *
 * 排程邏輯（UTC）：
 * - 每月 28 日送「當月」報告（各月皆有 28 號）
 * - 每年 12/30 另送「當年」報告
 *
 * 環境變數：CRON_SECRET、SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY（預設由平台注入）
 */
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  endOfMonth,
  endOfYear,
  startOfMonth,
  startOfYear,
} from "https://esm.sh/date-fns@4.1.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const REPORT_WEBHOOK_URL = "https://tjcookies.app.n8n.cloud/webhook/report";

/** 熱門商品：名稱含「幸運」者合併統計（與 lib/admin-reports.ts 一致） */
function canonicalPopularProductName(displayName: string): string {
  const t = (displayName ?? "").trim();
  if (t.includes("幸運")) return "幸運籤餅／相關品項";
  return t;
}

const REVENUE_ORDER_STATUSES = ["processing", "shipped", "delivered"] as const;
const ANALYTICS_ORDER_STATUSES = [
  "awaiting_payment",
  "processing",
  "shipped",
  "delivered",
] as const;

const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  general: "一般用戶",
  flash_ip: "快閃店／IP",
  pr_agent: "公關代理",
  company_self: "公司自己",
  pr_agency: "公關代理",
};

function customerTypeDisplayLabel(raw: string | null | undefined): string {
  if (raw == null || raw === "") return "未設定";
  return CUSTOMER_TYPE_LABELS[raw] ?? raw;
}

type CustomerTypeCountRow = { label: string; count: number };

type MonthlyReportPayload = {
  report_type: "monthly";
  year: number;
  month: number;
  revenue_ntd: number;
  order_count: number;
  customer_type_breakdown: CustomerTypeCountRow[];
  top_product_name: string | null;
  generated_at: string;
};

type YearlyReportPayload = {
  report_type: "yearly";
  year: number;
  revenue_ntd: number;
  order_count: number;
  customer_type_breakdown: CustomerTypeCountRow[];
  top_products: { name: string; count: number }[];
  generated_at: string;
};

const IN_CHUNK = 450;

async function fetchOrderIdsInRange(
  client: SupabaseClient,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<string[]> {
  const { data, error } = await client
    .from("orders")
    .select("id")
    .gte("created_at", rangeStart.toISOString())
    .lte("created_at", rangeEnd.toISOString());
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: { id: string }) => r.id);
}

async function sumRevenueInRange(
  client: SupabaseClient,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<number> {
  const { data, error } = await client
    .from("orders")
    .select("total_amount")
    .in("order_status", [...REVENUE_ORDER_STATUSES])
    .gte("created_at", rangeStart.toISOString())
    .lte("created_at", rangeEnd.toISOString());
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((s: number, r: { total_amount?: number }) => s + Number(r.total_amount ?? 0), 0);
}

async function fetchAnalyticsOrdersInRange(
  client: SupabaseClient,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<{ customer_type: string | null }[]> {
  const { data, error } = await client
    .from("orders")
    .select("customer_type")
    .in("order_status", [...ANALYTICS_ORDER_STATUSES])
    .gte("created_at", rangeStart.toISOString())
    .lte("created_at", rangeEnd.toISOString());
  if (error) throw new Error(error.message);
  return (data ?? []) as { customer_type: string | null }[];
}

function breakdownFromRows(rows: { customer_type: string | null }[]): CustomerTypeCountRow[] {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    const key = row.customer_type?.trim() || "";
    const label = customerTypeDisplayLabel(key || null);
    map.set(label, (map.get(label) ?? 0) + 1);
  });
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

async function topProductsFromOrderIds(
  client: SupabaseClient,
  orderIds: string[],
  limit: number,
): Promise<{ name: string; count: number }[]> {
  if (orderIds.length === 0) return [];

  const { data: products } = await client.from("products").select("id, name");
  const productNameMap = new Map<string, string>();
  (products ?? []).forEach((p: { id: string; name: string | null }) => {
    productNameMap.set(p.id, p.name || p.id);
  });

  const productCount = new Map<string, number>();
  for (let i = 0; i < orderIds.length; i += IN_CHUNK) {
    const chunk = orderIds.slice(i, i + IN_CHUNK);
    const { data: items, error } = await client
      .from("order_items")
      .select("product_id, product_name")
      .in("order_id", chunk);
    if (error) throw new Error(error.message);
    (items ?? []).forEach((item: { product_id: string; product_name: string | null }) => {
      const raw = productNameMap.get(item.product_id) || item.product_name || item.product_id;
      const displayName = canonicalPopularProductName(raw);
      productCount.set(displayName, (productCount.get(displayName) ?? 0) + 1);
    });
  }

  return Array.from(productCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

async function buildMonthlyReportPayload(
  client: SupabaseClient,
  year: number,
  month: number,
): Promise<MonthlyReportPayload> {
  const d = new Date(year, month - 1, 1);
  const rangeStart = startOfMonth(d);
  const rangeEnd = endOfMonth(d);

  const [revenue_ntd, analyticsRows, orderIds] = await Promise.all([
    sumRevenueInRange(client, rangeStart, rangeEnd),
    fetchAnalyticsOrdersInRange(client, rangeStart, rangeEnd),
    fetchOrderIdsInRange(client, rangeStart, rangeEnd),
  ]);

  const customer_type_breakdown = breakdownFromRows(analyticsRows);
  const order_count = analyticsRows.length;
  const top = await topProductsFromOrderIds(client, orderIds, 1);

  return {
    report_type: "monthly",
    year,
    month,
    revenue_ntd,
    order_count,
    customer_type_breakdown,
    top_product_name: top[0]?.name ?? null,
    generated_at: new Date().toISOString(),
  };
}

async function buildYearlyReportPayload(client: SupabaseClient, year: number): Promise<YearlyReportPayload> {
  const rangeStart = startOfYear(new Date(year, 0, 1));
  const rangeEnd = endOfYear(new Date(year, 0, 1));

  const [revenue_ntd, analyticsRows, orderIds] = await Promise.all([
    sumRevenueInRange(client, rangeStart, rangeEnd),
    fetchAnalyticsOrdersInRange(client, rangeStart, rangeEnd),
    fetchOrderIdsInRange(client, rangeStart, rangeEnd),
  ]);

  const customer_type_breakdown = breakdownFromRows(analyticsRows);
  const order_count = analyticsRows.length;
  const top_products = await topProductsFromOrderIds(client, orderIds, 3);

  return {
    report_type: "yearly",
    year,
    revenue_ntd,
    order_count,
    customer_type_breakdown,
    top_products,
    generated_at: new Date().toISOString(),
  };
}

async function postWebhook(payload: MonthlyReportPayload | YearlyReportPayload): Promise<Response> {
  return fetch(REPORT_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function shouldSendMonthlyReportCron(now: Date): boolean {
  return now.getUTCDate() === 28;
}

function shouldSendYearlyReportCron(now: Date): boolean {
  return now.getUTCMonth() === 11 && now.getUTCDate() === 30;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = Deno.env.get("CRON_SECRET");
  if (!expectedSecret || cronSecret !== expectedSecret) {
    console.error("[admin-reports] Invalid or missing x-cron-secret");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const client = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const url = new URL(req.url);
    const force = url.searchParams.get("force");
    const dryRun = url.searchParams.get("dryRun") === "1" || url.searchParams.get("dryRun") === "true";

    const sent: string[] = [];
    const payloads: unknown[] = [];

    if (force === "monthly") {
      const now = new Date();
      const year = parseInt(url.searchParams.get("year") ?? String(now.getUTCFullYear()), 10);
      const month = parseInt(url.searchParams.get("month") ?? String(now.getUTCMonth() + 1), 10);
      const payload = await buildMonthlyReportPayload(client, year, month);
      payloads.push(payload);
      if (!dryRun) {
        const res = await postWebhook(payload);
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          return new Response(JSON.stringify({ error: "Webhook failed", status: res.status, body: t }), {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      sent.push("monthly");
      return new Response(JSON.stringify({ ok: true, dryRun, sent, payloads }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (force === "yearly") {
      const now = new Date();
      const year = parseInt(url.searchParams.get("year") ?? String(now.getUTCFullYear()), 10);
      const payload = await buildYearlyReportPayload(client, year);
      payloads.push(payload);
      if (!dryRun) {
        const res = await postWebhook(payload);
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          return new Response(JSON.stringify({ error: "Webhook failed", status: res.status, body: t }), {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      sent.push("yearly");
      return new Response(JSON.stringify({ ok: true, dryRun, sent, payloads }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (force === "both") {
      const now = new Date();
      const y = parseInt(url.searchParams.get("year") ?? String(now.getUTCFullYear()), 10);
      const m = parseInt(url.searchParams.get("month") ?? String(now.getUTCMonth() + 1), 10);
      const monthly = await buildMonthlyReportPayload(client, y, m);
      const yearly = await buildYearlyReportPayload(client, y);
      payloads.push(monthly, yearly);
      if (!dryRun) {
        for (const p of [monthly, yearly]) {
          const res = await postWebhook(p);
          if (!res.ok) {
            const t = await res.text().catch(() => "");
            return new Response(JSON.stringify({ error: "Webhook failed", status: res.status, body: t }), {
              status: 502,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      }
      sent.push("monthly", "yearly");
      return new Response(JSON.stringify({ ok: true, dryRun, sent, payloads }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();

    if (shouldSendMonthlyReportCron(now)) {
      const y = now.getUTCFullYear();
      const m = now.getUTCMonth() + 1;
      const payload = await buildMonthlyReportPayload(client, y, m);
      payloads.push(payload);
      if (!dryRun) {
        const res = await postWebhook(payload);
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          console.error("[admin-reports] Monthly webhook failed:", res.status, t);
          return new Response(JSON.stringify({ error: "Monthly webhook failed", status: res.status, body: t }), {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      sent.push(`monthly:${y}-${m}`);
    }

    if (shouldSendYearlyReportCron(now)) {
      const y = now.getUTCFullYear();
      const payload = await buildYearlyReportPayload(client, y);
      payloads.push(payload);
      if (!dryRun) {
        const res = await postWebhook(payload);
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          console.error("[admin-reports] Yearly webhook failed:", res.status, t);
          return new Response(JSON.stringify({ error: "Yearly webhook failed", status: res.status, body: t }), {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      sent.push(`yearly:${y}`);
    }

    if (sent.length === 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          skipped: true,
          message: "非排程日（每月 28 UTC 送月度；12/30 UTC 送年度）",
          utc: now.toISOString(),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ ok: true, dryRun, sent, payloads }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[admin-reports]", e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
