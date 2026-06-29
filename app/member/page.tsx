"use client";

import { Suspense, useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { SafeImage } from "@/components/SafeImage";
import {
  Clock,
  Package,
  Truck,
  History,
  X,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Building2,
  CreditCard,
  Timer,
} from "lucide-react";
import { CREDIT_CARD_ENABLED_FOR_ALL } from "@/lib/site";
import { asOrderCustomizationsList } from "@/lib/order-item-customizations";
import { savePurchaseSnapshot } from "@/lib/purchase-snapshot";
import { Skeleton } from "@/components/ui/skeleton";

interface Order {
  id: string;
  created_at: string;
  total_amount: number;
  subtotal: number;
  shipping_fee: number;
  shipping_way: string;
  shipping_address_text: string;
  who_receive: string | null;
  notes: string | null;
  expected_pickup_date: string | null;
  payment_step: "pending" | "submitted" | "verified";
  order_status: "awaiting_payment" | "processing" | "shipped" | "delivered" | "canceled";
  transfer_last5: string | null;
  TAX_id: number | null;
  TAX_title: string | null;
}

interface OrderItem {
  order_item_id: number;
  product_name: string;
  quantity: number;
  quantity_description: string | null;
  unit_price: number;
  preview_url: string | null;
  customizations_json: any[];
  is_package_design: boolean;
}

const DELIVERY_METHOD_MAP: Record<string, string> = {
  special: "專件配送",
  blackcat: "黑貓宅配",
  pickup: "自取",
};

function MemberPageContent() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "pending");
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderItems, setOrderItems] = useState<Record<string, OrderItem[]>>({});
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [creditCardLoading, setCreditCardLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showPaymentMethodDialog, setShowPaymentMethodDialog] = useState(false);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [transferLast5, setTransferLast5] = useState("");
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [productNames, setProductNames] = useState<Record<string, string>>({});
  const [countdowns, setCountdowns] = useState<Record<string, number>>({});
  const hasScheduledExpiredRefetch = useRef(false);

  const formatCountdown = (ms: number) => {
    if (!ms || ms <= 0) return "已逾時";
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((ms % (1000 * 60)) / 1000);
    return `${hours}時${minutes}分${seconds}秒`;
  };

  const loadOrders = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_hide", false)
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "載入訂單失敗", description: error.message, variant: "destructive" });
    } else {
      setOrders(data || []);
    }
    setLoading(false);
  }, [user, toast]);

  useEffect(() => {
    const loadProductNames = async () => {
      const { data } = await supabase.from("products").select("id, name");
      if (data) {
        const mapping: Record<string, string> = {};
        data.forEach((p: { id: string; name: string }) => {
          mapping[p.id] = p.name || p.id;
        });
        setProductNames(mapping);
      }
    };
    loadProductNames();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const newCountdowns: Record<string, number> = {};
      orders.forEach((order) => {
        if (order.payment_step === "pending") {
          const createdAt = new Date(order.created_at).getTime();
          const deadline = createdAt + 24 * 60 * 60 * 1000;
          const remaining = deadline - Date.now();
          newCountdowns[order.id] = Math.max(0, remaining);
        }
      });
      setCountdowns(newCountdowns);
    }, 1000);
    return () => clearInterval(interval);
  }, [orders]);

  // 24 小時逾時訂單改由 Vercel Cron + auto-cancel-expired-orders Edge Function 主動觸發
  // 當 countdown 歸零時，約 70 秒後自動 refetch，讓訂單從列表消失（cron 已執行）
  useEffect(() => {
    if (orders.length === 0) return;
    const hasExpired = Object.values(countdowns).some((c) => c <= 0);
    if (!hasExpired || hasScheduledExpiredRefetch.current) return;
    hasScheduledExpiredRefetch.current = true;
    const timer = setTimeout(() => {
      loadOrders();
      hasScheduledExpiredRefetch.current = false;
    }, 70000);
    return () => clearTimeout(timer);
  }, [orders.length, countdowns, loadOrders]);


  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam && ["pending", "processing", "shipping", "history"].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!user) {
      router.push("/login?redirect=/member");
      return;
    }
    loadOrders();
    const checkAdminRole = async () => {
      if (!user) return;
      try {
        const { data } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
        setIsAdmin(!!data);
      } catch (error) {
        console.error("檢查管理員權限失敗:", error);
      }
    };
    checkAdminRole();
  }, [user, router, loadOrders]);

  const loadOrderItems = async (orderId: string) => {
    if (orderItems[orderId]) return;
    const { data, error } = await supabase.from("order_items").select("*").eq("order_id", orderId);
    if (error) {
      toast({ title: "載入訂單項目失敗", description: error.message, variant: "destructive" });
    } else {
      setOrderItems((prev) => ({ ...prev, [orderId]: data || [] }));
    }
  };

  const toggleOrderExpand = (orderId: string) => {
    const newExpanded = new Set(expandedOrders);
    if (newExpanded.has(orderId)) {
      newExpanded.delete(orderId);
    } else {
      newExpanded.add(orderId);
      loadOrderItems(orderId);
    }
    setExpandedOrders(newExpanded);
  };

  const handlePaymentSubmit = async () => {
    if (!selectedOrder || !transferLast5 || transferLast5.length !== 5) {
      toast({ title: "請輸入完整的轉帳末五碼", variant: "destructive" });
      return;
    }
    const { error } = await supabase
      .from("orders")
      .update({ payment_step: "submitted", transfer_last5: transferLast5 })
      .eq("id", selectedOrder.id);
    if (error) {
      toast({ title: "提交失敗", description: error.message, variant: "destructive" });
    } else {
      const orderId = selectedOrder.id;
      toast({ title: "✅ 匯款資訊已提交", description: "商家將盡快確認您的付款" });
      setShowTransferDialog(false);
      setTransferLast5("");
      setSelectedOrder(null);
      loadOrders();
      supabase.functions.invoke("update-order-status", {
        body: { order_id: orderId, new_status: "awaiting_payment", action_type: "user_payment_submitted" },
      }).catch((notifyErr) => console.error("[Member] 通知 Edge Function 失敗:", notifyErr));
    }
  };

  const savePurchaseSnapshotForOrder = async (order: Order) => {
    try {
      const { data } = await supabase
        .from("order_items")
        .select("product_id, product_name, quantity, unit_price")
        .eq("order_id", order.id);
      const rows = (data ?? []) as Array<{
        product_id: string | null;
        product_name: string | null;
        quantity: number | null;
        unit_price: number | null;
      }>;
      savePurchaseSnapshot(order.id, {
        value: order.total_amount,
        contentIds: [...new Set(rows.map((r) => r.product_id ?? "").filter(Boolean))],
        items: rows.map((r) => ({
          item_id: r.product_id ?? "",
          item_name: r.product_name ?? "",
          quantity: r.quantity ?? 1,
          price: r.unit_price ?? 0,
        })),
      });
    } catch (err) {
      console.error("[Member] 建立 purchase 快照失敗:", err);
    }
  };

  const handleCreditCardPayment = async () => {
    if (!selectedOrder || !user) return;
    setCreditCardLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ecpay-create-payment", {
        body: { order_id: selectedOrder.id },
      });
      if (error || !data?.html) {
        toast({ title: "付款初始化失敗", description: error?.message || "無法建立付款連結", variant: "destructive" });
        return;
      }
      await savePurchaseSnapshotForOrder(selectedOrder);
      localStorage.setItem("last_creditcard_order_id", selectedOrder.id);
      localStorage.setItem("last_creditcard_started_at", String(Date.now()));
      const container = document.createElement("div");
      container.innerHTML = data.html;
      document.body.appendChild(container);
      const form = container.querySelector("form");
      if (form) form.submit();
    } catch (err) {
      console.error("信用卡付款錯誤:", err);
      toast({ title: "付款失敗", description: "請稍後再試", variant: "destructive" });
    } finally {
      setCreditCardLoading(false);
      setShowPaymentMethodDialog(false);
    }
  };

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible" && user) {
        const lastOrderId = localStorage.getItem("last_creditcard_order_id");
        const lastStartedAt = localStorage.getItem("last_creditcard_started_at");
        if (lastOrderId && lastStartedAt && Date.now() - Number(lastStartedAt) < 30 * 60 * 1000) {
          await loadOrders();
          setActiveTab("processing");
          toast({ title: "訂單狀態已更新", description: "請查看「處理中」分頁確認訂單" });
          localStorage.removeItem("last_creditcard_order_id");
          localStorage.removeItem("last_creditcard_started_at");
          return;
        }
        loadOrders();
      }
    };
    const handleFocus = async () => {
      if (user) {
        const lastOrderId = localStorage.getItem("last_creditcard_order_id");
        const lastStartedAt = localStorage.getItem("last_creditcard_started_at");
        if (lastOrderId && lastStartedAt && Date.now() - Number(lastStartedAt) < 30 * 60 * 1000) {
          await loadOrders();
          setActiveTab("processing");
          toast({ title: "訂單狀態已更新", description: "請查看「處理中」分頁確認訂單" });
          localStorage.removeItem("last_creditcard_order_id");
          localStorage.removeItem("last_creditcard_started_at");
          return;
        }
        loadOrders();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [user, toast, loadOrders]);

  const getFilteredOrders = () => {
    switch (activeTab) {
      case "pending":
        return orders.filter((o) => o.payment_step === "pending" || o.payment_step === "submitted");
      case "processing":
        return orders.filter((o) => o.order_status === "processing");
      case "shipping":
        return orders.filter((o) => o.order_status === "shipped");
      case "history":
        return orders.filter((o) => o.order_status === "delivered");
      default:
        return orders;
    }
  };

  const filteredOrders = getFilteredOrders();
  const pendingCount = orders.filter((o) => o.payment_step === "pending" || o.payment_step === "submitted").length;
  const processingCount = orders.filter((o) => o.order_status === "processing").length;
  const shippingCount = orders.filter((o) => o.order_status === "shipped").length;
  const historyCount = orders.filter((o) => o.order_status === "delivered").length;

  const renderOrderCard = (order: Order) => {
    const isExpanded = expandedOrders.has(order.id);
    const items = orderItems[order.id] || [];
    return (
      <Card key={order.id} className="mb-4 md:mb-6">
        <CardHeader className="pb-3 md:pb-4">
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-lg md:text-xl">訂單編號: #{order.id.slice(0, 6).toUpperCase()}</CardTitle>
              <CardDescription className="text-sm md:text-base">{new Date(order.created_at).toLocaleString("zh-TW")}</CardDescription>
            </div>
            <Badge className="text-xs md:text-sm md:px-3 md:py-1" variant={order.payment_step === "verified" ? "default" : "secondary"}>
              {order.payment_step === "pending" && "未匯款"}
              {order.payment_step === "submitted" && "已匯款，商家確認中"}
              {order.payment_step === "verified" && "已確認"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 md:space-y-4">
          <div className="flex justify-between text-sm md:text-base">
            <span className="text-muted-foreground">配送方式</span>
            <span>{DELIVERY_METHOD_MAP[order.shipping_way] || order.shipping_way}（運費 NT$ {order.shipping_fee}）</span>
          </div>
          <div className="flex justify-between text-sm md:text-base">
            <span className="text-muted-foreground">收件人</span>
            <span>{order.who_receive || "未填寫"}</span>
          </div>
          {order.TAX_title && (
            <div className="flex justify-between text-sm md:text-base">
              <span className="text-muted-foreground">發票抬頭</span>
              <span>{order.TAX_title}</span>
            </div>
          )}
          {order.TAX_id && (
            <div className="flex justify-between text-sm md:text-base">
              <span className="text-muted-foreground">統一編號</span>
              <span>{order.TAX_id}</span>
            </div>
          )}
          <div className="flex justify-between text-sm md:text-base font-semibold">
            <span>總金額</span>
            <span className="text-primary md:text-lg">NT$ {order.total_amount}</span>
          </div>
          <Separator />
          <Button variant="outline" className="w-full md:h-12 md:text-base" onClick={() => toggleOrderExpand(order.id)}>
            {isExpanded ? <><ChevronUp className="mr-2 h-4 w-4 md:h-5 md:w-5" /> 收起訂單詳情</> : <><ChevronDown className="mr-2 h-4 w-4 md:h-5 md:w-5" /> 查看訂單詳情</>}
          </Button>
          {isExpanded && (
            <div className="space-y-4 md:space-y-6 pt-4 md:pt-6 border-t">
              <h4 className="font-semibold md:text-lg">商品明細</h4>
              {items.map((item) => {
                const customizationRows = asOrderCustomizationsList(item.customizations_json);
                return (
                <div key={item.order_item_id} className="space-y-2 md:space-y-3 p-4 md:p-6 bg-background border border-border rounded-lg shadow-sm">
                  <div className="flex items-start gap-4 md:gap-5">
                    <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded bg-muted md:h-24 md:w-24">
                      {item.preview_url ? (
                        <SafeImage
                          src={item.preview_url}
                          alt={item.product_name}
                          fill
                          className="cursor-pointer object-cover hover:opacity-80"
                          sizes="96px"
                          onClick={() => setLightboxImage(item.preview_url)}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">無圖</div>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium md:text-lg">{item.product_name}</p>
                      {customizationRows.length > 0 && (
                        <div className="mt-2 space-y-1 text-sm md:text-base text-muted-foreground">
                          {customizationRows.map((custom: any, idx: number) => (
                            <div key={idx}>
                              <span className="font-medium">{custom.group_name_zh}：</span>
                              {custom.summary}
                              {custom.value?.url && (
                                <a href={custom.value.url} target="_blank" rel="noopener noreferrer" className="ml-2 text-primary hover:underline inline-flex items-center">
                                  查看 <ExternalLink className="ml-1 h-3 w-3 md:h-4 md:w-4" />
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="mt-2 text-sm md:text-base">
                        <span className="text-muted-foreground">單價：</span>
                        NT$ {Number(item.unit_price ?? 0).toLocaleString()}
                      </div>
                      <div className="text-sm md:text-base">
                        <span className="text-muted-foreground">數量：</span>
                        {item.quantity_description || item.quantity}
                      </div>
                      <div className="text-sm md:text-base font-semibold">小計：NT$ {item.unit_price * item.quantity}</div>
                    </div>
                  </div>
                </div>
              );
              })}
              <Separator />
              <div className="space-y-2 text-sm md:text-base">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">商品小計</span>
                  <span>NT$ {order.subtotal}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">運費</span>
                  <span>NT$ {order.shipping_fee}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-semibold text-base md:text-lg">
                  <span>總金額</span>
                  <span className="text-primary">NT$ {order.total_amount}</span>
                </div>
              </div>
              {order.notes && (
                <div className="text-sm md:text-base">
                  <span className="text-muted-foreground">備註：</span>
                  {order.notes}
                </div>
              )}
            </div>
          )}
          {order.payment_step === "pending" && (
            <div className="space-y-3">
              <div className="min-h-[52px] flex items-center justify-center">
                {countdowns[order.id] !== undefined ? (
                  <div
                    className={`flex items-center justify-center gap-2 p-3 rounded-lg text-sm md:text-base font-medium w-full ${
                      countdowns[order.id] <= 0 ? "bg-red-50 border border-red-200 text-red-700" : countdowns[order.id] <= 3600000 ? "bg-orange-50 border border-orange-200 text-orange-700" : "bg-amber-50 border border-amber-200 text-amber-700"
                    }`}
                  >
                    <Timer className="h-4 w-4 md:h-5 md:w-5 flex-shrink-0" />
                    <span>{countdowns[order.id] <= 0 ? "付款時間已逾時，訂單將自動取消" : `剩餘 ${formatCountdown(countdowns[order.id])}`}</span>
                  </div>
                ) : null}
              </div>
              <Button
                className="w-full md:h-12 md:text-base"
                onClick={() => { setSelectedOrder(order); setShowPaymentMethodDialog(true); }}
                disabled={countdowns[order.id] !== undefined && countdowns[order.id] <= 0}
              >
                選擇付款方式
              </Button>
            </div>
          )}
          {order.payment_step === "submitted" && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 md:p-4 text-sm md:text-base text-amber-700">
              已匯款（末五碼：{order.transfer_last5}），商家確認中...
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  if (!user) {
    return (
      <div className="min-h-[calc(100vh-64px)] py-12 bg-gradient-to-b from-background to-brand-50">
        <div className="container max-w-4xl">
          <h1 className="mb-8 md:mb-10 text-ink text-center text-2xl md:text-4xl font-bold">會員中心</h1>
          <Card>
            <CardHeader className="md:py-6">
              <CardTitle className="md:text-2xl">訂單管理</CardTitle>
              <CardDescription className="text-sm md:text-base">請登入以查看您的訂單</CardDescription>
            </CardHeader>
            <CardContent className="md:px-8 py-12 md:py-16">
              <p className="text-center text-muted-foreground">請先登入或註冊以使用會員中心</p>
              <div className="flex justify-center gap-4 mt-6">
                <Button onClick={() => router.push("/login")}>登入</Button>
                <Button variant="outline" onClick={() => router.push("/register")}>註冊</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)] py-12 bg-gradient-to-b from-background to-brand-50">
      <div className="container max-w-4xl">
        <h1 className="mb-8 md:mb-10 text-ink text-center text-2xl md:text-4xl font-bold">會員中心</h1>
        <Card>
          <CardHeader className="md:py-6">
            <CardTitle className="md:text-2xl">訂單管理</CardTitle>
            <CardDescription className="text-sm md:text-base">查看和管理您的所有訂單</CardDescription>
          </CardHeader>
          <CardContent className="md:px-8">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-4 md:h-12 bg-brand-50 p-1 border border-border">
                <TabsTrigger value="pending" className="md:text-base relative data-[state=active]:bg-white data-[state=inactive]:bg-brand-100/50 data-[state=inactive]:text-ink">
                  <Clock className="mr-1 h-4 w-4 md:h-5 md:w-5" />
                  <span className="hidden sm:inline">待付款</span>
                  {pendingCount > 0 && (
                    <span className="ml-1 inline-flex items-center justify-center h-4 min-w-4 rounded-full bg-red-500/90 text-white text-[13px] font-semibold px-1 translate-y-[-2px]">{pendingCount}</span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="processing" className="md:text-base relative data-[state=active]:bg-white data-[state=inactive]:bg-brand-100/50 data-[state=inactive]:text-ink">
                  <Package className="mr-1 h-4 w-4 md:h-5 md:w-5" />
                  <span className="hidden sm:inline">處理中</span>
                  {processingCount > 0 && (
                    <span className="ml-1 inline-flex items-center justify-center h-4 min-w-4 rounded-full bg-red-500/90 text-white text-[13px] font-semibold px-1 translate-y-[-2px]">{processingCount}</span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="shipping" className="md:text-base relative data-[state=active]:bg-white data-[state=inactive]:bg-brand-100/50 data-[state=inactive]:text-ink">
                  <Truck className="mr-1 h-4 w-4 md:h-5 md:w-5" />
                  <span className="hidden sm:inline">出貨中</span>
                  {shippingCount > 0 && (
                    <span className="ml-1 inline-flex items-center justify-center h-4 min-w-4 rounded-full bg-red-500/90 text-white text-[13px] font-semibold px-1 translate-y-[-2px]">{shippingCount}</span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="history" className="md:text-base relative data-[state=active]:bg-white data-[state=inactive]:bg-brand-100/50 data-[state=inactive]:text-ink">
                  <History className="mr-1 h-4 w-4 md:h-5 md:w-5" />
                  <span className="hidden sm:inline">歷史訂單</span>
                  {historyCount > 0 && (
                    <span className="ml-1 inline-flex items-center justify-center h-4 min-w-4 rounded-full bg-red-500/90 text-white text-[13px] font-semibold px-1 translate-y-[-2px]">{historyCount}</span>
                  )}
                </TabsTrigger>
              </TabsList>
              <TabsContent value={activeTab} className="mt-6 md:mt-8">
                {loading ? (
                  <div className="space-y-4 md:space-y-6" aria-hidden>
                    {[1, 2, 3].map((i) => (
                      <Card key={i}>
                        <CardContent className="p-6 md:p-8">
                          <div className="flex justify-between mb-4">
                            <Skeleton className="h-5 w-24" />
                            <Skeleton className="h-5 w-20" />
                          </div>
                          <Skeleton className="h-4 w-full mb-2" />
                          <Skeleton className="h-4 w-3/4 mb-4" />
                          <div className="flex gap-2">
                            <Skeleton className="h-10 flex-1" />
                            <Skeleton className="h-10 w-28" />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : filteredOrders.length === 0 ? (
                  <p className="text-center text-muted-foreground py-12 md:py-16 text-sm md:text-base">目前沒有訂單</p>
                ) : (
                  filteredOrders.map((order) => renderOrderCard(order))
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showPaymentMethodDialog} onOpenChange={setShowPaymentMethodDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-lg md:text-xl">選擇付款方式</DialogTitle>
            <DialogDescription className="text-sm md:text-base">請選擇本次訂單的付款方式</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 py-2">
            <Button
              type="button"
              variant="outline"
              className="h-auto py-4 md:py-6 flex flex-col items-center gap-2 md:gap-3"
              onClick={() => { setShowPaymentMethodDialog(false); setShowTransferDialog(true); setTransferLast5(""); }}
              disabled={!selectedOrder}
            >
              <Building2 className="h-6 w-6 md:h-8 md:w-8" />
              <span className="text-sm md:text-base font-medium">轉帳</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-auto py-4 md:py-6 flex flex-col items-center gap-2 md:gap-3"
              disabled={(!CREDIT_CARD_ENABLED_FOR_ALL && !isAdmin) || creditCardLoading}
              onClick={handleCreditCardPayment}
            >
              <CreditCard className="h-6 w-6 md:h-8 md:w-8" />
              <span className="text-sm md:text-base font-medium">{creditCardLoading ? "處理中..." : "信用卡付款"}</span>
              {!CREDIT_CARD_ENABLED_FOR_ALL && !isAdmin && <span className="text-xs md:text-sm text-muted-foreground">（尚未開放）</span>}
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowPaymentMethodDialog(false); setSelectedOrder(null); }}>取消</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showTransferDialog}
        onOpenChange={(open) => { if (!open) { setTransferLast5(""); setSelectedOrder(null); } setShowTransferDialog(open); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="md:text-xl">🏦 付款資訊</DialogTitle>
            <DialogDescription className="text-sm md:text-base">請匯款至以下帳戶</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-sm md:text-base font-medium text-muted-foreground">銀行名稱</div>
              <div className="col-span-2 text-sm md:text-base">國泰世華 北新分行（013）</div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-sm md:text-base font-medium text-muted-foreground">戶名</div>
              <div className="col-span-2 text-sm md:text-base">舒喜坊 倪筠舒</div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-sm md:text-base font-medium text-muted-foreground">帳號</div>
              <div className="col-span-2 text-sm md:text-base font-mono">226-03-500474-1</div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-sm md:text-base font-medium text-muted-foreground">金額</div>
              <div className="col-span-2 text-lg md:text-xl font-semibold text-primary">NT$ {selectedOrder?.total_amount}</div>
            </div>
            <Separator />
            <div>
              <label className="text-sm md:text-base font-medium">請匯款後輸入轉帳末五碼</label>
              <Input
                type="text"
                maxLength={5}
                placeholder="請輸入末五碼"
                value={transferLast5}
                onChange={(e) => setTransferLast5(e.target.value.replace(/\D/g, ""))}
                className="mt-2 md:h-12 md:text-base"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowTransferDialog(false); setTransferLast5(""); setSelectedOrder(null); }}>待會匯款</Button>
            <Button onClick={handlePaymentSubmit}>我已匯款 →</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {lightboxImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 cursor-pointer" onClick={() => setLightboxImage(null)}>
          <button type="button" className="absolute top-4 right-4 text-white hover:opacity-80" onClick={() => setLightboxImage(null)}>
            <X className="h-8 w-8" />
          </button>
          <SafeImage
            src={lightboxImage}
            alt="預覽"
            width={1600}
            height={1600}
            className="max-h-[90vh] max-w-[90vw] object-contain"
            sizes="90vw"
          />
        </div>
      )}
    </div>
  );
}

export default function MemberPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[calc(100vh-64px)] py-12 bg-gradient-to-b from-background to-brand-50">
          <div className="container max-w-4xl">
            <Skeleton className="h-10 w-48 mx-auto mb-8 md:mb-10" />
            <Card>
              <CardHeader className="md:py-6">
                <Skeleton className="h-7 w-32 mb-2" />
                <Skeleton className="h-4 w-64" />
              </CardHeader>
              <CardContent className="md:px-8">
                <Skeleton className="h-12 w-full mb-6 md:mb-8" />
                <div className="space-y-4">
                  {[1, 2].map((i) => (
                    <Skeleton key={i} className="h-40 w-full rounded-lg" />
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      }
    >
      <MemberPageContent />
    </Suspense>
  );
}
