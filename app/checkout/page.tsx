"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { SafeImage } from "@/components/SafeImage";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { CartItem } from "@/contexts/CartContext";
import { trackLineClick } from "@/lib/track-line-click";
import { trackInitiateCheckout } from "@/lib/meta-pixel";
import { ga4BeginCheckout } from "@/lib/ga4";
import { CUSTOMER_SOURCE_OPTIONS, type CustomerSource } from "@/lib/customer-source";
import { CHECKOUT_INTENT_KEY, type CheckoutIntent } from "@/lib/checkout-create-quotation";
import { buildQuotationPdfHtml, type QuotationPdfWebhookPayload } from "@/lib/quotation-pdf-html";
import { cn } from "@/lib/utils";

const CHECKOUT_SELECTED_KEY = "tj_checkout_selected";

interface UserAddress {
  id: string;
  recipient_name: string;
  phone: string;
  address: string;
  is_default: boolean;
}

export default function CheckoutPage() {
  const router = useRouter();
  const { items: allCartItems, removeItemsByIds } = useCart();
  const { user, hasLineLinked } = useAuth();
  const { toast } = useToast();

  const [items, setItems] = useState<CartItem[]>([]);
  const [itemsReady, setItemsReady] = useState(false);
  const [checkoutIntent, setCheckoutIntent] = useState<CheckoutIntent>("order");
  const isQuotationMode = checkoutIntent === "quotation";
  const [showQuotationConfirmDialog, setShowQuotationConfirmDialog] = useState(false);

  useEffect(() => {
    try {
      const intentRaw =
        typeof window !== "undefined" ? sessionStorage.getItem(CHECKOUT_INTENT_KEY) : null;
      if (intentRaw === "quotation") setCheckoutIntent("quotation");
      else setCheckoutIntent("order");

      const raw = typeof window !== "undefined" ? sessionStorage.getItem(CHECKOUT_SELECTED_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as CartItem[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setItems(parsed);
          setItemsReady(true);
          // 延後移除 key，讓 React Strict Mode 二次掛載時仍能讀到同一筆資料
          const t = setTimeout(() => {
            sessionStorage.removeItem(CHECKOUT_SELECTED_KEY);
            sessionStorage.removeItem(CHECKOUT_INTENT_KEY);
          }, 500);
          return () => clearTimeout(t);
        }
      }
    } catch (_) {}
    setItems([]);
    setItemsReady(true);
  }, []);

  const [loading, setLoading] = useState(false);
  const [addresses, setAddresses] = useState<UserAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");
  const [recipientName, setRecipientName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [shippingMethod, setShippingMethod] = useState<"自取" | "黑貓宅配" | "專件配送" | "">("");
  const [notes, setNotes] = useState("");
  const [showSpecialDeliveryDialog, setShowSpecialDeliveryDialog] = useState(false);
  const [taxTitle, setTaxTitle] = useState("");
  const [taxId, setTaxId] = useState("");
  const [showLineLoginDialog, setShowLineLoginDialog] = useState(false);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [recipientError, setRecipientError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [addressError, setAddressError] = useState("");
  const [shippingMethodError, setShippingMethodError] = useState("");
  const [customerSource, setCustomerSource] = useState<CustomerSource | "">("");
  const [customerSourceError, setCustomerSourceError] = useState("");
  const [checkoutData, setCheckoutData] = useState<{
    subtotal: number;
    shipping_fee: number;
    total_amount: number;
    free_shipping_applied?: boolean;
    free_shipping_discount?: number;
    coupon_code?: string | null;
    coupon_discount?: number;
    validation?: { errors?: string[]; warnings?: string[] };
  } | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [showCouponInput, setShowCouponInput] = useState(false);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponMessage, setCouponMessage] = useState("");
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [minOrderError, setMinOrderError] = useState("");

  const initiateCheckoutFired = useRef(false);
  useEffect(() => {
    if (!itemsReady || items.length === 0 || initiateCheckoutFired.current) return;
    initiateCheckoutFired.current = true;
    const value = items.reduce((sum, item) => sum + (item.total_price || 0), 0);
    trackInitiateCheckout(items, value);
    ga4BeginCheckout(items, value);
  }, [itemsReady, items]);

  const subtotal = checkoutData?.subtotal ?? items.reduce((sum, item) => sum + (item.total_price || 0), 0);
  const shippingFee =
    checkoutData?.shipping_fee ??
    (shippingMethod === "自取" ? 0 : shippingMethod === "黑貓宅配" ? 240 : shippingMethod === "專件配送" ? 650 : 0);
  const totalAmount = checkoutData?.total_amount ?? subtotal + shippingFee;

  useEffect(() => {
    if (items.length === 0) return;
    const checkMinimumOrders = async () => {
      const productIds = [...new Set(items.map((i) => i.product_id))];
      const { data: productNotices } = await supabase
        .from("product_notice")
        .select("product_id, min_order_qty")
        .in("product_id", productIds);
      let errorMsg = "";
      productNotices?.forEach((notice) => {
        const totalQty = items.filter((i) => i.product_id === notice.product_id).reduce((sum, i) => sum + i.quantity, 0);
        if (notice.min_order_qty && totalQty < notice.min_order_qty) {
          errorMsg += `${notice.product_id} 最小訂購量為 ${notice.min_order_qty}，目前只有 ${totalQty}\n`;
        }
      });
      setMinOrderError(errorMsg);
    };
    checkMinimumOrders();
  }, [items]);

  useEffect(() => {
    if (!user) {
      router.push("/login?redirect=/checkout");
      return;
    }
    const loadUserData = async () => {
      const { data: userData } = await supabase.from("user_log_in").select("name, email, phone").eq("id", user.id).single();
      if (userData) {
        setRecipientName(userData.name || "");
        setPhone(userData.phone || "");
      }
      const { data: addressData } = await supabase
        .from("user_addresses")
        .select("*")
        .eq("user_id", user.id)
        .order("is_default", { ascending: false });
      if (addressData?.length) {
        setAddresses(addressData);
        const defaultAddr = addressData.find((a: UserAddress) => a.is_default) || addressData[0];
        setSelectedAddressId(defaultAddr.id);
        setAddress(defaultAddr.address);
        setRecipientName(defaultAddr.recipient_name);
        setPhone(defaultAddr.phone);
      }
      if (items.length > 0 && items[0]?.expected_pickup_date) {
        setNotes(`預定到貨日期：${items[0].expected_pickup_date}\n\n`);
      }
    };
    loadUserData();
  }, [user?.id]);

  const handleAddressChange = (addressId: string) => {
    setSelectedAddressId(addressId);
    const addr = addresses.find((a) => a.id === addressId);
    if (addr) {
      setAddress(addr.address);
      setRecipientName(addr.recipient_name);
      setPhone(addr.phone);
    }
  };

  const getAvailableShippingMethods = () => {
    const pickupDate = items[0]?.expected_pickup_date;
    if (!pickupDate) return ["自取", "黑貓宅配", "專件配送"];
    const dayOfWeek = new Date(pickupDate).getDay();
    if (dayOfWeek === 0) return ["專件配送"];
    if (dayOfWeek === 6) return ["黑貓宅配", "專件配送"];
    return ["自取", "黑貓宅配", "專件配送"];
  };
  const availableMethods = getAvailableShippingMethods();

  const recalcRef = useRef(0);
  const recalculateCheckout = useCallback(
    async (shipping: "自取" | "黑貓宅配" | "專件配送" | "", coupon?: string) => {
      if (!user || items.length === 0) return null;
      const effectiveShipping = shipping || "自取";
      const reqId = ++recalcRef.current;
      setIsRecalculating(true);
      try {
        const selectedIds = items.map((i) => i.id);
        const { data: dbCartRows } = await supabase
          .from("cart")
          .select("id")
          .eq("user_id", user.id)
          .eq("is_submitted", false)
          .in("id", selectedIds);
        const cartItemIds = dbCartRows?.map((r) => r.id) || [];
        if (cartItemIds.length === 0) return null;
        if (reqId !== recalcRef.current) return null;
        const { data, error } = await supabase.functions.invoke("calculate-checkout", {
          body: {
            cart_item_ids: cartItemIds,
            shipping_method: effectiveShipping,
            expected_pickup_date: items[0]?.expected_pickup_date || undefined,
            coupon_code: coupon?.trim() || undefined,
            user_id: user.id,
          },
        });
        if (reqId !== recalcRef.current) return null;
        if (error) {
          if (data?.error) {
            setCouponMessage(`❌ ${data.error}`);
            if (coupon?.trim()) return recalculateCheckout(effectiveShipping);
          }
          throw error;
        }
        if (data?.success && data.data) {
          setCheckoutData(data.data);
          return data.data;
        }
      } catch (err) {
        console.error("recalculateCheckout error:", err);
      } finally {
        if (reqId === recalcRef.current) setIsRecalculating(false);
      }
      return null;
    },
    [user?.id, items]
  );

  useEffect(() => {
    recalculateCheckout(shippingMethod);
  }, [shippingMethod]);

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    setCouponMessage("");
    try {
      const result = await recalculateCheckout(shippingMethod, couponCode);
      if (result) {
        if (result.coupon_code) setCouponMessage(`✅ 優惠碼「${result.coupon_code}」已套用`);
        else if (result.validation?.errors?.length) setCouponMessage(`❌ ${result.validation.errors.join(", ")}`);
        else if (result.validation?.warnings?.length) setCouponMessage(`⚠️ ${result.validation.warnings.join(", ")}`);
      } else {
        setCouponMessage("❌ 重複套用優惠碼或套用失敗，請稍後再試");
      }
    } catch {
      setCouponMessage("❌ 重複套用優惠碼或套用失敗，請稍後再試");
    } finally {
      setCouponLoading(false);
    }
  };

  const validateCheckoutForm = (): boolean => {
    let hasError = false;
    if (!recipientName.trim()) {
      setRecipientError("請填寫收件人姓名");
      hasError = true;
    } else setRecipientError("");
    if (!phone.trim()) {
      setPhoneError("請填寫聯絡電話");
      hasError = true;
    } else if (phone.replace(/\D/g, "").length !== 10) {
      setPhoneError("電話號碼必須為 10 碼");
      hasError = true;
    } else setPhoneError("");
    if (!address.trim()) {
      setAddressError("請填寫收件地址");
      hasError = true;
    } else setAddressError("");
    if (!shippingMethod) {
      setShippingMethodError("請選擇配送方式");
      hasError = true;
    } else if (!availableMethods.includes(shippingMethod)) {
      setShippingMethodError("此日期不支援該配送方式");
      hasError = true;
    } else setShippingMethodError("");
    if (!customerSource) {
      setCustomerSourceError("請選擇您是如何認識我們的");
      hasError = true;
    } else setCustomerSourceError("");
    if (hasError) {
      toast({ title: "❌ 請填寫完整資訊", description: "請確認所有必填欄位已正確填寫", variant: "destructive" });
      return false;
    }
    return true;
  };

  const handleCreateQuotationClick = () => {
    if (!user) {
      toast({ title: "❌ 請先登入", description: "您需要登入才能建立報價單", variant: "destructive" });
      return;
    }
    if (minOrderError) {
      toast({ title: "❌ 未達最小訂購量", description: minOrderError, variant: "destructive" });
      return;
    }
    if (!validateCheckoutForm()) return;
    setShowQuotationConfirmDialog(true);
  };

  const handleCreateQuotation = async () => {
    if (!user || !shippingMethod || !customerSource) return;
    setShowQuotationConfirmDialog(false);
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        toast({ title: "❌ 請重新登入", description: "無法取得登入憑證", variant: "destructive" });
        return;
      }

      const res = await fetch("/api/checkout/create-quotation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          who_receive: recipientName.trim(),
          phone: phone.trim(),
          address: address.trim(),
          shipping_way: shippingMethod,
          email: email.trim() || null,
          notes: notes.trim() || null,
          customer_source: customerSource,
          cart_item_ids: items.map((item) => item.id),
          coupon_code: checkoutData?.coupon_code || null,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        quotation_order_id?: string;
        pdf_input?: QuotationPdfWebhookPayload;
      };
      if (!res.ok) throw new Error(data.error || "建立報價單失敗");

      const pdfInput = data.pdf_input;
      if (pdfInput) {
        const html = buildQuotationPdfHtml(pdfInput);
        const blob = new Blob([html], { type: "text/html;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const w = window.open(url, "_blank", "noopener,noreferrer");
        if (!w) {
          toast({
            title: "報價單已建立，但無法開啟新視窗",
            description: "請允許彈出視窗後，至後台或聯絡客服取得報價單。可用 ⌘P／Ctrl+P 另存 PDF。",
            variant: "destructive",
          });
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
        } else {
          toast({
            title: "✅ 報價單已建立",
            description:
              "已在新分頁開啟報價單。請用 ⌘P／Ctrl+P → 目的地選「另存為 PDF」。購物車商品仍會保留。",
          });
          setTimeout(() => URL.revokeObjectURL(url), 600_000);
        }
      } else {
        toast({
          title: "✅ 報價單已建立",
          description: `報價單編號：${data.quotation_order_id || ""}（購物車商品仍會保留）`,
        });
      }

      router.push("/cart");
    } catch (error) {
      console.error("報價單建立失敗:", error);
      toast({
        title: "❌ 報價單建立失敗",
        description: error instanceof Error ? error.message : "請稍後再試或聯絡客服",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitOrder = async () => {
    if (!user) {
      toast({ title: "❌ 請先登入", description: "您需要登入才能送出訂單", variant: "destructive" });
      return;
    }
    if (minOrderError) {
      toast({ title: "❌ 未達最小訂購量", description: minOrderError, variant: "destructive" });
      return;
    }
    if (!validateCheckoutForm()) return;
    setLoading(true);
    try {
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .insert({
          user_id: user.id,
          total_amount: totalAmount,
          subtotal,
          shipping_fee: shippingFee,
          shipping_way: shippingMethod,
          shipping_address_text: `${phone}\n${address}`,
          who_receive: recipientName,
          phone,
          notes,
          payment_step: "pending",
          order_status: "awaiting_payment",
          expected_pickup_date: items[0]?.expected_pickup_date || null,
          Email: email || null,
          TAX_title: taxTitle || null,
          TAX_id: taxId ? parseInt(taxId) : null,
          customer_source: customerSource,
        })
        .select()
        .single();
      if (orderError || !orderData) throw orderError;

      const productIds = [...new Set(items.map((i) => i.product_id))];
      const { data: productData } = await supabase.from("products").select("id, name").in("id", productIds);
      const productNameMap: Record<string, string> = {};
      productData?.forEach((p: { id: string; name: string }) => {
        productNameMap[p.id] = p.name || p.id;
      });

      const itemIdMapping: Record<string, number> = {};
      for (const item of items) {
        const { data: orderItemData, error: itemError } = await supabase
          .from("order_items")
          .insert({
            order_id: orderData.id,
            product_id: item.product_id,
            product_name: productNameMap[item.product_id as string] || item.name || item.product_id,
            quantity: item.quantity,
            unit_price: (item.total_price || item.price || 0) / (item.quantity || 1),
            preview_url: item.preview_url,
            customizations_json: (item as any).customizations_json || item.customizations,
            is_package_design: (item as any).is_package_design ?? item.name?.includes("包裝設計"),
            linked_item_id: null,
            quantity_description: (item as any).is_package_design ? "與訂購之甜點數量一致，如有加購盒子，則與禮盒數量一致。" : null,
          })
          .select()
          .single();
        if (itemError || !orderItemData) throw itemError;
        itemIdMapping[item.id] = (orderItemData as any).order_item_id;
      }

      for (const item of items) {
        const linkedId = (item as any).linked_item_id;
        if (linkedId && itemIdMapping[linkedId]) {
          await supabase
            .from("order_items")
            .update({ linked_item_id: itemIdMapping[linkedId] })
            .eq("order_item_id", itemIdMapping[item.id]);
        }
      }

      for (const item of items) {
        const customizations = (item as any).customizations_json || item.customizations;
        if (customizations?.length) {
          const optionsToInsert = (customizations as any[])
            .filter((c: any) => c.option_id && c.option_id > 0)
            .map((c: any) => ({
              order_item_id: itemIdMapping[item.id],
              option_id: c.option_id,
              option_type: c.group || "custom",
              option_name_zh: c.group_name_zh || "",
              option_value: JSON.stringify(c),
            }));
          if (optionsToInsert.length) {
            const { error: optionError } = await supabase.from("order_item_options").insert(optionsToInsert);
            if (optionError) throw optionError;
          }
        }
      }

      if (checkoutData?.coupon_code) {
        const { data: currentUser } = await supabase.from("user_log_in").select("used_coupons").eq("id", user.id).single();
        const existingCoupons: string[] = currentUser?.used_coupons || [];
        if (!existingCoupons.includes(checkoutData.coupon_code)) {
          await supabase.from("user_log_in").update({ used_coupons: [...existingCoupons, checkoutData.coupon_code] }).eq("id", user.id);
        }
      }

      const submittedItemIds = items.map((item) => item.id);
      removeItemsByIds(submittedItemIds);

      void supabase.functions
        .invoke("generate-luck-layout", { body: { order_id: orderData.id } })
        .catch((err) => console.error("[Checkout] generate-luck-layout failed:", err));

      toast({ title: "✅ 訂單已建立成功", description: `訂單編號：${orderData.id}` });
      setCreatedOrderId(orderData.id);

      if (hasLineLinked) {
        try {
          await supabase.functions.invoke("notify-new-order", { body: { order_id: orderData.id, user_id: user.id } });
        } catch (err) {
          console.error("[Checkout] Failed to notify n8n:", err);
        }
        router.push("/member?tab=pending");
      } else {
        setShowLineLoginDialog(true);
      }
    } catch (error) {
      console.error("訂單建立失敗:", error);
      toast({ title: "❌ 訂單建立失敗", description: "請稍後再試或聯絡客服", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      (e as any).returnValue = "您的訂單資料不會保存，確定要離開嗎？";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  if (!itemsReady) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">載入中...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">請先登入</p>
        <Button asChild className="ml-4"><Link href="/login?redirect=/checkout">前往登入</Link></Button>
      </div>
    );
  }

  if (!itemsReady) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">載入中...</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>請先選擇要結帳的商品</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              請至購物車勾選至少一筆商品，並確保預定取貨時間一致後，再點「去買單」或「預先建立報價單」。
            </p>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link href="/cart">返回購物車</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="ghost"
            onClick={() => router.push("/cart")}
            className="flex items-center gap-2 text-base font-semibold border border-border rounded-full px-4 py-2 hover:bg-muted/50"
          >
            <ArrowLeft className="w-5 h-5" />
            返回購物車
          </Button>
          <h1 className="text-3xl font-bold text-foreground">
            {isQuotationMode ? "填寫報價單資訊" : "🧁 填寫訂單資訊"}
          </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>聯絡/收件資訊</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {addresses.length > 0 && (
                  <div className="space-y-2">
                    <Label>選擇常用地址</Label>
                    <Select value={selectedAddressId} onValueChange={handleAddressChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="選擇地址" />
                      </SelectTrigger>
                      <SelectContent>
                        {addresses.map((addr) => (
                          <SelectItem key={addr.id} value={addr.id}>
                            {addr.recipient_name} - {addr.phone.slice(-4)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="recipientName">收件人姓名 *</Label>
                  <Input
                    id="recipientName"
                    value={recipientName}
                    onChange={(e) => { setRecipientName(e.target.value); if (e.target.value.trim()) setRecipientError(""); }}
                    placeholder="請輸入收件人姓名"
                    className={recipientError ? "border-destructive" : ""}
                  />
                  {recipientError && <p className="text-sm text-destructive">{recipientError}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">聯絡電話 *（10 碼）</Label>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); if (e.target.value.replace(/\D/g, "").length === 10) setPhoneError(""); }}
                    placeholder="請輸入聯絡電話（例：0912345678）"
                    className={phoneError ? "border-destructive" : ""}
                  />
                  {phoneError && <p className="text-sm text-destructive">{phoneError}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">
                    {isQuotationMode ? "Email（選填）" : "Email（用於接收訂單確認信）"}
                  </Label>
                  <div className="flex gap-2">
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="請輸入您的 Email" className="flex-1" />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        if (user) {
                          const { data } = await supabase.from("user_log_in").select("email").eq("id", user.id).single();
                          if (data?.email) setEmail(data.email);
                        }
                      }}
                      className="whitespace-nowrap"
                    >
                      帶入會員信箱
                    </Button>
                  </div>
                </div>
                {!isQuotationMode && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="taxTitle">發票抬頭（選填）</Label>
                      <Input id="taxTitle" value={taxTitle} onChange={(e) => setTaxTitle(e.target.value)} placeholder="例：OO科技股份有限公司" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="taxId">統一編號（選填，8 碼數字）</Label>
                      <Input
                        id="taxId"
                        value={taxId}
                        onChange={(e) => setTaxId(e.target.value.replace(/\D/g, "").slice(0, 8))}
                        placeholder="例：12345678"
                        maxLength={8}
                      />
                    </div>
                  </>
                )}
                <div className="space-y-2">
                  <Label htmlFor="address">收件地址 *</Label>
                  <Textarea
                    id="address"
                    value={address}
                    onChange={(e) => { setAddress(e.target.value); if (e.target.value.trim()) setAddressError(""); }}
                    placeholder="請輸入完整收件地址"
                    rows={3}
                    className={addressError ? "border-destructive" : ""}
                  />
                  {addressError && <p className="text-sm text-destructive">{addressError}</p>}
                </div>
              </CardContent>
            </Card>

            <Card className={shippingMethodError ? "border-destructive" : ""}>
              <CardHeader>
                <CardTitle>配送方式 *</CardTitle>
              </CardHeader>
              <CardContent>
                <RadioGroup
                  value={shippingMethod}
                  onValueChange={(v: string) => {
                    const method = v as "自取" | "黑貓宅配" | "專件配送";
                    setShippingMethod(method);
                    setShippingMethodError("");
                    if (method === "專件配送") setShowSpecialDeliveryDialog(true);
                  }}
                >
                  {availableMethods.includes("自取") && (
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="自取" id="自取" />
                      <Label htmlFor="自取">自取（$0）</Label>
                    </div>
                  )}
                  {availableMethods.includes("黑貓宅配") && (
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="黑貓宅配" id="黑貓宅配" />
                      <Label htmlFor="黑貓宅配">黑貓宅配（$240）</Label>
                    </div>
                  )}
                  {availableMethods.includes("專件配送") && (
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="專件配送" id="專件配送" />
                      <Label htmlFor="專件配送">專件配送（$650）</Label>
                    </div>
                  )}
                </RadioGroup>
                {shippingMethodError && <p className="text-sm text-destructive mt-2">{shippingMethodError}</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>備註</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="其他需求或備註事項" rows={4} />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{isQuotationMode ? "報價摘要" : "🧾 訂單摘要"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {items.map((item) => {
                  const lineUnitPrice =
                    (item.total_price || item.price || 0) / Math.max(1, item.quantity || 1);
                  return (
                  <div key={item.id} className="flex items-center gap-3 border-b pb-3">
                    {item.preview_url && (
                      <SafeImage src={item.preview_url} alt={item.name} width={64} height={64} className="h-16 w-16 rounded object-cover" sizes="64px" />
                    )}
                    <div className="flex-1">
                      <p className="font-medium">{item.name}</p>
                      <p className="text-sm text-muted-foreground">
                        單價 NT$ {Math.round(lineUnitPrice).toLocaleString()}
                      </p>
                      <p className="text-sm text-muted-foreground">數量 × {item.quantity}</p>
                    </div>
                    <p className="font-semibold">NT${item.total_price || 0}</p>
                  </div>
                  );
                })}
                <div className="space-y-2 pt-4 border-t">
                  <div className="flex justify-between">
                    <span>商品小計</span>
                    <span>NT${subtotal}</span>
                  </div>
                  {checkoutData?.coupon_discount && checkoutData.coupon_discount > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>優惠折扣（{checkoutData.coupon_code}）</span>
                      <span>-NT${checkoutData.coupon_discount}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span>運費</span>
                    <div className="text-right">
                      {isRecalculating ? (
                        <span className="text-muted-foreground text-sm animate-pulse">計算中...</span>
                      ) : checkoutData?.free_shipping_applied ? (
                        <span className="flex items-center gap-2 flex-wrap justify-end">
                          <span className="line-through text-muted-foreground">NT${checkoutData.free_shipping_discount}</span>
                          <span className="text-green-700 text-sm">滿萬免運 -{checkoutData.free_shipping_discount}</span>
                          <span>NT$0</span>
                        </span>
                      ) : (
                        <span>NT${shippingFee}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between text-lg font-bold pt-2 border-t">
                    <span>總金額</span>
                    <span>NT${totalAmount}</span>
                  </div>
                  {!isQuotationMode && (
                    <div className="pt-2">
                      {!showCouponInput ? (
                        <Button variant="outline" size="sm" onClick={() => setShowCouponInput(true)} className="w-full">
                          輸入優惠折扣碼
                        </Button>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <Input placeholder="請輸入優惠碼" value={couponCode} onChange={(e) => setCouponCode(e.target.value)} className="flex-1" />
                            <Button size="sm" onClick={handleApplyCoupon} disabled={couponLoading || !couponCode.trim()}>
                              {couponLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "套用"}
                            </Button>
                          </div>
                          {couponMessage && <p className="text-sm text-muted-foreground">{couponMessage}</p>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {minOrderError && <div className="text-sm text-destructive bg-destructive/10 p-3 rounded">{minOrderError}</div>}
              </CardContent>
            </Card>

            <Card className={customerSourceError ? "border-destructive" : ""}>
              <CardHeader>
                <CardTitle>如何認識我們？ *</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="如何認識我們">
                  {CUSTOMER_SOURCE_OPTIONS.map((option) => {
                    const selected = customerSource === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => {
                          setCustomerSource(option.value);
                          setCustomerSourceError("");
                        }}
                        className={cn(
                          "min-h-[3.5rem] rounded-lg border-2 px-3 py-3 text-base font-medium leading-snug transition-colors",
                          selected
                            ? "border-[hsl(var(--color-brand-500))] bg-[hsl(var(--color-brand-50))] text-foreground shadow-sm"
                            : "border-border bg-background text-foreground hover:border-[hsl(var(--color-brand-300))] hover:bg-[hsl(var(--color-brand-100))]",
                        )}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                {customerSourceError && <p className="text-sm text-destructive mt-3">{customerSourceError}</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{isQuotationMode ? "報價須知" : "📋 下單須知"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                {isQuotationMode ? (
                  <>
                    <p>● 建立報價單並非送出訂單，購物車商品會保留，之後仍可正式下單。</p>
                    <p>● 匯款後請告知 Line 客服人員，已排入訂單。</p>
                    <p>● 請確認收件／配送資訊正確，以便後續轉為正式訂單。</p>
                  </>
                ) : (
                  <>
                    <p>● 依據消保法規定，本公司商品屬於保存期限短，無法回收再販售的生鮮商品，不適用消保法7日無條件退貨，若無法接受請勿下單。</p>
                    <p>● 結帳前請確認訂購人／收件人資料是否正確，以利商品順利送達。</p>
                    <p>● 請注意，黑貓宅配可能延誤送達，建議一定要選定在活動前1-2送達並放置陰涼處保存（奶油杯子蛋糕需要冷藏），本司無承擔黑貓物流延誤之責任</p>
                    <div>
                      <p>● 門市店營業時間</p>
                      <p className="ml-4">週一～週五 09:00–18:00</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <div className="flex gap-4">
              <Button variant="outline" onClick={() => router.push("/cart")} className="flex-1">
                <ArrowLeft className="mr-2 h-4 w-4" />
                回購物車
              </Button>
              {isQuotationMode ? (
                <Button
                  onClick={handleCreateQuotationClick}
                  disabled={loading || !!minOrderError || isRecalculating}
                  className="flex-1"
                >
                  {loading ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />處理中...</>
                  ) : isRecalculating ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />運費計算中...</>
                  ) : (
                    "建立報價單 PDF"
                  )}
                </Button>
              ) : (
                <Button onClick={handleSubmitOrder} disabled={loading || !!minOrderError || isRecalculating} className="flex-1">
                  {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />處理中...</> : isRecalculating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />運費計算中...</> : "送出訂單"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <AlertDialog open={showSpecialDeliveryDialog} onOpenChange={setShowSpecialDeliveryDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>專件配送提醒</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>您已選擇專件配送服務。</p>
              <p className="font-semibold text-foreground">請在下方備註欄位的「預定到貨日期」下方，手動輸入指定到貨的具體時間點。</p>
              <p className="text-sm text-muted-foreground">例如：「希望18:00到貨」或「請於下午3點前送達」</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button onClick={() => setShowSpecialDeliveryDialog(false)}>我知道了</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showQuotationConfirmDialog} onOpenChange={setShowQuotationConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>建立報價單前提醒</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 text-left">
              <p>建立報價單並非送出訂單。</p>
              <p>匯款後請告知 Line 客服人員，已排入訂單。</p>
              <p className="text-sm text-muted-foreground">建立後會開啟報價單頁面，可用列印功能另存為 PDF；購物車商品不會被移除。</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setShowQuotationConfirmDialog(false)} disabled={loading}>
              取消
            </Button>
            <Button onClick={() => void handleCreateQuotation()} disabled={loading}>
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />處理中...</> : "確認建立報價單 PDF"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showLineLoginDialog} onOpenChange={setShowLineLoginDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>您的訂單狀況：未付款</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>訂單已建立成功！</p>
              <p>是否透過 LINE 來接收訂單狀態更新資訊？</p>
              <p className="text-sm text-muted-foreground">連結 LINE 帳號後，您將收到付款確認、出貨通知等即時推播訊息。</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                if (createdOrderId && user?.id) {
                  try {
                    await supabase.functions.invoke("notify-new-order", { body: { order_id: createdOrderId, user_id: user.id } });
                  } catch (err) {
                    console.error("[Checkout] Failed to notify n8n:", err);
                  }
                }
                setShowLineLoginDialog(false);
                router.push("/member?tab=pending");
              }}
              className="w-full sm:w-auto"
            >
              不，我在網站上查看訂單狀況
            </Button>
            <Button
              onClick={() => {
                trackLineClick("checkout_line_login");
                const redirectUri = encodeURIComponent("https://akrxbdoxiopiubksgcrl.supabase.co/functions/v1/line-auth-callback");
                const state = encodeURIComponent(`${user?.id || ""}|${createdOrderId || ""}`);
                window.location.href = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=2008793012&redirect_uri=${redirectUri}&state=${state}&scope=profile%20openid`;
              }}
              className="w-full sm:w-auto bg-[#06C755] hover:bg-[#05a847] text-white"
            >
              好，去登入 LINE
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
