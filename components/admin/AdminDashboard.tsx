import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format, startOfYear, endOfYear, subYears, addYears } from "date-fns";
import { zhTW } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";

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

const AdminDashboard = () => {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [revenueData, setRevenueData] = useState<MonthlyRevenue[]>([]);
  const [popularProducts, setPopularProducts] = useState<ProductPopularity[]>([]);
  const [orderCountData, setOrderCountData] = useState<MonthlyOrderCount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, [selectedYear]);

  const loadDashboardData = async () => {
    setLoading(true);
    await Promise.all([loadRevenueData(), loadPopularProducts(), loadOrderCountData()]);
    setLoading(false);
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

  // 載入熱門商品數據（該年度前5名）
  const loadPopularProducts = async () => {
    const yearStart = startOfYear(new Date(selectedYear, 0, 1));
    const yearEnd = endOfYear(new Date(selectedYear, 0, 1));

    // 先載入產品名稱對照表
    const { data: products } = await supabase.from("products").select("id, name");

    const productNameMap = new Map<string, string>();
    (products || []).forEach((p) => {
      productNameMap.set(p.id, p.name || p.id);
    });

    // 載入該年度的訂單
    const { data: ordersData } = await supabase
      .from("orders")
      .select("id, created_at")
      .gte("created_at", yearStart.toISOString())
      .lte("created_at", yearEnd.toISOString());

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
                  <Tooltip formatter={(value: number) => [`NT$ ${value.toLocaleString()}`, "營收"]} />
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
                  <Tooltip formatter={(value: number) => [`${value} 筆`, "訂單數"]} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 第二列：熱門商品 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">熱門商品（前5名）- {selectedYear}年</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px] md:h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={popularProducts} layout="horizontal">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="product_name" />
                  <YAxis label={{ value: "出現次數", angle: -90, position: "insideLeft" }} />
                  <Tooltip formatter={(value: number) => [`${value} 次`, "出現次數"]} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminDashboard;
