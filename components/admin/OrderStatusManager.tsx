import { useState, useEffect, useCallback, Fragment } from "react";
import { supabase } from "@/integrations/supabase/client";
import { prepareImageForUpload } from "@/lib/prepare-upload-image-client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Check, ChevronDown, ChevronLeft, Plus, Trash2, CalendarIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { getEdgeFunctionErrorDetail } from "@/lib/edge-function-error";
import { buildReceiptHtml, ntdIntegerToChineseCapital, triggerDownloadHtmlFile } from "@/lib/receipt-html";
import ManualOrderForm from "./ManualOrderForm";
import { AdminOrderDetailPanel } from "./AdminOrderDetailPanel";
import { OrderBuyerDisplayBlock } from "./OrderBuyerDisplayBlock";
import { LineUserIdInput } from "./LineUserIdInput";
import {
  formatOrderBuyerFullText,
  getManualOrderDisplayName,
  getOrderBuyerDisplay,
  isSpecialSourceOrder,
  LINE_LINKED_BUYER_CLASS,
  resolveOrderLineUserId,
} from "@/lib/order-display";
import { CUSTOMER_SOURCE_OPTIONS } from "@/lib/customer-source";
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
  /** 由特殊報價單（多組合）拆單建立 */
  is_from_special_quotation?: boolean;
  auto_cancel_exempt?: boolean;
  admin_note?: string | null;
  Email?: string | null;
  TAX_id?: number | null;
  TAX_title?: string | null;
  phone?: string | null;
  line_user_id?: string | null;
  payment_method?: string | null;
  is_hide?: boolean;
  /** 舊版訂單欄位；新流程以 payment_step 為準 */
  payment_status?: string | null;
  /** 客戶類型：general | flash_ip | pr_agent | company_self */
  customer_type?: string | null;
  /** 結帳頁客戶來源調查 */
  customer_source?: string | null;
  /** 歷史／手動單可能寫入；後台「訂購人」顯示一律依 user_id 查 user_log_in.name */
  orderer_name?: string | null;
  /** 管理員補傳之訂單／合成圖 URL 陣列 */
  admin_media_urls?: unknown;
}

/** 訂購人顯示名稱：依 orders.user_id 對應 user_log_in.name（無 orders.name 欄位） */
function buyerDisplayName(userInfo: User | undefined): string {
  const n = userInfo?.name?.trim();
  return n || "";
}

const CUSTOMER_TYPE_OPTIONS = [
  { value: "general", label: "一般用戶" },
  { value: "flash_ip", label: "快閃店/IP" },
  { value: "pr_agent", label: "公關代理" },
  { value: "company_self", label: "公司自己" },
] as const;

