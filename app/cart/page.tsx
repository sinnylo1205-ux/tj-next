"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { PencilLine, Trash2, CalendarIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { SafeImage } from "@/components/SafeImage";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

const CUSTOMIZER_ROUTE_MAP: Record<string, string> = {
  cupcake_cream: "/customize/cupcake_cream",
  cupcake_choco: "/customize/cupcake_choco",
  cookie: "/customize/cookie",
  cotton: "/customize/cotton",
  cakeball: "/customize/cakeball",
  ice: "/customize/ice",
  longcake: "/customize/longcake",
  luck: "/customize/luck",
  macaron: "/customize/macaron",
  donut: "/customize/donut",
  popcorn: "/customize/popcorn",
  giftbox_custom: "/customize/giftbox",
  giftbox_flower: "/customize/giftbox",
  giftbox_star: "/customize/giftbox",
};

const CHECKOUT_SELECTED_KEY = "tj_checkout_selected";
const CHECKOUT_INTENT_KEY = "tj_checkout_intent";

function CartSkeleton() {
  return (
    <>
      <div className="hidden lg:grid grid-cols-[50px_140px_180px_100px_100px_100px_minmax(280px,2fr)_140px_80px] font-semibold text-base text-ink-muted pb-4 border-b border-border">
        <div>勾選</div>
        <div>商品縮圖</div>
        <div>商品名稱</div>
        <div>設計後單價</div>
        <div>數量</div>
        <div>小計</div>
        <div>客製化細節</div>
        <div>預定到/取貨時間</div>
        <div className="text-center">操作</div>
      </div>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex flex-col lg:grid lg:grid-cols-[50px_140px_180px_100px_100px_100px_minmax(280px,2fr)_140px_80px] items-start lg:items-center py-6 border-b border-border gap-4 lg:gap-0"
        >
          <div className="flex items-start gap-4 w-full lg:contents">
            <div className="flex justify-center pt-2 lg:pt-0">
              <Skeleton className="h-6 w-6 rounded" />
            </div>
            <div className="flex-shrink-0">
              <Skeleton className="w-20 h-20 md:w-24 md:h-24 rounded-lg" />
            </div>
            <div className="flex-1 lg:hidden space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
          <div className="hidden lg:block">
            <Skeleton className="h-6 w-32" />
          </div>
          <div className="hidden lg:block">
            <Skeleton className="h-5 w-16" />
          </div>
          <div className="hidden lg:block">
            <Skeleton className="h-5 w-8 mx-auto" />
          </div>
          <div className="hidden lg:block">
            <Skeleton className="h-6 w-20" />
          </div>
          <div className="hidden lg:block">
            <Skeleton className="h-5 w-24" />
          </div>
          <div className="hidden lg:block">
            <Skeleton className="h-5 w-28" />
          </div>
          <div className="hidden lg:block">
            <Skeleton className="h-8 w-16" />
          </div>
        </div>
      ))}
    </>
  );
}

