import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  customerTypeDisplayLabel as labelForCustomerType,
  type MonthlyReportPayload,
  type YearlyReportPayload,
} from "@/lib/admin-reports";

interface MonthlyRevenue {
  month: string;
  revenue: number;
}

interface ProductPopularity {
  product_name: string;
  count: number;
}

interface MonthlyOrderCount {
  month: string;
  count: number;
}

/**
 * 品牌玫瑰色系、刻意拉大深淺差距（同色相 ~354°，亮度由深到淺）
 */
const BRAND_SLICE_COLORS = [
  "hsl(354 42% 30%)",
  "hsl(354 38% 44%)",
  "hsl(355 40% 58%)",
  "hsl(356 42% 74%)",
  "hsl(0 48% 94%)",
] as const;

const PIE_LABEL_FILL = "hsl(var(--foreground))";

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

/** 已知類型對應品牌色階索引（深→淺；「未設定」用最淺） */
const CUSTOMER_TYPE_BRAND_COLOR_INDEX: Record<string, number> = {
  一般用戶: 0,
  "快閃店／IP": 1,
  "公關公司／福委會": 2,
  未設定: 4,
};

function pieColorForName(name: string): string {
  const mapped = CUSTOMER_TYPE_BRAND_COLOR_INDEX[name];
  if (mapped != null) return BRAND_SLICE_COLORS[mapped % BRAND_SLICE_COLORS.length];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) % BRAND_SLICE_COLORS.length;
  return BRAND_SLICE_COLORS[h];
}

/** 客戶類型圓餅：value = 該類型訂單筆數（扇形比例）；營收／客單價供標籤與 Tooltip */
interface CustomerTypePieSlice {
  name: string;
  value: number;
  revenue: number;
  aov: number;
  key: string;
}