function customerTypeLabel(v: string | null | undefined): string | null {
  if (!v) return null;
  if (v === "pr_agency") return "公關代理";
  return CUSTOMER_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

const ORDER_ADMIN_MEDIA_PREFIX = "website_img/order_admin";

/** 讀取品項管理員附圖 URL（避免型別或空白字串問題） */
function pickAdminMediaUrl(item: { admin_media_url?: unknown }): string | null {
  const v = item.admin_media_url;
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

interface OrderItem {
  order_item_id: number;
  product_name: string;
  quantity: number;
  quantity_description: string | null;
  unit_price: number;
  preview_url: string | null;
  /** 管理員補傳之該品項附圖（優先於 preview_url 顯示） */
  admin_media_url?: string | null;
  customizations_json: any[];
  is_package_design: boolean;
}

interface User {
  id: string;
  email: string;
  name: string;
  line_user_id?: string | null;
}

/**
 * 回溯訂單對應的 LINE user id（手動／報價單若為管理員 LINE 視同未綁定）。
 */
function resolveLineUserId(
  order: Pick<Order, "line_user_id" | "is_manual_order" | "is_from_quotation">,
  userInfo: User | undefined,
): { id: string | null; source: "order" | "member" | null } {
  const id = resolveOrderLineUserId(order, userInfo?.line_user_id);
  if (!id) return { id: null, source: null };
  const fromOrder = order.line_user_id?.trim();
  if (fromOrder === id) return { id, source: "order" };
  return { id, source: "member" };
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
  const [uploadingItemKey, setUploadingItemKey] = useState<string | null>(null);
  const [mobileDetailOrder, setMobileDetailOrder] = useState<Order | null>(null);

  // Loading action state to prevent duplicate clicks
  const [loadingAction, setLoadingAction] = useState<{
    orderId: string;
    action: string;
  } | null>(null);
  const [receiptTaxWarnOrder, setReceiptTaxWarnOrder] = useState<Order | null>(null);

  // 搜尋篩選狀態
  const [searchQuery, setSearchQuery] = useState("");
  const [searchDate, setSearchDate] = useState<Date | undefined>();
  const [customerTypePopoverId, setCustomerTypePopoverId] = useState<string | null>(null);
  const [lineDisplayNames, setLineDisplayNames] = useState<Record<string, string>>({});

  const loadLineDisplayNames = useCallback(async () => {
    const { data, error } = await supabase.from("chat_state").select("line_user_id, display_name");
    if (error) {
      console.error("loadLineDisplayNames:", error);
      return;
    }
    const map: Record<string, string> = {};
    (data ?? []).forEach((r) => {
      const id = (r.line_user_id as string)?.trim();
      if (id) map[id] = ((r.display_name as string) ?? "").trim();
    });
    setLineDisplayNames(map);
  }, []);

  // 使用 useCallback 包裝 loadOrders 避免閉包問題
  const loadOrders = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      // NULL 與 false 皆視為「未隱藏」；.eq(false) 會排除 is_hide IS NULL 的舊列
      .or("is_hide.is.null,is_hide.eq.false")
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
      void loadLineDisplayNames();
    }
    setLoading(false);
  }, [toast, loadLineDisplayNames]);

  useEffect(() => {
    loadOrders();
    void loadLineDisplayNames();
  }, [loadOrders, loadLineDisplayNames]);

  // 手機全螢幕詳情：鎖定背景捲動（不使用 Radix Dialog，避免黑色遮罩）
  useEffect(() => {
    if (!mobileDetailOrder) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileDetailOrder]);

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
      .select("id, email, name, line_user_id")
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

  /** 上傳／移除附圖後與資料庫同步（避免 order_item_id 型別導致本地 state 未更新） */
  const refreshOrderItemsForOrder = async (orderId: string) => {
    const { data, error } = await supabase.from("order_items").select("*").eq("order_id", orderId);
    if (error) throw new Error(error.message);
    setOrderItems((prev) => ({ ...prev, [orderId]: data ?? [] }));
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

  const openMobileDetail = (order: Order) => {
    setMobileDetailOrder(order);
    void loadOrderItems(order.id);
  };

  const closeMobileDetail = () => {
    setMobileDetailOrder(null);
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
      orderer_name: order.orderer_name ?? "",
      is_from_quotation: !!order.is_from_quotation,
      is_from_special_quotation: !!order.is_from_special_quotation,
      auto_cancel_exempt: !!order.auto_cancel_exempt,
      is_hide: !!order.is_hide,
      customer_type: order.customer_type ?? "",
      customer_source: order.customer_source ?? "",
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

  const handleOrderItemAdminMediaUpload = async (orderId: string, orderItemId: number, file: File) => {
    console.log("[admin-media] handleOrderItemAdminMediaUpload START", { orderId, orderItemId, fileName: file.name, fileType: file.type, fileSize: file.size });
    try {
      if (!file.type.startsWith("image/")) {
        console.warn("[admin-media] rejected: not an image", file.type);
        toast({ title: "請上傳圖片檔案", variant: "destructive" });
        return;
      }
      const itemKey = `${orderId}-${orderItemId}`;
      setUploadingItemKey(itemKey);

      const webpFile = file.type.startsWith("image/") ? await prepareImageForUpload(file) : file;
      const path = `${ORDER_ADMIN_MEDIA_PREFIX}/${orderId}/item_${orderItemId}_${Date.now()}_${Math.random().toString(36).slice(2)}.webp`;
      console.log("[admin-media] uploading to storage:", path);

      const { error: upErr } = await supabase.storage.from("custom_asset").upload(path, webpFile, { upsert: true, contentType: "image/webp" });
      if (upErr) {
        console.error("[admin-media] storage upload error:", upErr);
        toast({ title: "上傳失敗", description: upErr.message, variant: "destructive" });
        setUploadingItemKey(null);
        return;
      }
      console.log("[admin-media] storage upload OK");

      const { data: pub } = supabase.storage.from("custom_asset").getPublicUrl(path);
      const url = pub.publicUrl;
      console.log("[admin-media] public URL:", url);

      console.log("[admin-media] updating order_items row...", { orderId, orderItemId });
      const { data: updatedRows, error } = await supabase
        .from("order_items")
        .update({ admin_media_url: url })
        .eq("order_id", orderId)
        .eq("order_item_id", orderItemId)
        .select("order_item_id");
      console.log("[admin-media] update result:", { updatedRows, error });

      if (error) {
        console.error("[admin-media] DB update error:", error);
        toast({ title: "儲存圖片網址失敗", description: error.message, variant: "destructive" });
        setUploadingItemKey(null);
        return;
      }
      if (!updatedRows?.length) {
        console.warn("[admin-media] 0 rows updated — column may not exist or RLS blocked");
        toast({
          title: "儲存失敗",
          description:
            "沒有更新到任何品項。請確認遠端資料庫已執行 migration（order_items.admin_media_url），且您具備管理員權限。",
          variant: "destructive",
        });
        setUploadingItemKey(null);
        return;
      }

      console.log("[admin-media] DB update OK, refreshing items...");
      try {
        await refreshOrderItemsForOrder(orderId);
      } catch (refreshErr) {
        console.warn("[admin-media] refreshOrderItems failed:", refreshErr);
      }
      setOrderItems((prev) => {
        const list = prev[orderId];
        if (!list) return prev;
        return {
          ...prev,
          [orderId]: list.map((it) =>
            Number(it.order_item_id) === Number(orderItemId)
              ? { ...it, admin_media_url: pickAdminMediaUrl(it) ?? url }
              : it,
          ),
        };
      });
      console.log("[admin-media] state updated, showing toast");
      toast({ title: "已上傳品項附圖", description: "縮圖與連結已更新。" });
    } catch (e) {
      console.error("[admin-media] UNCAUGHT error in upload handler:", e);
      toast({
        title: "上傳過程發生錯誤",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setUploadingItemKey(null);
    }
  };

  const clearOrderItemAdminMedia = async (orderId: string, orderItemId: number) => {
    const { data: updatedRows, error } = await supabase
      .from("order_items")
      .update({ admin_media_url: null })
      .eq("order_id", orderId)
      .eq("order_item_id", orderItemId)
      .select("order_item_id");
    if (error) {
      toast({ title: "移除失敗", description: error.message, variant: "destructive" });
      return;
    }
    if (!updatedRows?.length) {
      toast({
        title: "移除失敗",
        description: "沒有更新到任何品項。請確認資料庫欄位已部署。",
        variant: "destructive",
      });
      return;
    }
    try {
      await refreshOrderItemsForOrder(orderId);
      // 若快取仍回傳舊欄位，強制該品項 admin_media_url 為 null
      setOrderItems((prev) => {
        const list = prev[orderId];
        if (!list) return prev;
        return {
          ...prev,
          [orderId]: list.map((it) =>
            Number(it.order_item_id) === Number(orderItemId) ? { ...it, admin_media_url: null } : it,
          ),
        };
      });
      toast({ title: "已移除管理員附圖", description: "縮圖已還原為客製預覽（若有）。" });
    } catch (e) {
      toast({
        title: "已清除網址，但重新載入明細失敗",
        description: e instanceof Error ? e.message : "請重新展開訂單試一次",
        variant: "destructive",
      });
    }
  };

  const buyerDisplayForOrder = (order: Order, userInfo: User | undefined) => {
    const lineId = resolveLineUserId(order, userInfo).id;
    const lineName = lineId ? lineDisplayNames[lineId] : null;
    const memberName = isSpecialSourceOrder(order)
      ? buyerDisplayName(userInfo)
      : userInfo?.name?.trim() || (userInfo === undefined ? "載入中..." : "—");
    return getOrderBuyerDisplay(order, memberName, userInfo?.line_user_id, lineName);
  };

  const getOrderUserFullText = (order: Order, userInfo: User | undefined): string => {
    const buyer = buyerDisplayForOrder(order, userInfo);
    const lineId = resolveLineUserId(order, userInfo).id;
    return formatOrderBuyerFullText(buyer, {
      userEmail: !isSpecialSourceOrder(order) ? userInfo?.email : undefined,
      hasLineLink: Boolean(lineId),
      isSpecial: isSpecialSourceOrder(order),
      ordererFieldName: order.orderer_name?.trim() || null,
      recipientName: order.who_receive?.trim() || null,
    });
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
      if (patch.customer_source === "") patch.customer_source = null;
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

  const getMissingReceiptTaxFields = (order: Order): string[] => {
    const missing: string[] = [];
    const title = String(order.TAX_title ?? "").trim();
    const taxIdRaw = order.TAX_id;
    const taxId =
      taxIdRaw !== null && taxIdRaw !== undefined && String(taxIdRaw).trim() !== ""
        ? String(taxIdRaw).trim()
        : "";
    if (!title) missing.push("發票抬頭");
    if (!taxId) missing.push("統一編號");
    return missing;
  };

  /** 點「預先組裝收據」：缺抬頭／統編時先提醒 */
  const handleAssembleReceiptClick = (order: Order) => {
    if (loadingAction) return;
    const missing = getMissingReceiptTaxFields(order);
    if (missing.length > 0) {
      setReceiptTaxWarnOrder(order);
      return;
    }
    void handleAssembleReceiptDownload(order);
  };

  /** 未匯款（payment_step=pending）時預覽收據（本機下載 HTML）；不變更訂單狀態、不觸發寄信 edge */
  const handleAssembleReceiptDownload = async (order: Order) => {
    if (loadingAction) return;
    setReceiptTaxWarnOrder(null);
    setLoadingAction({ orderId: order.id, action: "assemble_receipt" });
    try {
      const { data, error } = await supabase.from("order_items").select("*").eq("order_id", order.id);
      if (error) throw error;
      const rows = (data ?? []) as OrderItem[];
      const lineItems = rows.map((it) => {
        const qty = Number(it.quantity) || 0;
        const up = Number(it.unit_price) || 0;
        return {
          product_name: String(it.product_name ?? ""),
          quantity: qty,
          unit_price: up,
          subtotal: qty * up,
        };
      });
      const total = Math.round(Number(order.total_amount) || 0);
      const chinese = ntdIntegerToChineseCapital(total);
      const receiptDate = `（預覽）${new Date().toLocaleDateString("zh-TW", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })}`;
      const taxIdRaw = order.TAX_id;
      const taxIdStr =
        taxIdRaw !== null && taxIdRaw !== undefined && String(taxIdRaw).trim() !== ""
          ? String(taxIdRaw).trim()
          : "";
      const html = buildReceiptHtml({
        receiptDate,
        tax_title: String(order.TAX_title ?? "").trim(),
        tax_id: taxIdStr,
        items: lineItems,
        shipping_fee: Number(order.shipping_fee) || 0,
        total_amount: total,
        total_amount_chinese: chinese,
      });
      triggerDownloadHtmlFile(html, `收據預覽_${order.id.slice(0, 8)}.html`);
      toast({ title: "已下載收據 HTML", description: "日期為預覽用；確認匯款轉處理中後寄送邏輯不變。" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "組裝失敗";
      toast({ title: "預先組裝收據失敗", description: msg, variant: "destructive" });
    } finally {
      setLoadingAction(null);
    }
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

  /** 未匯款先出貨：僅更新 order_status → processing，payment_step 維持不變 */
  const handleForceProcessing = async (orderId: string) => {
    if (loadingAction) return;
    setLoadingAction({ orderId, action: "force_processing" });
    try {
      const { error } = await supabase
        .from("orders")
        .update({ order_status: "processing" })
        .eq("id", orderId);
      if (error) {
        toast({ title: "操作失敗", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "✅ 已轉為處理中（付款狀態不變）" });
      loadOrders();
    } catch {
      toast({ title: "操作失敗", description: "請稍後再試", variant: "destructive" });
    } finally {
      setLoadingAction(null);
    }
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
        filtered = filtered.filter((o) => {
          if (o.payment_step === "pending" || o.payment_step === "submitted") return true;
          // 舊資料：僅有 payment_status=unpaid、payment_step 為空，仍應出現在「待付款」
          const stepMissing = o.payment_step == null || String(o.payment_step).trim() === "";
          const legacyUnpaid =
            o.payment_status === "unpaid" || o.payment_status == null || o.payment_status === "";
          return stepMissing && legacyUnpaid;
        });
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
        const lineId = resolveLineUserId(order, userInfo).id;
        const lineDisplay = (lineId && lineDisplayNames[lineId] ? lineDisplayNames[lineId] : "").toLowerCase();
        const orderIdPrefix = order.id.slice(0, 5).toLowerCase();

        return (
          userName.includes(query) ||
          userEmail.includes(query) ||
          recipientName.includes(query) ||
          lineDisplay.includes(query) ||
          orderIdPrefix.includes(query)
        );
      });
    }

    // 3. 日期篩選：預計取件日期
    if (searchDate) {
      const targetDate = format(searchDate, "yyyy-MM-dd");
      filtered = filtered.filter((order) => order.expected_pickup_date === targetDate);
    }

    // 4. 歷史訂單：依建立時間由近到遠（其餘分頁維持預計取件日由近到遠）
    if (activeTab === "history") {
      return filtered.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
    }

    return filtered;
  };

  const filteredOrders = getFilteredOrders();

  const renderOrderActions = (order: Order) => (
    <div className="flex flex-wrap gap-2 items-center">
      {order.payment_step === "pending" && (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => handleAssembleReceiptClick(order)}
          disabled={loadingAction !== null}
        >
          {loadingAction?.orderId === order.id && loadingAction?.action === "assemble_receipt"
            ? "產生中..."
            : "預先組裝收據"}
        </Button>
      )}
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
      {order.order_status === "awaiting_payment" && order.payment_step !== "verified" && (
        <Button
          size="sm"
          variant="outline"
          className="border-amber-400 text-amber-700 hover:bg-amber-50"
          onClick={() => handleForceProcessing(order.id)}
          disabled={loadingAction !== null}
        >
          {loadingAction?.orderId === order.id && loadingAction?.action === "force_processing"
            ? "處理中..."
            : "未匯款，先出貨"}
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
  );

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
          <CardDescription>
            管理和追蹤所有訂單狀態。網站會員訂單：未綁 LINE 顯示註冊名稱，已綁則同時顯示註冊名與
            LINE 名（綠色）。手動建立或報價單轉訂單：有 LINE 優先顯示 LINE 名，否則顯示收件人姓名。
          </CardDescription>
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
              <>
                {/* 手機：取貨日期 + 姓名 */}
                <div className="md:hidden -mx-4 sm:-mx-0 rounded-lg border border-border overflow-hidden">
                  <div className="grid grid-cols-2 gap-3 px-4 py-2.5 text-xs font-medium text-muted-foreground bg-muted/40 border-b">
                    <span>取貨日期</span>
                    <span className="text-right">姓名</span>
                  </div>
                  <ul className="divide-y divide-border bg-white">
                    {filteredOrders.map((order) => {
                      const userInfo = users[order.user_id];
                      const buyer = buyerDisplayForOrder(order, userInfo);
                      return (
                        <li key={order.id}>
                          <button
                            type="button"
                            className="grid w-full grid-cols-2 gap-3 px-4 py-3.5 text-left text-sm transition-colors hover:bg-muted/40 active:bg-muted/60"
                            onClick={() => openMobileDetail(order)}
                          >
                            <span className="font-medium tabular-nums text-foreground">
                              {order.expected_pickup_date || "未指定"}
                            </span>
                            <span
                              className={cn(
                                "text-right truncate",
                                buyer.linePrimary ? LINE_LINKED_BUYER_CLASS : "text-foreground",
                              )}
                            >
                              {buyer.showMemberAndLine ? (
                                <>
                                  {buyer.memberName}
                                  <span className="text-muted-foreground"> · </span>
                                  <span className={LINE_LINKED_BUYER_CLASS}>{buyer.lineName}</span>
                                </>
                              ) : (
                                buyer.name
                              )}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {/* 桌機：完整表格 */}
                <div className="hidden md:block w-full max-w-full overflow-x-auto md:overflow-x-visible">
              <Table className="table-fixed w-full min-w-[36rem] md:min-w-0">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[5.5rem] min-w-0">訂單號</TableHead>
                    <TableHead className="w-[6.5rem] min-w-0">預計取件日期</TableHead>
                    <TableHead className="w-[7.5rem] max-w-[7.5rem] min-w-0 md:w-[9.5rem] md:max-w-[9.5rem] align-top px-2 md:px-3">
                      用戶
                    </TableHead>
                    <TableHead className="w-[5rem] min-w-0 whitespace-nowrap px-2 md:px-4">金額</TableHead>
                    <TableHead className="w-[4.5rem] min-w-0 px-2 md:px-3">配送方式</TableHead>
                    <TableHead className="w-[4.25rem] min-w-0 px-2 md:px-3">付款狀態</TableHead>
                    <TableHead className="w-[4.25rem] min-w-0 px-2 md:px-3">訂單狀態</TableHead>
                    <TableHead className="w-[11rem] min-w-[10rem] max-w-[13rem] px-2 md:px-3">操作</TableHead>
                    <TableHead className="min-w-0 w-[12%] px-2 md:px-3">管理員備注</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => {
                    const isExpanded = expandedOrders.has(order.id);
                    const items = orderItems[order.id] || [];
                    const userInfo = users[order.user_id];
                    const userFullText = getOrderUserFullText(order, userInfo);
                    const userPreviewMobile = userFullText.replace(/\n/g, " · ");

                    return (
                      <Fragment key={order.id}>
                        <TableRow
                          className="cursor-pointer hover:bg-muted/40"
                          onClick={() => toggleOrderExpand(order.id)}
                        >
                          <TableCell className="font-medium min-w-0 py-3 px-2 md:px-4">#{order.id.slice(0, 6).toUpperCase()}</TableCell>
                          <TableCell className="min-w-0 py-3 px-2 md:px-4">{order.expected_pickup_date || "未指定"}</TableCell>
                          <TableCell className="align-top min-w-0 w-[7.5rem] max-w-[7.5rem] md:w-[9.5rem] md:max-w-[9.5rem] py-3 px-2 md:px-3">
                            <div className="md:hidden">
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button
                                    type="button"
                                    className="w-full max-w-full text-left text-xs leading-snug truncate hover:underline underline-offset-2"
                                    onClick={(e) => e.stopPropagation()}
                                    onMouseDown={(e) => e.stopPropagation()}
                                  >
                                    {userPreviewMobile.slice(0, 56)}
                                    {userPreviewMobile.length > 56 ? "…" : ""}
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent
                                  align="start"
                                  className="max-w-[min(90vw,20rem)] text-sm"
                                  onClick={(e) => e.stopPropagation()}
                                  onMouseDown={(e) => e.stopPropagation()}
                                >
                                  <pre className="whitespace-pre-wrap font-sans text-left">{userFullText}</pre>
                                </PopoverContent>
                              </Popover>
                            </div>
                            <div className="hidden md:block max-w-full break-words text-xs leading-snug text-foreground">
                              <OrderBuyerDisplayBlock
                                buyer={buyerDisplayForOrder(order, userInfo)}
                                memberEmail={
                                  !isSpecialSourceOrder(order) ? userInfo?.email : undefined
                                }
                                ordererFieldName={order.orderer_name?.trim() || null}
                                recipientName={order.who_receive?.trim() || null}
                              />
                            </div>
                          </TableCell>
                          <TableCell className="min-w-0 whitespace-nowrap py-3 px-2 md:px-4">NT$ {order.total_amount}</TableCell>
                          <TableCell className="min-w-0 break-words py-3 px-2 md:px-3 text-xs md:text-sm">{order.shipping_way}</TableCell>
                          <TableCell className="min-w-0 py-3 px-2 md:px-3">
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
                          <TableCell className="min-w-0 py-3 px-2 md:px-3">
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
                          <TableCell className="min-w-0 align-top py-3 px-2 md:px-3">
                            <div className="flex gap-2 items-center flex-wrap" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                              {renderOrderActions(order)}
                            </div>
                          </TableCell>
                          <TableCell
                            className="min-w-0 py-3 px-2 md:px-3"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex flex-col gap-1.5">
                              <div className="flex flex-wrap items-center gap-1">
                                {order.is_manual_order && (
                                  <Badge variant="outline" className="w-fit bg-amber-50 text-amber-700 border-amber-300">
                                    手動訂單
                                  </Badge>
                                )}
                                {order.is_from_special_quotation ? (
                                  <Badge variant="outline" className="w-fit bg-violet-50 text-violet-800 border-violet-300">
                                    特殊報價
                                  </Badge>
                                ) : null}
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
                          <TableRow key={`${order.id}-detail`} className="hover:bg-transparent">
                            <TableCell
                              colSpan={9}
                              className="bg-muted/30 p-0 align-top overflow-hidden"
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={(e) => e.stopPropagation()}
                            >
                              <div className="p-4">
                                <AdminOrderDetailPanel
                                  order={order}
                                  items={items}
                                  buyerDisplay={buyerDisplayForOrder(order, userInfo)}
                                  uploadingItemKey={uploadingItemKey}
                                  onUploadItem={(orderItemId, file) =>
                                    void handleOrderItemAdminMediaUpload(order.id, orderItemId, file)
                                  }
                                  onClearItemMedia={(orderItemId) =>
                                    void clearOrderItemAdminMedia(order.id, orderItemId)
                                  }
                                  onLuckLayoutRefresh={() => void refreshOrderItemsForOrder(order.id)}
                                />
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
              </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>

    {/* 手機：全螢幕訂單詳情（不用 Dialog，避免 Radix 黑色遮罩蓋住內容） */}
    {mobileDetailOrder && (() => {
      const order = mobileDetailOrder;
      const items = orderItems[order.id] || [];
      const userInfo = users[order.user_id];
      return (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-order-detail-title"
          className="admin-font md:hidden fixed inset-x-0 top-14 bottom-0 z-[1001] flex flex-col bg-white"
        >
          <div className="flex shrink-0 items-center gap-2 border-b bg-white px-3 py-2.5 pr-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 shrink-0 px-2 -ml-1 text-foreground"
              onClick={closeMobileDetail}
              aria-label="返回訂單列表"
            >
              <ChevronLeft className="h-5 w-5" />
              返回
            </Button>
            <div className="min-w-0 flex-1 text-left">
              <h2 id="mobile-order-detail-title" className="truncate text-base font-semibold leading-tight">
                訂單 #{order.id.slice(0, 6).toUpperCase()}
              </h2>
              <p className="truncate text-xs text-muted-foreground">
                {order.expected_pickup_date || "未指定取件日"} ·{" "}
                {(() => {
                  const b = buyerDisplayForOrder(order, userInfo);
                  return b.name;
                })()}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={closeMobileDetail}
              aria-label="關閉"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-4">
            <AdminOrderDetailPanel
              order={order}
              items={items}
              buyerDisplay={buyerDisplayForOrder(order, userInfo)}
              screenshotMode
              uploadingItemKey={uploadingItemKey}
              onUploadItem={(orderItemId, file) =>
                void handleOrderItemAdminMediaUpload(order.id, orderItemId, file)
              }
              onClearItemMedia={(orderItemId) =>
                void clearOrderItemAdminMedia(order.id, orderItemId)
              }
              onLuckLayoutRefresh={() => void refreshOrderItemsForOrder(order.id)}
            />
          </div>
          <div className="shrink-0 border-t bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-3">
            {renderOrderActions(order)}
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                openEditOrder(order);
                closeMobileDetail();
              }}
            >
              編輯訂單
            </Button>
            <Button type="button" variant="secondary" className="w-full" onClick={closeMobileDetail}>
              返回訂單列表
            </Button>
          </div>
        </div>
      );
    })()}

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
          <div className="space-y-1 col-span-2">
            <span className="text-sm text-muted-foreground">訂購人（會員姓名）</span>
            {editDraft.is_manual_order ? (
              <>
                <Input
                  readOnly
                  className="bg-muted/50"
                  value={editDraft.orderer_name?.trim() || editDraft.who_receive?.trim() || "—"}
                />
                <p className="text-xs text-muted-foreground">此為手動建立訂單，訂購人取自 orderer_name。</p>
              </>
            ) : (
              <Input
                readOnly
                className="bg-muted/50"
                value={buyerDisplayName(users[editDraft.user_id ?? ""]) || "—"}
                title="由 user_log_in.name 顯示，請至客戶管理修改會員姓名"
              />
            )}
          </div>
          <div className="space-y-1">
            <span className="text-sm text-muted-foreground">LINE user_id</span>
            <LineUserIdInput
              value={editDraft.line_user_id ?? ""}
              onChange={(v) => setEditDraft((p) => ({ ...p, line_user_id: v }))}
              footer={(() => {
                const resolved = resolveLineUserId(editDraft, users[editDraft.user_id ?? ""]);
                if (resolved.id) {
                  return (
                    <p className="text-xs text-emerald-700">
                      ✅ 已綁定 LINE（{resolved.source === "order" ? "訂單指定" : "會員資料"}）：
                      <code className="ml-1 text-[11px] font-mono text-emerald-800 break-all">{resolved.id}</code>
                    </p>
                  );
                }
                return (
                  <p className="text-xs text-muted-foreground">
                    ❌ 此訂單尚未綁定 LINE（orders 與會員資料皆無）
                  </p>
                );
              })()}
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
          <div className="space-y-1 col-span-2">
            <span className="text-sm text-muted-foreground">客戶來源（如何認識我們）</span>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm bg-background"
              value={editDraft.customer_source ?? ""}
              onChange={(e) => setEditDraft((p) => ({ ...p, customer_source: e.target.value }))}
            >
              <option value="">未設定</option>
              {CUSTOMER_SOURCE_OPTIONS.map((opt) => (
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

    <AlertDialog
      open={!!receiptTaxWarnOrder}
      onOpenChange={(open) => {
        if (!open) setReceiptTaxWarnOrder(null);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>尚未填寫發票資訊</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2 text-left">
            <p>
              此訂單尚未填寫
              {receiptTaxWarnOrder
                ? getMissingReceiptTaxFields(receiptTaxWarnOrder).join("、")
                : "發票抬頭、統一編號"}
              。
            </p>
            <p>建議先在訂單編輯中補齊抬頭與統編再組裝收據；若確定不需統編／抬頭，仍可繼續預覽。</p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>返回填寫</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (receiptTaxWarnOrder) void handleAssembleReceiptDownload(receiptTaxWarnOrder);
            }}
          >
            仍要組裝收據
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
};

export default OrderStatusManager;