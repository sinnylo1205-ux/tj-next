import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ChevronDown, ChevronUp, Upload, ExternalLink, Loader2, RefreshCw } from "lucide-react";

// ========== Types ==========
interface QuotationOrder {
  id: string;
  status: string;
  all_requirement: any;
  created_at: string;
  updated_at: string;
  email: string | null;
  shipping_way: string | null;
  shipping_address_text: string | null;
  shipping_fee: number | null;
  subtotal: number | null;
  total_amount: number | null;
  expected_pickup_date: string | null;
  who_receive: string | null;
  notes: string | null;
  line_user_id: string | null;
  user_id: string | null;
  payment_method: string | null;
  payment_step: string | null;
  transfer_last5: string | null;
  discount_amount: number | null;
  recipient_name: string | null;
}

interface QuotationOrderItem {
  id: string;
  quotation_order_id: string;
  product_name: string | null;
  quantity: number | null;
  unit_price: number | null;
  preview_url: string | null;
  category: string;
  all_requirement: any;
  customizations_json: any;
  quantity_description: string | null;
}

// ========== Key Translation Map ==========
const KEY_ZH_MAP: Record<string, string> = {
  // customer_profile
  name: "姓名",
  email: "信箱",
  purpose: "用途",
  // delivery
  phone: "電話",
  method: "配送方式",
  address: "地址",
  receiver: "收件人",
  special_date: "指定日期",
  special_date_time: "指定時間",
  self_pick_date: "自取日期",
  self_pick_time: "自取時間",
  black_date: "排除日期",
  black_date_time: "排除時間",
  // service_order
  service_type: "服務類型",
  selections: "選擇項目",
  GiftBox: "禮盒",
  candyBar: "甜點佈置",
  custom_design: "客製化品項",
  // item-level
  customization: "客製化需求",
  note: "備註",
  reference_images: "參考圖片",
  quantity: "數量",
  // CandyBar keys
  budget_range: "預算範圍",
  design_concept: "設計概念",
  items_required: "需求品項",
  reference_files: "參考檔案",
  services_required: "需要的服務",
  // GiftBox keys
  budget_per_box: "每盒預算",
  contents: "內容物",
  customization_options: "客製化選項",
};

const SERVICE_TYPE_ZH: Record<string, string> = {
  custom_design: "客製化設計",
  giftbox: "禮盒",
  candy_bar: "甜點佈置",
};

// ========== Helpers ==========
const translateKey = (key: string) => KEY_ZH_MAP[key] || key;