export default function CartPage() {
  const { items, hydrated, removeFromCart, updateCartItem } = useCart();
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [showDateMismatchDialog, setShowDateMismatchDialog] = useState(false);
  const [dateMismatchMode, setDateMismatchMode] = useState<"order" | "quotation">("order");
  const [show24HourWarningDialog, setShow24HourWarningDialog] = useState(false);
  const [showQuotationMergeDialog, setShowQuotationMergeDialog] = useState(false);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  const [pendingCheckoutProducts, setPendingCheckoutProducts] = useState<typeof items>([]);
  const pendingCheckoutRef = useRef<typeof items>([]);
  const pendingQuotationRef = useRef<typeof items>([]);

  const dessertPackageMap = new Map<string, string>();
  const packageDessertMap = new Map<string, string>();
  items.forEach((item) => {
    const isPackage = item.name?.includes("包裝設計");
    const tempId = item.temp_id as string | undefined;
    if (tempId) {
      if (isPackage) {
        packageDessertMap.set(item.id, tempId);
      } else {
        const packageItem = items.find((i) => i.temp_id === tempId && i.name?.includes("包裝設計"));
        if (packageItem) dessertPackageMap.set(item.id, packageItem.id);
      }
    }
  });

  const toggleSelect = (id: string) => {
    setSelectedItems((prev) => {
      const newSelection = prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id];
      const relatedPackageId = dessertPackageMap.get(id);
      const relatedDessertId = packageDessertMap.get(id);
      if (relatedPackageId && !prev.includes(id)) newSelection.push(relatedPackageId);
      if (relatedDessertId && !prev.includes(id)) newSelection.push(relatedDessertId);
      if (relatedPackageId && prev.includes(id)) return newSelection.filter((i) => i !== relatedPackageId);
      if (relatedDessertId && prev.includes(id)) return newSelection.filter((i) => i !== relatedDessertId);
      return newSelection;
    });
  };

  const isSelected = (id: string) => selectedItems.includes(id);
  const isAllSelected = selectedItems.length === items.length && items.length > 0;
  const toggleSelectAll = () => {
    if (isAllSelected) setSelectedItems([]);
    else setSelectedItems(items.map((item) => item.id));
  };

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!user && items.length > 0) {
        e.preventDefault();
        (e as any).returnValue = "您尚未登入，刷新後購物車會消失，是否要登入？";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [user, items.length]);

  useEffect(() => {
    const ids = new Set(items.map((i) => i.id));
    setSelectedItems((prev) => prev.filter((id) => ids.has(id)));
  }, [items]);

  const getCustomizerPath = (item: { product_id?: string; id: string }) => {
    const id = (item.product_id || item.id).toString().toLowerCase();
    const path = CUSTOMIZER_ROUTE_MAP[id];
    if (path?.startsWith("/customize/")) return `/customizer-new/${id}`;
    return path || "/order";
  };

  const handleDateSelect = async (item: (typeof items)[0], date: Date | undefined) => {
    if (!date) return;
    const formattedDate = format(date, "yyyy-MM-dd");
    const isDbId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id);
    try {
      if (isDbId) {
        const { error } = await supabase.from("cart").update({ expected_pickup_date: formattedDate }).eq("id", item.id);
        if (error) throw error;
      }
      updateCartItem(item.id, { expected_pickup_date: formattedDate });
      toast({ title: "已更新取貨日期", description: `取貨日期已設定為 ${formattedDate}` });
    } catch (err) {
      console.error("更新日期失敗:", err);
      updateCartItem(item.id, { expected_pickup_date: formattedDate });
      toast({ title: "已更新取貨日期", description: `取貨日期已設定為 ${formattedDate}` });
    }
  };

  const validateSelectedForCheckout = (
    mode: "order" | "quotation" = "order",
  ): (typeof items) | null => {
    if (selectedItems.length === 0) {
      toast({ title: "請至少勾選一筆商品", description: "請勾選要結帳的項目後再送出", variant: "destructive" });
      return null;
    }
    if (!user) {
      setShowLoginDialog(true);
      return null;
    }
    const selectedProducts = items.filter((i) => selectedItems.includes(i.id));
    if (selectedProducts.length === 0) {
      toast({
        title: "請重新勾選要結帳的商品",
        description: "購物車已更新（例如登入後同步），請再勾選要結帳的項目後點「去買單」",
        variant: "destructive",
      });
      return null;
    }
    const nonPackageSelected = selectedProducts.filter((item) => !item.name?.includes("包裝設計"));
    const pickupDates = nonPackageSelected.map((item) => item.expected_pickup_date).filter(Boolean);
    const uniqueDates = [...new Set(pickupDates)];

    if (uniqueDates.length > 1) {
      setDateMismatchMode(mode);
      setShowDateMismatchDialog(true);
      return null;
    }
    const hasSomeDate = nonPackageSelected.some((item) => !!item.expected_pickup_date);
    const hasSomeNoDate = nonPackageSelected.some((item) => !item.expected_pickup_date);
    if (hasSomeDate && hasSomeNoDate) {
      if (mode === "quotation") {
        setDateMismatchMode("quotation");
        setShowDateMismatchDialog(true);
        return null;
      }
      toast({
        title: "取貨日期須一致",
        description: "請為所有選中商品設定相同的預定取貨時間，或全部改為「結帳時選擇」",
        variant: "destructive",
      });
      return null;
    }
    const classicWithoutDate = selectedProducts.find(
      (item) => item.category === "classic" && !item.expected_pickup_date && !item.name?.includes("包裝設計")
    );
    if (classicWithoutDate) {
      toast({
        title: "請設定取貨日期",
        description:
          mode === "quotation"
            ? "經典款商品需要設定取貨日期才能建立報價單"
            : "經典款商品需要設定取貨日期才能結帳",
        variant: "destructive",
      });
      return null;
    }
    return selectedProducts;
  };

  const goToCheckout = (selectedProducts: (typeof items), intent: "order" | "quotation") => {
    try {
      sessionStorage.setItem(CHECKOUT_SELECTED_KEY, JSON.stringify(selectedProducts));
      sessionStorage.setItem(CHECKOUT_INTENT_KEY, intent);
    } catch (_) {
      toast({ title: "無法儲存結帳資料", variant: "destructive" });
      return;
    }
    router.push("/checkout");
  };

  const handleCheckout = () => {
    const selectedProducts = validateSelectedForCheckout();
    if (!selectedProducts) return;
    pendingCheckoutRef.current = selectedProducts;
    setPendingCheckoutProducts(selectedProducts);
    setShow24HourWarningDialog(true);
  };

  const handlePreCreateQuotation = () => {
    const selectedProducts = validateSelectedForCheckout("quotation");
    if (!selectedProducts) return;
    if (selectedProducts.length > 1) {
      pendingQuotationRef.current = selectedProducts;
      setShowQuotationMergeDialog(true);
      return;
    }
    goToCheckout(selectedProducts, "quotation");
  };

  const proceedMergedQuotation = () => {
    setShowQuotationMergeDialog(false);
    const toSubmit = pendingQuotationRef.current;
    if (!toSubmit?.length) {
      toast({
        title: "請重新勾選商品",
        description: "未取得勾選項目，請勾選後再點「預先建立報價單」",
        variant: "destructive",
      });
      return;
    }
    goToCheckout(toSubmit, "quotation");
  };

  const proceedToCheckout = () => {
    setShow24HourWarningDialog(false);
    const toSubmit =
      pendingCheckoutRef.current?.length > 0
        ? pendingCheckoutRef.current
        : items.filter((i) => selectedItems.includes(i.id));
    if (toSubmit.length === 0) {
      toast({
        title: "請重新勾選要結帳的商品",
        description: "未取得勾選項目，請勾選後再點「去買單」",
        variant: "destructive",
      });
      return;
    }
    goToCheckout(toSubmit, "order");
  };

  const isClassicProduct = (item: (typeof items)[0]) => item.category === "classic";

  /** 從 cart item 的 customizations 拆出價格明細（與 QuantityPriceBox 對應） */
  function getPriceBreakdown(item: (typeof items)[0]) {
    const cust = (item.customizations || []) as { group?: string; details?: { totalPrice?: number; fee?: number; option_name_zh?: string; customFeeAmount?: number } }[];
    let packageFee = 0;
    let conditionalFee = 0;
    const conditionalFeeDetails: { option_name_zh: string; fee: number }[] = [];
    let customFeeAmount = 0;
    cust.forEach((c) => {
      if (c.group === "package_style" && c.details?.totalPrice) packageFee += c.details.totalPrice;
      if (c.group === "package_decoration" && c.details?.totalPrice) packageFee += c.details.totalPrice;
      if (c.group === "conditional_fee" && c.details?.fee) {
        conditionalFee += c.details.fee;
        if (c.details?.option_name_zh != null) conditionalFeeDetails.push({ option_name_zh: c.details.option_name_zh, fee: c.details.fee });
      }
      if (c.group === "macaron_mode" && c.details?.customFeeAmount) customFeeAmount += c.details.customFeeAmount;
    });
    const grandTotal = item.total_price ?? 0;
    const subtotal = Math.max(0, grandTotal - packageFee - conditionalFee - customFeeAmount);
    return { subtotal, packageFee, conditionalFee, conditionalFeeDetails, customFeeAmount, grandTotal };
  }

  /** 價格明細區塊（與 QuantityPriceBox 一致：小計、指定色、包裝、插卡、總計） */
  function PriceBreakdownContent({ item }: { item: (typeof items)[0] }) {
    const { subtotal, packageFee, conditionalFee, conditionalFeeDetails, customFeeAmount, grandTotal } = getPriceBreakdown(item);
    const hasPackageFee = packageFee > 0;
    const hasConditionalFee = conditionalFee > 0;
    const hasCustomFee = customFeeAmount > 0;
    return (
      <div className="p-4 min-w-[240px] space-y-2 text-sm">
        <p className="text-lg font-medium text-foreground border-b border-border pb-2">價格明細</p>
        <p className="text-muted-foreground">小計（甜點）：NT$ {subtotal.toLocaleString()}</p>
        {hasCustomFee && (
          <p className="text-amber-600">指定色費用（10%）：NT$ {customFeeAmount.toLocaleString()}</p>
        )}
        {hasPackageFee && (
          <p className="text-muted-foreground">包裝費用：NT$ {packageFee.toLocaleString()}</p>
        )}
        {hasConditionalFee && (
          <>
            <p className="text-amber-600">插卡費用：NT$ {conditionalFee.toLocaleString()}</p>
            {conditionalFeeDetails.length > 0 && (
              <ul className="list-disc list-inside text-amber-600/90 text-xs space-y-0.5 ml-1">
                {conditionalFeeDetails.map((d, i) => (
                  <li key={i}>「{d.option_name_zh}」NT$ {d.fee.toLocaleString()}</li>
                ))}
              </ul>
            )}
          </>
        )}
        <p className="text-base font-bold text-primary pt-2 border-t border-border/50">總計：NT$ {grandTotal.toLocaleString()}</p>
      </div>
    );
  }

  return (
    <>
      <div className="w-full max-w-7xl lg:max-w-[1400px] xl:max-w-[1600px] mx-auto py-10 md:py-20 px-4 md:px-6">
        <h1 className="text-3xl md:text-5xl font-semibold text-brand-600 flex items-baseline gap-3 flex-wrap">
          來看我的購物車
          <span className="font-semibold text-sm md:text-base text-ink-muted">
            🔔 取貨<span className="text-red-500 font-semibold">時間相同</span>之品項可以合併建立訂單
          </span>
        </h1>

        <div className="mt-6 md:mt-10">
          <Card className="w-full p-4 md:p-10 bg-white shadow-lg rounded-2xl md:rounded-3xl border border-border">
            {!hydrated ? (
              <CartSkeleton />
            ) : items.length === 0 ? (
              <div className="text-center py-16 min-h-[280px] flex items-center justify-center">
                <p className="text-ink-muted text-xl">購物車是空的</p>
              </div>
            ) : (
              <>
                <div className="hidden lg:grid grid-cols-[50px_140px_180px_100px_100px_100px_minmax(280px,2fr)_140px_80px] font-semibold text-base text-ink-muted pb-4 border-b border-border">
                  <div>勾選</div>
                  <div>商品縮圖</div>
                  <div>商品名稱</div>
                  <div>設計後單價</div>
                  <div>數量</div>
                  <div>小計</div>
                  <div>客製化細節</div>
                  <div>預定到/取貨時間</div>
                  <div className="text-center">操作</div>
                </div>

                {items.map((item) => {
                  const isPackageDesign = item.name?.includes("包裝設計");
                  const isClassic = isClassicProduct(item);
                  const unitPrice = item.price ?? (item.total_price ?? 0) / (item.quantity || 1);
                  return (
                    <div
                      key={item.id}
                      className="flex flex-col lg:grid lg:grid-cols-[50px_140px_180px_100px_100px_100px_minmax(280px,2fr)_140px_80px] items-start lg:items-center py-6 border-b border-border text-base gap-4 lg:gap-0"
                    >
                      <div className="flex items-start gap-4 w-full lg:contents">
                        <div className="flex justify-center pt-2 lg:pt-0">
                          <input
                            type="checkbox"
                            checked={isSelected(item.id)}
                            onChange={() => toggleSelect(item.id)}
                            className="h-6 w-6 accent-brand-500 cursor-pointer"
                          />
                        </div>
                        <div className="flex-shrink-0">
                          <div className="relative h-20 w-20 overflow-hidden rounded-lg border border-border bg-muted/30 md:h-24 md:w-24">
                            <SafeImage
                              src={item.preview_url || item.image_url || "https://placehold.co/100x100?text=商品"}
                              alt={item.name}
                              fill
                              className="object-cover"
                              sizes="96px"
                            />
                          </div>
                        </div>
                        <div className="flex-1 lg:hidden">
                          <p className="font-semibold text-ink text-base">{item.name}</p>
                          <p className="text-sm text-ink-muted mt-1">
                            {isPackageDesign ? "N/A" : `單價: NT$ ${unitPrice?.toLocaleString()}`}
                          </p>
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className="text-sm font-bold text-brand-600 mt-1 hover:underline text-left"
                              >
                                小計: NT$ {(item.total_price || 0).toLocaleString()}元（點擊看明細）
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <PriceBreakdownContent item={item} />
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>

                      <div className="hidden lg:block">
                        <p className="font-semibold text-ink text-lg">{item.name}</p>
                      </div>
                      <div className="hidden lg:block font-medium text-ink">
                        {isPackageDesign ? "N/A" : `NT$ ${unitPrice?.toLocaleString()}`}
                      </div>
                      <div className="hidden lg:block text-center font-bold text-ink text-sm px-2">
                        {isPackageDesign ? "與訂購之甜點數量一致，如有加購盒子，則與禮盒數量一致。" : item.quantity}
                      </div>
                      <div className="hidden lg:block font-bold text-brand-600 text-lg">
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="text-left hover:bg-muted/50 rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors cursor-pointer"
                            >
                              <div>NT$ {(item.total_price || 0).toLocaleString()}元</div>
                              {(() => {
                                const { packageFee, conditionalFee } = getPriceBreakdown(item);
                                return (
                                  <>
                                    {conditionalFee > 0 && (
                                      <div className="text-sm font-normal text-amber-600">（含插卡價格{conditionalFee.toLocaleString()}元）</div>
                                    )}
                                    {packageFee > 0 && (
                                      <div className="text-sm font-normal text-ink-muted">（含包裝價格{packageFee.toLocaleString()}元）</div>
                                    )}
                                  </>
                                );
                              })()}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start" side="left">
                            <PriceBreakdownContent item={item} />
                          </PopoverContent>
                        </Popover>
                      </div>

                      <div className="flex items-center justify-between w-full lg:hidden px-2">
                        <div className="text-sm text-ink-muted">
                          {isPackageDesign ? <span className="text-xs">數量與甜點一致</span> : <span>數量: {item.quantity}</span>}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => {
                            removeFromCart(item.id);
                            toast({ title: "已刪除", description: "商品已從購物車移除" });
                          }}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>

                      <div className="lg:hidden text-sm text-ink-muted space-y-1 px-2 w-full">
                        <p className="font-medium text-ink mb-1">客製化細節：</p>
                        {item.customizations && (item.customizations as any[]).length > 0 ? (
                          (item.customizations as any[]).map((c: any, idx: number) => (
                            <div key={idx} className="text-xs">
                              <span className="font-medium">{c.group_name_zh}：</span>
                              {c.value?.url ? (
                                <a href={c.value.url} target="_blank" rel="noopener noreferrer" className="text-brand-500 underline">
                                  {c.summary}
                                </a>
                              ) : (
                                <span>{c.summary}</span>
                              )}
                            </div>
                          ))
                        ) : (
                          <span className="text-ink-muted text-xs">無客製化</span>
                        )}
                      </div>

                      <div className="lg:hidden w-full px-2">
                        <p className="font-medium text-ink text-sm mb-2">預定取貨時間：</p>
                        {isClassic && !isPackageDesign ? (
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                className={cn("w-full justify-start text-left font-normal", !item.expected_pickup_date && "text-muted-foreground")}
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {item.expected_pickup_date
                                  ? format(new Date(item.expected_pickup_date), "yyyy年MM月dd日", { locale: zhTW })
                                  : "選擇取貨日期"}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={item.expected_pickup_date ? new Date(item.expected_pickup_date) : undefined}
                                onSelect={(date) => handleDateSelect(item, date)}
                                month={calendarMonth}
                                onMonthChange={setCalendarMonth}
                                disabled={(date) => date < new Date()}
                                className="pointer-events-auto"
                              />
                            </PopoverContent>
                          </Popover>
                        ) : (
                          <p className="text-sm text-ink-muted">{item.expected_pickup_date || "結帳時選擇"}</p>
                        )}
                      </div>

                      <div className="hidden lg:block text-sm text-ink-muted space-y-1">
                        {item.customizations && (item.customizations as any[]).length > 0 ? (
                          (item.customizations as any[]).map((c: any, idx: number) => (
                            <div key={idx}>
                              <span className="font-medium text-ink">{c.group_name_zh}：</span>
                              {c.value?.url ? (
                                <a href={c.value.url} target="_blank" rel="noopener noreferrer" className="text-brand-500 underline">
                                  {c.summary}
                                </a>
                              ) : (
                                <span>{c.summary}</span>
                              )}
                            </div>
                          ))
                        ) : (
                          <span className="text-ink-muted">無客製化</span>
                        )}
                      </div>

                      <div className="hidden lg:block">
                        {isClassic && !isPackageDesign ? (
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className={cn("w-full justify-start text-left font-normal text-sm", !item.expected_pickup_date && "text-muted-foreground")}
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {item.expected_pickup_date
                                  ? format(new Date(item.expected_pickup_date), "MM/dd", { locale: zhTW })
                                  : "選擇日期"}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={item.expected_pickup_date ? new Date(item.expected_pickup_date) : undefined}
                                onSelect={(date) => handleDateSelect(item, date)}
                                month={calendarMonth}
                                onMonthChange={setCalendarMonth}
                                disabled={(date) => date < new Date()}
                                className="pointer-events-auto"
                              />
                            </PopoverContent>
                          </Popover>
                        ) : (
                          <span className="text-sm text-ink-muted">{item.expected_pickup_date || "結帳時選擇"}</span>
                        )}
                      </div>

                      <div className="hidden lg:flex justify-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => {
                            removeFromCart(item.id);
                            toast({ title: "已刪除", description: "商品已從購物車移除" });
                          }}
                        >
                          <Trash2 size={18} />
                        </Button>
                      </div>
                    </div>
                  );
                })}

                {items.length > 0 && (
                  <div className="flex flex-col sm:flex-row justify-center items-center gap-3 sm:gap-4 mt-8 md:mt-10">
                    <Button
                      size="lg"
                      variant="outline"
                      className="w-full sm:w-auto px-6 md:px-8 py-4 text-lg border-brand-500 text-brand-500 hover:bg-brand-50 rounded-xl transition"
                      onClick={toggleSelectAll}
                    >
                      {isAllSelected ? "取消全選" : "全選"}
                    </Button>
                    <Button
                      size="lg"
                      className="w-full sm:w-auto px-12 md:px-16 py-4 text-lg bg-brand-500 text-white rounded-xl hover:bg-brand-600 transition disabled:opacity-50 disabled:pointer-events-none"
                      onClick={handleCheckout}
                      disabled={selectedItems.length === 0}
                    >
                      去買單
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      className="w-full sm:w-auto px-8 md:px-12 py-4 text-lg border-brand-500 text-brand-600 hover:bg-brand-50 rounded-xl transition disabled:opacity-50 disabled:pointer-events-none"
                      onClick={handlePreCreateQuotation}
                      disabled={selectedItems.length === 0}
                    >
                      預先建立報價單
                    </Button>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>
        <div className="mt-8 md:mt-10">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
            <p className="text-sm text-amber-700">
              <span className="font-medium">⚠️ 系統提醒：</span>
              系統會自動刪除超過 60 天的甜點預覽照片及用戶上傳資料，請自行下載與備份重要檔案。
            </p>
          </div>
        </div>
      </div>

      <AlertDialog open={showLoginDialog} onOpenChange={setShowLoginDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>需要登入才能提交訂單</AlertDialogTitle>
            <AlertDialogDescription>請先登入或註冊會員，以便保存購物車紀錄並完成訂單。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => router.push("/login?redirect=/cart")}>立即登入</AlertDialogAction>
            <AlertDialogAction onClick={() => router.push("/register?redirect=/cart")}>立即註冊</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDateMismatchDialog} onOpenChange={setShowDateMismatchDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {dateMismatchMode === "quotation" ? "無法合併建立報價單" : "取貨日期不一致"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {dateMismatchMode === "quotation"
                ? "您勾選的商品配送／自取日期不同（或有的有日期、有的沒有）。請分開勾選，並分別建立報價單。"
                : "您選擇的商品有不同的預定取貨日期，請確保所有商品的取貨日期一致後再結帳。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowDateMismatchDialog(false)}>了解，返回修改</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showQuotationMergeDialog} onOpenChange={setShowQuotationMergeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>多筆商品是否合併報價？</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 text-left">
              <p>您勾選了多筆購物車項目。請確認：</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>是否為同一送貨地點（或皆為自取）？</li>
                <li>配送／自取日期是否為同一天？</li>
              </ul>
              <p>
                若皆為「是」，將合併為一張報價單（訂購內容與報價明細會合併顯示）。
                若不是，請取消後分開勾選、分別建立報價單。
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col sm:flex-row gap-2">
            <AlertDialogCancel>不是，我要分開建立</AlertDialogCancel>
            <AlertDialogAction onClick={proceedMergedQuotation}>是，合併建立報價單</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={show24HourWarningDialog} onOpenChange={setShow24HourWarningDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">⏱️ 24 小時付款提醒</DialogTitle>
            <div className="text-sm text-muted-foreground text-base leading-relaxed pt-4 space-y-4">
              <p>
                填寫資料並送出訂單後，須在 <strong className="text-primary">24 小時內匯款</strong>
                ，如時間內未匯款，系統將會自動取消該筆訂單，購物車、會員中心將不會看見該筆訂單。
              </p>
              <p>建議您確認可以在 24 小時內完成付款後再送出訂單。</p>
              <p className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-sm">
                💡 如果您因為公司報帳取款流程無法 24 小時內付款，請截圖購物車明細，寄送圖片到 LINE 官方，將由專員為您服務。
              </p>
            </div>
          </DialogHeader>
          <DialogFooter className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button variant="outline" onClick={() => setShow24HourWarningDialog(false)} className="w-full sm:w-auto">
              回到購物車
            </Button>
            <Button onClick={proceedToCheckout} className="w-full sm:w-auto">
              我了解，繼續建立訂單
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
