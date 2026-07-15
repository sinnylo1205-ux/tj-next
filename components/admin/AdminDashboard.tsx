import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { format, startOfYear, endOfYear, startOfMonth, endOfMonth } from "date-fns";
import { zhTW } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildMonthlyReportPayload,
  buildYearlyReportPayload,
  canonicalPopularProductName,
  customerTypeDisplayLabel,
  REVENUE_PAYMENT_STEP,
  type MonthlyReportPayload,
  type YearlyReportPayload,
} from "@/lib/admin-reports";

/** 營收長條圖：每月三柱 — 總額、已確認到帳、尚未確認（未匯款／待確認） */
interface MonthlyRevenue {
  month: string;
  /** yyyy-MM，供點擊明細與資料對齊 */
  monthKey: string;
  totalRevenue: number;
  paidRevenue: number;
  unpaidRevenue: number;
}

interface RevenueOrderDetailRow {
  id: string;
  /** 收件人（orders.who_receive），不用會員帳號姓名 */
  recipientName: string;
  pickupDate: string | null;
  amount: number;
}

function formatPickupDisplay(value: string | null | undefined): string {
  if (value == null || String(value).trim() === "") return "—";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value).trim();
  return format(dt, "yyyy/MM/dd", { locale: zhTW });
}

interface ProductPopularity {
  product_name: string;
  count: number;
}

interface MonthlyOrderCount {
  month: string;
  count: number;
}

/** 未在表內的客戶類型名稱：仍用品牌色階輪替 */
const BRAND_SLICE_FALLBACK_FILLS = [
  "hsl(var(--primary))",
  "hsl(var(--color-brand-600))",
  "hsl(var(--color-brand-500))",
  "hsl(var(--color-brand-300))",
  "hsl(var(--ring))",
] as const;

/**
 * 客戶類型圓餅圖：須含「待付款」— 多數訂單打完標籤時尚未進入處理中，若僅統計 processing+ 會變成 0 筆。
 * 排除已取消、退貨。
 */
const CUSTOMER_TYPE_PIE_STATUSES = [
  "awaiting_payment",
  "processing",
  "shipped",
  "delivered",
] as const;

/** 圓餅扇形：皆為品牌玫瑰／粉階 */
const CUSTOMER_TYPE_PIE_FILL: Record<string, string> = {
  一般用戶: "hsl(var(--primary))",
  公關代理: "hsl(var(--color-brand-500))",
  公司自己: "hsl(var(--color-brand-300))",
  "快閃店／IP": "hsl(var(--color-brand-600))",
  "快閃店/IP": "hsl(var(--color-brand-600))",
  未設定: "hsl(var(--color-brand-100))",
  "公關公司／福委會": "hsl(var(--color-brand-500))",
};

const ORDER_CHANNEL_PIE_FILL: Record<string, string> = {
  網站自行下單: "hsl(var(--primary))",
  手動建立: "hsl(var(--color-brand-500))",
};

function pieColorForName(name: string): string {
  const fill = CUSTOMER_TYPE_PIE_FILL[name] ?? ORDER_CHANNEL_PIE_FILL[name];
  if (fill) return fill;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) % BRAND_SLICE_FALLBACK_FILLS.length;
  return BRAND_SLICE_FALLBACK_FILLS[h];
}

/** 客戶類型圓餅：value = 該類型訂單筆數（扇形比例）；營收＝實收、客單價＝實收÷已確認筆數，供標籤與 Tooltip */
interface CustomerTypePieSlice {
  name: string;
  value: number;
  revenue: number;
  aov: number;
  key: string;
}

/** 依所選年度與今天日期，決定營收圖預設顯示上半年或下半年 */
function defaultRevenueHalfYear(forYear: number): 1 | 2 {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  if (forYear < currentYear) return 2;
  if (forYear > currentYear) return 1;
  return currentMonth <= 6 ? 1 : 2;
}

