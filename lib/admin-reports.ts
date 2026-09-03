import type { SupabaseClient } from "@supabase/supabase-js";
import { startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";

/** 儀表板長條圖／月年報告營收：待付款＋處理中＋出貨中＋已送達（不含取消、退貨） */
export const REVENUE_ORDER_STATUSES = [
  "awaiting_payment",
  "processing",
  "shipped",
  "delivered",
] as const;

/** 已匯款／實收：付款步驟已確認到帳（其餘進未匯款） */
export const REVENUE_PAYMENT_STEP = "verified" as const;

/** 與客戶類型圓餅／備註筆數一致 */
export const ANALYTICS_ORDER_STATUSES = REVENUE_ORDER_STATUSES;

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
  /** 實收：已確認到帳（payment_step=verified） */
  revenue_ntd: number;
  /** 含未收款：同訂單狀態集合，不限付款狀態（＝長條圖「總營收」） */
  revenue_incl_unpaid_ntd: number;
  order_count: number;
  /** 待付款／處理中／出貨中／已送達 且 payment_step=verified 的筆數（客單價分母） */
  verified_order_count: number;
  /** 實收營收 ÷ verified_order_count */
  aov_verified_ntd: number;
  customer_type_breakdown: CustomerTypeCountRow[];
  top_product_name: string | null;
  generated_at: string;
}

export interface YearlyReportPayload {
  report_type: "yearly";
  year: number;
  /** 實收：已確認到帳（payment_step=verified） */
  revenue_ntd: number;
  /** 含未收款：同訂單狀態集合，不限付款狀態（＝長條圖「總營收」） */
  revenue_incl_unpaid_ntd: number;
  order_count: number;
  verified_order_count: number;
  aov_verified_ntd: number;
  customer_type_breakdown: CustomerTypeCountRow[];
  top_products: { name: string; count: number }[];
  generated_at: string;
}

const IN_CHUNK = 450;
/** PostgREST 預設最多回 1000 列；全年查詢不翻頁會讓後段月份的單消失 */
const PAGE_SIZE = 1000;

/**
 * 依建立日取期間內訂單，自動翻頁。不改營收規則，只避免被 1000 筆截斷。
 */
export async function fetchOrdersCreatedInRange<T>(
  client: SupabaseClient,
  rangeStart: Date,
  rangeEnd: Date,
  select: string,
  statuses?: readonly string[],
): Promise<T[]> {
  const acc: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const filtered =
      statuses && statuses.length > 0
        ? client
            .from("orders")
            .select(select)
            .in("order_status", [...statuses])
            .gte("created_at", rangeStart.toISOString())
            .lte("created_at", rangeEnd.toISOString())
        : client
            .from("orders")
            .select(select)
            .gte("created_at", rangeStart.toISOString())
            .lte("created_at", rangeEnd.toISOString());
    const { data, error } = await filtered
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as T[];
    acc.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return acc;
}

async function fetchOrderIdsInRange(
  client: SupabaseClient,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<string[]> {
  const rows = await fetchOrdersCreatedInRange<{ id: string }>(
    client,
    rangeStart,
    rangeEnd,
    "id",
  );
  return rows.map((r) => r.id);
}

/**
 * 同訂單狀態集合下，一次算出「實收（已確認到帳）」與「含未收款的總額」。
 * paid＝payment_step=verified 的加總；gross＝全部（不限付款狀態）的加總。
 */
async function sumRevenueBreakdownInRange(
  client: SupabaseClient,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<{ paid: number; gross: number; verified_count: number }> {
  const rows = await fetchOrdersCreatedInRange<{ total_amount?: number; payment_step?: string }>(
    client,
    rangeStart,
    rangeEnd,
    "total_amount, payment_step",
    REVENUE_ORDER_STATUSES,
  );

  let paid = 0;
  let gross = 0;
  let verified_count = 0;
  rows.forEach((r) => {
    const amt = Number(r.total_amount ?? 0);
    gross += amt;
    if (r.payment_step === REVENUE_PAYMENT_STEP) {
      paid += amt;
      verified_count += 1;
    }
  });
  return { paid, gross, verified_count };
}

async function fetchAnalyticsOrdersInRange(
  client: SupabaseClient,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<{ customer_type: string | null }[]> {
  return fetchOrdersCreatedInRange<{ customer_type: string | null }>(
    client,
    rangeStart,
    rangeEnd,
    "customer_type",
    ANALYTICS_ORDER_STATUSES,
  );
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

  const [revenue, analyticsRows, orderIds] = await Promise.all([
    sumRevenueBreakdownInRange(client, rangeStart, rangeEnd),
    fetchAnalyticsOrdersInRange(client, rangeStart, rangeEnd),
    fetchOrderIdsInRange(client, rangeStart, rangeEnd),
  ]);

  const customer_type_breakdown = breakdownFromRows(analyticsRows);
  const order_count = analyticsRows.length;
  const top = await topProductsFromOrderIds(client, orderIds, 1);
  const top_product_name = top[0]?.name ?? null;

  const verified_order_count = revenue.verified_count;
  const aov_verified_ntd =
    verified_order_count > 0 ? Math.round(revenue.paid / verified_order_count) : 0;

  return {
    report_type: "monthly",
    year,
    month,
    revenue_ntd: revenue.paid,
    revenue_incl_unpaid_ntd: revenue.gross,
    order_count,
    verified_order_count,
    aov_verified_ntd,
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

  const [revenue, analyticsRows, orderIds] = await Promise.all([
    sumRevenueBreakdownInRange(client, rangeStart, rangeEnd),
    fetchAnalyticsOrdersInRange(client, rangeStart, rangeEnd),
    fetchOrderIdsInRange(client, rangeStart, rangeEnd),
  ]);

  const customer_type_breakdown = breakdownFromRows(analyticsRows);
  const order_count = analyticsRows.length;
  const top_products = await topProductsFromOrderIds(client, orderIds, 3);

  const verified_order_count = revenue.verified_count;
  const aov_verified_ntd =
    verified_order_count > 0 ? Math.round(revenue.paid / verified_order_count) : 0;

  return {
    report_type: "yearly",
    year,
    revenue_ntd: revenue.paid,
    revenue_incl_unpaid_ntd: revenue.gross,
    order_count,
    verified_order_count,
    aov_verified_ntd,
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