const AdminDashboard = () => {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [revenueData, setRevenueData] = useState<MonthlyRevenue[]>([]);
  const [popularProducts, setPopularProducts] = useState<ProductPopularity[]>([]);
  const [orderCountData, setOrderCountData] = useState<MonthlyOrderCount[]>([]);
  const [tagPeriod, setTagPeriod] = useState<"month" | "year">("month");
  const [tagMonth, setTagMonth] = useState(() => new Date().getMonth() + 1);
  const [popularPeriod, setPopularPeriod] = useState<"month" | "year">("year");
  const [popularMonth, setPopularMonth] = useState(() => new Date().getMonth() + 1);
  const [customerTypePieData, setCustomerTypePieData] = useState<CustomerTypePieSlice[]>([]);
  const [monthlyReport, setMonthlyReport] = useState<MonthlyReportPayload | null>(null);
  const [yearlyReport, setYearlyReport] = useState<YearlyReportPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, [selectedYear, tagPeriod, tagMonth, popularPeriod, popularMonth]);

  const loadDashboardData = async () => {
    setLoading(true);
    await Promise.all([
      loadRevenueData(),
      loadPopularProducts(),
      loadOrderCountData(),
      loadCustomerTypeCharts(),
      loadReportSummaries(),
    ]);
    setLoading(false);
  };

  /** 月度＝行事曆當月；年度＝上方選擇之年份（與 cron JSON 結構一致） */
  const loadReportSummaries = async () => {
    try {
      const cal = new Date();
      const cy = cal.getFullYear();
      const cm = cal.getMonth() + 1;
      const [monthly, yearly] = await Promise.all([
        buildMonthlyReportPayload(supabase, cy, cm),
        buildYearlyReportPayload(supabase, selectedYear),
      ]);
      setMonthlyReport(monthly);
      setYearlyReport(yearly);
    } catch (err) {
      console.error("loadReportSummaries:", err);
      setMonthlyReport(null);
      setYearlyReport(null);
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
      .select("customer_type, total_amount")
      .in("order_status", [...CUSTOMER_TYPE_PIE_STATUSES])
      .gte("created_at", rangeStart.toISOString())
      .lte("created_at", rangeEnd.toISOString());

    if (error) {
      console.error("Error loading customer type stats:", error);
      setCustomerTypePieData([]);
      return;
    }

    const countMap = new Map<string, number>();
    const revenueMap = new Map<string, number>();

    (orders || []).forEach((row) => {
      const key = row.customer_type?.trim() || "";
      const label = labelForCustomerType(key || null);

      countMap.set(label, (countMap.get(label) ?? 0) + 1);

      const amt = Number(row.total_amount ?? 0);
      revenueMap.set(label, (revenueMap.get(label) ?? 0) + amt);
    });

    const slices: CustomerTypePieSlice[] = Array.from(countMap.entries()).map(([name, count]) => {
      const revenue = revenueMap.get(name) ?? 0;
      const aov = count > 0 ? Math.round(revenue / count) : 0;
      return { name, value: count, revenue, aov, key: name };
    });

    slices.sort((a, b) => b.value - a.value);
    setCustomerTypePieData(slices);
  };

  // 載入月度營收數據：訂單進入「處理中」(processing) 即併入計算，退貨(returned) 不計入
  const loadRevenueData = async () => {
    const yearStart = startOfYear(new Date(selectedYear, 0, 1));
    const yearEnd = endOfYear(new Date(selectedYear, 0, 1));

    const { data: orders, error } = await supabase
      .from("orders")
      .select("total_amount, created_at")
      .in("order_status", ["processing", "shipped", "delivered"])
      .gte("created_at", yearStart.toISOString())
      .lte("created_at", yearEnd.toISOString());

    if (error) {
      console.error("Error loading revenue:", error);
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
        monthlyMap.set(monthKey, (monthlyMap.get(monthKey) || 0) + order.total_amount);
      }
    });

    const data: MonthlyRevenue[] = Array.from(monthlyMap.entries()).map(([month, revenue]) => ({
      month: format(new Date(month + "-01"), "M月", { locale: zhTW }),
      revenue,
    }));

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
      const displayName = productNameMap.get(item.product_id) || item.product_name;
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

      {/* 第一列：兩個圖表 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 訂單營收長條圖 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">訂單營收（新台幣）- {selectedYear}年</CardTitle>
            <p className="text-sm text-muted-foreground font-normal mt-1">
              依據訂單建立日期，在訂單「處理中」的狀態併入計算
            </p>
          </CardHeader>
          <CardContent>
            <div className="h-[250px] md:h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={(value) => `$${value.toLocaleString()}`} />
                  <Tooltip
                    formatter={(value) => {
                      const num = Number(value ?? 0);
                      return [`NT$ ${num.toLocaleString()}`, "營收"];
                    }}
                  />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* 訂單數量圖表 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">訂單數量 - {selectedYear}年</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px] md:h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={orderCountData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip
                    formatter={(value) => {
                      const num = Number(value ?? 0);
                      return [`${num} 筆`, "訂單數"];
                    }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
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

      {/* 第三列：客戶類型分析（單獨一列，避免圓餅與標籤被裁切） */}
      <div className="grid grid-cols-1 gap-6">
        <Card className="min-w-0 overflow-visible">
          <CardHeader className="space-y-3 pb-2">
            <CardTitle className="text-lg leading-snug">
              {tagPeriod === "month" ? "當月客戶類型分析" : "當年客戶類型分析"}
            </CardTitle>
            <p className="text-xs text-muted-foreground font-normal">
              扇形依各類型訂單筆數；% 為筆數占比。標籤另附該類型營收與客單價（營收 ÷ 該類型訂單數）。訂單狀態含待付款／處理中／已出貨／已送達（不含已取消、退貨）
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
              <div className="h-[min(560px,82vh)] min-h-[440px] w-full max-w-5xl mx-auto">
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
                        return (
                          <text
                            x={x}
                            y={y}
                            textAnchor={anchor}
                            dominantBaseline="central"
                            fill={PIE_LABEL_FILL}
                            fontSize={14}
                            fontWeight={500}
                          >
                            <tspan x={x} dy="-1.05em">
                              {line1}
                            </tspan>
                            <tspan x={x} dy="1.15em">
                              {line2}
                            </tspan>
                            <tspan x={x} dy="1.15em">
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
                          <div className="rounded-md border border-border bg-background px-3 py-2 text-sm shadow-md text-foreground">
                            <div className="font-medium mb-1">{p.name}</div>
                            <div>訂單 {p.value} 筆</div>
                            <div>營收 NT$ {p.revenue.toLocaleString()}</div>
                            <div>客單價 NT$ {p.aov.toLocaleString()}（營收 ÷ 訂單數）</div>
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
                        color: "hsl(var(--foreground))",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card
            className={cn(
              "overflow-hidden border-2 shadow-sm",
              "border-[hsl(var(--primary)/0.35)] bg-card",
            )}
          >
            <CardHeader className="space-y-1 border-b border-[hsl(var(--primary)/0.2)] bg-[hsl(var(--primary)/0.06)] pb-4">
              <CardTitle className="text-xl md:text-2xl font-semibold tracking-tight text-[hsl(var(--primary))]">
                月度報告
              </CardTitle>
              <p className="text-sm text-muted-foreground font-normal leading-relaxed">
                統計區間為行事曆當月（與排程 webhook 月度 JSON 欄位一致）
              </p>
            </CardHeader>
            <CardContent className="space-y-4 p-5 md:p-6">
              {!monthlyReport ? (
                <p className="text-muted-foreground text-base">無法載入（請確認權限或稍後再試）</p>
              ) : (
                <>
                  <div
                    className={cn(
                      "rounded-xl border border-[hsl(var(--primary)/0.25)] bg-background/80",
                      "p-4 shadow-[inset_0_1px_0_0_hsl(var(--primary)/0.08)]",
                    )}
                  >
                    <div className="text-sm md:text-base font-medium text-foreground/80">1. 當月收入（NT$）</div>
                    <p className="mt-2 text-2xl md:text-3xl font-bold tabular-nums text-[hsl(var(--primary))]">
                      {monthlyReport.revenue_ntd.toLocaleString()}
                    </p>
                  </div>
                  <div
                    className={cn(
                      "rounded-xl border border-[hsl(var(--primary)/0.25)] bg-background/80",
                      "p-4 shadow-[inset_0_1px_0_0_hsl(var(--primary)/0.08)]",
                    )}
                  >
                    <div className="text-sm md:text-base font-medium text-foreground/80">2. 當月訂單筆數</div>
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
                    <div className="text-sm md:text-base font-medium text-foreground/80">3. 當月商品熱銷第一名</div>
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
            <CardHeader className="space-y-1 border-b border-[hsl(var(--primary)/0.2)] bg-[hsl(var(--primary)/0.06)] pb-4">
              <CardTitle className="text-xl md:text-2xl font-semibold tracking-tight text-[hsl(var(--primary))]">
                年度報告
              </CardTitle>
              <p className="text-sm text-muted-foreground font-normal leading-relaxed">
                統計區間為上方選擇之 {selectedYear} 年（與排程 webhook 年度 JSON 一致）
              </p>
            </CardHeader>
            <CardContent className="space-y-4 p-5 md:p-6">
              {!yearlyReport ? (
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
                    <p className="mt-2 text-2xl md:text-3xl font-bold tabular-nums text-[hsl(var(--primary))]">
                      {yearlyReport.revenue_ntd.toLocaleString()}
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
      </div>
    </div>
  );
};

export default AdminDashboard;
