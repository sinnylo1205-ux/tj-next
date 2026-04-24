import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CalendarIcon, Plus, Trash2, X, ChevronsUpDown, Check } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
}

interface ProductNotice {
  product_id: string;
  min_order_qty: number | null;
  price_min: number | null;
}

interface OrderItemInput {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  customizations_json: string;
  preview_url: string;
}

interface ManualOrderFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

// 運費選項 Enum
const SHIPPING_OPTIONS = [
  { label: "自取", fee: 0, way: "自取" },
  { label: "黑貓配送 (NT$240)", fee: 240, way: "黑貓配送" },
  { label: "專件配送 (NT$650)", fee: 650, way: "專件配送" },
] as const;

const ManualOrderForm = ({ onClose, onSuccess }: ManualOrderFormProps) => {
  const { toast } = useToast();
  const { user } = useAuth();

  // Products state
  const [products, setProducts] = useState<Product[]>([]);
  const [productsByCategory, setProductsByCategory] = useState<Record<string, Product[]>>({});
  const [productNotices, setProductNotices] = useState<Record<string, ProductNotice>>({});

  // Form state
  const [orderItems, setOrderItems] = useState<OrderItemInput[]>([
    { id: crypto.randomUUID(), product_id: "", quantity: 0, unit_price: 0, customizations_json: "", preview_url: "" },
  ]);
  const [recipientName, setRecipientName] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [expectedPickupDate, setExpectedPickupDate] = useState<Date | undefined>();
  const [expectedPickupDateString, setExpectedPickupDateString] = useState("");
  const [shippingFee, setShippingFee] = useState(0);
  const [shippingWay, setShippingWay] = useState("自取");

  // Product search/filter state (Combobox)
  const [productSearch, setProductSearch] = useState<Record<string, string>>({});
  const [openProductPopover, setOpenProductPopover] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);

  // who_receive state
  const [whoReceiveType, setWhoReceiveType] = useState<"custom" | "same">("custom");
  const [whoReceiveName, setWhoReceiveName] = useState("");

  // Email state
  const [email, setEmail] = useState("");

  // Phone state
  const [phone, setPhone] = useState("");

  // LINE User ID state（手動訂單專用）
  const [lineUserId, setLineUserId] = useState("");

  /** 建立時訂單／付款狀態（可選「處理中」等，並寫入 auto_cancel_exempt） */
  const [orderStatus, setOrderStatus] = useState<string>("processing");
  const [paymentStep, setPaymentStep] = useState<string>("verified");
  /** 客戶類型標籤，空字串表示不設定 */
  const [customerType, setCustomerType] = useState<string>("");

  // 統編/抬頭
  const [taxTitle, setTaxTitle] = useState("");
  const [taxId, setTaxId] = useState("");

  // Load products and product notices
  useEffect(() => {
    const loadData = async () => {
      // Load products
      const { data: productsData, error: productsError } = await supabase
        .from("products")
        .select("id, name, category, price")
        .or("is_hide.is.null,is_hide.eq.false")
        .order("category");

      if (!productsError && productsData) {
        setProducts(productsData);
        // Group by category
        const grouped: Record<string, Product[]> = {};
        productsData.forEach((p) => {
          const cat = p.category || "未分類";
          if (!grouped[cat]) grouped[cat] = [];
          grouped[cat].push(p);
        });
        setProductsByCategory(grouped);
      }

      // Load product notices
      const { data: noticesData, error: noticesError } = await supabase
        .from("product_notice")
        .select("product_id, min_order_qty, price_min");

      if (!noticesError && noticesData) {
        const noticesMap: Record<string, ProductNotice> = {};
        noticesData.forEach((n) => {
          if (n.product_id) {
            noticesMap[n.product_id] = n;
          }
        });
        setProductNotices(noticesMap);
      }
    };
    loadData();
  }, []);

  // Calculate totals
  const subtotal = orderItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const totalAmount = subtotal + shippingFee;

  // Add order item
  const addOrderItem = () => {
    setOrderItems([
      ...orderItems,
      { id: crypto.randomUUID(), product_id: "", quantity: 0, unit_price: 0, customizations_json: "", preview_url: "" },
    ]);
  };

  // Remove order item
  const removeOrderItem = (id: string) => {
    if (orderItems.length > 1) {
      setOrderItems(orderItems.filter((item) => item.id !== id));
    }
  };

  // Update order item
  const updateOrderItem = (id: string, field: keyof OrderItemInput, value: string | number) => {
    setOrderItems(
      orderItems.map((item) => {
        if (item.id === id) {
          const updated = { ...item, [field]: value };
          // Auto-fill price and quantity when product selected
          if (field === "product_id") {
            const product = products.find((p) => p.id === value);
            const notice = productNotices[value as string];
            if (product) {
              // 優先使用 product_notice 的 price_min，否則使用 product.price
              updated.unit_price = notice?.price_min ?? product.price;
              // 數量維持管理員手動輸入，不自動帶入最低訂購量
            }
          }
          return updated;
        }
        return item;
      })
    );
  };

  // Filter products by search query
  const getFilteredProducts = (searchQuery: string) => {
    if (!searchQuery.trim()) return productsByCategory;

    const query = searchQuery.toLowerCase();
    const filtered: Record<string, Product[]> = {};

    Object.entries(productsByCategory).forEach(([category, prods]) => {
      const matchedProds = prods.filter((p) =>
        p.name.toLowerCase().includes(query)
      );
      if (matchedProds.length > 0) {
        filtered[category] = matchedProds;
      }
    });

    return filtered;
  };

  // Handle product selection from Combobox
  const handleSelectProduct = (itemId: string, productId: string) => {
    updateOrderItem(itemId, "product_id", productId);
    setOpenProductPopover((prev) => ({ ...prev, [itemId]: false }));
    setProductSearch((prev) => ({ ...prev, [itemId]: "" }));
  };

  // Handle shipping option change
  const handleShippingChange = (value: string) => {
    const option = SHIPPING_OPTIONS.find((o) => o.way === value);
    if (option) {
      setShippingFee(option.fee);
      setShippingWay(option.way);
    }
  };

  // Submit order
  const handleSubmit = async () => {
    if (!user) {
      toast({ title: "請先登入", variant: "destructive" });
      return;
    }

    // Validation
    if (!recipientName.trim()) {
      toast({ title: "請填寫訂購人／聯絡姓名", variant: "destructive" });
      return;
    }
    if (whoReceiveType === "custom" && !whoReceiveName.trim()) {
      toast({ title: "請填寫實際收件人姓名", variant: "destructive" });
      return;
    }

    const validItems = orderItems.filter((item) => item.product_id && item.quantity > 0);
    if (validItems.length === 0) {
      toast({ title: "請至少添加一個商品", variant: "destructive" });
      return;
    }

    // Determine who_receive value
    const whoReceiveValue = whoReceiveType === "same" ? recipientName : whoReceiveName;

    setSubmitting(true);

    try {
      // Create order
      // Determine who_receive: use whoReceiveValue, fallback to recipientName
      const finalWhoReceive = whoReceiveValue || recipientName;
      /** 非「等待付款＋未匯款」則標記不受 24h 自動取消（手動單 cron 本即略過，此為資料一致性） */
      const autoCancelExempt = !(orderStatus === "awaiting_payment" && paymentStep === "pending");

      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .insert({
          user_id: user.id,
          is_manual_order: true,
          orderer_name: recipientName.trim(),
          customer_type: customerType || null,
          shipping_address_text: shippingAddress,
          notes: notes || null,
          expected_pickup_date: expectedPickupDateString || (expectedPickupDate ? format(expectedPickupDate, "yyyy-MM-dd") : null),
          shipping_fee: shippingFee,
          subtotal: subtotal,
          total_amount: totalAmount,
          payment_step: paymentStep,
          order_status: orderStatus,
          auto_cancel_exempt: autoCancelExempt,
          payment_method: "cash",
          shipping_way: shippingWay,
          who_receive: finalWhoReceive,
          Email: email || null,
          phone: phone || null, // 訂購人電話
          line_user_id: lineUserId || null, // 手動訂單專用 LINE User ID
          TAX_title: taxTitle || null,
          TAX_id: taxId ? parseInt(taxId) : null,
        })
        .select("id")
        .single();

      if (orderError) throw orderError;

      // Create order items
      const orderItemsToInsert = validItems.map((item) => {
        const product = products.find((p) => p.id === item.product_id);
        let customizations = [];
        if (item.customizations_json.trim()) {
          try {
            customizations = JSON.parse(item.customizations_json);
          } catch {
            // If not valid JSON, wrap as text
            customizations = [{ group_name_zh: "備註", summary: item.customizations_json }];
          }
        }

        return {
          order_id: orderData.id,
          product_id: item.product_id,
          product_name: product?.name || item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          preview_url: item.preview_url || null,
          customizations_json: customizations,
        };
      });

      const { error: itemsError } = await supabase.from("order_items").insert(orderItemsToInsert);

      if (itemsError) throw itemsError;

      // 呼叫 notify-new-order Edge Function
      try {
        await supabase.functions.invoke("notify-new-order", {
          body: { order_id: orderData.id, user_id: user.id },
        });
      } catch (notifyError) {
        console.error("Notify error:", notifyError);
        // 不影響訂單建立
      }

      toast({ title: "✅ 手動訂單已建立" });
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Create manual order error:", error);
      toast({
        title: "建立訂單失敗",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>手動建立訂單</CardTitle>
          <CardDescription>為客戶手動建立訂單（使用管理員帳號，標記為手動訂單）</CardDescription>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Order Items */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-base font-semibold">商品項目</Label>
            <Button variant="outline" size="sm" onClick={addOrderItem}>
              <Plus className="h-4 w-4 mr-1" /> 添加商品
            </Button>
          </div>

          {orderItems.map((item, index) => {
            const selectedProduct = products.find((p) => p.id === item.product_id);
            const filteredProducts = getFilteredProducts(productSearch[item.id] || "");

            return (
            <div key={item.id} className="grid grid-cols-12 gap-3 p-4 border rounded-lg bg-muted/30">
              <div className="col-span-12 md:col-span-4">
                <Label className="text-xs">商品</Label>
                <Popover
                  open={openProductPopover[item.id] || false}
                  onOpenChange={(open) =>
                    setOpenProductPopover((prev) => ({ ...prev, [item.id]: open }))
                  }
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openProductPopover[item.id] || false}
                      className="w-full justify-between font-normal"
                    >
                      {selectedProduct ? selectedProduct.name : "選擇商品..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="輸入商品名稱搜尋..."
                        value={productSearch[item.id] || ""}
                        onValueChange={(v) =>
                          setProductSearch((prev) => ({ ...prev, [item.id]: v }))
                        }
                      />
                      <CommandList>
                        <CommandEmpty>找不到商品</CommandEmpty>
                        {Object.entries(filteredProducts).map(([category, prods]) => (
                          <CommandGroup key={category} heading={category}>
                            {prods.map((p) => {
                              const notice = productNotices[p.id];
                              const displayPrice = notice?.price_min ?? p.price;
                              const minQty = notice?.min_order_qty;
                              return (
                                <CommandItem
                                  key={p.id}
                                  value={p.id}
                                  onSelect={() => handleSelectProduct(item.id, p.id)}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      item.product_id === p.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {p.name} (${displayPrice}{minQty ? `, 最低${minQty}份` : ""})
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        ))}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="col-span-4 md:col-span-2">
                <Label className="text-xs">單價</Label>
                <Input
                  type="number"
                  min={0}
                  value={item.unit_price === 0 ? "" : item.unit_price}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const raw = e.target.value;
                    updateOrderItem(item.id, "unit_price", raw === "" ? 0 : parseInt(raw) || 0);
                  }}
                />
              </div>

              <div className="col-span-4 md:col-span-2">
                <Label className="text-xs">數量</Label>
                <Input
                  type="number"
                  min={0}
                  value={item.quantity === 0 ? "" : item.quantity}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const raw = e.target.value;
                    updateOrderItem(item.id, "quantity", raw === "" ? 0 : parseInt(raw) || 0);
                  }}
                />
              </div>

              <div className="col-span-4 md:col-span-3">
                <Label className="text-xs">小計</Label>
                <div className="h-10 flex items-center font-medium">NT$ {item.quantity * item.unit_price}</div>
              </div>

              <div className="col-span-12 md:col-span-1 flex items-end justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeOrderItem(item.id)}
                  disabled={orderItems.length === 1}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>

              <div className="col-span-12 md:col-span-6">
                <Label className="text-xs">客製化內容（JSON 或文字）</Label>
                <Textarea
                  placeholder='例如：{"flavor": "巧克力", "topping": "草莓"} 或直接輸入文字'
                  value={item.customizations_json}
                  onChange={(e) => updateOrderItem(item.id, "customizations_json", e.target.value)}
                  rows={2}
                />
              </div>

              <div className="col-span-12 md:col-span-6">
                <Label className="text-xs">預覽圖片 URL</Label>
                <Input
                  placeholder="貼上圖片連結"
                  value={item.preview_url}
                  onChange={(e) => updateOrderItem(item.id, "preview_url", e.target.value)}
                />
              </div>
            </div>
          );
          })}
        </div>

        <Separator />

        {/* 訂單狀態（建立時） */}
        <div className="space-y-3">
          <Label className="text-base font-semibold">訂單狀態（建立時）</Label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>訂單狀態</Label>
              <Select value={orderStatus} onValueChange={setOrderStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇狀態" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="awaiting_payment">等待付款</SelectItem>
                  <SelectItem value="processing">處理中</SelectItem>
                  <SelectItem value="shipped">出貨中</SelectItem>
                  <SelectItem value="delivered">已送達</SelectItem>
                  <SelectItem value="canceled">已取消</SelectItem>
                  <SelectItem value="returned">已退貨</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>付款狀態</Label>
              <Select value={paymentStep} onValueChange={setPaymentStep}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇付款狀態" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">未匯款</SelectItem>
                  <SelectItem value="submitted">已匯款（待確認）</SelectItem>
                  <SelectItem value="verified">已確認到帳</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>客戶類型（選填）</Label>
              <Select value={customerType || "none"} onValueChange={(v) => setCustomerType(v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="不設定" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">不設定</SelectItem>
                  <SelectItem value="general">一般用戶</SelectItem>
                  <SelectItem value="flash_ip">快閃店/IP</SelectItem>
                  <SelectItem value="pr_agent">公關代理</SelectItem>
                  <SelectItem value="company_self">公司自己</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            選擇「等待付款」且「未匯款」時會寫入可受 24 小時規則影響的標記；其餘組合（例如處理中、已確認到帳）會標記為不受 24 小時自動取消影響。手動訂單在排程上本來就不會被自動取消，上述欄位供資料與未來流程一致。
          </p>
        </div>

        <Separator />

        {/* Customer Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>訂購人／聯絡姓名 *</Label>
            <Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="訂購人或聯絡窗口姓名" />
          </div>

          <div className="space-y-2">
            <Label>預計取件日期</Label>
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="yyyy-MM-dd（可直接輸入）"
                value={expectedPickupDateString || (expectedPickupDate ? format(expectedPickupDate, "yyyy-MM-dd") : "")}
                onChange={(e) => {
                  setExpectedPickupDateString(e.target.value);
                  // 嘗試解析日期
                  const parsed = new Date(e.target.value);
                  if (!isNaN(parsed.getTime())) {
                    setExpectedPickupDate(parsed);
                  }
                }}
              />
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon" type="button">
                    <CalendarIcon className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-[9999]" align="start" sideOffset={4}>
                  <Calendar
                    mode="single"
                    selected={expectedPickupDate}
                    onSelect={(date) => {
                      setExpectedPickupDate(date);
                      if (date) {
                        setExpectedPickupDateString(format(date, "yyyy-MM-dd"));
                      }
                    }}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* who_receive 選項 */}
          <div className="space-y-2 md:col-span-2">
            <Label>實際收件人（資料庫欄位：who_receive）</Label>
            <p className="text-xs text-muted-foreground">
              訂購人會寫入 orderer_name；實際收件人寫入 who_receive。若與訂購人不同，請選「自行輸入」。
            </p>
            <RadioGroup
              value={whoReceiveType}
              onValueChange={(v) => setWhoReceiveType(v as "custom" | "same")}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="custom" id="who-custom" />
                <Label htmlFor="who-custom" className="cursor-pointer">自行輸入</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="same" id="who-same" />
                <Label htmlFor="who-same" className="cursor-pointer">同訂購人</Label>
              </div>
            </RadioGroup>
            {whoReceiveType === "custom" && (
              <Input
                value={whoReceiveName}
                onChange={(e) => setWhoReceiveName(e.target.value)}
                placeholder="輸入實際收件人姓名"
                className="mt-2"
              />
            )}
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <Label>訂購人電話</Label>
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="例：0912345678"
            />
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label>聯絡信箱</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="輸入 Email"
            />
          </div>

          {/* LINE User ID */}
          <div className="space-y-2 md:col-span-2">
            <Label>LINE User ID（選填）</Label>
            <Input
              value={lineUserId}
              onChange={(e) => setLineUserId(e.target.value)}
              placeholder="填入後，訂單狀態更新將發送 LINE 通知給此用戶"
            />
            <p className="text-xs text-muted-foreground">
              ℹ️ 填入 LINE User ID 後，訂單狀態變更時將發送 LINE 通知
            </p>
          </div>

          {/* 統編/抬頭 */}
          <div className="space-y-2">
            <Label>發票抬頭（選填）</Label>
            <Input
              value={taxTitle}
              onChange={(e) => setTaxTitle(e.target.value)}
              placeholder="例：OO科技股份有限公司"
            />
          </div>
          <div className="space-y-2">
            <Label>統一編號（選填，8碼）</Label>
            <Input
              value={taxId}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "").slice(0, 8);
                setTaxId(val);
              }}
              placeholder="例：12345678"
              maxLength={8}
            />
          </div>

          {/* 運費選項 */}
          <div className="space-y-2">
            <Label>配送方式</Label>
            <Select value={shippingWay} onValueChange={handleShippingChange}>
              <SelectTrigger>
                <SelectValue placeholder="選擇配送方式" />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                {SHIPPING_OPTIONS.map((option) => (
                  <SelectItem key={option.way} value={option.way}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>配送地址</Label>
            <Input value={shippingAddress} onChange={(e) => setShippingAddress(e.target.value)} placeholder="輸入配送地址" />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>訂單備註</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="輸入備註" rows={2} />
          </div>
        </div>

        <Separator />

        {/* Pricing */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span>運費（{shippingWay}）</span>
            <span>NT$ {shippingFee}</span>
          </div>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>小計</span>
            <span>NT$ {subtotal}</span>
          </div>
          <div className="flex items-center justify-between font-semibold text-lg">
            <span>總金額</span>
            <span>NT$ {totalAmount}</span>
          </div>
        </div>

        <Separator />

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "建立中..." : "建立訂單"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ManualOrderForm;