const renderValue = (value: any): string => {
  if (value === null || value === undefined || value === "") return "";
  if (Array.isArray(value)) {
    if (value.length === 0) return "";
    if (typeof value[0] === "string") return value.join("、");
    return JSON.stringify(value);
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

/** 從單一欄位蒐集可點連結的圖檔 URL（字串或巢狀陣列） */
function collectImageUrlsFromField(raw: unknown): string[] {
  if (raw == null) return [];
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return [];
    if (t.startsWith("http://") || t.startsWith("https://")) return [t];
    return [];
  }
  if (Array.isArray(raw)) {
    return raw.flatMap((x) => collectImageUrlsFromField(x));
  }
  return [];
}

/** 品項 all_requirement / customizations_json 內的風格參考圖 */
function getItemStyleReferenceUrls(item: QuotationOrderItem): string[] {
  const req = item.all_requirement;
  const fromReq = collectImageUrlsFromField(req?.reference_images);
  const cust = item.customizations_json;
  const fromCust =
    cust && typeof cust === "object" && !Array.isArray(cust)
      ? collectImageUrlsFromField((cust as Record<string, unknown>).reference_images)
      : [];
  return [...new Set([...fromReq, ...fromCust])];
}

/** 全單 service_order（甜點佈置 candyBar、禮盒 GiftBox）內上傳的參考圖／檔連結 */
function getOrderServiceStyleReferenceUrls(allReq: any): string[] {
  const so = allReq?.service_order;
  if (!so || typeof so !== "object") return [];
  const keys = ["reference_images", "reference_files", "style_reference_images"] as const;
  const urls: string[] = [];
  for (const block of [so.candyBar, so.GiftBox]) {
    if (!block || typeof block !== "object") continue;
    for (const k of keys) {
      urls.push(...collectImageUrlsFromField((block as Record<string, unknown>)[k]));
    }
  }
  return [...new Set(urls)];
}

const StyleReferenceLinksBlock = ({ label, urls }: { label: string; urls: string[] }) => {
  if (urls.length === 0) return null;
  return (
    <div className="space-y-1">
      <Label className="text-sm">{label}</Label>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {urls.map((url, idx) => (
          <a
            key={`${url}-${idx}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline inline-flex items-center gap-1"
          >
            參考圖 {idx + 1} <ExternalLink className="h-3 w-3" />
          </a>
        ))}
      </div>
    </div>
  );
};

// Render all_requirement JSON into readable sections
const renderAllRequirement = (allReq: any) => {
  if (!allReq || typeof allReq !== "object") return null;

  const sections: { title: string; entries: { key: string; value: string }[] }[] = [];

  // customer_profile
  if (allReq.customer_profile) {
    const entries = Object.entries(allReq.customer_profile)
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(([k, v]) => ({ key: translateKey(k), value: renderValue(v) }));
    if (entries.length > 0) sections.push({ title: "👤 客戶資訊", entries });
  }

  // delivery
  if (allReq.delivery) {
    const entries = Object.entries(allReq.delivery)
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(([k, v]) => ({ key: translateKey(k), value: renderValue(v) }));
    if (entries.length > 0) sections.push({ title: "🚚 配送資訊", entries });
  }

  // service_order
  if (allReq.service_order) {
    const entries: { key: string; value: string }[] = [];
    const so = allReq.service_order;
    if (so.service_type) entries.push({ key: "服務類型", value: SERVICE_TYPE_ZH[so.service_type] || so.service_type });
    if (so.selections && so.selections.length > 0) {
      entries.push({ key: "選擇項目", value: so.selections.join("、") });
    }
    if (entries.length > 0) sections.push({ title: "🎨 服務內容", entries });

    // CandyBar 客製化細節 — 展開 JSON
    if (so.candyBar && typeof so.candyBar === "object") {
      const candyBarEntries = Object.entries(so.candyBar as Record<string, any>)
        .filter(([, v]) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0))
        .map(([k, v]) => ({ key: translateKey(k), value: renderValue(v) }));
      if (candyBarEntries.length > 0) {
        sections.push({ title: "🎨 甜點佈置客製化細節", entries: candyBarEntries });
      }
    }

    // GiftBox 客製化細節 — 展開 JSON
    if (so.GiftBox && typeof so.GiftBox === "object") {
      const giftBoxEntries = Object.entries(so.GiftBox as Record<string, any>)
        .filter(([, v]) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0))
        .map(([k, v]) => ({ key: translateKey(k), value: renderValue(v) }));
      if (giftBoxEntries.length > 0) {
        sections.push({ title: "🎁 禮盒客製化細節", entries: giftBoxEntries });
      }
    }
  }

  return (
    <div className="space-y-3">
      {sections.map((section, idx) => (
        <div key={idx}>
          <p className="font-semibold text-sm mb-1">{section.title}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {section.entries.map((entry, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-muted-foreground whitespace-nowrap">{entry.key}：</span>
                <span className="break-all">{entry.value}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// Render only service_order (服務內容、甜點佈置、禮盒) — for 報價填寫 block
const renderServiceAndProductRequirement = (allReq: any) => {
  if (!allReq?.service_order || typeof allReq.service_order !== "object") return null;
  const sections: { title: string; entries: { key: string; value: string }[] }[] = [];
  const so = allReq.service_order;

  const entries: { key: string; value: string }[] = [];
  if (so.service_type) entries.push({ key: "服務類型", value: SERVICE_TYPE_ZH[so.service_type] || so.service_type });
  if (so.selections && so.selections.length > 0) {
    entries.push({ key: "選擇項目", value: so.selections.join("、") });
  }
  if (entries.length > 0) sections.push({ title: "🎨 服務內容", entries });

  if (so.candyBar && typeof so.candyBar === "object") {
    const candyBarEntries = Object.entries(so.candyBar as Record<string, any>)
      .filter(([, v]) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0))
      .map(([k, v]) => ({ key: translateKey(k), value: renderValue(v) }));
    if (candyBarEntries.length > 0) {
      sections.push({ title: "🎨 甜點佈置客製化細節", entries: candyBarEntries });
    }
  }
  if (so.GiftBox && typeof so.GiftBox === "object") {
    const giftBoxEntries = Object.entries(so.GiftBox as Record<string, any>)
      .filter(([, v]) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0))
      .map(([k, v]) => ({ key: translateKey(k), value: renderValue(v) }));
    if (giftBoxEntries.length > 0) {
      sections.push({ title: "🎁 禮盒客製化細節", entries: giftBoxEntries });
    }
  }
  if (sections.length === 0) return null;
  return (
    <div className="space-y-3">
      {sections.map((section, idx) => (
        <div key={idx}>
          <p className="font-semibold text-sm mb-1">{section.title}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {section.entries.map((entry, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-muted-foreground whitespace-nowrap">{entry.key}：</span>
                <span className="break-all">{entry.value}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// ========== Image Upload ==========
const handleQuotationImageUpload = async (file: File): Promise<string> => {
  if (!file.type.startsWith("image/")) throw new Error("只能上傳圖片");
  if (file.size > 2 * 1024 * 1024) throw new Error("圖片不超過 2MB");

  const ext = file.name.split(".").pop() || "jpg";
  const fileName = `quotation/quote_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;

  const { error } = await supabase.storage
    .from("custom_asset")
    .upload(fileName, file, { cacheControl: "3600", upsert: false, contentType: file.type });

  if (error) throw error;

  const { data: urlData } = supabase.storage.from("custom_asset").getPublicUrl(fileName);
  return urlData.publicUrl;
};

// ========== Item Card for Price Asked ==========
interface ItemEditorProps {
  item: QuotationOrderItem;
  unitPrice: number | null;
  previewUrl: string;
  whyPrice: string;
  onUnitPriceChange: (val: number | null) => void;
  onPreviewUrlChange: (val: string) => void;
  onWhyPriceChange: (val: string) => void;
}

const ItemEditor = ({ item, unitPrice, previewUrl, whyPrice, onUnitPriceChange, onPreviewUrlChange, onWhyPriceChange }: ItemEditorProps) => {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const req = item.all_requirement || {};
  const lineTotal = unitPrice && item.quantity ? unitPrice * item.quantity : 0;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await handleQuotationImageUpload(file);
      onPreviewUrlChange(url);
      toast({ title: "✅ 圖片上傳成功" });
    } catch (err: any) {
      toast({ title: "上傳失敗", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="p-4 border rounded-lg bg-background space-y-3">
      <div className="flex justify-between items-start">
        <div>
          <p className="font-semibold text-base">{item.product_name}</p>
          {req.customization && (
            <p className="text-sm text-muted-foreground">客製化需求：{req.customization}</p>
          )}
          {req.note && <p className="text-sm text-muted-foreground">備註：{req.note}</p>}
        </div>
        <Badge variant="outline">{item.category}</Badge>
      </div>

      <StyleReferenceLinksBlock label="🎨 用戶風格參考圖連結" urls={getItemStyleReferenceUrls(item)} />

      {/* 單價（顯示在數量說明之後、與下欄編輯一致：單價在上） */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 flex-1">
          <Label className="whitespace-nowrap text-sm">單價：</Label>
          <Input
            type="number"
            min={0}
            placeholder="填入單價"
            value={unitPrice ?? ""}
            onChange={(e) => onUnitPriceChange(e.target.value ? Number(e.target.value) : null)}
            className="w-32"
          />
          <span className="text-sm text-muted-foreground">元</span>
        </div>
        <div className="text-sm font-medium">
          小計：NT$ {lineTotal.toLocaleString()}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">數量 × {item.quantity}</p>

      {/* Why Price (報價備注) */}
      <div className="space-y-1">
        <Label className="text-sm">報價備注：</Label>
        <Input
          placeholder="說明報價原因或備注"
          value={whyPrice}
          onChange={(e) => onWhyPriceChange(e.target.value)}
        />
      </div>

      {/* Preview URL + Upload */}
      <div className="space-y-2">
        <Label className="text-sm">預覽圖片：</Label>
        <div className="flex gap-2">
          <Input
            placeholder="輸入圖片 URL 或上傳"
            value={previewUrl}
            onChange={(e) => onPreviewUrlChange(e.target.value)}
            className="flex-1"
          />
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            className="hidden"
            onChange={handleUpload}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          </Button>
        </div>
        {previewUrl && (
          <div className="flex items-center gap-2">
            <img src={previewUrl} alt="preview" className="w-16 h-16 rounded object-cover" />
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline inline-flex items-center"
            >
              查看原圖 <ExternalLink className="ml-1 h-3 w-3" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
};

// ========== Main Component ==========
const AdminQuotationsPanel = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("price_asked");
  const [quotations, setQuotations] = useState<QuotationOrder[]>([]);
  const [items, setItems] = useState<Record<string, QuotationOrderItem[]>>({});
  const [loading, setLoading] = useState(false);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

  // Editable fields per quotation
  const [editData, setEditData] = useState<
    Record<
      string,
      {
        itemPrices: Record<string, number | null>;
        itemPreviewUrls: Record<string, string>;
        itemWhyPrices: Record<string, string>;
        shippingFee: number | null;
        lineUserId: string;
      }
    >
  >({});

  // Payment fields for price_reply
  const [paymentData, setPaymentData] = useState<
    Record<
      string,
      {
        paymentMethod: string;
        transferLast5: string;
        paymentStep: string;
        orderStatus: string;
        autoCancelExempt: boolean;
      }
    >
  >({});

  // Action loading state
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [customShippingFee, setCustomShippingFee] = useState<Set<string>>(new Set());

  // Editable quotation fields for price_reply / order_created
  const [quotationEdits, setQuotationEdits] = useState<Record<string, Partial<QuotationOrder> & { tax_title?: string; tax_id?: string }>>({});
  const [savingQuotation, setSavingQuotation] = useState<string | null>(null);

  const initQuotationEdits = (q: QuotationOrder) => {
    if (!quotationEdits[q.id]) {
      const ar = q.all_requirement || {};
      const cp = ar.customer_profile || {};
      const del = ar.delivery || {};
      const nameOrReceiver = q.recipient_name || q.who_receive || cp.name || del.receiver || null;
      setQuotationEdits(prev => ({
        ...prev,
        [q.id]: {
          shipping_fee: q.shipping_fee,
          subtotal: q.subtotal,
          total_amount: q.total_amount,
          notes: q.notes ?? null,
          shipping_way: q.shipping_way || del.method || null,
          discount_amount: q.discount_amount,
          email: q.email || cp.email || null,
          who_receive: nameOrReceiver,
          recipient_name: nameOrReceiver,
          shipping_address_text: q.shipping_address_text || del.address || null,
          expected_pickup_date: q.expected_pickup_date || del.special_date || del.self_pick_date || null,
          line_user_id: q.line_user_id ?? null,
          user_id: q.user_id ?? null,
        },
      }));
    }
  };

  const handleSaveQuotationEdits = async (quotationId: string): Promise<boolean> => {
    const edits = quotationEdits[quotationId];
    if (!edits) return false;
    setSavingQuotation(quotationId);
    try {
      const { error } = await supabase
        .from("quotation_orders")
        .update({
          shipping_fee: edits.shipping_fee,
          subtotal: edits.subtotal,
          total_amount: edits.total_amount,
          notes: edits.notes,
          shipping_way: edits.shipping_way,
          discount_amount: edits.discount_amount,
          email: edits.email,
          who_receive: edits.who_receive,
          recipient_name: edits.recipient_name,
          shipping_address_text: edits.shipping_address_text,
          expected_pickup_date: edits.expected_pickup_date,
          line_user_id: edits.line_user_id ?? null,
          user_id: (edits.user_id && String(edits.user_id).trim()) ? String(edits.user_id).trim() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", quotationId);
      if (error) throw error;
      toast({ title: "✅ 報價單已更新" });
      loadQuotations();
      return true;
    } catch (err: any) {
      toast({ title: "更新失敗", description: err.message, variant: "destructive" });
      return false;
    } finally {
      setSavingQuotation(null);
    }
  };

  const loadQuotations = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("quotation_orders")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "載入報價單失敗", description: error.message, variant: "destructive" });
    } else {
      setQuotations(data || []);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    loadQuotations();
  }, [loadQuotations]);

  const loadItems = async (quotationOrderId: string) => {
    if (items[quotationOrderId]) return;
    const { data, error } = await supabase
      .from("quotation_order_items")
      .select("*")
      .eq("quotation_order_id", quotationOrderId);

    if (error) {
      toast({ title: "載入品項失敗", description: error.message, variant: "destructive" });
    } else {
      setItems((prev) => ({ ...prev, [quotationOrderId]: data || [] }));

      // Initialize edit data
      const itemPrices: Record<string, number | null> = {};
      const itemPreviewUrls: Record<string, string> = {};
      const itemWhyPrices: Record<string, string> = {};
      (data || []).forEach((item) => {
        itemPrices[item.id] = item.unit_price;
        itemPreviewUrls[item.id] = item.preview_url || "";
        itemWhyPrices[item.id] = item.customizations_json?.why_price || "";
      });

      const quotation = quotations.find((q) => q.id === quotationOrderId);
      setEditData((prev) => ({
        ...prev,
        [quotationOrderId]: {
          itemPrices,
          itemPreviewUrls,
          itemWhyPrices,
          shippingFee: quotation?.shipping_fee ?? null,
          lineUserId: quotation?.line_user_id || "",
        },
      }));
    }
  };

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedOrders);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
      loadItems(id);
    }
    setExpandedOrders(newExpanded);
  };

  // Calculate subtotal from item prices
  const calcSubtotal = (quotationId: string) => {
    const qItems = items[quotationId] || [];
    const prices = editData[quotationId]?.itemPrices || {};
    return qItems.reduce((sum, item) => {
      const price = prices[item.id] ?? 0;
      return sum + price * (item.quantity || 0);
    }, 0);
  };

  const calcTotal = (quotationId: string) => {
    const subtotal = calcSubtotal(quotationId);
    const fee = editData[quotationId]?.shippingFee ?? 0;
    return subtotal + fee;
  };

  // Send quote action
  const handleSendQuote = async (quotation: QuotationOrder) => {
    const ed = editData[quotation.id];
    if (!ed) return;

    // Validate all items have prices
    const qItems = items[quotation.id] || [];
    const missingPrice = qItems.some((item) => !ed.itemPrices[item.id] && ed.itemPrices[item.id] !== 0);
    if (missingPrice) {
      toast({ title: "請填寫所有品項單價", variant: "destructive" });
      return;
    }

    setActionLoading(quotation.id);
    try {
      const itemsPayload = qItems.map((item) => ({
        id: item.id,
        unit_price: ed.itemPrices[item.id] || 0,
        preview_url: ed.itemPreviewUrls[item.id] || "",
        why_price: ed.itemWhyPrices?.[item.id] || "",
      }));

      const lineUserId = quotationEdits[quotation.id]?.line_user_id ?? ed.lineUserId ?? null;
      const { data, error } = await supabase.functions.invoke("process-quotation", {
        body: {
          action: "send_quote",
          quotation_order_id: quotation.id,
          items: itemsPayload,
          shipping_fee: ed.shippingFee || 0,
          line_user_id: lineUserId || null,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: "✅ 報價單已發送" });
      loadQuotations();
      // Clear expanded so it reloads items on next expand
      setItems((prev) => {
        const next = { ...prev };
        delete next[quotation.id];
        return next;
      });
    } catch (err: any) {
      toast({ title: "發送報價失敗", description: err.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  // Convert to order action
  const handleConvertToOrder = async (quotation: QuotationOrder) => {
    const pd = paymentData[quotation.id];
    if (!pd || !pd.paymentMethod) {
      toast({ title: "請填寫付款方式", variant: "destructive" });
      return;
    }

    const qe = quotationEdits[quotation.id];
    const userId = (qe?.user_id && String(qe.user_id).trim()) ? String(qe.user_id).trim() : quotation.user_id;
    const lineUserId = qe?.line_user_id ?? quotation.line_user_id;

    setActionLoading(quotation.id);
    try {
      const { data, error } = await supabase.functions.invoke("process-quotation", {
        body: {
          action: "convert_to_order",
          quotation_order_id: quotation.id,
          payment_method: pd.paymentMethod,
          payment_step: pd.paymentStep || "verified",
          order_status: pd.orderStatus || "processing",
          auto_cancel_exempt: pd.autoCancelExempt ?? false,
          transfer_last5: pd.transferLast5 || null,
          user_id: userId || null,
          line_user_id: lineUserId || null,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: `✅ 訂單已建立：${data?.order_id?.slice(0, 6).toUpperCase()}` });
      loadQuotations();
    } catch (err: any) {
      toast({ title: "轉換訂單失敗", description: err.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const getFilteredQuotations = () => {
    return quotations.filter((q) => q.status === activeTab);
  };

  const filtered = getFilteredQuotations();

  return (
    <div className="p-4 md:p-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>報價單管理</CardTitle>
              <CardDescription>管理客戶詢價、報價與訂單轉換</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                loadQuotations();
                setItems({});
                setExpandedOrders(new Set());
                setEditData({});
                setCustomShippingFee(new Set());
              }}
            >
              <RefreshCw className="h-4 w-4 mr-1" /> 重新整理
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="price_asked">
                詢價中 ({quotations.filter((q) => q.status === "price_asked").length})
              </TabsTrigger>
              <TabsTrigger value="price_reply">
                已報價 ({quotations.filter((q) => q.status === "price_reply").length})
              </TabsTrigger>
              <TabsTrigger value="order_created">
                已建立訂單 ({quotations.filter((q) => q.status === "order_created").length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="mt-6">
              {loading ? (
                <p className="text-center text-muted-foreground py-12">載入中...</p>
              ) : filtered.length === 0 ? (
                <p className="text-center text-muted-foreground py-12">目前沒有報價單</p>
              ) : (
                <div className="space-y-4">
                  {filtered.map((q) => {
                    const isExpanded = expandedOrders.has(q.id);
                    const qItems = items[q.id] || [];
                    const ed = editData[q.id];

                    return (
                      <Card key={q.id} className="border">
                        {/* Header */}
                        <div
                          className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                          onClick={() => toggleExpand(q.id)}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">#{q.id.slice(0, 6).toUpperCase()}</span>
                              <Badge variant={q.status === "price_asked" ? "outline" : q.status === "price_reply" ? "secondary" : "default"}>
                                {q.status === "price_asked" && "詢價中"}
                                {q.status === "price_reply" && "已報價"}
                                {q.status === "order_created" && "已建立訂單"}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {q.all_requirement?.customer_profile?.name || "未知客戶"} ·{" "}
                              {new Date(q.created_at).toLocaleDateString("zh-TW")}
                              {q.total_amount ? ` · NT$ ${q.total_amount.toLocaleString()}` : ""}
                            </p>
                          </div>
                          {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                        </div>

                        {/* Expanded Content */}
                        {isExpanded && (() => {
                          initQuotationEdits(q);
                          const qe = quotationEdits[q.id] || {};
                          const updateField = (field: string, value: any) =>
                            setQuotationEdits((prev) => ({ ...prev, [q.id]: { ...prev[q.id], [field]: value } }));

                          return (
                          <div className="px-4 pb-4 space-y-4">
                            <Separator />

                            {/* ========== 上半部：客戶與配送（僅顯示並可編輯，無服務/商品） ========== */}
                            <div className="space-y-3">
                              <p className="font-semibold">客戶與配送</p>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                  <Label className="text-sm">收件人／姓名</Label>
                                  <Input
                                    value={qe.recipient_name ?? qe.who_receive ?? ""}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      updateField("recipient_name", v);
                                      updateField("who_receive", v);
                                    }}
                                    placeholder="收件人姓名"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-sm">聯絡信箱</Label>
                                  <Input
                                    type="email"
                                    value={qe.email ?? ""}
                                    onChange={(e) => updateField("email", e.target.value)}
                                    placeholder="email@example.com"
                                  />
                                </div>
                                {q.all_requirement?.delivery?.phone != null && String(q.all_requirement.delivery.phone).trim() !== "" && (
                                  <div className="space-y-1 col-span-2">
                                    <Label className="text-sm">電話（來自詢價，唯讀）</Label>
                                    <p className="text-sm text-muted-foreground py-2">{renderValue(q.all_requirement.delivery.phone)}</p>
                                  </div>
                                )}
                                <div className="space-y-1">
                                  <Label className="text-sm">配送方式</Label>
                                  <Input
                                    value={qe.shipping_way ?? ""}
                                    onChange={(e) => updateField("shipping_way", e.target.value)}
                                    placeholder="pickup / blackcat / special"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-sm">預計取件日</Label>
                                  <Input
                                    type="date"
                                    value={qe.expected_pickup_date ?? ""}
                                    onChange={(e) => updateField("expected_pickup_date", e.target.value)}
                                  />
                                </div>
                                <div className="space-y-1 col-span-2">
                                  <Label className="text-sm">配送地址</Label>
                                  <Input
                                    value={qe.shipping_address_text ?? ""}
                                    onChange={(e) => updateField("shipping_address_text", e.target.value)}
                                    placeholder="配送地址"
                                  />
                                </div>
                                <div className="space-y-1 col-span-2">
                                  <Label className="text-sm">備註</Label>
                                  <Input
                                    value={qe.notes ?? ""}
                                    onChange={(e) => updateField("notes", e.target.value)}
                                    placeholder="備註"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-sm">User ID（選填，轉訂單時用）</Label>
                                  <Input
                                    value={qe.user_id ?? ""}
                                    onChange={(e) => updateField("user_id", e.target.value)}
                                    placeholder="auth.users 的 UUID"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-sm">LINE User ID（選填）</Label>
                                  <Input
                                    value={qe.line_user_id ?? ""}
                                    onChange={(e) => updateField("line_user_id", e.target.value)}
                                    placeholder="Uxxxxxxx..."
                                  />
                                </div>
                              </div>
                              {activeTab !== "price_asked" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleSaveQuotationEdits(q.id)}
                                  disabled={savingQuotation === q.id}
                                >
                                  {savingQuotation === q.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                  儲存客戶與配送
                                </Button>
                              )}
                            </div>

                            <StyleReferenceLinksBlock
                              label="🎨 用戶風格參考圖連結（甜點佈置／禮盒等服務區）"
                              urls={getOrderServiceStyleReferenceUrls(q.all_requirement)}
                            />

                            <Separator />

                            {/* ========== 下半部：報價填寫（品項細節僅此區，無重複服務內容/客製化品項明細） ========== */}
                            <div className="space-y-4">
                            {/* ========== Price Asked: Admin fills prices ========== */}
                            {activeTab === "price_asked" && (
                              <div className="space-y-4">
                                <p className="font-semibold">💰 報價填寫</p>

                                {/* Item editors */}
                                {qItems.map((item) => (
                                  <ItemEditor
                                    key={item.id}
                                    item={item}
                                    unitPrice={ed?.itemPrices[item.id] ?? null}
                                    previewUrl={ed?.itemPreviewUrls[item.id] ?? ""}
                                    whyPrice={ed?.itemWhyPrices?.[item.id] ?? ""}
                                    onUnitPriceChange={(val) =>
                                      setEditData((prev) => ({
                                        ...prev,
                                        [q.id]: {
                                          ...prev[q.id],
                                          itemPrices: { ...prev[q.id]?.itemPrices, [item.id]: val },
                                        },
                                      }))
                                    }
                                    onPreviewUrlChange={(val) =>
                                      setEditData((prev) => ({
                                        ...prev,
                                        [q.id]: {
                                          ...prev[q.id],
                                          itemPreviewUrls: { ...prev[q.id]?.itemPreviewUrls, [item.id]: val },
                                        },
                                      }))
                                    }
                                    onWhyPriceChange={(val) =>
                                      setEditData((prev) => ({
                                        ...prev,
                                        [q.id]: {
                                          ...prev[q.id],
                                          itemWhyPrices: { ...prev[q.id]?.itemWhyPrices, [item.id]: val },
                                        },
                                      }))
                                    }
                                  />
                                ))}

                                {/* Order-level fields（LINE 僅在上半部客戶與配送編輯） */}
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <Label>運費</Label>
                                    <div className="flex gap-2 items-center">
                                      <select
                                        className="border rounded-md px-3 py-2 text-sm bg-background"
                                        value={
                                          customShippingFee.has(q.id) ? "custom" :
                                          ed?.shippingFee === 0 ? "0" :
                                          ed?.shippingFee === 240 ? "240" :
                                          ed?.shippingFee === 650 ? "650" :
                                          (ed?.shippingFee !== null && ed?.shippingFee !== undefined) ? "custom" : ""
                                        }
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          if (val === "custom") {
                                            setCustomShippingFee(prev => new Set(prev).add(q.id));
                                            if (ed?.shippingFee === null || ed?.shippingFee === undefined) {
                                              setEditData(prev => ({
                                                ...prev,
                                                [q.id]: { ...prev[q.id], shippingFee: 0 },
                                              }));
                                            }
                                          } else {
                                            setCustomShippingFee(prev => {
                                              const next = new Set(prev);
                                              next.delete(q.id);
                                              return next;
                                            });
                                            setEditData(prev => ({
                                              ...prev,
                                              [q.id]: { ...prev[q.id], shippingFee: val ? Number(val) : null },
                                            }));
                                          }
                                        }}
                                      >
                                        <option value="">請選擇</option>
                                        <option value="0">0（免運）</option>
                                        <option value="240">240</option>
                                        <option value="650">650</option>
                                        <option value="custom">自訂</option>
                                      </select>
                                      {(customShippingFee.has(q.id) || (ed?.shippingFee !== null && ed?.shippingFee !== undefined && ed?.shippingFee !== 0 && ed?.shippingFee !== 240 && ed?.shippingFee !== 650)) && (
                                        <Input
                                          type="number"
                                          min={0}
                                          placeholder="自訂運費"
                                          value={ed?.shippingFee ?? ""}
                                          onChange={(e) =>
                                            setEditData(prev => ({
                                              ...prev,
                                              [q.id]: { ...prev[q.id], shippingFee: e.target.value ? Number(e.target.value) : null },
                                            }))
                                          }
                                          className="w-32"
                                        />
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Totals */}
                                <div className="bg-muted/30 p-4 rounded-lg space-y-1 text-sm">
                                  <div className="flex justify-between">
                                    <span>小計</span>
                                    <span className="font-medium">NT$ {calcSubtotal(q.id).toLocaleString()}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>運費</span>
                                    <span className="font-medium">NT$ {(ed?.shippingFee ?? 0).toLocaleString()}</span>
                                  </div>
                                  <Separator className="my-1" />
                                  <div className="flex justify-between text-base font-semibold">
                                    <span>總計</span>
                                    <span className="text-primary">NT$ {calcTotal(q.id).toLocaleString()}</span>
                                  </div>
                                </div>

                                <div className="flex gap-2">
                                  <Button
                                    className="flex-1"
                                    onClick={async () => {
                                      const saved = await handleSaveQuotationEdits(q.id);
                                      if (!saved) return;
                                      handleSendQuote(q);
                                    }}
                                    disabled={actionLoading === q.id || savingQuotation === q.id}
                                  >
                                    {actionLoading === q.id || savingQuotation === q.id ? (
                                      <>
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        處理中...
                                      </>
                                    ) : (
                                      "儲存資料並發送報價單"
                                    )}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    onClick={async () => {
                                      setActionLoading(q.id);
                                      try {
                                        const { error } = await supabase
                                          .from("quotation_orders")
                                          .update({ status: "price_reply", updated_at: new Date().toISOString() })
                                          .eq("id", q.id);
                                        if (error) throw error;
                                        toast({ title: "✅ 已跳過報價，直接進入已報價階段" });
                                        loadQuotations();
                                        setItems(prev => { const next = { ...prev }; delete next[q.id]; return next; });
                                      } catch (err: any) {
                                        toast({ title: "操作失敗", description: err.message, variant: "destructive" });
                                      } finally {
                                        setActionLoading(null);
                                      }
                                    }}
                                    disabled={actionLoading === q.id}
                                  >
                                    跳過報價
                                  </Button>
                                </div>
                              </div>
                            )}

                            {/* ========== Price Reply: Payment info + editable 報價欄位（客戶/配送僅在上半部編輯） ========== */}
                            {activeTab === "price_reply" && (
                              <div className="space-y-4">
                                <p className="font-semibold">💳 付款確認 & 報價欄位修改</p>

                                {/* Show quoted items */}
                                {qItems.map((item) => (
                                  <div key={item.id} className="p-3 border rounded-lg bg-background space-y-2">
                                    <div className="flex justify-between items-center gap-3">
                                      <div>
                                        <p className="font-medium">{item.product_name}</p>
                                        <p className="text-sm text-muted-foreground">
                                          單價 NT$ {item.unit_price?.toLocaleString() ?? 0}
                                        </p>
                                        <p className="text-sm text-muted-foreground">數量 × {item.quantity}</p>
                                      </div>
                                      <div className="text-sm font-medium shrink-0">
                                        NT$ {((item.unit_price || 0) * (item.quantity || 0)).toLocaleString()}
                                      </div>
                                    </div>
                                    <StyleReferenceLinksBlock label="🎨 用戶風格參考圖連結" urls={getItemStyleReferenceUrls(item)} />
                                  </div>
                                ))}

                                {/* Editable 報價欄位（小計／運費／折扣／總金額／發票） */}
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-1">
                                    <Label className="text-sm">小計</Label>
                                    <Input type="number" value={qe.subtotal ?? ""} onChange={e => updateField("subtotal", e.target.value ? Number(e.target.value) : null)} />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-sm">運費</Label>
                                    <Input type="number" value={qe.shipping_fee ?? ""} onChange={e => updateField("shipping_fee", e.target.value ? Number(e.target.value) : null)} />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-sm">折扣金額</Label>
                                    <Input type="number" value={qe.discount_amount ?? ""} onChange={e => updateField("discount_amount", e.target.value ? Number(e.target.value) : null)} />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-sm">總金額</Label>
                                    <Input type="number" value={qe.total_amount ?? ""} onChange={e => updateField("total_amount", e.target.value ? Number(e.target.value) : null)} />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-sm">發票抬頭</Label>
                                    <Input value={qe.tax_title ?? ""} onChange={e => updateField("tax_title", e.target.value)} placeholder="OO科技股份有限公司" />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-sm">統一編號</Label>
                                    <Input value={qe.tax_id ?? ""} onChange={e => updateField("tax_id", e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="12345678" maxLength={8} />
                                  </div>
                                </div>

                                <Button
                                  variant="outline"
                                  className="w-full"
                                  onClick={() => handleSaveQuotationEdits(q.id)}
                                  disabled={savingQuotation === q.id}
                                >
                                  {savingQuotation === q.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                  儲存修改
                                </Button>

                                <Separator />

                                {/* Payment fields */}
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <Label>付款方式</Label>
                                    <select
                                      className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                                      value={paymentData[q.id]?.paymentMethod || ""}
                                      onChange={(e) =>
                                        setPaymentData((prev) => ({
                                          ...prev,
                                          [q.id]: { ...prev[q.id], paymentMethod: e.target.value },
                                        }))
                                      }
                                    >
                                      <option value="">請選擇</option>
                                      <option value="cash">現金</option>
                                      <option value="transfer">轉帳匯款</option>
                                    </select>
                                  </div>
                                  <div className="space-y-2">
                                    <Label>匯款末五碼</Label>
                                    <Input
                                      placeholder="輸入末五碼"
                                      maxLength={5}
                                      value={paymentData[q.id]?.transferLast5 || ""}
                                      onChange={(e) =>
                                        setPaymentData((prev) => ({
                                          ...prev,
                                          [q.id]: { ...prev[q.id], transferLast5: e.target.value },
                                        }))
                                      }
                                    />
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <Label>轉單後狀態</Label>
                                    <select
                                      className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                                      value={paymentData[q.id]?.orderStatus || "processing"}
                                      onChange={(e) =>
                                        setPaymentData((prev) => ({
                                          ...prev,
                                          [q.id]: { ...prev[q.id], orderStatus: e.target.value },
                                        }))
                                      }
                                    >
                                      <option value="awaiting_payment">等待付款</option>
                                      <option value="processing">處理中</option>
                                      <option value="shipped">已出貨</option>
                                      <option value="delivered">已完成</option>
                                    </select>
                                  </div>
                                  <div className="space-y-2">
                                    <Label>24 小時未付款限制</Label>
                                    <label className="flex items-center gap-2 text-sm">
                                      <input
                                        type="checkbox"
                                        checked={paymentData[q.id]?.autoCancelExempt ?? true}
                                        onChange={(e) =>
                                          setPaymentData((prev) => ({
                                            ...prev,
                                            [q.id]: { ...prev[q.id], autoCancelExempt: e.target.checked },
                                          }))
                                        }
                                      />
                                      不受 24 小時自動取消影響
                                    </label>
                                  </div>
                                </div>

                                <Button
                                  className="w-full"
                                  onClick={() => handleConvertToOrder(q)}
                                  disabled={actionLoading === q.id}
                                >
                                  {actionLoading === q.id ? (
                                    <>
                                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                      處理中...
                                    </>
                                  ) : (
                                    "將報價單排入製作"
                                  )}
                                </Button>
                              </div>
                            )}

                            {/* ========== Order Created: 報價欄位（客戶/配送僅在上半部編輯） ========== */}
                            {activeTab === "order_created" && (
                              <div className="space-y-4">
                                {/* Editable 報價欄位 */}
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-1">
                                    <Label className="text-sm">小計</Label>
                                    <Input type="number" value={qe.subtotal ?? ""} onChange={e => updateField("subtotal", e.target.value ? Number(e.target.value) : null)} />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-sm">運費</Label>
                                    <Input type="number" value={qe.shipping_fee ?? ""} onChange={e => updateField("shipping_fee", e.target.value ? Number(e.target.value) : null)} />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-sm">折扣金額</Label>
                                    <Input type="number" value={qe.discount_amount ?? ""} onChange={e => updateField("discount_amount", e.target.value ? Number(e.target.value) : null)} />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-sm">總金額</Label>
                                    <Input type="number" value={qe.total_amount ?? ""} onChange={e => updateField("total_amount", e.target.value ? Number(e.target.value) : null)} />
                                  </div>
                                </div>

                                <Button
                                  variant="outline"
                                  className="w-full"
                                  onClick={() => handleSaveQuotationEdits(q.id)}
                                  disabled={savingQuotation === q.id}
                                >
                                  {savingQuotation === q.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                  儲存修改
                                </Button>

                                <Separator />

                                <div className="text-sm text-muted-foreground">
                                  付款方式：{q.payment_method || "—"} ·
                                  匯款末五碼：{q.transfer_last5 || "—"} ·
                                  狀態：{q.payment_step || "—"}
                                </div>

                                {/* Show items */}
                                {qItems.map((item) => (
                                  <div key={item.id} className="p-3 border rounded-lg bg-background space-y-2">
                                    <div className="flex gap-3">
                                      {item.preview_url && (
                                        <img src={item.preview_url} alt={item.product_name || ""} className="w-16 h-16 rounded object-cover shrink-0" />
                                      )}
                                      <div className="min-w-0 flex-1">
                                        <p className="font-medium">{item.product_name}</p>
                                        <p className="text-sm text-muted-foreground">
                                          單價 NT$ {item.unit_price?.toLocaleString() ?? 0}
                                        </p>
                                        <p className="text-sm text-muted-foreground">數量 × {item.quantity}</p>
                                        <p className="text-sm text-muted-foreground">
                                          小計 NT${" "}
                                          {((item.unit_price || 0) * (item.quantity || 0)).toLocaleString()}
                                        </p>
                                      </div>
                                    </div>
                                    <StyleReferenceLinksBlock label="🎨 用戶風格參考圖連結" urls={getItemStyleReferenceUrls(item)} />
                                  </div>
                                ))}
                              </div>
                            )}
                            </div>
                          </div>
                          );
                        })()}
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminQuotationsPanel;
