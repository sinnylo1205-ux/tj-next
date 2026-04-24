import type { SupabaseClient } from "@supabase/supabase-js";
import { startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";

/** 與儀表板「訂單營收」一致 */
export const REVENUE_ORDER_STATUSES = ["processing", "shipped", "delivered"] as const;

/** 與客戶類型圓餅／備註筆數一致 */
export const ANALYTICS_ORDER_STATUSES = [
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
  /** 遷移前舊值；報表／快取若仍見到此字串則顯示為公關代理 */
  pr_agency: "公關代理",
};

export function customerTypeDisplayLabel(raw: string | null | undefined): string {
  if (raw == null || raw === "") return "未設定";
  return CUSTOMER_TYPE_LABELS[raw] ?? raw;
}

/** 熱門商品統計：商品名稱含「幸運」者合併為同一列，不拆成多個品名 */
export function canonicalPopularProductName(displayName: string): string {
  const t = (displayName ?? "").trim();
  if (t.includes("幸運")) return "幸運籤餅／相關品項";
  return t;
}

export const ADMIN_REPORT_WEBHOOK_URL = "https://tjcookies.app.n8n.cloud/webhook/report";

export interface CustomerTypeCountRow {
  label: string;
  count: number;
}

export interface MonthlyReportPayload {
  report_type: "monthly";
  year: number;
  month: number;
  revenue_ntd: number;
  order_count: number;
  customer_type_breakdown: CustomerTypeCountRow[];
  top_product_name: string | null;
  generated_at: string;
}

export interface YearlyReportPayload {
  report_type: "yearly";
  year: number;
  revenue_ntd: number;
  order_count: number;
  customer_type_breakdown: CustomerTypeCountRow[];
  top_products: { name: string; count: number }[];
  generated_at: string;
}

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
  return (data ?? []).map((r) => r.id as string);
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
  return (data ?? []).reduce((s, r) => s + Number((r as { total_amount?: number }).total_amount ?? 0), 0);
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

export async function buildMonthlyReportPayload(
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
  const top_product_name = top[0]?.name ?? null;

  return {
    report_type: "monthly",
    year,
    month,
    revenue_ntd,
    order_count,
    customer_type_breakdown,
    top_product_name,
    generated_at: new Date().toISOString(),
  };
}

export async function buildYearlyReportPayload(
  client: SupabaseClient,
  year: number,
): Promise<YearlyReportPayload> {
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

/** 實際排程送 webhook 請用 Edge Function `admin-reports`；此函式僅供本機／腳本需要時呼叫 */
export async function postReportToWebhook(payload: MonthlyReportPayload | YearlyReportPayload): Promise<Response> {
  return fetch(ADMIN_REPORT_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/** Cron：每月 28 日（UTC）觸發月度；各月皆有 28 號，無需 2 月特例 */
export function shouldSendMonthlyReportCron(now: Date): boolean {
  return now.getUTCDate() === 28;
}

/** Cron：每年 12/30（UTC）觸發年度 */
export function shouldSendYearlyReportCron(now: Date): boolean {
  return now.getUTCMonth() === 11 && now.getUTCDate() === 30;
}
