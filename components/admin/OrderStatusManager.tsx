import { useState, useEffect, useCallback, Fragment } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Check, ChevronDown, ChevronUp, ExternalLink, Plus, Trash2, CalendarIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { getEdgeFunctionErrorDetail } from "@/lib/edge-function-error";
import { asOrderCustomizationsList } from "@/lib/order-item-customizations";
import ManualOrderForm from "./ManualOrderForm";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Order {
  id: string;
  created_at: string;
  user_id: string;
  total_amount: number;
  subtotal: number;
  shipping_fee: number;
  shipping_way: string;
  shipping_address_text: string;
  who_receive: string | null;
  notes: string | null;
  expected_pickup_date: string | null;
  payment_step: "pending" | "submitted" | "verified";
  order_status: "awaiting_payment" | "processing" | "shipped" | "delivered" | "canceled" | "returned";
  transfer_last5: string | null;
  admin_verified_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  is_manual_order?: boolean;
  is_from_quotation?: boolean;
  auto_cancel_exempt?: boolean;
  admin_note?: string | null;
  Email?: string | null;
  TAX_id?: number | null;
  TAX_title?: string | null;
  phone?: string | null;
  line_user_id?: string | null;
  payment_method?: string | null;
  is_hide?: boolean;
  /** 客戶類型：general | flash_ip | pr_agency */
  customer_type?: string | null;
  /** 歷史／手動單可能寫入；後台「訂購人」顯示一律依 user_id 查 user_log_in.name */
  orderer_name?: string | null;
}

/** 訂購人顯示名稱：依 orders.user_id 對應 user_log_in.name（無 orders.name 欄位） */
function buyerDisplayName(userInfo: User | undefined): string {
  const n = userInfo?.name?.trim();
  return n || "";
}

const CUSTOMER_TYPE_OPTIONS = [
  { value: "general", label: "一般用戶" },
  { value: "flash_ip", label: "快閃店/IP" },
  { value: "pr_agency", label: "公關公司/福委會" },
] as const;

