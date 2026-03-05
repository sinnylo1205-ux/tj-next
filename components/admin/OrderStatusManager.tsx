import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronUp, ExternalLink, Plus, Trash2, CalendarIcon, X } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import ManualOrderForm from "./ManualOrderForm";
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
  admin_note?: string | null;
  Email?: string | null;
  TAX_id?: number | null;
  TAX_title?: string | null;
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

  // Loading action state to prevent duplicate clicks
  const [loadingAction, setLoadingAction] = useState<{
    orderId: string;
    action: string;
  } | null>(null);

  // 搜尋篩選狀態
  const [searchQuery, setSearchQuery] = useState("");
  const [searchDate, setSearchDate] = useState<Date | undefined>();

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
      const userMap: Record<string, User> = {};
      data.forEach((u) => {
        userMap[u.id] = u;
      });
      setUsers(userMap);
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

    // 2. 文字搜尋：用戶名、用戶信箱、收件人、訂單號前五碼
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((order) => {
        const userInfo = users[order.user_id];
        const userName = userInfo?.name?.toLowerCase() || "";
        const userEmail = userInfo?.email?.toLowerCase() || "";
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
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="pending">待付款</TabsTrigger>
            <TabsTrigger value="processing">處理中</TabsTrigger>
            <TabsTrigger value="shipping">出貨中</TabsTrigger>
            <TabsTrigger value="history">歷史訂單</TabsTrigger>
            <TabsTrigger value="returned">退貨紀錄</TabsTrigger>
            <TabsTrigger value="all">所有訂單</TabsTrigger>
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
                      <>
                        <TableRow key={order.id}>
                          <TableCell className="font-medium">#{order.id.slice(0, 6).toUpperCase()}</TableCell>
                          <TableCell>{order.expected_pickup_date || "未指定"}</TableCell>
                          <TableCell>
                            {userInfo?.name || "載入中..."}
                            <br />
                            <span className="text-xs text-muted-foreground">{userInfo?.email}</span>
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
                              {order.is_manual_order && (
                                <Badge variant="outline" className="w-fit bg-amber-50 text-amber-700 border-amber-300">
                                  手動訂單
                                </Badge>
                              )}
                              <Input
                                placeholder="備注..."
                                className="h-8 text-sm"
                                defaultValue={order.admin_note ?? ""}
                                onBlur={async (e) => {
                                  const value = e.target.value.trim();
                                  if (value === (order.admin_note ?? "")) return;
                                  const { error } = await supabase.from("orders").update({ admin_note: value || null }).eq("id", order.id);
                                  if (error) {
                                    toast({ title: "儲存備注失敗", description: error.message, variant: "destructive" });
                                    return;
                                  }
                                  setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, admin_note: value || null } : o)));
                                }}
                              />
                            </div>
                          </TableCell>
                        </TableRow>

                        {isExpanded && (
                          <TableRow>
                            <TableCell colSpan={9} className="bg-muted/30">
                              <div className="p-4 space-y-4">
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                  <div>
                                    <span className="font-medium">收件人：</span>
                                    {order.who_receive || "未填寫"}
                                  </div>
                                  <div>
                                    <span className="font-medium">預計取件日期：</span>
                                    {order.expected_pickup_date || "未指定"}
                                  </div>
                                  {/* 聯絡信箱 */}
                                  <div>
                                    <span className="font-medium">聯絡信箱：</span>
                                    {order.Email || "未填寫"}
                                  </div>
                                  <div className="col-span-2">
                                    <span className="font-medium">地址：</span>
                                    {order.shipping_address_text}
                                  </div>
                                  {order.notes && (
                                    <div className="col-span-2">
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
                                  {order.TAX_title && (
                                    <div>
                                      <span className="font-medium">發票抬頭：</span>
                                      {order.TAX_title}
                                    </div>
                                  )}
                                  {order.TAX_id && (
                                    <div>
                                      <span className="font-medium">統一編號：</span>
                                      {order.TAX_id}
                                    </div>
                                  )}
                                </div>

                                {/* 配送方式與總價 */}
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                  <div>
                                    <span className="font-medium">配送方式：</span>
                                    {order.shipping_way || "未指定"}
                                  </div>
                                  <div>
                                    <span className="font-medium">運費：</span>
                                    NT$ {order.shipping_fee || 0}
                                  </div>
                                  <div>
                                    <span className="font-medium">商品小計：</span>
                                    NT$ {order.subtotal || 0}
                                  </div>
                                  <div className="font-semibold text-primary">
                                    <span className="font-medium">總計（含運費）：</span>
                                    NT$ {order.total_amount}
                                  </div>
                                </div>

                                <Separator />

                                <div>
                                  <h4 className="font-semibold mb-3">商品明細</h4>
                                  {items.map((item) => (
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
                                        {item.customizations_json && item.customizations_json.length > 0 && (
                                          <div className="space-y-1 text-sm text-muted-foreground">
                                            {item.customizations_json.map((custom: any, idx: number) => (
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
                                          <span className="text-muted-foreground">數量：</span>
                                          {item.quantity_description || item.quantity}
                                        </div>
                                        <div className="text-sm font-semibold">
                                          小計：NT$ {item.unit_price * item.quantity}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default OrderStatusManager;