const AdminDashboard = () => {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  /** 營收長條圖：1＝1–6 月、2＝7–12 月，避免 12 個月三柱過擠 */
  const [revenueHalfYear, setRevenueHalfYear] = useState<1 | 2>(() =>
    defaultRevenueHalfYear(new Date().getFullYear()),
  );
  const [revenueData, setRevenueData] = useState<MonthlyRevenue[]>([]);
  const [popularProducts, setPopularProducts] = useState<ProductPopularity[]>([]);
  const [orderCountData, setOrderCountData] = useState<MonthlyOrderCount[]>([]);
  const [tagPeriod, setTagPeriod] = useState<"month" | "year">("month");
  const [tagMonth, setTagMonth] = useState(() => new Date().getMonth() + 1);
  const [popularPeriod, setPopularPeriod] = useState<"month" | "year">("year");
  const [popularMonth, setPopularMonth] = useState(() => new Date().getMonth() + 1);
  const [customerTypePieData, setCustomerTypePieData] = useState<CustomerTypePieSlice[]>([]);
  const [orderChannelPieData, setOrderChannelPieData] = useState<CustomerTypePieSlice[]>([]);
  const [monthlyReport, setMonthlyReport] = useState<MonthlyReportPayload | null>(null);
  const [yearlyReport, setYearlyReport] = useState<YearlyReportPayload | null>(null);
  const [monthlyReportYear, setMonthlyReportYear] = useState(() => new Date().getFullYear());
  const [monthlyReportMonth, setMonthlyReportMonth] = useState(() => new Date().getMonth() + 1);
  const [yearlyReportYear, setYearlyReportYear] = useState(() => new Date().getFullYear());
  const [reportLoading, setReportLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  const [revenueDetailOpen, setRevenueDetailOpen] = useState(false);
  const [revenueDetailTitle, setRevenueDetailTitle] = useState("");
  const [revenueDetailLoading, setRevenueDetailLoading] = useState(false);
  const [revenueDetailPaid, setRevenueDetailPaid] = useState<RevenueOrderDetailRow[]>([]);
  const [revenueDetailUnpaid, setRevenueDetailUnpaid] = useState<RevenueOrderDetailRow[]>([]);
  const [revenueDetailError, setRevenueDetailError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, [selectedYear, tagPeriod, tagMonth, popularPeriod, popularMonth]);

  useEffect(() => {
    void loadReportSummaries();
  }, [monthlyReportYear, monthlyReportMonth, yearlyReportYear]);

  useEffect(() => {
    setRevenueHalfYear(defaultRevenueHalfYear(selectedYear));
  }, [selectedYear]);

  const reportYearOptions = useMemo(() => {
    const y = new Date().getFullYear();
    return Array.from({ length: y - 2019 }, (_, i) => y - i);
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    await Promise.all([
      loadRevenueData(),
      loadPopularProducts(),
      loadOrderCountData(),
      loadCustomerTypeCharts(),
    ]);
    setLoading(false);
  };

  const loadReportSummaries = async () => {
    setReportLoading(true);
    try {
      const [monthly, yearly] = await Promise.all([
        buildMonthlyReportPayload(supabase, monthlyReportYear, monthlyReportMonth),
        buildYearlyReportPayload(supabase, yearlyReportYear),
      ]);
      setMonthlyReport(monthly);
      setYearlyReport(yearly);
    } catch (err) {
      console.error("loadReportSummaries:", err);
      setMonthlyReport(null);
      setYearlyReport(null);
    } finally {
      setReportLoading(false);
    }
  };

  const loadCustomerTypeCharts = async () => {
    let rangeStart: Date;
    let rangeEnd: Date;
    if (tagPeriod === "year") {
      rangeStart = startOfYear(new Date(selectedYear, 0, 1));
      rangeEnd = endOfYear(new Date(selectedYear, 0, 1));
    } else {
      const d = new Date(selectedYear, tagMonth - 1, 1);
      rangeStart = startOfMonth(d);
      rangeEnd = endOfMonth(d);
    }

    const { data: orders, error } = await supabase
      .from("orders")
      .select("customer_type, total_amount, payment_step, is_manual_order")
      .in("order_status", [...CUSTOMER_TYPE_PIE_STATUSES])
      .gte("created_at", rangeStart.toISOString())
      .lte("created_at", rangeEnd.toISOString());

    if (error) {
      console.error("Error loading customer type stats:", error);
      setCustomerTypePieData([]);
      setOrderChannelPieData([]);
      return;
    }

    const countMap = new Map<string, number>();
    const revenueMap = new Map<string, number>();
    const verifiedCountMap = new Map<string, number>();

    (orders || []).forEach((row) => {
      const key = row.customer_type?.trim() || "";
      const label = customerTypeDisplayLabel(key || null);

      countMap.set(label, (countMap.get(label) ?? 0) + 1);

      const amt = Number(row.total_amount ?? 0);
      if (row.payment_step === REVENUE_PAYMENT_STEP) {
        revenueMap.set(label, (revenueMap.get(label) ?? 0) + amt);
        verifiedCountMap.set(label, (verifiedCountMap.get(label) ?? 0) + 1);
      }
    });

    const slices: CustomerTypePieSlice[] = Array.from(countMap.entries()).map(([name, count]) => {
      const revenue = revenueMap.get(name) ?? 0;
      const verifiedCount = verifiedCountMap.get(name) ?? 0;
      const aov = verifiedCount > 0 ? Math.round(revenue / verifiedCount) : 0;
      return { name, value: count, revenue, aov, key: name };
    });

    slices.sort((a, b) => b.value - a.value);
    setCustomerTypePieData(slices);

    let manualCount = 0;
    let websiteCount = 0;
    let manualRevenue = 0;
    let websiteRevenue = 0;
    let manualVerified = 0;
    let websiteVerified = 0;

    (orders || []).forEach((row) => {
      const isManual = Boolean(row.is_manual_order);
      const amt = Number(row.total_amount ?? 0);
      const verified = row.payment_step === REVENUE_PAYMENT_STEP;
      if (isManual) {
        manualCount += 1;
        if (verified) {
          manualRevenue += amt;
          manualVerified += 1;
        }
      } else {
        websiteCount += 1;
        if (verified) {
          websiteRevenue += amt;
          websiteVerified += 1;
        }
      }
    });

    const channelSlices: CustomerTypePieSlice[] = [
      {
        name: "網站自行下單",
        value: websiteCount,
        revenue: websiteRevenue,
        aov: websiteVerified > 0 ? Math.round(websiteRevenue / websiteVerified) : 0,
        key: "website",
      },
      {
        name: "手動建立",
        value: manualCount,
        revenue: manualRevenue,
        aov: manualVerified > 0 ? Math.round(manualRevenue / manualVerified) : 0,
        key: "manual",
      },
    ];

    setOrderChannelPieData(manualCount + websiteCount > 0 ? channelSlices : []);
  };

  // 月營收長條：同 cohort（處理中／出貨中／已送達）拆成總額、已確認到帳、尚未確認金額
  const loadRevenueData = async () => {
    const yearStart = startOfYear(new Date(selectedYear, 0, 1));
    const yearEnd = endOfYear(new Date(selectedYear, 0, 1));

    const { data: orders, error } = await supabase
      .from("orders")
      .select("total_amount, created_at, payment_step")
      .in("order_status", ["processing", "shipped", "delivered"])
      .gte("created_at", yearStart.toISOString())
      .lte("created_at", yearEnd.toISOString());

    if (error) {
      console.error("Error loading revenue:", error);
      return;
    }

    const paidMap = new Map<string, number>();
    const unpaidMap = new Map<string, number>();
    for (let i = 0; i < 12; i++) {
      const monthKey = `${selectedYear}-${String(i + 1).padStart(2, "0")}`;
      paidMap.set(monthKey, 0);
      unpaidMap.set(monthKey, 0);
    }

    (orders || []).forEach((order) => {
      const monthKey = format(new Date(order.created_at), "yyyy-MM");
      if (!paidMap.has(monthKey)) return;
      const amt = Number(order.total_amount ?? 0);
      if (order.payment_step === REVENUE_PAYMENT_STEP) {
        paidMap.set(monthKey, (paidMap.get(monthKey) || 0) + amt);
      } else {
        unpaidMap.set(monthKey, (unpaidMap.get(monthKey) || 0) + amt);
      }
    });

    const data: MonthlyRevenue[] = Array.from(paidMap.keys())
      .sort()
      .map((monthKey) => {
        const paid = paidMap.get(monthKey) || 0;
        const unpaid = unpaidMap.get(monthKey) || 0;
        return {
          month: format(new Date(monthKey + "-01"), "M月", { locale: zhTW }),
          monthKey,
          totalRevenue: paid + unpaid,
          paidRevenue: paid,
          unpaidRevenue: unpaid,
        };
      });

    setRevenueData(data);
  };

  // 載入熱門商品（前5名）：可選當年或當月（依上方年份與月份）
  const loadPopularProducts = async () => {
    let rangeStart: Date;
    let rangeEnd: Date;
    if (popularPeriod === "year") {
      rangeStart = startOfYear(new Date(selectedYear, 0, 1));
      rangeEnd = endOfYear(new Date(selectedYear, 0, 1));
    } else {
      const d = new Date(selectedYear, popularMonth - 1, 1);
      rangeStart = startOfMonth(d);
      rangeEnd = endOfMonth(d);
    }

    // 先載入產品名稱對照表
    const { data: products } = await supabase.from("products").select("id, name");

    const productNameMap = new Map<string, string>();
    (products || []).forEach((p) => {
      productNameMap.set(p.id, p.name || p.id);
    });

    const { data: ordersData } = await supabase
      .from("orders")
      .select("id, created_at")
      .gte("created_at", rangeStart.toISOString())
      .lte("created_at", rangeEnd.toISOString());

    if (!ordersData || ordersData.length === 0) {
      setPopularProducts([]);
      return;
    }

    const orderIds = ordersData.map((o) => o.id);

    const { data: items, error } = await supabase
      .from("order_items")
      .select("product_id, product_name, order_id")
      .in("order_id", orderIds);

    if (error) {
      console.error("Error loading popular products:", error);
      return;
    }

    // 統計每個產品出現次數
    const productCount = new Map<string, number>();
    (items || []).forEach((item) => {
      const raw = productNameMap.get(item.product_id) || item.product_name || item.product_id;
      const displayName = canonicalPopularProductName(typeof raw === "string" ? raw : String(raw));
      productCount.set(displayName, (productCount.get(displayName) || 0) + 1);
    });

    // 排序取前5名
    const sorted = Array.from(productCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([product_name, count]) => ({ product_name, count }));

    setPopularProducts(sorted);
  };

  // 載入月度訂單數量
  const loadOrderCountData = async () => {
    const yearStart = startOfYear(new Date(selectedYear, 0, 1));
    const yearEnd = endOfYear(new Date(selectedYear, 0, 1));

    const { data: orders, error } = await supabase
      .from("orders")
      .select("created_at")
      .gte("created_at", yearStart.toISOString())
      .lte("created_at", yearEnd.toISOString());

    if (error) {
      console.error("Error loading order count:", error);
      return;
    }

    // 初始化全年 12 個月
    const monthlyMap = new Map<string, number>();
    for (let i = 0; i < 12; i++) {
      const monthKey = `${selectedYear}-${String(i + 1).padStart(2, "0")}`;
      monthlyMap.set(monthKey, 0);
    }

    (orders || []).forEach((order) => {
      const monthKey = format(new Date(order.created_at), "yyyy-MM");
      if (monthlyMap.has(monthKey)) {
        monthlyMap.set(monthKey, (monthlyMap.get(monthKey) || 0) + 1);
      }
    });

    const data: MonthlyOrderCount[] = Array.from(monthlyMap.entries()).map(([month, count]) => ({
      month: format(new Date(month + "-01"), "M月", { locale: zhTW }),
      count,
    }));

    setOrderCountData(data);
  };

  const goToPrevYear = () => setSelectedYear((y) => y - 1);
  const goToNextYear = () => setSelectedYear((y) => y + 1);

  const revenueChartData = useMemo(
    () => (revenueHalfYear === 1 ? revenueData.slice(0, 6) : revenueData.slice(6, 12)),
    [revenueData, revenueHalfYear],
  );

  const openRevenueMonthDetail = useCallback(async (monthKey: string, titleLabel: string) => {
    setRevenueDetailOpen(true);
    setRevenueDetailTitle(titleLabel);
    setRevenueDetailLoading(true);
    setRevenueDetailError(null);
    setRevenueDetailPaid([]);
    setRevenueDetailUnpaid([]);
    try {
      const [yStr, mStr] = monthKey.split("-");
      const y = Number(yStr);
      const m = Number(mStr);
      if (!y || !m) return;
      const rangeStart = startOfMonth(new Date(y, m - 1, 1));
      const rangeEnd = endOfMonth(new Date(y, m - 1, 1));

      const { data: rows, error } = await supabase
        .from("orders")
        .select("id, who_receive, expected_pickup_date, total_amount, payment_step, created_at")
        .in("order_status", ["processing", "shipped", "delivered"])
        .gte("created_at", rangeStart.toISOString())
        .lte("created_at", rangeEnd.toISOString())
        .order("created_at", { ascending: false });

      if (error) {
        console.error("營收明細載入失敗:", error);
        setRevenueDetailError(error.message || "載入失敗");
        return;
      }

      const list = rows ?? [];

      const paid: RevenueOrderDetailRow[] = [];
      const unpaid: RevenueOrderDetailRow[] = [];

      for (const r of list) {
        const recipient = (r.who_receive as string | null | undefined)?.trim();
        const recipientName = recipient || "（無收件人）";
        const row: RevenueOrderDetailRow = {
          id: r.id as string,
          recipientName,
          pickupDate: (r.expected_pickup_date as string | null) ?? null,
          amount: Number((r as { total_amount?: number }).total_amount ?? 0),
        };
        if (r.payment_step === REVENUE_PAYMENT_STEP) paid.push(row);
        else unpaid.push(row);
      }

      setRevenueDetailPaid(paid);
      setRevenueDetailUnpaid(unpaid);
    } catch (e) {
      setRevenueDetailError(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setRevenueDetailLoading(false);
    }
  }, []);

  const handleRevenueChartClick = useCallback(
    (state: unknown) => {
      const s = state as { activeLabel?: string | number; activePayload?: { payload: MonthlyRevenue }[] };
      const fromPayload = s?.activePayload?.[0]?.payload;
      if (fromPayload?.monthKey) {
        void openRevenueMonthDetail(fromPayload.monthKey, `${selectedYear}年${fromPayload.month}`);
        return;
      }
      const label = s?.activeLabel;
      if (typeof label !== "string") return;
      const row = revenueChartData.find((d) => d.month === label);
      if (row?.monthKey) void openRevenueMonthDetail(row.monthKey, `${selectedYear}年${row.month}`);
    },
    [openRevenueMonthDetail, revenueChartData, selectedYear],
  );

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <p className="text-muted-foreground">載入儀表板...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-3xl font-bold">儀表板</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={goToPrevYear}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-semibold min-w-[80px] text-center">{selectedYear} 年</span>
          <Button variant="outline" size="icon" onClick={goToNextYear}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 第一列：兩個圖表（lg 等高，長條區域底對齊） */}
      <div className="grid grid-cols-1 lg:grid-cols-2 lg:items-stretch gap-6">
        {/* 訂單營收長條圖 */}
        <Card className="flex min-h-0 flex-col">
          <CardHeader className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <CardTitle className="text-lg leading-snug">
                訂單營收（新台幣）- {selectedYear}年
                <span className="block text-sm font-normal text-muted-foreground mt-0.5">
                  {revenueHalfYear === 1 ? "1–6 月" : "7–12 月"}
                </span>
              </CardTitle>
              <div className="flex shrink-0 rounded-md border border-border bg-muted/30 p-0.5">
                <Button
                  type="button"
                  variant={revenueHalfYear === 1 ? "default" : "ghost"}
                  size="sm"
                  className="h-9 px-4"
                  onClick={() => setRevenueHalfYear(1)}
                >
                  1–6 月
                </Button>
                <Button
                  type="button"
                  variant={revenueHalfYear === 2 ? "default" : "ghost"}
                  size="sm"
                  className="h-9 px-4"
                  onClick={() => setRevenueHalfYear(2)}
                >
                  7–12 月
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground font-normal leading-relaxed">
              不論訂單狀態為何，只有匯款進度是確認收到匯款，才會進入已匯款金額。不論何時收到匯款，都是併入訂單創立該月。
            </p>
            <p className="text-xs text-[hsl(var(--primary))] font-medium">
              點擊圖表月份可檢視該月訂單明細（收件人／取件日／金額；未付款／已付款分列）
            </p>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col">
            <div className="mt-auto h-[300px] min-h-[300px] w-full shrink-0 cursor-pointer md:h-[400px] md:min-h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={revenueChartData}
                  margin={{ top: 12, right: 16, left: 8, bottom: 12 }}
                  barCategoryGap="24%"
                  barGap={6}
                  onClick={handleRevenueChartClick}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 13 }} />
                  <YAxis tickFormatter={(value) => `$${value.toLocaleString()}`} width={60} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value, name) => {
                      const num = Number(value ?? 0);
                      return [`NT$ ${num.toLocaleString()}`, String(name)];
                    }}
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--card))",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 13, paddingTop: 10 }} iconType="square" />
                  <Bar
                    dataKey="totalRevenue"
                    name="總營收（未付＋已付）"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={56}
                  />
                  <Bar
                    dataKey="paidRevenue"
                    name="已匯款金額"
                    fill="hsl(var(--color-brand-500))"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={56}
                  />
                  <Bar
                    dataKey="unpaidRevenue"
                    name="未匯款金額"
                    fill="hsl(var(--color-brand-300))"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={56}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* 訂單數量圖表 */}
        <Card className="flex min-h-0 flex-col">
          <CardHeader className="flex-shrink-0">
            <CardTitle className="text-lg">訂單數量 - {selectedYear}年</CardTitle>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col">
            <div className="mt-auto h-[300px] min-h-[300px] w-full shrink-0 md:h-[400px] md:min-h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={orderCountData} margin={{ top: 12, right: 16, left: 8, bottom: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 13 }} />
                  <YAxis width={48} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value) => {
                      const num = Number(value ?? 0);
                      return [`${num} 筆`, "訂單數"];
                    }}
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--card))",
                    }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={56} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 第二列：熱門商品（單獨一列，全寬；可切換當月／當年） */}
      <div className="grid grid-cols-1 gap-6">
        <Card className="min-w-0">
          <CardHeader className="space-y-3 pb-2">
            <CardTitle className="text-lg leading-snug">
              {popularPeriod === "month"
                ? `熱門商品（前5名）- ${selectedYear}年${popularMonth}月`
                : `熱門商品（前5名）- ${selectedYear}年`}
            </CardTitle>
            <p className="text-xs text-muted-foreground font-normal">
              依訂單建立日期統計該期間內 order_items 出現次數；與上方年份選擇一致
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-md border p-0.5 bg-muted/40">
                <Button
                  type="button"
                  variant={popularPeriod === "month" ? "default" : "ghost"}
                  size="sm"
                  className="h-8 px-3"
                  onClick={() => setPopularPeriod("month")}
                >
                  當月
                </Button>
                <Button
                  type="button"
                  variant={popularPeriod === "year" ? "default" : "ghost"}
                  size="sm"
                  className="h-8 px-3"
                  onClick={() => setPopularPeriod("year")}
                >
                  當年
                </Button>
              </div>
              {popularPeriod === "month" && (
                <select
                  className={cn(
                    "h-8 rounded-md border border-input bg-background px-2 text-sm",
                    "min-w-[7rem]",
                  )}
                  value={popularMonth}
                  onChange={(e) => setPopularMonth(Number(e.target.value))}
                  aria-label="熱門商品統計月份"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {m} 月
                    </option>
                  ))}
                </select>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] md:h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={popularProducts}
                  margin={{ top: 12, right: 16, left: 8, bottom: 36 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="product_name"
                    tick={{ fontSize: 14, fontWeight: 500 }}
                    interval={0}
                    height={56}
                  />
                  <YAxis label={{ value: "出現次數", angle: -90, position: "insideLeft" }} />
                  <Tooltip
                    formatter={(value) => {
                      const num = Number(value ?? 0);
                      return [`${num} 次`, "出現次數"];
                    }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} barSize={44} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 第三列：客戶類型 + 下單管道圓餅 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="min-w-0 overflow-visible">
          <CardHeader className="space-y-3 pb-2">
            <CardTitle className="text-lg leading-snug">
              {tagPeriod === "month" ? "當月客戶類型分析" : "當年客戶類型分析"}
            </CardTitle>
            <p className="text-xs text-muted-foreground font-normal">
              扇形依各類型（customer_type）訂單筆數；% 為筆數占比。手動／網站占比請看右側「下單管道」。標籤「營收」僅計已確認到帳；「客單價」＝該類型實收 ÷ 已確認到帳筆數。狀態含待付款／處理中／已出貨／已送達（不含已取消、退貨）
              {tagPeriod === "month"
                ? ` · ${selectedYear}年${tagMonth}月`
                : ` · ${selectedYear}年`}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-md border p-0.5 bg-muted/40">
                <Button
                  type="button"
                  variant={tagPeriod === "month" ? "default" : "ghost"}
                  size="sm"
                  className="h-8 px-3"
                  onClick={() => setTagPeriod("month")}
                >
                  當月
                </Button>
                <Button
                  type="button"
                  variant={tagPeriod === "year" ? "default" : "ghost"}
                  size="sm"
                  className="h-8 px-3"
                  onClick={() => setTagPeriod("year")}
                >
                  當年
                </Button>
              </div>
              {tagPeriod === "month" && (
                <select
                  className={cn(
                    "h-8 rounded-md border border-input bg-background px-2 text-sm",
                    "min-w-[7rem]",
                  )}
                  value={tagMonth}
                  onChange={(e) => setTagMonth(Number(e.target.value))}
                  aria-label="選擇月份"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {m} 月
                    </option>
                  ))}
                </select>
              )}
            </div>
          </CardHeader>
          <CardContent className="overflow-visible pb-8">
            {customerTypePieData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-12 text-center px-2">
                此期間尚無符合條件之訂單（請確認年月、或訂單是否為待付款／處理中／已出貨／已送達）
              </p>
            ) : (
              <div className="h-[min(560px,82vh)] min-h-[440px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 28, right: 36, bottom: 80, left: 36 }}>
                    <Pie
                      data={customerTypePieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="47%"
                      innerRadius="16%"
                      outerRadius="58%"
                      paddingAngle={2}
                      labelLine={false}
                      label={(props: {
                        x?: number;
                        y?: number;
                        textAnchor?: string;
                        payload?: CustomerTypePieSlice;
                        percent?: number;
                      }) => {
                        const p = props.payload as CustomerTypePieSlice;
                        const pct = ((props.percent ?? 0) * 100).toFixed(0);
                        const x = props.x ?? 0;
                        const y = props.y ?? 0;
                        const anchor = (props.textAnchor as "start" | "end" | "middle") ?? "middle";
                        const line1 = `${p.name} ${pct}%`;
                        const line2 = `營收 NT$${p.revenue.toLocaleString()}`;
                        const line3 = `客單 NT$${p.aov.toLocaleString()}`;
                        const cPrimary = "hsl(var(--primary))";
                        const cDeep = "hsl(var(--color-brand-600))";
                        const cMid = "hsl(var(--color-brand-500))";
                        return (
                          <text
                            x={x}
                            y={y}
                            textAnchor={anchor}
                            dominantBaseline="central"
                            fontSize={14}
                            fontWeight={500}
                          >
                            <tspan x={x} dy="-1.05em" fill={cPrimary}>
                              {line1}
                            </tspan>
                            <tspan x={x} dy="1.15em" fill={cDeep}>
                              {line2}
                            </tspan>
                            <tspan x={x} dy="1.15em" fill={cMid}>
                              {line3}
                            </tspan>
                          </text>
                        );
                      }}
                    >
                      {customerTypePieData.map((entry) => (
                        <Cell key={entry.name} fill={pieColorForName(entry.name)} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0].payload as CustomerTypePieSlice;
                        return (
                          <div className="rounded-md border border-border bg-card px-3 py-2 text-sm shadow-md">
                            <div className="font-semibold mb-1 text-[hsl(var(--primary))]">{p.name}</div>
                            <div className="text-[hsl(var(--color-brand-600))]">訂單 {p.value} 筆</div>
                            <div className="text-[hsl(var(--color-brand-600))]">營收 NT$ {p.revenue.toLocaleString()}</div>
                            <div className="text-[hsl(var(--color-brand-500))]">
                              客單價 NT$ {p.aov.toLocaleString()}（實收營收 ÷ 已確認到帳筆數）
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Legend
                      layout="horizontal"
                      verticalAlign="bottom"
                      align="center"
                      wrapperStyle={{
                        fontSize: 13,
                        paddingTop: 12,
                        color: "hsl(var(--primary))",
                        fontWeight: 500,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 overflow-visible">
          <CardHeader className="space-y-3 pb-2">
            <CardTitle className="text-lg leading-snug">
              {tagPeriod === "month" ? "當月下單管道" : "當年下單管道"}
            </CardTitle>
            <p className="text-xs text-muted-foreground font-normal">
              手動建立（後台建單）vs 網站會員自行下單。統計範圍與左側客戶類型圓餅相同
              {tagPeriod === "month"
                ? ` · ${selectedYear}年${tagMonth}月`
                : ` · ${selectedYear}年`}
            </p>
          </CardHeader>
          <CardContent className="overflow-visible pb-8">
            {orderChannelPieData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-12 text-center px-2">
                此期間尚無符合條件之訂單
              </p>
            ) : (
              <div className="h-[min(560px,82vh)] min-h-[440px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 28, right: 36, bottom: 80, left: 36 }}>
                    <Pie
                      data={orderChannelPieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="47%"
                      innerRadius="16%"
                      outerRadius="58%"
                      paddingAngle={2}
                      labelLine={false}
                      label={(props: {
                        x?: number;
                        y?: number;
                        textAnchor?: string;
                        payload?: CustomerTypePieSlice;
                        percent?: number;
                      }) => {
                        const p = props.payload as CustomerTypePieSlice;
                        const pct = ((props.percent ?? 0) * 100).toFixed(0);
                        const x = props.x ?? 0;
                        const y = props.y ?? 0;
                        const anchor = (props.textAnchor as "start" | "end" | "middle") ?? "middle";
                        const line1 = `${p.name} ${pct}%`;
                        const line2 = `營收 NT$${p.revenue.toLocaleString()}`;
                        const line3 = `客單 NT$${p.aov.toLocaleString()}`;
                        const cPrimary = "hsl(var(--primary))";
                        const cDeep = "hsl(var(--color-brand-600))";
                        const cMid = "hsl(var(--color-brand-500))";
                        return (
                          <text
                            x={x}
                            y={y}
                            textAnchor={anchor}
                            dominantBaseline="central"
                            fontSize={14}
                            fontWeight={500}
                          >
                            <tspan x={x} dy="-1.05em" fill={cPrimary}>
                              {line1}
                            </tspan>
                            <tspan x={x} dy="1.15em" fill={cDeep}>
                              {line2}
                            </tspan>
                            <tspan x={x} dy="1.15em" fill={cMid}>
                              {line3}
                            </tspan>
                          </text>
                        );
                      }}
                    >
                      {orderChannelPieData.map((entry) => (
                        <Cell key={entry.key} fill={pieColorForName(entry.name)} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0].payload as CustomerTypePieSlice;
                        return (
                          <div className="rounded-md border border-border bg-card px-3 py-2 text-sm shadow-md">
                            <div className="font-semibold mb-1 text-[hsl(var(--primary))]">{p.name}</div>
                            <div className="text-[hsl(var(--color-brand-600))]">訂單 {p.value} 筆</div>
                            <div className="text-[hsl(var(--color-brand-600))]">營收 NT$ {p.revenue.toLocaleString()}</div>
                            <div className="text-[hsl(var(--color-brand-500))]">
                              客單價 NT$ {p.aov.toLocaleString()}（實收營收 ÷ 已確認到帳筆數）
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Legend
                      layout="horizontal"
                      verticalAlign="bottom"
                      align="center"
                      wrapperStyle={{
                        fontSize: 13,
                        paddingTop: 12,
                        color: "hsl(var(--primary))",
                        fontWeight: 500,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card
            className={cn(
              "overflow-hidden border-2 shadow-sm",
              "border-[hsl(var(--primary)/0.35)] bg-card",
            )}
          >
            <CardHeader className="space-y-3 border-b border-[hsl(var(--primary)/0.2)] bg-[hsl(var(--primary)/0.06)] pb-4">
              <CardTitle className="text-xl md:text-2xl font-semibold tracking-tight text-[hsl(var(--primary))]">
                月度報告
                {monthlyReport ? (
                  <span className="text-base font-medium text-muted-foreground ml-2">
                    {monthlyReport.year}年{monthlyReport.month}月
                  </span>
                ) : null}
              </CardTitle>
              <p className="text-sm text-muted-foreground font-normal leading-relaxed">
                依所選年月統計（與排程 webhook 月度 JSON 欄位一致）
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <select
                  className={cn(
                    "h-9 rounded-md border border-input bg-background px-2 text-sm min-w-[6rem]",
                  )}
                  value={monthlyReportYear}
                  onChange={(e) => setMonthlyReportYear(Number(e.target.value))}
                  aria-label="月度報告年份"
                >
                  {reportYearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y} 年
                    </option>
                  ))}
                </select>
                <select
                  className={cn(
                    "h-9 rounded-md border border-input bg-background px-2 text-sm min-w-[5rem]",
                  )}
                  value={monthlyReportMonth}
                  onChange={(e) => setMonthlyReportMonth(Number(e.target.value))}
                  aria-label="月度報告月份"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {m} 月
                    </option>
                  ))}
                </select>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-5 md:p-6">
              {reportLoading ? (
                <p className="text-muted-foreground text-base py-8 text-center">載入中…</p>
              ) : !monthlyReport ? (
                <p className="text-muted-foreground text-base">無法載入（請確認權限或稍後再試）</p>
              ) : (
                <>
                  <div
                    className={cn(
                      "rounded-xl border border-[hsl(var(--primary)/0.25)] bg-background/80",
                      "p-4 shadow-[inset_0_1px_0_0_hsl(var(--primary)/0.08)]",
                    )}
                  >
                    <div className="text-sm md:text-base font-medium text-foreground/80">1. 月收入（NT$）</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {monthlyReport.year}年{monthlyReport.month}月 · 實收：處理中／出貨中／已送達 且 付款「已確認到帳」；依訂單建立日歸月
                    </p>
                    <p className="mt-2 text-2xl md:text-3xl font-bold tabular-nums text-[hsl(var(--primary))]">
                      {monthlyReport.revenue_ntd.toLocaleString()}
                    </p>
                    <p className="mt-2 text-sm md:text-base font-medium text-muted-foreground border-t border-border/60 pt-2">
                      未收款項+已收款項=總營收：共計{" "}
                      <span className="font-semibold text-foreground/80 tabular-nums">
                        NT$ {monthlyReport.revenue_incl_unpaid_ntd.toLocaleString()}
                      </span>{" "}
                      元
                    </p>
                    <p className="mt-2 text-sm md:text-base text-muted-foreground">
                      客單價（已確認到帳）：{" "}
                      <span className="font-semibold text-foreground/80 tabular-nums">
                        NT$ {monthlyReport.aov_verified_ntd.toLocaleString()}
                      </span>
                      <span className="text-xs ml-1">
                        （實收 ÷ {monthlyReport.verified_order_count} 筆；處理中／出貨中／已送達且已確認到帳）
                      </span>
                    </p>
                  </div>
                  <div
                    className={cn(
                      "rounded-xl border border-[hsl(var(--primary)/0.25)] bg-background/80",
                      "p-4 shadow-[inset_0_1px_0_0_hsl(var(--primary)/0.08)]",
                    )}
                  >
                    <div className="text-sm md:text-base font-medium text-foreground/80">2. 訂單筆數</div>
                    <p className="mt-2 text-2xl md:text-3xl font-bold tabular-nums text-[hsl(var(--primary))]">
                      {monthlyReport.order_count}
                      <span className="text-lg md:text-xl font-semibold ml-1.5">筆</span>
                    </p>
                    <p className="mt-3 text-sm md:text-base leading-relaxed text-muted-foreground border-t border-border/80 pt-3">
                      <span className="font-medium text-foreground/70">備註：</span>
                      {monthlyReport.customer_type_breakdown.length === 0 ? (
                        <span>—</span>
                      ) : (
                        <span className="text-[hsl(var(--primary))] font-semibold">
                          {monthlyReport.customer_type_breakdown
                            .map((r) => `${r.label} × ${r.count} 筆`)
                            .join("、")}
                        </span>
                      )}
                    </p>
                  </div>
                  <div
                    className={cn(
                      "rounded-xl border border-[hsl(var(--primary)/0.25)] bg-background/80",
                      "p-4 shadow-[inset_0_1px_0_0_hsl(var(--primary)/0.08)]",
                    )}
                  >
                    <div className="text-sm md:text-base font-medium text-foreground/80">3. 商品熱銷第一名</div>
                    <p className="mt-2 text-lg md:text-xl font-bold leading-snug text-[hsl(var(--primary))]">
                      {monthlyReport.top_product_name ?? "—"}
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card
            className={cn(
              "overflow-hidden border-2 shadow-sm",
              "border-[hsl(var(--primary)/0.35)] bg-card",
            )}
          >
            <CardHeader className="space-y-3 border-b border-[hsl(var(--primary)/0.2)] bg-[hsl(var(--primary)/0.06)] pb-4">
              <CardTitle className="text-xl md:text-2xl font-semibold tracking-tight text-[hsl(var(--primary))]">
                年度報告
                {yearlyReport ? (
                  <span className="text-base font-medium text-muted-foreground ml-2">{yearlyReport.year} 年</span>
                ) : null}
              </CardTitle>
              <p className="text-sm text-muted-foreground font-normal leading-relaxed">
                依所選年份統計（與排程 webhook 年度 JSON 一致）
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <select
                  className={cn(
                    "h-9 rounded-md border border-input bg-background px-2 text-sm min-w-[6rem]",
                  )}
                  value={yearlyReportYear}
                  onChange={(e) => setYearlyReportYear(Number(e.target.value))}
                  aria-label="年度報告年份"
                >
                  {reportYearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y} 年
                    </option>
                  ))}
                </select>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-5 md:p-6">
              {reportLoading ? (
                <p className="text-muted-foreground text-base py-8 text-center">載入中…</p>
              ) : !yearlyReport ? (
                <p className="text-muted-foreground text-base">無法載入（請確認權限或稍後再試）</p>
              ) : (
                <>
                  <div
                    className={cn(
                      "rounded-xl border border-[hsl(var(--primary)/0.25)] bg-background/80",
                      "p-4 shadow-[inset_0_1px_0_0_hsl(var(--primary)/0.08)]",
                    )}
                  >
                    <div className="text-sm md:text-base font-medium text-foreground/80">1. 全年收入（NT$）</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {yearlyReport.year}年 · 實收：處理中／出貨中／已送達 且 付款「已確認到帳」；依訂單建立日歸屬該年
                    </p>
                    <p className="mt-2 text-2xl md:text-3xl font-bold tabular-nums text-[hsl(var(--primary))]">
                      {yearlyReport.revenue_ntd.toLocaleString()}
                    </p>
                    <p className="mt-2 text-sm md:text-base font-medium text-muted-foreground border-t border-border/60 pt-2">
                      未收款項＋已收款項=總營收：共計{" "}
                      <span className="font-semibold text-foreground/80 tabular-nums">
                        NT$ {yearlyReport.revenue_incl_unpaid_ntd.toLocaleString()}
                      </span>{" "}
                      元
                    </p>
                    <p className="mt-2 text-sm md:text-base text-muted-foreground">
                      客單價（已確認到帳）：{" "}
                      <span className="font-semibold text-foreground/80 tabular-nums">
                        NT$ {yearlyReport.aov_verified_ntd.toLocaleString()}
                      </span>
                      <span className="text-xs ml-1">
                        （實收 ÷ {yearlyReport.verified_order_count} 筆；處理中／出貨中／已送達且已確認到帳）
                      </span>
                    </p>
                  </div>
                  <div
                    className={cn(
                      "rounded-xl border border-[hsl(var(--primary)/0.25)] bg-background/80",
                      "p-4 shadow-[inset_0_1px_0_0_hsl(var(--primary)/0.08)]",
                    )}
                  >
                    <div className="text-sm md:text-base font-medium text-foreground/80">2. 全年訂單</div>
                    <p className="mt-2 text-2xl md:text-3xl font-bold tabular-nums text-[hsl(var(--primary))]">
                      {yearlyReport.order_count}
                      <span className="text-lg md:text-xl font-semibold ml-1.5">筆</span>
                    </p>
                    <p className="mt-3 text-sm md:text-base leading-relaxed text-muted-foreground border-t border-border/80 pt-3">
                      <span className="font-medium text-foreground/70">備註：</span>
                      {yearlyReport.customer_type_breakdown.length === 0 ? (
                        <span>—</span>
                      ) : (
                        <span className="text-[hsl(var(--primary))] font-semibold">
                          {yearlyReport.customer_type_breakdown
                            .map((r) => `${r.label} × ${r.count} 筆`)
                            .join("、")}
                        </span>
                      )}
                    </p>
                  </div>
                  <div
                    className={cn(
                      "rounded-xl border border-[hsl(var(--primary)/0.25)] bg-background/80",
                      "p-4 shadow-[inset_0_1px_0_0_hsl(var(--primary)/0.08)]",
                    )}
                  >
                    <div className="text-sm md:text-base font-medium text-foreground/80">3. 全年熱銷商品前三名</div>
                    <ol className="mt-3 list-decimal space-y-2 pl-5 md:pl-6 text-base md:text-lg marker:font-bold marker:text-[hsl(var(--primary))]">
                      {yearlyReport.top_products.length === 0 ? (
                        <li className="text-muted-foreground pl-1">—</li>
                      ) : (
                        yearlyReport.top_products.map((p) => (
                          <li key={p.name} className="pl-1 leading-snug">
                            <span className="font-bold text-[hsl(var(--primary))]">{p.name}</span>
                            <span className="text-muted-foreground font-medium">（{p.count} 次）</span>
                          </li>
                        ))
                      )}
                    </ol>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

      <Dialog open={revenueDetailOpen} onOpenChange={setRevenueDetailOpen}>
        <DialogContent className="flex max-h-[88vh] max-w-lg flex-col gap-0 overflow-hidden border-[hsl(var(--primary)/0.35)] p-0 sm:max-w-lg">
          <DialogHeader className="space-y-1 border-b border-[hsl(var(--primary)/0.2)] bg-[hsl(var(--primary)/0.08)] px-5 py-4 text-left">
            <DialogTitle className="text-lg font-semibold text-[hsl(var(--primary))]">營收明細 · {revenueDetailTitle}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              與長條圖相同範圍：處理中／出貨中／已送達，依訂單建立月；已付款＝匯款進度已確認到帳。清單第一欄為「收件人」（who_receive），非會員帳號姓名。
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {revenueDetailError ? (
              <p className="text-sm text-destructive">{revenueDetailError}</p>
            ) : revenueDetailLoading ? (
              <p className="text-sm text-muted-foreground">載入中…</p>
            ) : (
              <div className="space-y-8">
                <section>
                  <h3 className="mb-3 border-b border-[hsl(var(--primary)/0.25)] pb-1.5 text-base font-semibold text-[hsl(var(--color-brand-600))]">
                    未付款
                  </h3>
                  {revenueDetailUnpaid.length === 0 ? (
                    <p className="text-sm text-muted-foreground">無資料</p>
                  ) : (
                    <ol className="list-decimal space-y-2.5 pl-5 text-sm leading-relaxed marker:font-medium marker:text-[hsl(var(--primary))]">
                      {revenueDetailUnpaid.map((row) => (
                        <li key={row.id} className="pl-1 text-foreground">
                          {row.recipientName}／{formatPickupDisplay(row.pickupDate)}／NT$ {row.amount.toLocaleString()}
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
                <section>
                  <h3 className="mb-3 border-b border-[hsl(var(--primary)/0.25)] pb-1.5 text-base font-semibold text-[hsl(var(--primary))]">
                    已付款
                  </h3>
                  {revenueDetailPaid.length === 0 ? (
                    <p className="text-sm text-muted-foreground">無資料</p>
                  ) : (
                    <ol className="list-decimal space-y-2.5 pl-5 text-sm leading-relaxed marker:font-medium marker:text-[hsl(var(--primary))]">
                      {revenueDetailPaid.map((row) => (
                        <li key={row.id} className="pl-1 text-foreground">
                          {row.recipientName}／{formatPickupDisplay(row.pickupDate)}／NT$ {row.amount.toLocaleString()}
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDashboard;