function customerTypeLabel(v: string | null | undefined): string | null {
  if (!v) return null;
  return CUSTOMER_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v;
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

interface User {
  id: string;
  email: string;
  name: string;
}

const OrderStatusManager = () => {
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState("pending");
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderItems, setOrderItems] = useState<Record<string, OrderItem[]>>({});
  const [users, setUsers] = useState<Record<string, User>>({});
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [showManualOrderForm, setShowManualOrderForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, any>>({});
  const [savingEdit, setSavingEdit] = useState(false);

  // Loading action state to prevent duplicate clicks
  const [loadingAction, setLoadingAction] = useState<{
    orderId: string;
    action: string;
  } | null>(null);

  // 搜尋篩選狀態
  const [searchQuery, setSearchQuery] = useState("");
  const [searchDate, setSearchDate] = useState<Date | undefined>();
  const [customerTypePopoverId, setCustomerTypePopoverId] = useState<string | null>(null);

  // 使用 useCallback 包裝 loadOrders 避免閉包問題
  const loadOrders = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("is_hide", false)
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        title: "載入訂單失敗",
        description: error.message,
        variant: "destructive",
      });
    } else {
      const sorted = (data || []).slice().sort((a, b) => {
        const d1 = a.expected_pickup_date || "9999-12-31";
        const d2 = b.expected_pickup_date || "9999-12-31";
        return d1.localeCompare(d2);
      });
      setOrders(sorted);
      const userIds = [...new Set(data?.map((o) => o.user_id) || [])];
      loadUsers(userIds);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // 當頁面重新獲得焦點時自動刷新訂單
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        loadOrders();
      }
    };

    const handleFocus = () => {
      loadOrders();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [loadOrders]);

  const loadUsers = async (userIds: string[]) => {
    if (userIds.length === 0) return;
    const { data, error } = await supabase
      .from("user_log_in")
      .select("id, email, name")
      .in("id", userIds);

    if (!error && data) {
      setUsers((prev) => {
        const next = { ...prev };
        data.forEach((u) => {
          next[u.id] = u;
        });
        return next;
      });
    }
  };

  const loadOrderItems = async (orderId: string) => {
    if (orderItems[orderId]) return;

    const { data, error } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", orderId);

    if (error) {
      toast({
        title: "載入訂單項目失敗",
        description: error.message,
        variant: "destructive",
      });
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

  const openEditOrder = (order: Order) => {
    setEditingOrder(order);
    if (order.user_id) void loadUsers([order.user_id]);
    setEditDraft({
      user_id: order.user_id,
      Email: order.Email ?? "",
      who_receive: order.who_receive ?? "",
      phone: order.phone ?? "",
      line_user_id: order.line_user_id ?? "",
      shipping_way: order.shipping_way ?? "",
      shipping_address_text: order.shipping_address_text ?? "",
      expected_pickup_date: order.expected_pickup_date ?? "",
      notes: order.notes ?? "",
      TAX_title: order.TAX_title ?? "",
      TAX_id: order.TAX_id ?? "",
      payment_method: order.payment_method ?? "",
      payment_step: order.payment_step ?? "pending",
      order_status: order.order_status ?? "awaiting_payment",
      transfer_last5: order.transfer_last5 ?? "",
      subtotal: order.subtotal ?? 0,
      shipping_fee: order.shipping_fee ?? 0,
      total_amount: order.total_amount ?? 0,
      admin_note: order.admin_note ?? "",
      is_manual_order: !!order.is_manual_order,
      is_from_quotation: !!order.is_from_quotation,
      auto_cancel_exempt: !!order.auto_cancel_exempt,
      is_hide: !!order.is_hide,
      customer_type: order.customer_type ?? "",
    });
  };

  /** 客戶類型：直接更新 orders（RLS 已允許 admin），不依賴雲端是否已部署含 customer_type 的 admin-update-order */
  const updateCustomerType = async (orderId: string, type: string | null) => {
    try {
      const { error } = await supabase.from("orders").update({ customer_type: type }).eq("id", orderId);
      if (error) {
        toast({ title: "更新客戶類型失敗", description: error.message, variant: "destructive" });
        return;
      }
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, customer_type: type } : o)));
      toast({ title: "已更新客戶類型" });
    } catch (err: unknown) {
      toast({
        title: "更新客戶類型失敗",
        description: err instanceof Error ? err.message : "請稍後再試",
        variant: "destructive",
      });
    } finally {
      setCustomerTypePopoverId(null);
    }
  };

  const saveOrderEdits = async () => {
    if (!editingOrder) return;
    setSavingEdit(true);
    try {
      const patch: Record<string, any> = { ...editDraft };
      if (patch.TAX_id === "") patch.TAX_id = null;
      if (typeof patch.TAX_id === "string") patch.TAX_id = patch.TAX_id ? Number(patch.TAX_id) : null;
      if (patch.Email === "") patch.Email = null;
      if (patch.phone === "") patch.phone = null;
      if (patch.line_user_id === "") patch.line_user_id = null;
      if (patch.who_receive === "") patch.who_receive = null;
      if (patch.notes === "") patch.notes = null;
      if (patch.TAX_title === "") patch.TAX_title = null;
      if (patch.transfer_last5 === "") patch.transfer_last5 = null;
      if (patch.admin_note === "") patch.admin_note = null;
      if (patch.expected_pickup_date === "") patch.expected_pickup_date = null;
      if (patch.customer_type === "") patch.customer_type = null;
      delete patch.orderer_name;

      const { data, error } = await supabase.functions.invoke("admin-update-order", {
        body: { order_id: editingOrder.id, patch },
      });

      const noUpdatableFields = (msg: string) =>
        msg.includes("沒有可更新的欄位") || msg.toLowerCase().includes("no fields");

      let updated: Order | undefined = data?.order as Order | undefined;

      if (error) {
        const detail = await getEdgeFunctionErrorDetail(error);
        if (noUpdatableFields(detail)) {
          const { data: row, error: directErr } = await supabase
            .from("orders")
            .update(patch)
            .eq("id", editingOrder.id)
            .select("*")
            .single();
          if (directErr || !row) {
            toast({
              title: "更新失敗",
              description: directErr?.message ?? "請稍後再試",
              variant: "destructive",
            });
            return;
          }
          updated = row as Order;
        } else {
          toast({ title: "更新失敗", description: detail, variant: "destructive" });
          return;
        }
      } else if (data?.error) {
        const msg =
          (data as { details?: string; error?: string }).details ||
          (data as { error: string }).error ||
          "";
        if (noUpdatableFields(msg)) {
          const { data: row, error: directErr } = await supabase
            .from("orders")
            .update(patch)
            .eq("id", editingOrder.id)
            .select("*")
            .single();
          if (directErr || !row) {
            toast({
              title: "更新失敗",
              description: directErr?.message ?? msg,
              variant: "destructive",
            });
            return;
          }
          updated = row as Order;
        } else {
          toast({
            title: "更新失敗",
            description: msg,
            variant: "destructive",
          });
          return;
        }
      }

      if (updated?.id) {
        setOrders((prev) => prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o)));
      } else {
        await loadOrders();
      }
      toast({ title: "✅ 訂單已更新" });
      setEditingOrder(null);
    } catch (e: unknown) {
      const detail =
        e && typeof e === "object" && "message" in e && typeof (e as Error).message === "string"
          ? await getEdgeFunctionErrorDetail(e)
          : "請稍後再試";
      toast({ title: "更新失敗", description: detail, variant: "destructive" });
    } finally {
      setSavingEdit(false);
    }
  };

  // 統一的狀態更新函式 - 透過 Edge Function
  const handleStatusUpdate = async (orderId: string, newStatus: string, actionType: string) => {
    // Prevent duplicate clicks
    if (loadingAction) return;

    setLoadingAction({ orderId, action: actionType });

    try {
      const { data, error } = await supabase.functions.invoke('update-order-status', {
        body: { 
          order_id: orderId, 
          new_status: newStatus,
          action_type: actionType
        }
      });

      if (error) {
        console.error("Edge function error:", error);
        toast({ 
          title: "操作失敗", 
          description: error.message, 
          variant: "destructive" 
        });
        return;
      }

      if (data?.success) {
        let message = data.message || "狀態已更新";
        if (data.notification_sent) {
          message += "，LINE 通知已發送";
        } else if (!data.line_linked) {
          message += "（用戶未連結 LINE）";
        }
        toast({ title: `✅ ${message}` });
        loadOrders();
      } else {
        toast({ 
          title: "操作失敗", 
          description: data?.error || "未知錯誤", 
          variant: "destructive" 
        });
      }
    } catch (err) {
      console.error("Status update error:", err);
      toast({ 
        title: "操作失敗", 
        description: "請稍後再試", 
        variant: "destructive" 
      });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleVerifyPayment = async (orderId: string) => {
    await handleStatusUpdate(orderId, "processing", "verify_payment");
  };

  const handleConfirmShipment = async (orderId: string) => {
    await handleStatusUpdate(orderId, "shipped", "confirm_shipment");
  };

  const handleMarkDelivered = async (orderId: string) => {
    await handleStatusUpdate(orderId, "delivered", "mark_delivered");
  };

  const handleReturn = async (orderId: string) => {
    await handleStatusUpdate(orderId, "returned", "return");
  };

  // 隱藏訂單（軟刪除）
  const handleDeleteOrder = async (orderId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("delete-order", {
        body: { order_id: orderId },
      });

      if (error) {
        console.error("隱藏訂單錯誤:", error);
        toast({
          title: "隱藏失敗",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      if (data?.success) {
        toast({ title: "✅ 訂單已成功隱藏" });
        loadOrders();
      } else {
        toast({
          title: "隱藏失敗",
          description: data?.error || "未知錯誤",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("隱藏訂單錯誤:", err);
      toast({
        title: "隱藏失敗",
        description: "請稍後再試",
        variant: "destructive",
      });
    }
  };

  const getFilteredOrders = () => {
    let filtered = orders;

    // 1. 先按 Tab 篩選
    switch (activeTab) {
      case "pending":
        filtered = filtered.filter((o) => o.payment_step === "pending" || o.payment_step === "submitted");
        break;
      case "processing":
        filtered = filtered.filter((o) => o.order_status === "processing");
        break;
      case "shipping":
        filtered = filtered.filter((o) => o.order_status === "shipped");
        break;
      case "history":
        filtered = filtered.filter((o) => o.order_status === "delivered");
        break;
      case "returned":
        filtered = filtered.filter((o) => o.order_status === "returned");
        break;
      case "all":
        // 不篩選狀態，顯示所有訂單
        break;
    }

    // 2. 文字搜尋：用戶名、用戶信箱、收件人、訂單號前五碼（報價單訂單以 who_receive 當作用戶名）
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((order) => {
        const userInfo = users[order.user_id];
        const userName = order.is_from_quotation ? "" : (userInfo?.name?.toLowerCase() || "");
        const userEmail = order.is_from_quotation ? "" : (userInfo?.email?.toLowerCase() || "");
        const recipientName = (order.who_receive || "").toLowerCase();
        const orderIdPrefix = order.id.slice(0, 5).toLowerCase();

        return (
          userName.includes(query) ||
          userEmail.includes(query) ||
          recipientName.includes(query) ||
          orderIdPrefix.includes(query)
        );
      });
    }

    // 3. 日期篩選：預計取件日期
    if (searchDate) {
      const targetDate = format(searchDate, "yyyy-MM-dd");
      filtered = filtered.filter((order) => order.expected_pickup_date === targetDate);
    }

    return filtered;
  };

  const filteredOrders = getFilteredOrders();

  // If showing manual order form, render it instead
  if (showManualOrderForm) {
    return (
      <ManualOrderForm
        onClose={() => setShowManualOrderForm(false)}
        onSuccess={() => loadOrders()}
      />
    );
  }

  return (
    <>
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>訂單狀態管理</CardTitle>
          <CardDescription>管理和追蹤所有訂單狀態</CardDescription>
        </div>
        <Button onClick={() => setShowManualOrderForm(true)}>
          <Plus className="h-4 w-4 mr-2" /> 手動建立訂單
        </Button>
      </CardHeader>
      <CardContent>
        {/* 搜尋篩選區 */}
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder="搜尋：用戶名、收件人、訂單號前五碼..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full"
            />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[180px] justify-start">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {searchDate ? format(searchDate, "yyyy-MM-dd") : "篩選取件日期"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={searchDate}
                onSelect={setSearchDate}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
          {(searchQuery || searchDate) && (
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => { setSearchQuery(""); setSearchDate(undefined); }}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex w-full overflow-x-auto overflow-y-hidden flex-nowrap gap-2 px-2 py-1.5 justify-start md:grid md:grid-cols-6 md:overflow-visible md:flex-wrap md:px-1 md:py-1 md:justify-center">
            <TabsTrigger value="pending" className="flex-shrink-0 min-w-[4.25rem] px-4 py-2 tracking-wide text-center md:min-w-0">待付款</TabsTrigger>
            <TabsTrigger value="processing" className="flex-shrink-0 min-w-[4.25rem] px-4 py-2 tracking-wide text-center md:min-w-0">處理中</TabsTrigger>
            <TabsTrigger value="shipping" className="flex-shrink-0 min-w-[4.25rem] px-4 py-2 tracking-wide text-center md:min-w-0">出貨中</TabsTrigger>
            <TabsTrigger value="history" className="flex-shrink-0 min-w-[5rem] px-4 py-2 tracking-wide text-center md:min-w-0">歷史訂單</TabsTrigger>
            <TabsTrigger value="returned" className="flex-shrink-0 min-w-[5rem] px-4 py-2 tracking-wide text-center md:min-w-0">退貨紀錄</TabsTrigger>
            <TabsTrigger value="all" className="flex-shrink-0 min-w-[5rem] px-4 py-2 tracking-wide text-center md:min-w-0">所有訂單</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-6">
            {loading ? (
              <p className="text-center text-muted-foreground py-12">載入中...</p>
            ) : filteredOrders.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">目前沒有訂單</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>訂單號</TableHead>
                    <TableHead>預計取件日期</TableHead>
                    <TableHead>用戶</TableHead>
                    <TableHead>金額</TableHead>
                    <TableHead>配送方式</TableHead>
                    <TableHead>付款狀態</TableHead>
                    <TableHead>訂單狀態</TableHead>
                    <TableHead>操作</TableHead>
                    <TableHead>管理員備注</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => {
                    const isExpanded = expandedOrders.has(order.id);
                    const items = orderItems[order.id] || [];
                    const userInfo = users[order.user_id];

                    return (
                      <Fragment key={order.id}>
                        <TableRow>
                          <TableCell className="font-medium">#{order.id.slice(0, 6).toUpperCase()}</TableCell>
                          <TableCell>{order.expected_pickup_date || "未指定"}</TableCell>
                          <TableCell>
                            {order.is_from_quotation ? (
                              <>
                                {(order.who_receive || "未填寫") + "（報價單）"}
                                <br />
                                <span className="text-xs text-muted-foreground">非網站會員</span>
                              </>
                            ) : order.is_manual_order ? (
                              <>
                                <span className="font-medium">訂購：{buyerDisplayName(userInfo) || "—"}</span>
                                {order.who_receive?.trim() && (
                                  <>
                                    <br />
                                    <span className="text-sm text-muted-foreground">收件：{order.who_receive}</span>
                                  </>
                                )}
                                <br />
                                <span className="text-xs text-muted-foreground">（手動）</span>
                              </>
                            ) : (
                              <>
                                {userInfo?.name || "載入中..."}
                                <br />
                                <span className="text-xs text-muted-foreground">{userInfo?.email}</span>
                              </>
                            )}
                          </TableCell>
                          <TableCell>NT$ {order.total_amount}</TableCell>
                          <TableCell>{order.shipping_way}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                order.payment_step === "verified"
                                  ? "default"
                                  : order.payment_step === "submitted"
                                    ? "secondary"
                                    : "outline"
                              }
                            >
                              {order.payment_step === "pending" && "未匯款"}
                              {order.payment_step === "submitted" && "他匯款ㄌ"}
                              {order.payment_step === "verified" && "已確認"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                order.order_status === "delivered"
                                  ? "default"
                                  : order.order_status === "shipped"
                                    ? "secondary"
                                    : order.order_status === "returned"
                                      ? "destructive"
                                      : "outline"
                              }
                            >
                              {order.order_status === "awaiting_payment" && "等待付款"}
                              {order.order_status === "processing" && "處理中"}
                              {order.order_status === "shipped" && "出貨中"}
                              {order.order_status === "delivered" && "已送達"}
                              {order.order_status === "returned" && "已退貨"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2 items-center">
                              <Button size="sm" variant="outline" onClick={() => toggleOrderExpand(order.id)}>
                                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </Button>
                              {order.payment_step === "submitted" && (
                                <Button
                                  size="sm"
                                  onClick={() => handleVerifyPayment(order.id)}
                                  disabled={loadingAction !== null}
                                >
                                  {loadingAction?.orderId === order.id && loadingAction?.action === "verify_payment"
                                    ? "處理中..."
                                    : "確認收到匯款"}
                                </Button>
                              )}
                              {order.order_status === "processing" && (
                                <Button
                                  size="sm"
                                  onClick={() => handleConfirmShipment(order.id)}
                                  disabled={loadingAction !== null}
                                >
                                  {loadingAction?.orderId === order.id && loadingAction?.action === "confirm_shipment"
                                    ? "處理中..."
                                    : "確認出貨"}
                                </Button>
                              )}
                              {order.order_status === "shipped" && (
                                <Button
                                  size="sm"
                                  onClick={() => handleMarkDelivered(order.id)}
                                  disabled={loadingAction !== null}
                                >
                                  {loadingAction?.orderId === order.id && loadingAction?.action === "mark_delivered"
                                    ? "處理中..."
                                    : "標記已送達"}
                                </Button>
                              )}
                              {order.order_status === "delivered" && activeTab === "history" && (
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleReturn(order.id)}
                                  disabled={loadingAction !== null}
                                >
                                  {loadingAction?.orderId === order.id && loadingAction?.action === "return"
                                    ? "處理中..."
                                    : "退貨"}
                                </Button>
                              )}
                              {/* 隱藏訂單按鈕 */}
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>確定要隱藏此訂單？</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      此操作會隱藏訂單，資料不會被刪除，可在資料庫中恢復。
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>取消</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDeleteOrder(order.id)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      確定隱藏
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                          <TableCell className="min-w-[140px]">
                            <div className="flex flex-col gap-1.5">
                              <div className="flex flex-wrap items-center gap-1">
                                {order.is_manual_order && (
                                  <Badge variant="outline" className="w-fit bg-amber-50 text-amber-700 border-amber-300">
                                    手動訂單
                                  </Badge>
                                )}
                                <Popover
                                  open={customerTypePopoverId === order.id}
                                  onOpenChange={(open) => setCustomerTypePopoverId(open ? order.id : null)}
                                >
                                  <PopoverTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className={cn(
                                        "h-7 shrink-0 gap-1 px-2 font-normal",
                                        order.customer_type &&
                                          customerTypeLabel(order.customer_type) &&
                                          "border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100 hover:text-sky-950",
                                      )}
                                      aria-label={
                                        order.customer_type && customerTypeLabel(order.customer_type)
                                          ? "修改客戶類型"
                                          : "新增客戶類型"
                                      }
                                    >
                                      {order.customer_type && customerTypeLabel(order.customer_type) ? (
                                        <>
                                          <span className="max-w-[140px] truncate">
                                            {customerTypeLabel(order.customer_type)}
                                          </span>
                                          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
                                        </>
                                      ) : (
                                        <Plus className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-56 p-2" align="start">
                                    <p className="text-xs text-muted-foreground px-2 pb-1">客戶類型（可點選變更）</p>
                                    <div className="flex flex-col gap-0.5">
                                      {CUSTOMER_TYPE_OPTIONS.map((opt) => {
                                        const selected = order.customer_type === opt.value;
                                        return (
                                          <Button
                                            key={opt.value}
                                            type="button"
                                            variant={selected ? "secondary" : "ghost"}
                                            size="sm"
                                            className="h-8 w-full justify-start gap-2 px-2"
                                            onClick={() => void updateCustomerType(order.id, opt.value)}
                                          >
                                            {selected ? (
                                              <Check className="h-4 w-4 shrink-0" aria-hidden />
                                            ) : (
                                              <span className="w-4 shrink-0" aria-hidden />
                                            )}
                                            {opt.label}
                                          </Button>
                                        );
                                      })}
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="justify-start h-8 text-muted-foreground"
                                        onClick={() => void updateCustomerType(order.id, null)}
                                      >
                                        清除標籤
                                      </Button>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              </div>
                              <Button variant="outline" size="sm" className="h-8" onClick={() => openEditOrder(order)}>
                                編輯訂單
                              </Button>
                              <Input
                                placeholder="備注..."
                                className="h-8 text-sm"
                                defaultValue={order.admin_note ?? ""}
                                onBlur={async (e) => {
                                  const value = e.target.value.trim();
                                  if (value === (order.admin_note ?? "")) return;
                                  try {
                                    const { data, error } = await supabase.functions.invoke("admin-update-order", {
                                      body: { order_id: order.id, patch: { admin_note: value || null } },
                                    });
                                    if (error) {
                                      const detail = await getEdgeFunctionErrorDetail(error);
                                      toast({ title: "儲存備注失敗", description: detail, variant: "destructive" });
                                      return;
                                    }
                                    if (data?.error) {
                                      toast({
                                        title: "儲存備注失敗",
                                        description:
                                          (data as { details?: string; error?: string }).details ||
                                          (data as { error: string }).error,
                                        variant: "destructive",
                                      });
                                      return;
                                    }
                                    setOrders((prev) =>
                                      prev.map((o) => (o.id === order.id ? { ...o, admin_note: value || null } : o)),
                                    );
                                  } catch (err: unknown) {
                                    const detail = await getEdgeFunctionErrorDetail(err);
                                    toast({ title: "儲存備注失敗", description: detail, variant: "destructive" });
                                  }
                                }}
                              />
                            </div>
                          </TableCell>
                        </TableRow>

                        {isExpanded && (
                          <TableRow key={`${order.id}-detail`}>
                            <TableCell colSpan={9} className="bg-muted/30">
                              <div className="p-4 space-y-4">
                                <div className="grid md:grid-cols-2 gap-6 text-sm">
                                  <div className="space-y-3">
                                    <div>
                                      <span className="font-medium">收件人：</span>
                                      {order.who_receive || "未填寫"}
                                    </div>
                                    <div>
                                      <span className="font-medium">會員名（訂購人）：</span>
                                      {buyerDisplayName(userInfo) || "—"}
                                    </div>
                                    <div>
                                      <span className="font-medium">預計取件日：</span>
                                      {order.expected_pickup_date || "未指定"}
                                    </div>
                                    <div>
                                      <span className="font-medium">電話：</span>
                                      {order.phone || "未填寫"}
                                    </div>
                                    <div>
                                      <span className="font-medium">聯絡信箱：</span>
                                      {order.Email || "未填寫"}
                                    </div>
                                    <div>
                                      <span className="font-medium">配送方式：</span>
                                      {order.shipping_way || "未指定"}
                                    </div>
                                  </div>
                                  <div className="space-y-3">
                                    <div>
                                      <span className="font-medium">商品小計：</span>
                                      NT$ {order.subtotal || 0}
                                    </div>
                                    <div>
                                      <span className="font-medium">運費：</span>
                                      NT$ {order.shipping_fee || 0}
                                    </div>
                                    <div className="font-semibold text-primary">
                                      <span className="font-medium text-foreground">總計（含運費）：</span>
                                      NT$ {order.total_amount}
                                    </div>
                                    <div>
                                      <span className="font-medium">發票抬頭：</span>
                                      {order.TAX_title || "—"}
                                    </div>
                                    <div>
                                      <span className="font-medium">統一編號：</span>
                                      {order.TAX_id ?? "—"}
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-2 text-sm border-t border-border pt-4">
                                  <div>
                                    <span className="font-medium">地址：</span>
                                    {order.shipping_address_text || "—"}
                                  </div>
                                  {order.notes && (
                                    <div>
                                      <span className="font-medium">備註：</span>
                                      {order.notes}
                                    </div>
                                  )}
                                  {order.transfer_last5 && (
                                    <div>
                                      <span className="font-medium">轉帳末五碼：</span>
                                      {order.transfer_last5}
                                    </div>
                                  )}
                                </div>

                                <Separator />

                                <div>
                                  <h4 className="font-semibold mb-3">商品明細</h4>
                                  {items.map((item) => {
                                    const customizationRows = asOrderCustomizationsList(item.customizations_json);
                                    return (
                                    <div key={item.order_item_id} className="flex gap-4 mb-4 p-3 bg-background rounded-lg">
                                      {item.preview_url && (
                                        <div className="flex flex-col items-center gap-1">
                                          <img
                                            src={item.preview_url}
                                            alt={item.product_name}
                                            className="w-24 h-24 rounded object-cover"
                                          />
                                          <a
                                            href={item.preview_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-primary hover:underline inline-flex items-center"
                                          >
                                            查看原圖 <ExternalLink className="ml-1 h-3 w-3" />
                                          </a>
                                        </div>
                                      )}
                                      <div className="flex-1 space-y-2">
                                        <p className="font-medium">{item.product_name}</p>
                                        {customizationRows.length > 0 && (
                                          <div className="space-y-1 text-sm text-muted-foreground">
                                            {customizationRows.map((custom: any, idx: number) => (
                                              <div key={idx}>
                                                <span className="font-medium">{custom.group_name_zh}：</span>
                                                {custom.summary}
                                                {custom.value?.url && (
                                                  <a
                                                    href={custom.value.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="ml-2 text-primary hover:underline inline-flex items-center"
                                                  >
                                                    查看 <ExternalLink className="ml-1 h-3 w-3" />
                                                  </a>
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                        <div className="text-sm">
                                          <span className="text-muted-foreground">單價：</span>
                                          NT$ {Number(item.unit_price ?? 0).toLocaleString()}
                                        </div>
                                        <div className="text-sm">
                                          <span className="text-muted-foreground">數量：</span>
                                          {item.quantity_description || item.quantity}
                                        </div>
                                        <div className="text-sm font-semibold">
                                          小計：NT$ {item.unit_price * item.quantity}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                  })}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>

    <Dialog open={!!editingOrder} onOpenChange={(open) => (!open ? setEditingOrder(null) : null)}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>編輯訂單資訊</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 overflow-y-auto pr-1">
          <div className="space-y-1">
            <span className="text-sm text-muted-foreground">用戶 ID（user_id）</span>
            <Input
              value={editDraft.user_id ?? ""}
              onChange={(e) => setEditDraft((p) => ({ ...p, user_id: e.target.value }))}
              onBlur={(e) => {
                const id = e.currentTarget.value.trim();
                if (id) void loadUsers([id]);
              }}
            />
            <p className="text-xs text-muted-foreground">
              訂購人姓名取自 <code className="text-[11px] bg-muted px-1 rounded">user_log_in.name</code>
              （依 user_id），非 orders 上的 name 欄位。
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-sm text-muted-foreground">訂購人（會員姓名）</span>
            <Input
              readOnly
              className="bg-muted/50"
              value={buyerDisplayName(users[editDraft.user_id ?? ""]) || "—"}
              title="由 user_log_in.name 顯示，請至客戶管理修改會員姓名"
            />
          </div>
          <div className="space-y-1">
            <span className="text-sm text-muted-foreground">LINE user_id</span>
            <Input
              value={editDraft.line_user_id ?? ""}
              onChange={(e) => setEditDraft((p) => ({ ...p, line_user_id: e.target.value }))}
              placeholder="Uxxxxxxxx..."
            />
          </div>
          <div className="space-y-1">
            <span className="text-sm text-muted-foreground">聯絡信箱</span>
            <Input value={editDraft.Email ?? ""} onChange={(e) => setEditDraft((p) => ({ ...p, Email: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <span className="text-sm text-muted-foreground">電話</span>
            <Input value={editDraft.phone ?? ""} onChange={(e) => setEditDraft((p) => ({ ...p, phone: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <span className="text-sm text-muted-foreground">實際收件人 who_receive</span>
            <Input value={editDraft.who_receive ?? ""} onChange={(e) => setEditDraft((p) => ({ ...p, who_receive: e.target.value }))} />
          </div>
          <div className="space-y-1 col-span-2">
            <span className="text-sm text-muted-foreground">客戶類型</span>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm bg-background"
              value={editDraft.customer_type ?? ""}
              onChange={(e) => setEditDraft((p) => ({ ...p, customer_type: e.target.value }))}
            >
              <option value="">未設定</option>
              {CUSTOMER_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <span className="text-sm text-muted-foreground">預計取件日期 (YYYY-MM-DD)</span>
            <Input
              value={editDraft.expected_pickup_date ?? ""}
              onChange={(e) => setEditDraft((p) => ({ ...p, expected_pickup_date: e.target.value }))}
              placeholder="2026-03-18"
            />
          </div>
          <div className="space-y-1">
            <span className="text-sm text-muted-foreground">配送方式</span>
            <Input value={editDraft.shipping_way ?? ""} onChange={(e) => setEditDraft((p) => ({ ...p, shipping_way: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <span className="text-sm text-muted-foreground">地址</span>
            <Input
              value={editDraft.shipping_address_text ?? ""}
              onChange={(e) => setEditDraft((p) => ({ ...p, shipping_address_text: e.target.value }))}
            />
          </div>
          <div className="space-y-1 col-span-2">
            <span className="text-sm text-muted-foreground">備註</span>
            <Textarea value={editDraft.notes ?? ""} onChange={(e) => setEditDraft((p) => ({ ...p, notes: e.target.value }))} />
          </div>

          <div className="space-y-1">
            <span className="text-sm text-muted-foreground">發票抬頭</span>
            <Input value={editDraft.TAX_title ?? ""} onChange={(e) => setEditDraft((p) => ({ ...p, TAX_title: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <span className="text-sm text-muted-foreground">統一編號</span>
            <Input value={editDraft.TAX_id ?? ""} onChange={(e) => setEditDraft((p) => ({ ...p, TAX_id: e.target.value.replace(/\D/g, "").slice(0, 8) }))} />
          </div>

          <div className="space-y-1">
            <span className="text-sm text-muted-foreground">付款方式</span>
            <Input value={editDraft.payment_method ?? ""} onChange={(e) => setEditDraft((p) => ({ ...p, payment_method: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <span className="text-sm text-muted-foreground">匯款末五碼</span>
            <Input value={editDraft.transfer_last5 ?? ""} onChange={(e) => setEditDraft((p) => ({ ...p, transfer_last5: e.target.value }))} />
          </div>

          <div className="space-y-1">
            <span className="text-sm text-muted-foreground">付款狀態 payment_step</span>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm bg-background"
              value={editDraft.payment_step ?? "pending"}
              onChange={(e) => setEditDraft((p) => ({ ...p, payment_step: e.target.value }))}
            >
              <option value="pending">pending</option>
              <option value="submitted">submitted</option>
              <option value="verified">verified</option>
            </select>
          </div>
          <div className="space-y-1">
            <span className="text-sm text-muted-foreground">訂單狀態 order_status</span>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm bg-background"
              value={editDraft.order_status ?? "awaiting_payment"}
              onChange={(e) => setEditDraft((p) => ({ ...p, order_status: e.target.value }))}
            >
              <option value="awaiting_payment">awaiting_payment</option>
              <option value="processing">processing</option>
              <option value="shipped">shipped</option>
              <option value="delivered">delivered</option>
              <option value="canceled">canceled</option>
              <option value="returned">returned</option>
            </select>
          </div>

          <div className="space-y-1">
            <span className="text-sm text-muted-foreground">小計</span>
            <Input type="number" value={editDraft.subtotal ?? 0} onChange={(e) => setEditDraft((p) => ({ ...p, subtotal: Number(e.target.value) }))} />
          </div>
          <div className="space-y-1">
            <span className="text-sm text-muted-foreground">運費</span>
            <Input type="number" value={editDraft.shipping_fee ?? 0} onChange={(e) => setEditDraft((p) => ({ ...p, shipping_fee: Number(e.target.value) }))} />
          </div>
          <div className="space-y-1">
            <span className="text-sm text-muted-foreground">總金額</span>
            <Input type="number" value={editDraft.total_amount ?? 0} onChange={(e) => setEditDraft((p) => ({ ...p, total_amount: Number(e.target.value) }))} />
          </div>
          <div className="space-y-1">
            <span className="text-sm text-muted-foreground">管理員備註</span>
            <Input value={editDraft.admin_note ?? ""} onChange={(e) => setEditDraft((p) => ({ ...p, admin_note: e.target.value }))} />
          </div>

          <div className="col-span-2 grid grid-cols-3 gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!editDraft.is_from_quotation}
                onChange={(e) => setEditDraft((p) => ({ ...p, is_from_quotation: e.target.checked }))}
              />
              is_from_quotation
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!editDraft.is_manual_order}
                onChange={(e) => setEditDraft((p) => ({ ...p, is_manual_order: e.target.checked }))}
              />
              is_manual_order
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!editDraft.auto_cancel_exempt}
                onChange={(e) => setEditDraft((p) => ({ ...p, auto_cancel_exempt: e.target.checked }))}
              />
              auto_cancel_exempt
            </label>
          </div>
        </div>

        <DialogFooter className="gap-2 mt-4">
          <Button variant="outline" onClick={() => setEditingOrder(null)}>
            取消
          </Button>
          <Button onClick={saveOrderEdits} disabled={savingEdit}>
            {savingEdit ? "儲存中..." : "儲存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
};

export default OrderStatusManager;