import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, X, Split, ExternalLink } from "lucide-react";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, subDays, getDay, startOfWeek, endOfWeek } from "date-fns";
import { zhTW } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { SafeImage } from "@/components/SafeImage";
import { asOrderCustomizationsList } from "@/lib/order-item-customizations";

interface OrderItem {
  order_item_id: number;
  order_id: string;
  product_name: string;
  quantity: number;
  quantity_description: string | null;
  unit_price: number | null;
  preview_url: string | null;
  customizations_json: any[];
}

interface Order {
  id: string;
  user_id: string;
  expected_pickup_date: string | null;
  who_receive: string | null;
  notes: string | null;
  total_amount: number;
  shipping_way: string | null;
  shipping_address_text: string | null;
  payment_step: string | null;
  order_status: string | null;
}

interface User {
  id: string;
  name: string;
  email: string;
}

// 工作 Block（可拆分）
interface WorkBlock {
  id: string; // unique block id
  order_item_id: number;
  order_id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  original_quantity: number; // 原始數量（用於追蹤拆分）
  user_name: string;
  order_color: string;
  scheduled_date: string; // YYYY-MM-DD
  expected_pickup_date: string | null; // 客戶指定送達/取貨日期（不會因拖曳而變動）
  preview_url: string | null;
  customizations_json: any[];
  order_status: string;
  payment_step: string;
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  awaiting_payment: "待付款",
  processing: "處理中",
  shipped: "出貨中",
  delivered: "已送達",
  returned: "已退貨",
};

const PAYMENT_STEP_LABEL: Record<string, string> = {
  pending: "未付款",
  submitted: "已提交",
  verified: "已確認",
};

// 預設顏色池（用於區分不同訂單）
const ORDER_COLORS = [
  "#8B5CF6", // purple
  "#F97316", // orange
  "#06B6D4", // cyan
  "#84CC16", // lime
  "#EC4899", // pink
  "#6366F1", // indigo
  "#14B8A6", // teal
  "#F59E0B", // amber
  "#EF4444", // red
  "#22C55E", // green
];

const OrderWorkCalendar = () => {
  const { toast } = useToast();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [workBlocks, setWorkBlocks] = useState<WorkBlock[]>([]);
  const [orders, setOrders] = useState<Map<string, Order>>(new Map());
  const [users, setUsers] = useState<Map<string, User>>(new Map());
  const [loading, setLoading] = useState(true);
  
  // Drag state
  const [draggedBlock, setDraggedBlock] = useState<WorkBlock | null>(null);
  
  // Dialog states
  const [selectedBlock, setSelectedBlock] = useState<WorkBlock | null>(null);
  const [showBlockDetail, setShowBlockDetail] = useState(false);
  const [showSplitDialog, setShowSplitDialog] = useState(false);
  const [splitQuantities, setSplitQuantities] = useState<number[]>([]);

  useEffect(() => {
    loadProcessingOrders();
  }, []);

  const loadProcessingOrders = async () => {
    setLoading(true);

    // 1. 載入符合條件的訂單：
    //    - payment_step=pending 且 order_status IN (awaiting_payment, processing)
    //    - payment_step=verified 且 order_status=processing
    const { data: ordersData, error: ordersError } = await supabase
      .from("orders")
      .select("*")
      .or(
        "and(payment_step.eq.pending,order_status.in.(awaiting_payment,processing)),and(payment_step.eq.verified,order_status.eq.processing)"
      );

    if (ordersError) {
      toast({ title: "載入訂單失敗", description: ordersError.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    const orderMap = new Map<string, Order>();
    (ordersData || []).forEach((o) => orderMap.set(o.id, o as Order));
    setOrders(orderMap);

    // 2. 載入用戶資訊（使用 service role 或 admin 權限）
    const userIds = [...new Set((ordersData || []).map((o) => o.user_id))];
    const userMap = new Map<string, User>();
    
    if (userIds.length > 0) {
      // 方法1：從 orders 表的 who_receive 取得
      (ordersData || []).forEach((o) => {
        if (o.who_receive) {
          userMap.set(o.user_id, { 
            id: o.user_id, 
            name: o.who_receive, 
            email: "" 
          });
        }
      });

      // 方法2：嘗試從 user_log_in 取得（可能因 RLS 失敗）
      const { data: usersData } = await supabase
        .from("user_log_in")
        .select("id, name, email")
        .in("id", userIds);

      // 若成功取得，覆蓋 userMap
      (usersData || []).forEach((u) => {
        userMap.set(u.id, u);
      });
    }
    setUsers(userMap);

    // 3. 載入訂單品項
    const orderIds = (ordersData || []).map((o) => o.id);
    if (orderIds.length === 0) {
      setWorkBlocks([]);
      setLoading(false);
      return;
    }

    const { data: itemsData, error: itemsError } = await supabase
      .from("order_items")
      .select("*")
      .in("order_id", orderIds);

    if (itemsError) {
      toast({ title: "載入品項失敗", description: itemsError.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    // 4. 為每個訂單分配顏色
    const orderColorMap = new Map<string, string>();
    let colorIndex = 0;
    orderIds.forEach((orderId) => {
      orderColorMap.set(orderId, ORDER_COLORS[colorIndex % ORDER_COLORS.length]);
      colorIndex++;
    });

    // 5. 建立工作 Blocks（預設放在客戶指定送達日當天）
    const blocks: WorkBlock[] = [];
    (itemsData || []).forEach((item) => {
      const order = orderMap.get(item.order_id);
      
      // 預設日期：客戶指定送達日當天（不再是前一天）
      let scheduledDate = format(new Date(), "yyyy-MM-dd");
      const expectedPickupDate = order?.expected_pickup_date || null;
      if (expectedPickupDate) {
        scheduledDate = format(new Date(expectedPickupDate), "yyyy-MM-dd");
      }

      // 從 userMap 取得用戶名稱，fallback 到 who_receive
      const userInfo = order?.user_id ? userMap.get(order.user_id) : null;
      const displayName = userInfo?.name || order?.who_receive || "未知用戶";

      blocks.push({
        id: `block-${item.order_item_id}-0`,
        order_item_id: item.order_item_id,
        order_id: item.order_id,
        product_name: item.product_name,
        unit_price: Number(item.unit_price ?? 0),
        quantity: item.quantity,
        original_quantity: item.quantity,
        user_name: displayName,
        order_color: orderColorMap.get(item.order_id) || "#888888",
        scheduled_date: scheduledDate,
        expected_pickup_date: expectedPickupDate,
        preview_url: item.preview_url,
        customizations_json: asOrderCustomizationsList(item.customizations_json),
        order_status: order?.order_status || "awaiting_payment",
        payment_step: order?.payment_step || "pending",
      });
    });

    setWorkBlocks(blocks);
    setLoading(false);
  };

  // 日曆導航
  const goToPrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const goToNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

  // 取得當月日期（含前後填充）
  const getCalendarDays = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  };

  // 取得某日的 blocks
  const getBlocksForDate = (date: Date): WorkBlock[] => {
    const dateStr = format(date, "yyyy-MM-dd");
    return workBlocks.filter((b) => b.scheduled_date === dateStr);
  };

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, block: WorkBlock) => {
    setDraggedBlock(block);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, date: Date) => {
    e.preventDefault();
    if (!draggedBlock) return;

    const newDate = format(date, "yyyy-MM-dd");
    setWorkBlocks((prev) =>
      prev.map((b) =>
        b.id === draggedBlock.id ? { ...b, scheduled_date: newDate } : b
      )
    );
    setDraggedBlock(null);
    toast({ title: "已移動工作項目", description: `移動至 ${format(date, "M月d日")}` });
  };

  // Block 點擊展開詳情
  const handleBlockClick = (block: WorkBlock) => {
    setSelectedBlock(block);
    setShowBlockDetail(true);
  };

  // 開啟拆分對話框
  const handleOpenSplit = (block: WorkBlock) => {
    setSelectedBlock(block);
    setSplitQuantities([Math.floor(block.quantity / 2), block.quantity - Math.floor(block.quantity / 2)]);
    setShowSplitDialog(true);
  };

  // 執行拆分
  const handleSplit = () => {
    if (!selectedBlock) return;

    const totalSplit = splitQuantities.reduce((a, b) => a + b, 0);
    if (totalSplit !== selectedBlock.quantity) {
      toast({
        title: "拆分數量錯誤",
        description: `拆分總數 (${totalSplit}) 必須等於原始數量 (${selectedBlock.quantity})`,
        variant: "destructive",
      });
      return;
    }

    // 移除原 block，新增多個拆分 blocks
    setWorkBlocks((prev) => {
      const filtered = prev.filter((b) => b.id !== selectedBlock.id);
      const newBlocks: WorkBlock[] = splitQuantities.map((qty, idx) => ({
        ...selectedBlock,
        id: `${selectedBlock.id}-split-${idx}-${Date.now()}`,
        quantity: qty,
        expected_pickup_date: selectedBlock.expected_pickup_date,
        order_status: selectedBlock.order_status,
        payment_step: selectedBlock.payment_step,
      }));
      return [...filtered, ...newBlocks];
    });

    setShowSplitDialog(false);
    toast({ title: "拆分成功", description: `已拆分為 ${splitQuantities.length} 個工作項目` });
  };

  // 新增拆分欄位
  const addSplitField = () => {
    setSplitQuantities([...splitQuantities, 0]);
  };

  // 更新拆分數量
  const updateSplitQuantity = (index: number, value: number) => {
    const newQuantities = [...splitQuantities];
    newQuantities[index] = value;
    setSplitQuantities(newQuantities);
  };

  // 移除拆分欄位
  const removeSplitField = (index: number) => {
    if (splitQuantities.length <= 2) return;
    setSplitQuantities(splitQuantities.filter((_, i) => i !== index));
  };

  const calendarDays = getCalendarDays();
  const weekDays = ["日", "一", "二", "三", "四", "五", "六"];

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">載入工作日曆...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="h-[calc(100vh-200px)]">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle>訂單工作日曆排程</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={goToPrevMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="font-semibold min-w-[120px] text-center">
                {format(currentMonth, "yyyy年 M月", { locale: zhTW })}
              </span>
              <Button variant="outline" size="icon" onClick={goToNextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 h-[calc(100%-80px)] overflow-auto">
          {/* 星期標題 */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {weekDays.map((day) => (
              <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                {day}
              </div>
            ))}
          </div>

          {/* 日曆格子 */}
          <div className="grid grid-cols-7 gap-1 flex-1">
            {calendarDays.map((day) => {
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isToday = isSameDay(day, new Date());
              const blocks = getBlocksForDate(day);

              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "min-h-[120px] border rounded-lg p-1 transition-colors",
                    isCurrentMonth ? "bg-white" : "bg-muted/30",
                    isToday && "ring-2 ring-primary",
                    "hover:bg-muted/20"
                  )}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, day)}
                >
                  <div className={cn(
                    "text-sm font-medium mb-1",
                    !isCurrentMonth && "text-muted-foreground"
                  )}>
                    {format(day, "d")}
                  </div>
                  
                  {/* Blocks */}
                  <div className="space-y-1 overflow-auto max-h-[90px]">
                    {blocks.map((block) => (
                      <div
                        key={block.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, block)}
                        onClick={() => handleBlockClick(block)}
                        className="text-xs p-1.5 rounded cursor-move hover:opacity-80 transition-opacity truncate"
                        style={{ backgroundColor: block.order_color, color: "white" }}
                        title={`${block.user_name}/${block.product_name}/${block.quantity}個 [${ORDER_STATUS_LABEL[block.order_status] || block.order_status}${block.payment_step !== "verified" ? `・${PAYMENT_STEP_LABEL[block.payment_step] || block.payment_step}` : ""}]`}
                      >
                        <div className="font-medium truncate flex items-center gap-1">
                          {block.user_name}
                          <span className="inline-block text-[10px] leading-tight px-1 rounded bg-white/30">
                            {ORDER_STATUS_LABEL[block.order_status] || block.order_status}
                          </span>
                        </div>
                        <div className="truncate">{block.product_name}/{block.quantity}個</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Block 詳情對話框 */}
      <Dialog open={showBlockDetail} onOpenChange={setShowBlockDetail}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>工作項目詳情</DialogTitle>
          </DialogHeader>
          {selectedBlock &&
            (() => {
              const customizationRows = asOrderCustomizationsList(selectedBlock.customizations_json);
              return (
            <div className="space-y-4">
              <div className="flex gap-4">
                {selectedBlock.preview_url && (
                  <SafeImage
                    src={selectedBlock.preview_url}
                    alt={selectedBlock.product_name}
                    width={96}
                    height={96}
                    className="h-24 w-24 rounded object-cover"
                    sizes="96px"
                  />
                )}
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: selectedBlock.order_color }}
                    />
                    <span className="font-semibold">{selectedBlock.user_name}</span>
                  </div>
                  <p><span className="text-muted-foreground">商品：</span>{selectedBlock.product_name}</p>
                  <p><span className="text-muted-foreground">單價：</span>NT$ {Number(selectedBlock.unit_price ?? 0).toLocaleString()}</p>
                  <p><span className="text-muted-foreground">數量：</span>{selectedBlock.quantity} 個</p>
                  <p><span className="text-muted-foreground">排程日期：</span>{selectedBlock.scheduled_date}</p>
                  <p><span className="text-muted-foreground">客戶指定送達/取貨日期：</span>{selectedBlock.expected_pickup_date || "未指定"}</p>
                  <p><span className="text-muted-foreground">訂單狀態：</span>{ORDER_STATUS_LABEL[selectedBlock.order_status] || selectedBlock.order_status}</p>
                  <p><span className="text-muted-foreground">付款狀態：</span>{PAYMENT_STEP_LABEL[selectedBlock.payment_step] || selectedBlock.payment_step}</p>
                </div>
              </div>

              {customizationRows.length > 0 && (
                <div className="border-t pt-4">
                  <h4 className="font-medium mb-2">客製化選項</h4>
                  <div className="space-y-1 text-sm">
                    {customizationRows.map((custom: any, idx: number) => (
                      <div key={idx}>
                        <span className="text-muted-foreground">{custom.group_name_zh}：</span>
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
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setShowBlockDetail(false)}>
                  關閉
                </Button>
                <Button onClick={() => { setShowBlockDetail(false); handleOpenSplit(selectedBlock); }}>
                  <Split className="h-4 w-4 mr-2" />
                  拆分工作項目
                </Button>
              </DialogFooter>
            </div>
              );
            })()}
        </DialogContent>
      </Dialog>

      {/* 拆分對話框 */}
      <Dialog open={showSplitDialog} onOpenChange={setShowSplitDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>拆分工作項目</DialogTitle>
          </DialogHeader>
          {selectedBlock && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                原始數量：<span className="font-semibold">{selectedBlock.quantity} 個</span>
              </p>
              <p className="text-sm text-muted-foreground">
                請輸入拆分後每個 Block 的數量（總和必須等於原始數量）
              </p>

              <div className="space-y-2">
                {splitQuantities.map((qty, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-sm w-20">Block {idx + 1}:</span>
                    <Input
                      type="number"
                      min={1}
                      value={qty}
                      onChange={(e) => updateSplitQuantity(idx, parseInt(e.target.value) || 0)}
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">個</span>
                    {splitQuantities.length > 2 && (
                      <Button variant="ghost" size="icon" onClick={() => removeSplitField(idx)}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              <Button variant="outline" size="sm" onClick={addSplitField}>
                + 新增拆分項目
              </Button>

              <div className="text-sm">
                拆分總數：<span className={cn(
                  "font-semibold",
                  splitQuantities.reduce((a, b) => a + b, 0) === selectedBlock.quantity
                    ? "text-green-600"
                    : "text-red-600"
                )}>
                  {splitQuantities.reduce((a, b) => a + b, 0)} 個
                </span>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setShowSplitDialog(false)}>
                  取消
                </Button>
                <Button onClick={handleSplit}>
                  確認拆分
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default OrderWorkCalendar;
