import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { prepareImageForUpload } from "@/lib/prepare-upload-image-client";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, ChevronUp, Upload, ExternalLink, Loader2, RefreshCw, Plus, ChevronsUpDown, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { getEdgeFunctionErrorDetail } from "@/lib/edge-function-error";
import { buildQuotationPdfHtml, type QuotationPdfWebhookPayload } from "@/lib/quotation-pdf-html";
import {
  getSpecialConvertedOrderCount,
  getSpecialQuotationRoot,
  isSpecialQuotation,
  parseComboIdFromQuotationItem,
} from "@/lib/special-quotation";
import { SafeImage } from "@/components/SafeImage";
import { SpecialQuotationDialog } from "@/components/admin/SpecialQuotationDialog";
import { QuotationAiDraftDialog } from "@/components/admin/QuotationAiDraftDialog";

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
  is_hide?: boolean | null;
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

type QuotationEditsState = Partial<QuotationOrder> & { tax_title?: string; tax_id?: string };

function parseAllRequirement(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      const o = JSON.parse(raw) as unknown;
      if (o && typeof o === "object" && !Array.isArray(o)) return o as Record<string, unknown>;
    } catch {
      /* ignore */
    }
  }
  return null;
}

const ITEM_AR_TEXT_EXCLUDE = new Set(["customization", "note", "reference_images"]);

/** 將 all_requirement 物件（排除已知鍵）轉成多行文字 */
function formatAllRequirementFieldsAsText(
  obj: Record<string, unknown> | null,
  excludeKeys: Set<string> = ITEM_AR_TEXT_EXCLUDE,
): string {
  if (!obj) return "";
  return Object.entries(obj)
    .filter(
      ([k, v]) =>
        !excludeKeys.has(k) &&
        v !== null &&
        v !== undefined &&
        v !== "" &&
        !(Array.isArray(v) && v.length === 0),
    )
    .map(([k, v]) => `${translateKey(k)}：${renderValue(v)}`)
    .join("\n");
}

/** 品項編輯器「客製化需求」：僅來自 quotation_order_items.all_requirement */
function getDefaultItemCustomization(item: QuotationOrderItem): string {
  const itemAr = parseAllRequirement(item.all_requirement);
  if (!itemAr) return "";
  const cust = itemAr.customization;
  if (typeof cust === "string" && cust.trim()) return cust.trim();
  return formatAllRequirementFieldsAsText(itemAr);
}

function getDefaultItemNote(item: QuotationOrderItem): string {
  const itemAr = parseAllRequirement(item.all_requirement);
  const note = itemAr?.note;
  return typeof note === "string" ? note : "";
}

function buildQuotationEditsFromOrder(q: QuotationOrder): QuotationEditsState {
  const ar = parseAllRequirement(q.all_requirement) || {};
  const cp = (ar.customer_profile as Record<string, unknown> | undefined) || {};
  const del = (ar.delivery as Record<string, unknown> | undefined) || {};
  const nameOrReceiver =
    q.recipient_name ||
    q.who_receive ||
    (typeof cp.name === "string" ? cp.name : null) ||
    (typeof del.receiver === "string" ? del.receiver : null) ||
    null;
  return {
    shipping_fee: q.shipping_fee,
    subtotal: q.subtotal,
    total_amount: q.total_amount,
    notes: q.notes ?? null,
    shipping_way:
      q.shipping_way ||
      (typeof del.method === "string" ? del.method : null) ||
      null,
    discount_amount: q.discount_amount,
    email: q.email || (typeof cp.email === "string" ? cp.email : null) || null,
    who_receive: nameOrReceiver,
    recipient_name: nameOrReceiver,
    shipping_address_text:
      q.shipping_address_text ||
      (typeof del.address === "string" ? del.address : null) ||
      null,
    expected_pickup_date:
      q.expected_pickup_date ||
      (typeof del.special_date === "string" ? del.special_date : null) ||
      (typeof del.self_pick_date === "string" ? del.self_pick_date : null) ||
      null,
    line_user_id: q.line_user_id ?? null,
    user_id: q.user_id ?? null,
  };
}

/** 訂單組合唯讀區與畫面上方編輯同步（未儲存前預覽）。Supabase 可能回傳 object 或 JSON 字串；合併時必須保留 combo_id 等欄位 */
function customizationJsonRecord(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return { ...(raw as Record<string, unknown>) };
  if (typeof raw === "string") {
    try {
      const o = JSON.parse(raw) as unknown;
      if (o && typeof o === "object" && !Array.isArray(o)) return { ...(o as Record<string, unknown>) };
    } catch {
      /* ignore */
    }
  }
  return {};
}

function mergeQuotationItemsWithEditData(
  qItems: QuotationOrderItem[],
  ed:
    | {
        itemProductNames?: Record<string, string>;
        itemQuantities?: Record<string, number>;
        itemCustomizations?: Record<string, string>;
        itemNotes?: Record<string, string>;
      }
    | undefined,
): QuotationOrderItem[] {
  if (!ed) return qItems;
  return qItems.map((it) => {
    const base =
      it.all_requirement && typeof it.all_requirement === "object" && !Array.isArray(it.all_requirement)
        ? { ...it.all_requirement }
        : {};
    const cust = ed.itemCustomizations?.[it.id];
    if (cust !== undefined) {
      if (cust.trim()) base.customization = cust;
      else delete base.customization;
    }
    const note = ed.itemNotes?.[it.id];
    if (note !== undefined) {
      if (note.trim()) base.note = note;
      else delete base.note;
    }
    return {
      ...it,
      product_name: ed.itemProductNames?.[it.id] ?? it.product_name,
      quantity: ed.itemQuantities?.[it.id] ?? it.quantity,
      all_requirement: base,
    };
  });
}

/** 與手動建立訂單相同來源：products 表 */
interface NewQuotationProductRow {
  id: string;
  name: string;
  category: string;
  price: number;
}

interface ProductNoticeRow {
  product_id: string;
  min_order_qty: number | null;
  price_min: number | null;
}

type NewQuotationDraftItem = {
  id: string;
  productName: string;
  productId: string;
  customization: string;
  quantity: number;
};

function newDraftQuotationItem(): NewQuotationDraftItem {
  return {
    id: crypto.randomUUID(),
    productName: "",
    productId: "",
    customization: "",
    quantity: 1,
  };
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

/** 轉訂單時寫入 orders.payment_step（與訂單後台一致） */
const QUOTATION_PAYMENT_STEP_OPTIONS: { value: string; label: string }[] = [
  { value: "pending", label: "未匯款" },
  { value: "submitted", label: "待核對（客戶已填匯款）" },
  { value: "verified", label: "已確認入帳" },
];

function paymentStepLabel(step: string | null | undefined): string {
  if (step == null || String(step).trim() === "") return "—";
  const o = QUOTATION_PAYMENT_STEP_OPTIONS.find((x) => x.value === step);
  return o?.label ?? String(step);
}

/** 表頭／輸入框是否在畫面上視為空白（特殊報價單可藉此略過不渲染） */
function isEmptyDisplayValue(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

/** 數字欄位是否視為有資料（含 0；null／undefined／"" 為無） */
function hasNumericDisplayValue(v: unknown): boolean {
  if (v === null || v === undefined || v === "") return false;
  return true;
}

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
  const req = parseAllRequirement(item.all_requirement);
  const fromReq = collectImageUrlsFromField(req?.reference_images);
  const cust = item.customizations_json;
  const fromCust =
    cust && typeof cust === "object" && !Array.isArray(cust)
      ? collectImageUrlsFromField((cust as Record<string, unknown>).reference_images)
      : [];
  return [...new Set([...fromReq, ...fromCust])];
}

/** 全單 service_order（甜點佈置 candyBar、禮盒 GiftBox）內上傳的參考圖／檔連結 */
function getOrderServiceStyleReferenceUrls(allReqRaw: unknown): string[] {
  const allReq = parseAllRequirement(allReqRaw);
  const so = allReq?.service_order;
  if (!so || typeof so !== "object") return [];
  const soRec = so as Record<string, unknown>;
  const keys = ["reference_images", "reference_files", "style_reference_images"] as const;
  const urls: string[] = [];
  for (const block of [soRec.candyBar, soRec.GiftBox]) {
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

// ========== Image Upload ==========
const handleQuotationImageUpload = async (file: File): Promise<string> => {
  if (!file.type.startsWith("image/")) throw new Error("只能上傳圖片");
  if (file.size > 20 * 1024 * 1024) throw new Error("圖片原檔不超過 20MB");

  const webpFile = await prepareImageForUpload(file);
  if (webpFile.size > 2 * 1024 * 1024) throw new Error("壓縮後圖片仍超過 2MB");
  const fileName = `quotation/quote_${Date.now()}_${Math.random().toString(36).substring(7)}.webp`;

  const { error } = await supabase.storage
    .from("custom_asset")
    .upload(fileName, webpFile, { cacheControl: "604800", upsert: false, contentType: "image/webp" });

  if (error) throw error;

  const { data: urlData } = supabase.storage.from("custom_asset").getPublicUrl(fileName);
  return urlData.publicUrl;
};

function formatSpecialComboMoney(n: unknown): string {
  if (n === null || n === undefined) return "待補";
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return "待補";
  return x.toLocaleString();
}

/** 一、二、三…（1-based，供列表標題） */
function comboOrdinalChinese(index1Based: number): string {
  const table: Record<number, string> = {
    1: "一", 2: "二", 3: "三", 4: "四", 5: "五", 6: "六", 7: "七", 8: "八", 9: "九", 10: "十",
    11: "十一", 12: "十二", 13: "十三", 14: "十四", 15: "十五", 16: "十六", 17: "十七", 18: "十八", 19: "十九", 20: "二十",
    21: "二十一", 22: "二十二", 23: "二十三", 24: "二十四", 25: "二十五", 26: "二十六", 27: "二十七", 28: "二十八", 29: "二十九", 30: "三十",
  };
  return table[index1Based] ?? String(index1Based);
}

/** 特殊報價：依 `all_requirement.special_quotation.combos` 顯示訂單組合與底下品項（唯讀摘要） */
function SpecialQuotationCombosReadonlyBlock({
  allRequirement,
  items,
  context,
}: {
  allRequirement: unknown;
  items: QuotationOrderItem[];
  context: "price_asked" | "price_reply" | "order_created";
}) {
  if (!isSpecialQuotation(allRequirement)) return null;
  const notice =
    context === "price_asked"
      ? "特殊報價單 · 訂單組合摘要（詢價中）：轉訂單時將依「訂單組合」拆成多筆訂單。請於下方填寫各品項單價與運費後再發送報價。"
      : context === "order_created"
        ? "特殊報價單 · 訂單組合摘要（已建立訂單）：可依下方編輯品項內容後按「儲存品項與報價表頭」寫入資料庫。"
        : "特殊報價單：轉訂單時將依「訂單組合」拆成多筆訂單；表頭小計／運費／總額為全單摘要。";
  return (
    <div className="space-y-3">
      <p className="text-sm rounded-md border border-amber-200 bg-amber-50 text-amber-950 px-3 py-2">{notice}</p>
      {(getSpecialQuotationRoot(allRequirement)?.combos || []).map((combo, comboIdx) => {
        const ordinal = comboOrdinalChinese(comboIdx + 1);
        const comboItems = items.filter(
          (it) => parseComboIdFromQuotationItem(it.customizations_json) === combo.id,
        );
        return (
          <div key={combo.id} className="p-3 border rounded-lg bg-background space-y-2">
            <p className="text-sm font-medium">
              訂單組合{ordinal} · 取件 {combo.expected_pickup_date || "—"} · {combo.pickup_location || "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              取件人：{combo.pickup_contact_name || "—"}（{combo.pickup_contact_phone || "—"}）· 小計 NT${" "}
              {formatSpecialComboMoney(combo.line_subtotal)}
              {" · "}
              運費 NT$ {formatSpecialComboMoney(combo.shipping_fee)}
              {" · "}
              合計 NT$ {formatSpecialComboMoney(combo.line_total)}
            </p>
            {comboItems.length === 0 ? (
              <p className="text-xs text-amber-800 border-t pt-2">此組合尚無對應品項列（請檢查品項的 combo_id）。</p>
            ) : (
              comboItems.map((item) => (
                <div key={item.id} className="flex justify-between gap-2 text-sm border-t pt-2 first:border-t-0 first:pt-0">
                  <span>{item.product_name}</span>
                  <span className="text-muted-foreground shrink-0">
                    {item.unit_price == null ? "單價待補" : `NT$ ${(item.unit_price ?? 0).toLocaleString()}`} ×{" "}
                    {item.quantity}
                  </span>
                </div>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}

// ========== Item Card for Price Asked ==========
interface ItemEditorProps {
  item: QuotationOrderItem;
  productName: string;
  quantity: number;
  customization: string;
  note: string;
  unitPrice: number | null;
  previewUrl: string;
  whyPrice: string;
  onProductNameChange: (val: string) => void;
  onQuantityChange: (val: number) => void;
  onCustomizationChange: (val: string) => void;
  onNoteChange: (val: string) => void;
  onUnitPriceChange: (val: number | null) => void;
  onPreviewUrlChange: (val: string) => void;
  onWhyPriceChange: (val: string) => void;
}

const ItemEditor = ({
  item,
  productName,
  quantity,
  customization,
  note,
  unitPrice,
  previewUrl,
  whyPrice,
  onProductNameChange,
  onQuantityChange,
  onCustomizationChange,
  onNoteChange,
  onUnitPriceChange,
  onPreviewUrlChange,
  onWhyPriceChange,
}: ItemEditorProps) => {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** 數量用字串控制，避免 type=number 在輸入過程被 Math.floor 強制成 1 造成跳字 */
  const [qtyDraft, setQtyDraft] = useState(String(quantity));
  useEffect(() => {
    setQtyDraft(String(quantity));
  }, [quantity]);

  const lineTotal = unitPrice && quantity ? unitPrice * quantity : 0;

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
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="space-y-1">
            <Label className="text-sm">品項名稱</Label>
            <Input
              value={productName}
              onChange={(e) => onProductNameChange(e.target.value)}
              placeholder="待補充"
              className="font-medium"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-sm">數量</Label>
            <Input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={qtyDraft}
              onChange={(e) => {
                const raw = e.target.value.replace(/\D/g, "");
                setQtyDraft(raw);
                if (raw !== "") {
                  const n = parseInt(raw, 10);
                  if (!Number.isNaN(n) && n >= 1) onQuantityChange(n);
                }
              }}
              onBlur={() => {
                const n = Math.max(1, parseInt(qtyDraft, 10) || 1);
                const s = String(n);
                setQtyDraft(s);
                onQuantityChange(n);
              }}
              className="w-28"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-sm">客製化需求</Label>
            <Textarea
              value={customization}
              onChange={(e) => onCustomizationChange(e.target.value)}
              placeholder="選填"
              rows={2}
              className="resize-y min-h-[2.5rem] text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-sm">備註</Label>
            <Textarea
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder="選填"
              rows={2}
              className="resize-y min-h-[2.5rem] text-sm"
            />
          </div>
        </div>
        <Badge variant="outline" className="shrink-0">
          {item.category}
        </Badge>
      </div>

      <StyleReferenceLinksBlock label="🎨 用戶風格參考圖連結" urls={getItemStyleReferenceUrls(item)} />

      {/* 單價（顯示在數量說明之後、與下欄編輯一致：單價在上） */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 flex-1">
          <Label className="whitespace-nowrap text-sm">單價：</Label>
          <Input
            type="text"
            inputMode="decimal"
            placeholder="填入單價"
            value={unitPrice === null || unitPrice === undefined ? "" : String(unitPrice)}
            onChange={(e) => {
              const t = e.target.value.trim();
              if (t === "") {
                onUnitPriceChange(null);
                return;
              }
              const n = Number(t);
              if (!Number.isNaN(n) && n >= 0) onUnitPriceChange(n);
            }}
            onBlur={(e) => {
              const t = e.target.value.trim();
              if (t === "") {
                onUnitPriceChange(null);
                return;
              }
              const n = Number(t);
              if (!Number.isNaN(n) && n >= 0) onUnitPriceChange(n);
            }}
            className="w-32"
          />
          <span className="text-sm text-muted-foreground">元</span>
        </div>
        <div className="text-sm font-medium">
          小計：NT$ {lineTotal.toLocaleString()}
        </div>
      </div>

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
            <SafeImage src={previewUrl} alt="preview" width={64} height={64} className="h-16 w-16 rounded object-cover" sizes="64px" />
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
        itemProductNames: Record<string, string>;
        itemQuantities: Record<string, number>;
        itemCustomizations: Record<string, string>;
        itemNotes: Record<string, string>;
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
  /** 勾選後列表一併顯示已隱藏報價單 */
  const [showHiddenQuotations, setShowHiddenQuotations] = useState(false);

  // Editable quotation fields for price_reply / order_created
  const [quotationEdits, setQuotationEdits] = useState<Record<string, QuotationEditsState>>({});
  const [savingQuotation, setSavingQuotation] = useState<string | null>(null);

  const defaultNewQuotationForm = () => ({
    customerName: "",
    email: "",
    phone: "",
    whoReceive: "",
    lineUserId: "",
    userId: "",
    shippingWay: "",
    shippingAddress: "",
    expectedPickupDate: "",
    serviceType: "custom_design" as "custom_design" | "giftbox" | "candy_bar",
    inquiryNotes: "",
  });

  const [newQuotationOpen, setNewQuotationOpen] = useState(false);
  const [newQuotationStep, setNewQuotationStep] = useState(1);
  const [newQuotationSubmitting, setNewQuotationSubmitting] = useState(false);
  const [newQForm, setNewQForm] = useState(() => defaultNewQuotationForm());
  const [newQuoteDraftItems, setNewQuoteDraftItems] = useState<NewQuotationDraftItem[]>(() => [
    newDraftQuotationItem(),
  ]);
  const [newQuoteDraftItemPopoverOpen, setNewQuoteDraftItemPopoverOpen] = useState<Record<string, boolean>>({});
  const [newQuoteDraftItemProductSearch, setNewQuoteDraftItemProductSearch] = useState<Record<string, string>>({});

  const [newQuoteProducts, setNewQuoteProducts] = useState<NewQuotationProductRow[]>([]);
  const [newQuoteProductsByCategory, setNewQuoteProductsByCategory] = useState<Record<string, NewQuotationProductRow[]>>({});
  const [newQuoteProductNotices, setNewQuoteProductNotices] = useState<Record<string, ProductNoticeRow>>({});
  const [addingQuotationItemId, setAddingQuotationItemId] = useState<string | null>(null);
  const [specialQuotationOpen, setSpecialQuotationOpen] = useState(false);
  const [quotationAiDraftOpen, setQuotationAiDraftOpen] = useState(false);

  const initQuotationEdits = (q: QuotationOrder) => {
    if (!quotationEdits[q.id]) {
      setQuotationEdits((prev) => ({
        ...prev,
        [q.id]: buildQuotationEditsFromOrder(q),
      }));
    }
  };

  const handleSaveQuotationEdits = async (quotationId: string): Promise<boolean> => {
    const q = quotations.find((x) => x.id === quotationId);
    if (!q) {
      toast({ title: "找不到報價單", variant: "destructive" });
      return false;
    }
    const edits = quotationEdits[quotationId] ?? buildQuotationEditsFromOrder(q);

    setSavingQuotation(quotationId);
    try {
      const rowEd = editData[quotationId];
      const qItemsLocal = items[quotationId];
      const shippingFeeForOrder =
        rowEd != null && rowEd.shippingFee !== null && rowEd.shippingFee !== undefined
          ? rowEd.shippingFee
          : edits.shipping_fee;
      const recalculatedSubtotal = qItemsLocal?.length ? calcSubtotal(quotationId) : edits.subtotal;
      const recalculatedTotal =
        qItemsLocal?.length
          ? (Number(recalculatedSubtotal) || 0) + (Number(shippingFeeForOrder) || 0)
          : edits.total_amount;

      if (rowEd && qItemsLocal?.length) {
        for (const item of qItemsLocal) {
          const productNameRaw = (rowEd.itemProductNames?.[item.id] ?? item.product_name ?? "").trim();
          const productName = productNameRaw || "待補充";
          const qty = Math.max(1, Math.floor(Number(rowEd.itemQuantities?.[item.id] ?? item.quantity ?? 1)) || 1);

          const baseReq = { ...(parseAllRequirement(item.all_requirement) || {}) };
          const custStr = (rowEd.itemCustomizations?.[item.id] ?? "").trim();
          const noteStr = (rowEd.itemNotes?.[item.id] ?? "").trim();
          if (custStr) baseReq.customization = custStr;
          else delete baseReq.customization;
          if (noteStr) baseReq.note = noteStr;
          else delete baseReq.note;

          const cj = customizationJsonRecord(item.customizations_json);
          const wp = (rowEd.itemWhyPrices?.[item.id] ?? "").trim();
          if (wp) cj.why_price = wp;
          else delete cj.why_price;

          const previewRaw = rowEd.itemPreviewUrls?.[item.id] ?? "";
          const preview = previewRaw.trim() || null;

          const priceVal = rowEd.itemPrices?.[item.id];
          const unit_price = priceVal === undefined ? item.unit_price : priceVal;

          const { error: uErr } = await supabase
            .from("quotation_order_items")
            .update({
              product_name: productName.slice(0, 500),
              quantity: qty,
              unit_price,
              preview_url: preview,
              all_requirement: baseReq,
              customizations_json: Object.keys(cj).length ? cj : null,
            })
            .eq("id", item.id);
          if (uErr) throw uErr;
        }

        const { data: fresh, error: refErr } = await supabase
          .from("quotation_order_items")
          .select("*")
          .eq("quotation_order_id", quotationId);
        if (refErr) throw refErr;
        if (fresh?.length) {
          const rows = fresh as QuotationOrderItem[];
          setItems((prev) => ({ ...prev, [quotationId]: rows }));
          setEditData((prev) => {
            const cur = prev[quotationId];
            if (!cur) return prev;
            const itemPrices: Record<string, number | null> = {};
            const itemPreviewUrls: Record<string, string> = {};
            const itemWhyPrices: Record<string, string> = {};
            const itemProductNames: Record<string, string> = {};
            const itemQuantities: Record<string, number> = {};
            const itemCustomizations: Record<string, string> = {};
            const itemNotes: Record<string, string> = {};
            rows.forEach((row) => {
              itemPrices[row.id] = row.unit_price;
              itemPreviewUrls[row.id] = row.preview_url || "";
              itemWhyPrices[row.id] =
                String(customizationJsonRecord(row.customizations_json).why_price ?? "").trim() || "";
              itemProductNames[row.id] = row.product_name || "";
              itemQuantities[row.id] = Math.max(1, row.quantity ?? 1);
              itemCustomizations[row.id] = getDefaultItemCustomization(row);
              itemNotes[row.id] = getDefaultItemNote(row);
            });
            return {
              ...prev,
              [quotationId]: {
                ...cur,
                itemPrices,
                itemPreviewUrls,
                itemWhyPrices,
                itemProductNames,
                itemQuantities,
                itemCustomizations,
                itemNotes,
              },
            };
          });
        }
      }

      const { error } = await supabase
        .from("quotation_orders")
        .update({
          shipping_fee: shippingFeeForOrder,
          subtotal: recalculatedSubtotal,
          total_amount: recalculatedTotal,
          notes: edits.notes,
          shipping_way: edits.shipping_way,
          discount_amount: edits.discount_amount,
          email: edits.email,
          who_receive: edits.who_receive,
          recipient_name: edits.recipient_name,
          shipping_address_text: edits.shipping_address_text,
          expected_pickup_date: edits.expected_pickup_date,
          line_user_id: edits.line_user_id ?? null,
          user_id: edits.user_id && String(edits.user_id).trim() ? String(edits.user_id).trim() : null,
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

  /** 新增報價單對話框開啟時，載入與手動訂單相同的商品清單 */
  useEffect(() => {
    if (!newQuotationOpen) return;
    let cancelled = false;
    (async () => {
      const { data: productsData, error: productsError } = await supabase
        .from("products")
        .select("id, name, category, price")
        .or("is_hide.is.null,is_hide.eq.false")
        .order("category");
      if (cancelled) return;
      if (!productsError && productsData) {
        setNewQuoteProducts(productsData as NewQuotationProductRow[]);
        const grouped: Record<string, NewQuotationProductRow[]> = {};
        (productsData as NewQuotationProductRow[]).forEach((p) => {
          const cat = p.category || "未分類";
          if (!grouped[cat]) grouped[cat] = [];
          grouped[cat].push(p);
        });
        setNewQuoteProductsByCategory(grouped);
      }
      const { data: noticesData, error: noticesError } = await supabase
        .from("product_notice")
        .select("product_id, min_order_qty, price_min");
      if (cancelled) return;
      if (!noticesError && noticesData) {
        const noticesMap: Record<string, ProductNoticeRow> = {};
        (noticesData as ProductNoticeRow[]).forEach((n) => {
          if (n.product_id) noticesMap[n.product_id] = n;
        });
        setNewQuoteProductNotices(noticesMap);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [newQuotationOpen]);

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
      const itemProductNames: Record<string, string> = {};
      const itemQuantities: Record<string, number> = {};
      const itemCustomizations: Record<string, string> = {};
      const itemNotes: Record<string, string> = {};
      const itemList = data || [];
      const quotation = quotations.find((q) => q.id === quotationOrderId);
      itemList.forEach((item) => {
        itemPrices[item.id] = item.unit_price;
        itemPreviewUrls[item.id] = item.preview_url || "";
        itemWhyPrices[item.id] =
          String(customizationJsonRecord(item.customizations_json).why_price ?? "").trim() || "";
        itemProductNames[item.id] = item.product_name || "";
        itemQuantities[item.id] = Math.max(1, item.quantity ?? 1);
        itemCustomizations[item.id] = getDefaultItemCustomization(item);
        itemNotes[item.id] = getDefaultItemNote(item);
      });

      setEditData((prev) => ({
        ...prev,
        [quotationOrderId]: {
          itemPrices,
          itemPreviewUrls,
          itemWhyPrices,
          itemProductNames,
          itemQuantities,
          itemCustomizations,
          itemNotes,
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

  const handleAddQuotationItem = async (quotationId: string) => {
    const q = quotations.find((x) => x.id === quotationId);
    if (!q) return;
    if (isSpecialQuotation(q.all_requirement)) {
      toast({ title: "特殊報價單請使用訂單組合管理品項", variant: "destructive" });
      return;
    }

    const orderAr = parseAllRequirement(q.all_requirement);
    const so = orderAr?.service_order;
    const serviceType =
      so && typeof so === "object" && !Array.isArray(so)
        ? String((so as Record<string, unknown>).service_type || "custom_design")
        : "custom_design";

    setAddingQuotationItemId(quotationId);
    try {
      const { data, error } = await supabase
        .from("quotation_order_items")
        .insert({
          quotation_order_id: quotationId,
          product_name: "待補充",
          quantity: 1,
          unit_price: null,
          preview_url: null,
          category: serviceType.slice(0, 200),
          all_requirement: {},
          customizations_json: null,
          quantity_description: null,
        })
        .select("*")
        .single();

      if (error) throw error;
      if (!data) throw new Error("新增失敗");

      const newItem = data as QuotationOrderItem;
      setItems((prev) => ({
        ...prev,
        [quotationId]: [...(prev[quotationId] || []), newItem],
      }));

      setEditData((prev) => {
        const cur = prev[quotationId] ?? {
          itemPrices: {},
          itemPreviewUrls: {},
          itemWhyPrices: {},
          itemProductNames: {},
          itemQuantities: {},
          itemCustomizations: {},
          itemNotes: {},
          shippingFee: q.shipping_fee ?? null,
          lineUserId: q.line_user_id || "",
        };
        return {
          ...prev,
          [quotationId]: {
            ...cur,
            itemPrices: { ...cur.itemPrices, [newItem.id]: newItem.unit_price },
            itemPreviewUrls: { ...cur.itemPreviewUrls, [newItem.id]: newItem.preview_url || "" },
            itemWhyPrices: { ...cur.itemWhyPrices, [newItem.id]: "" },
            itemProductNames: { ...cur.itemProductNames, [newItem.id]: newItem.product_name || "待補充" },
            itemQuantities: { ...cur.itemQuantities, [newItem.id]: Math.max(1, newItem.quantity ?? 1) },
            itemCustomizations: {
              ...cur.itemCustomizations,
              [newItem.id]: getDefaultItemCustomization(newItem),
            },
            itemNotes: { ...cur.itemNotes, [newItem.id]: getDefaultItemNote(newItem) },
          },
        };
      });

      toast({ title: "✅ 已新增品項", description: "請填寫品項名稱與報價後儲存。" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "新增失敗";
      toast({ title: "新增品項失敗", description: msg, variant: "destructive" });
    } finally {
      setAddingQuotationItemId(null);
    }
  };

  const renderGeneralQuotationAddItemButton = (q: QuotationOrder) => {
    if (isSpecialQuotation(q.all_requirement)) return null;
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={addingQuotationItemId === q.id}
        onClick={() => void handleAddQuotationItem(q.id)}
      >
        {addingQuotationItemId === q.id ? (
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
        ) : (
          <Plus className="h-4 w-4 mr-2" />
        )}
        新增品項
      </Button>
    );
  };

  // Calculate subtotal from item prices
  const calcSubtotal = (quotationId: string) => {
    const qItems = items[quotationId] || [];
    const prices = editData[quotationId]?.itemPrices || {};
    const qtyMap = editData[quotationId]?.itemQuantities || {};
    return qItems.reduce((sum, item) => {
      const price = prices[item.id] ?? 0;
      const qty = qtyMap[item.id] ?? item.quantity ?? 0;
      return sum + price * qty;
    }, 0);
  };

  const calcTotal = (quotationId: string) => {
    const subtotal = calcSubtotal(quotationId);
    const fee = editData[quotationId]?.shippingFee ?? 0;
    return subtotal + fee;
  };

  const renderQuotationItemEditors = (qid: string, qItemsList: QuotationOrderItem[]) =>
    qItemsList.map((item) => {
      const defCust = getDefaultItemCustomization(item);
      const defNote = getDefaultItemNote(item);
      const edLocal = editData[qid];
      const storedCust = edLocal?.itemCustomizations?.[item.id];
      const storedNote = edLocal?.itemNotes?.[item.id];
      return (
        <ItemEditor
          key={item.id}
          item={item}
          productName={edLocal?.itemProductNames?.[item.id] ?? item.product_name ?? ""}
          quantity={edLocal?.itemQuantities?.[item.id] ?? Math.max(1, item.quantity ?? 1)}
          customization={storedCust?.trim() ? storedCust : defCust}
          note={storedNote?.trim() ? storedNote : defNote}
          unitPrice={edLocal?.itemPrices[item.id] ?? null}
          previewUrl={edLocal?.itemPreviewUrls[item.id] ?? ""}
          whyPrice={edLocal?.itemWhyPrices?.[item.id] ?? ""}
          onProductNameChange={(val) =>
            setEditData((prev) => {
              const cur = prev[qid];
              if (!cur) return prev;
              return {
                ...prev,
                [qid]: { ...cur, itemProductNames: { ...cur.itemProductNames, [item.id]: val } },
              };
            })
          }
          onQuantityChange={(val) =>
            setEditData((prev) => {
              const cur = prev[qid];
              if (!cur) return prev;
              return {
                ...prev,
                [qid]: { ...cur, itemQuantities: { ...cur.itemQuantities, [item.id]: val } },
              };
            })
          }
          onCustomizationChange={(val) =>
            setEditData((prev) => {
              const cur = prev[qid];
              if (!cur) return prev;
              return {
                ...prev,
                [qid]: { ...cur, itemCustomizations: { ...cur.itemCustomizations, [item.id]: val } },
              };
            })
          }
          onNoteChange={(val) =>
            setEditData((prev) => {
              const cur = prev[qid];
              if (!cur) return prev;
              return {
                ...prev,
                [qid]: { ...cur, itemNotes: { ...cur.itemNotes, [item.id]: val } },
              };
            })
          }
          onUnitPriceChange={(val) =>
            setEditData((prev) => {
              const cur = prev[qid];
              if (!cur) return prev;
              return {
                ...prev,
                [qid]: { ...cur, itemPrices: { ...cur.itemPrices, [item.id]: val } },
              };
            })
          }
          onPreviewUrlChange={(val) =>
            setEditData((prev) => {
              const cur = prev[qid];
              if (!cur) return prev;
              return {
                ...prev,
                [qid]: { ...cur, itemPreviewUrls: { ...cur.itemPreviewUrls, [item.id]: val } },
              };
            })
          }
          onWhyPriceChange={(val) =>
            setEditData((prev) => {
              const cur = prev[qid];
              if (!cur) return prev;
              return {
                ...prev,
                [qid]: { ...cur, itemWhyPrices: { ...cur.itemWhyPrices, [item.id]: val } },
              };
            })
          }
        />
      );
    });

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
      window.dispatchEvent(new Event("admin-refresh-badges"));
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

  /** 寫入已報價、不經 n8n；另開報價單 HTML，由管理員以瀏覽器列印／外掛轉 PDF */
  const handleStandaloneQuote = async (quotation: QuotationOrder) => {
    const ed = editData[quotation.id];
    if (!ed) return;

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
          action: "send_quote_standalone",
          quotation_order_id: quotation.id,
          items: itemsPayload,
          shipping_fee: ed.shippingFee || 0,
          line_user_id: lineUserId || null,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const pdfInput = data?.pdf_input as QuotationPdfWebhookPayload | undefined;
      if (pdfInput) {
        const html = buildQuotationPdfHtml(pdfInput);
        const blob = new Blob([html], { type: "text/html;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const w = window.open(url, "_blank", "noopener,noreferrer");
        if (!w) {
          toast({
            title: "無法開啟新視窗",
            description: "請允許此網站開啟彈出視窗，或暫停阻擋後再試一次「單獨開立報價單」。",
            variant: "destructive",
          });
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
        } else {
          toast({
            title: "✅ 已單獨開立並標記為已報價",
            description:
              "已在新分頁開啟報價單。請用 ⌘P／Ctrl+P → 目的地選「另存為 PDF」；若底色不見，請展開「顯示更多設定」並勾選「背景圖形」。",
          });
        }
        setTimeout(() => URL.revokeObjectURL(url), 600_000);
      } else {
        toast({
          title: "✅ 已單獨開立並標記為已報價",
          description: "未收到報價單內容資料，請至「已報價」分頁確認。",
        });
      }
      loadQuotations();
      window.dispatchEvent(new Event("admin-refresh-badges"));
      setItems((prev) => {
        const next = { ...prev };
        delete next[quotation.id];
        return next;
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "操作失敗";
      toast({ title: "單獨開立失敗", description: msg, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const submitNewQuotation = async () => {
    const f = newQForm;
    if (!f.customerName.trim() || !f.email.trim() || !f.phone.trim() || !f.whoReceive.trim()) {
      toast({ title: "請完成必填欄位", description: "姓名、Email、電話、收件人為必填。", variant: "destructive" });
      return;
    }
    if (!f.inquiryNotes.trim()) {
      toast({ title: "請填寫詢價說明", variant: "destructive" });
      return;
    }
    const validDraftItems = newQuoteDraftItems.filter((d) => d.productName.trim());
    if (validDraftItems.length === 0) {
      toast({ title: "請至少新增一筆品項", description: "每筆品項需填寫品項名稱。", variant: "destructive" });
      return;
    }

    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const userIdClean = f.userId.trim();
    const user_id = uuidRe.test(userIdClean) ? userIdClean : null;

    const notesLines = [`聯絡電話：${f.phone.trim()}`];
    if (f.inquiryNotes.trim()) notesLines.push(`詢價備註：${f.inquiryNotes.trim()}`);
    const notes = notesLines.join("\n");

    const all_requirement = {
      customer_profile: {
        name: f.customerName.trim(),
        email: f.email.trim(),
      },
      delivery: {
        method: f.shippingWay.trim(),
        address: f.shippingAddress.trim(),
        receiver: f.whoReceive.trim(),
        phone: f.phone.trim(),
      },
      service_order: {
        service_type: f.serviceType,
        selections: [f.inquiryNotes.trim()],
      },
    };

    setNewQuotationSubmitting(true);
    try {
      const { data: row, error: qErr } = await supabase
        .from("quotation_orders")
        .insert({
          status: "price_asked",
          email: f.email.trim(),
          who_receive: f.whoReceive.trim(),
          shipping_way: f.shippingWay.trim() || null,
          shipping_address_text: f.shippingAddress.trim() || null,
          expected_pickup_date: f.expectedPickupDate.trim() || null,
          notes,
          line_user_id: f.lineUserId.trim() || null,
          user_id,
          all_requirement,
        })
        .select("id")
        .single();

      if (qErr) throw qErr;
      if (!row?.id) throw new Error("建立失敗");

      const itemRows = validDraftItems.map((draft) => {
        const product = draft.productId ? newQuoteProducts.find((p) => p.id === draft.productId) : undefined;
        const itemCategory = (product?.category || f.serviceType || "custom_design").toString().slice(0, 200);
        const customization = draft.customization.trim() || f.inquiryNotes.trim();
        return {
          quotation_order_id: row.id,
          product_name: draft.productName.trim().slice(0, 500),
          quantity: Math.max(1, Math.floor(Number(draft.quantity) || 1)),
          unit_price: null,
          preview_url: null,
          category: itemCategory,
          all_requirement: customization ? { customization } : {},
          customizations_json: draft.productId.trim() ? { product_id: draft.productId.trim() } : null,
          quantity_description: null,
        };
      });

      const { error: itemErr } = await supabase.from("quotation_order_items").insert(itemRows);

      if (itemErr) throw itemErr;

      toast({ title: "✅ 已建立詢價報價單", description: "請至「詢價中」分頁展開單據並填寫報價。" });
      setNewQuotationOpen(false);
      setNewQuotationStep(1);
      setNewQForm(defaultNewQuotationForm());
      setNewQuoteDraftItems([newDraftQuotationItem()]);
      setNewQuoteDraftItemPopoverOpen({});
      setNewQuoteDraftItemProductSearch({});
      setActiveTab("price_asked");
      await loadQuotations();
      window.dispatchEvent(new Event("admin-refresh-badges"));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "建立失敗";
      toast({ title: "新增報價單失敗", description: msg, variant: "destructive" });
    } finally {
      setNewQuotationSubmitting(false);
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
    const saved = await handleSaveQuotationEdits(quotation.id);
    if (!saved) return;

    setActionLoading(quotation.id);
    try {
      const { data, error } = await supabase.functions.invoke("process-quotation", {
        body: {
          action: "convert_to_order",
          quotation_order_id: quotation.id,
          payment_method: pd.paymentMethod,
          payment_step: pd.paymentStep ?? quotation.payment_step ?? "pending",
          order_status: pd.orderStatus || "processing",
          auto_cancel_exempt: pd.autoCancelExempt ?? true,
          transfer_last5: pd.transferLast5 || null,
          user_id: userId || null,
          line_user_id: lineUserId || null,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const ids: string[] = Array.isArray(data?.order_ids) ? data.order_ids : data?.order_id ? [data.order_id] : [];
      const n = ids.length;
      toast({
        title: n > 1 ? `✅ 已建立 ${n} 筆訂單` : `✅ 訂單已建立：${(ids[0] || data?.order_id || "").slice(0, 6).toUpperCase()}`,
        description: n > 1 ? ids.map((id) => `#${id.slice(0, 6).toUpperCase()}`).join("、") : undefined,
      });
      loadQuotations();
      window.dispatchEvent(new Event("admin-refresh-badges"));
    } catch (err: unknown) {
      const description = await getEdgeFunctionErrorDetail(err);
      toast({ title: "轉換訂單失敗", description, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const getFilteredQuotations = () => {
    return quotations.filter((q) => {
      if (q.status !== activeTab) return false;
      if (!showHiddenQuotations && q.is_hide) return false;
      return true;
    });
  };

  const isQuotationHidden = (q: QuotationOrder) => !!q.is_hide;

  const handleToggleQuotationHide = async (q: QuotationOrder, nextHide: boolean) => {
    setActionLoading(q.id);
    try {
      const { error } = await supabase.from("quotation_orders").update({ is_hide: nextHide }).eq("id", q.id);
      if (error) throw error;
      toast({ title: nextHide ? "已隱藏報價單" : "已取消隱藏" });
      await loadQuotations();
      window.dispatchEvent(new Event("admin-refresh-badges"));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "操作失敗";
      toast({ title: "更新失敗", description: msg, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const getFilteredProductsForSearch = (search: string) => {
    if (!search.trim()) return newQuoteProductsByCategory;
    const query = search.toLowerCase();
    const filtered: Record<string, NewQuotationProductRow[]> = {};
    Object.entries(newQuoteProductsByCategory).forEach(([category, prods]) => {
      const matchedProds = prods.filter((p) => p.name.toLowerCase().includes(query));
      if (matchedProds.length > 0) filtered[category] = matchedProds;
    });
    return filtered;
  };

  const filtered = getFilteredQuotations();

  const countQuotationsVisible = (status: string) =>
    quotations.filter((q) => q.status === status && !q.is_hide).length;

  return (
    <div className="p-4 md:p-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>報價單管理</CardTitle>
              <CardDescription>管理客戶詢價、報價與訂單轉換</CardDescription>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
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
              <Button size="sm" variant="secondary" onClick={() => setSpecialQuotationOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> 建立特殊報價單
              </Button>
              <Button size="sm" variant="outline" onClick={() => setQuotationAiDraftOpen(true)}>
                從對話／截圖（AI）
              </Button>
              <Button size="sm" onClick={() => setNewQuotationOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> 新增報價單
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-3">
            <Checkbox
              id="admin-quotations-show-hidden"
              checked={showHiddenQuotations}
              onCheckedChange={(c) => setShowHiddenQuotations(c === true)}
            />
            <Label htmlFor="admin-quotations-show-hidden" className="text-sm font-normal cursor-pointer">
              顯示已隱藏報價單
            </Label>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="price_asked">
                詢價中 ({countQuotationsVisible("price_asked")})
              </TabsTrigger>
              <TabsTrigger value="price_reply">
                已報價 ({countQuotationsVisible("price_reply")})
              </TabsTrigger>
              <TabsTrigger value="order_created">
                已建立訂單 ({countQuotationsVisible("order_created")})
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
                      <Card
                        key={q.id}
                        className={cn("border", isQuotationHidden(q) && "opacity-80 border-dashed")}
                      >
                        {/* Header */}
                        <div
                          className="flex items-center justify-between gap-2 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                          onClick={() => toggleExpand(q.id)}
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium">#{q.id.slice(0, 6).toUpperCase()}</span>
                              <Badge variant={q.status === "price_asked" ? "outline" : q.status === "price_reply" ? "secondary" : "default"}>
                                {q.status === "price_asked" && "詢價中"}
                                {q.status === "price_reply" && "已報價"}
                                {q.status === "order_created" && "已建立訂單"}
                              </Badge>
                              {isSpecialQuotation(q.all_requirement) ? (
                                <Badge variant="outline" className="text-xs border-violet-300 bg-violet-50 text-violet-900">
                                  特殊報價
                                </Badge>
                              ) : null}
                              {isQuotationHidden(q) ? (
                                <Badge variant="destructive" className="text-xs">
                                  已隱藏
                                </Badge>
                              ) : null}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {(getSpecialQuotationRoot(q.all_requirement)?.orderer_name ||
                                q.all_requirement?.customer_profile?.name ||
                                "未知客戶") +
                                " · "}
                              {new Date(q.created_at).toLocaleDateString("zh-TW")}
                              {q.total_amount ? ` · NT$ ${q.total_amount.toLocaleString()}` : ""}
                              {q.status === "order_created" && getSpecialConvertedOrderCount(q.all_requirement) > 0
                                ? ` · 已轉 ${getSpecialConvertedOrderCount(q.all_requirement)} 筆訂單`
                                : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="text-xs"
                              disabled={actionLoading === q.id}
                              onClick={() => handleToggleQuotationHide(q, !isQuotationHidden(q))}
                            >
                              {actionLoading === q.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : isQuotationHidden(q) ? (
                                "取消隱藏"
                              ) : (
                                "隱藏"
                              )}
                            </Button>
                            {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                          </div>
                        </div>

                        {/* Expanded Content */}
                        {isExpanded && (() => {
                          initQuotationEdits(q);
                          const qe = quotationEdits[q.id] || {};
                          const updateField = (field: string, value: any) =>
                            setQuotationEdits((prev) => ({ ...prev, [q.id]: { ...prev[q.id], [field]: value } }));

                          const isSq = isSpecialQuotation(q.all_requirement);
                          /** 特殊報價單：表頭 JSON 無資料時不渲染該輸入框 */
                          const sqShowHeaderText = (v: unknown) => !isSq || !isEmptyDisplayValue(v);
                          const sqShowHeaderNum = (v: unknown) => !isSq || hasNumericDisplayValue(v);

                          const showQuoteHeaderAmountsCore =
                            !isSq ||
                            sqShowHeaderNum(qe.subtotal ?? q.subtotal) ||
                            sqShowHeaderNum(qe.shipping_fee ?? q.shipping_fee) ||
                            sqShowHeaderNum(qe.discount_amount ?? q.discount_amount) ||
                            sqShowHeaderNum(qe.total_amount ?? q.total_amount);

                          const showQuoteHeaderAmountsPriceReply =
                            showQuoteHeaderAmountsCore ||
                            sqShowHeaderText(qe.tax_title) ||
                            sqShowHeaderText(qe.tax_id);

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
                                {(() => {
                                  const phone = parseAllRequirement(q.all_requirement)?.delivery as
                                    | Record<string, unknown>
                                    | undefined;
                                  const phoneStr = phone?.phone != null ? String(phone.phone).trim() : "";
                                  if (!phoneStr) return null;
                                  return (
                                  <div className="space-y-1 col-span-2">
                                    <Label className="text-sm">電話（來自詢價，唯讀）</Label>
                                    <p className="text-sm text-muted-foreground py-2">{renderValue(phoneStr)}</p>
                                  </div>
                                  );
                                })()}
                                {sqShowHeaderText(qe.shipping_way) && (
                                <div className="space-y-1">
                                  <Label className="text-sm">配送方式</Label>
                                  <Input
                                    value={qe.shipping_way ?? ""}
                                    onChange={(e) => updateField("shipping_way", e.target.value)}
                                    placeholder="pickup / blackcat / special"
                                  />
                                </div>
                                )}
                                {sqShowHeaderText(qe.expected_pickup_date) && (
                                <div className="space-y-1">
                                  <Label className="text-sm">預計取件日</Label>
                                  <Input
                                    type="date"
                                    value={qe.expected_pickup_date ?? ""}
                                    onChange={(e) => updateField("expected_pickup_date", e.target.value)}
                                  />
                                </div>
                                )}
                                {sqShowHeaderText(qe.shipping_address_text) && (
                                <div className="space-y-1 col-span-2">
                                  <Label className="text-sm">配送地址</Label>
                                  <Input
                                    value={qe.shipping_address_text ?? ""}
                                    onChange={(e) => updateField("shipping_address_text", e.target.value)}
                                    placeholder="配送地址"
                                  />
                                </div>
                                )}
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
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleSaveQuotationEdits(q.id)}
                                disabled={savingQuotation === q.id}
                              >
                                {savingQuotation === q.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                儲存客戶／配送與品項
                              </Button>
                            </div>

                            <StyleReferenceLinksBlock
                              label="🎨 用戶風格參考圖連結（甜點佈置／禮盒等服務區）"
                              urls={getOrderServiceStyleReferenceUrls(q.all_requirement)}
                            />

                            <Separator />

                            {/* ========== 下半部：（品項細節僅此區，無重複服務內容/客製化品項明細） ========== */}
                            <div className="space-y-4">
                            {/* ========== Price Asked: Admin fills prices ========== */}
                            {activeTab === "price_asked" && (
                              <div className="space-y-4">
                                <p className="font-semibold">💰 報價填寫</p>

                                <SpecialQuotationCombosReadonlyBlock
                                  allRequirement={q.all_requirement}
                                  items={mergeQuotationItemsWithEditData(qItems, ed)}
                                  context="price_asked"
                                />

                                {/* Item editors */}
                                {renderQuotationItemEditors(q.id, qItems)}
                                {renderGeneralQuotationAddItemButton(q)}

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

                                {showQuoteHeaderAmountsPriceReply && (
                                  <div className="space-y-2">
                                    <p className="text-sm font-medium text-muted-foreground">
                                      報價表頭金額（選填；下方「運費」選項會一併寫入資料庫表頭運費）
                                    </p>
                                    <div className="grid grid-cols-2 gap-4">
                                      {(!isSq || sqShowHeaderNum(qe.subtotal ?? q.subtotal)) && (
                                        <div className="space-y-1">
                                          <Label className="text-sm">小計（表頭）</Label>
                                          <Input
                                            type="number"
                                            value={qe.subtotal ?? ""}
                                            onChange={(e) =>
                                              updateField("subtotal", e.target.value ? Number(e.target.value) : null)
                                            }
                                          />
                                        </div>
                                      )}
                                      {(!isSq || sqShowHeaderNum(qe.discount_amount ?? q.discount_amount)) && (
                                        <div className="space-y-1">
                                          <Label className="text-sm">折扣金額</Label>
                                          <Input
                                            type="number"
                                            value={qe.discount_amount ?? ""}
                                            onChange={(e) =>
                                              updateField(
                                                "discount_amount",
                                                e.target.value ? Number(e.target.value) : null,
                                              )
                                            }
                                          />
                                        </div>
                                      )}
                                      {(!isSq || sqShowHeaderNum(qe.total_amount ?? q.total_amount)) && (
                                        <div className="space-y-1">
                                          <Label className="text-sm">總金額（表頭）</Label>
                                          <Input
                                            type="number"
                                            value={qe.total_amount ?? ""}
                                            onChange={(e) =>
                                              updateField("total_amount", e.target.value ? Number(e.target.value) : null)
                                            }
                                          />
                                        </div>
                                      )}
                                      {sqShowHeaderText(qe.tax_title) && (
                                        <div className="space-y-1">
                                          <Label className="text-sm">發票抬頭</Label>
                                          <Input
                                            value={qe.tax_title ?? ""}
                                            onChange={(e) => updateField("tax_title", e.target.value)}
                                            placeholder="OO科技股份有限公司"
                                          />
                                        </div>
                                      )}
                                      {sqShowHeaderText(qe.tax_id) && (
                                        <div className="space-y-1">
                                          <Label className="text-sm">統一編號</Label>
                                          <Input
                                            value={qe.tax_id ?? ""}
                                            onChange={(e) =>
                                              updateField("tax_id", e.target.value.replace(/\D/g, "").slice(0, 8))
                                            }
                                            placeholder="12345678"
                                            maxLength={8}
                                          />
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Totals */}
                                <div className="bg-muted/30 p-4 rounded-lg space-y-1 text-sm">
                                  <div className="flex justify-between">
                                    <span>小計（依品項單價試算）</span>
                                    <span className="font-medium">NT$ {calcSubtotal(q.id).toLocaleString()}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>運費</span>
                                    <span className="font-medium">NT$ {(ed?.shippingFee ?? 0).toLocaleString()}</span>
                                  </div>
                                  <Separator className="my-1" />
                                  <div className="flex justify-between text-base font-semibold">
                                    <span>總計（試算）</span>
                                    <span className="text-primary">NT$ {calcTotal(q.id).toLocaleString()}</span>
                                  </div>
                                </div>

                                <Button
                                  type="button"
                                  variant="outline"
                                  className="w-full"
                                  onClick={() => handleSaveQuotationEdits(q.id)}
                                  disabled={savingQuotation === q.id}
                                >
                                  {savingQuotation === q.id ? (
                                    <>
                                      <Loader2 className="h-4 w-4 animate-spin mr-2 inline" />
                                      儲存中…
                                    </>
                                  ) : (
                                    "儲存報價單（品項／客戶／配送／表頭，不發送）"
                                  )}
                                </Button>

                                <div className="flex flex-col sm:flex-row gap-2">
                                  <Button
                                    variant="secondary"
                                    className="sm:shrink-0"
                                    onClick={async () => {
                                      const saved = await handleSaveQuotationEdits(q.id);
                                      if (!saved) return;
                                      handleStandaloneQuote(q);
                                    }}
                                    disabled={actionLoading === q.id || savingQuotation === q.id}
                                  >
                                    {actionLoading === q.id || savingQuotation === q.id ? (
                                      <>
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        處理中...
                                      </>
                                    ) : (
                                      "單獨開立報價單"
                                    )}
                                  </Button>
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
                                    className="sm:shrink-0"
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

                                {isSpecialQuotation(q.all_requirement) ? (
                                  <SpecialQuotationCombosReadonlyBlock
                                    allRequirement={q.all_requirement}
                                    items={mergeQuotationItemsWithEditData(qItems, ed)}
                                    context="price_reply"
                                  />
                                ) : null}

                                {renderQuotationItemEditors(q.id, qItems)}
                                {renderGeneralQuotationAddItemButton(q)}

                                {/* Editable 報價欄位（小計／運費／折扣／總金額／發票）；特殊報價單僅顯示表頭有值的欄位 */}
                                {showQuoteHeaderAmountsPriceReply && (
                                <div className="grid grid-cols-2 gap-4">
                                  {sqShowHeaderNum(qe.subtotal ?? q.subtotal) && (
                                  <div className="space-y-1">
                                    <Label className="text-sm">小計</Label>
                                    <Input type="number" value={qe.subtotal ?? ""} onChange={e => updateField("subtotal", e.target.value ? Number(e.target.value) : null)} />
                                  </div>
                                  )}
                                  {sqShowHeaderNum(qe.shipping_fee ?? q.shipping_fee) && (
                                  <div className="space-y-1">
                                    <Label className="text-sm">運費</Label>
                                    <Input type="number" value={qe.shipping_fee ?? ""} onChange={e => updateField("shipping_fee", e.target.value ? Number(e.target.value) : null)} />
                                  </div>
                                  )}
                                  {sqShowHeaderNum(qe.discount_amount ?? q.discount_amount) && (
                                  <div className="space-y-1">
                                    <Label className="text-sm">折扣金額</Label>
                                    <Input type="number" value={qe.discount_amount ?? ""} onChange={e => updateField("discount_amount", e.target.value ? Number(e.target.value) : null)} />
                                  </div>
                                  )}
                                  {sqShowHeaderNum(qe.total_amount ?? q.total_amount) && (
                                  <div className="space-y-1">
                                    <Label className="text-sm">總金額</Label>
                                    <Input type="number" value={qe.total_amount ?? ""} onChange={e => updateField("total_amount", e.target.value ? Number(e.target.value) : null)} />
                                  </div>
                                  )}
                                  {sqShowHeaderText(qe.tax_title) && (
                                  <div className="space-y-1">
                                    <Label className="text-sm">發票抬頭</Label>
                                    <Input value={qe.tax_title ?? ""} onChange={e => updateField("tax_title", e.target.value)} placeholder="OO科技股份有限公司" />
                                  </div>
                                  )}
                                  {sqShowHeaderText(qe.tax_id) && (
                                  <div className="space-y-1">
                                    <Label className="text-sm">統一編號</Label>
                                    <Input value={qe.tax_id ?? ""} onChange={e => updateField("tax_id", e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="12345678" maxLength={8} />
                                  </div>
                                  )}
                                </div>
                                )}

                                <Button
                                  variant="outline"
                                  className="w-full"
                                  onClick={() => handleSaveQuotationEdits(q.id)}
                                  disabled={savingQuotation === q.id}
                                >
                                  {savingQuotation === q.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                  儲存品項、客戶／配送與報價表頭
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
                                    <Label>付款狀態（轉訂單）</Label>
                                    <select
                                      className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                                      value={
                                        paymentData[q.id]?.paymentStep ??
                                        q.payment_step ??
                                        "pending"
                                      }
                                      onChange={(e) =>
                                        setPaymentData((prev) => ({
                                          ...prev,
                                          [q.id]: { ...prev[q.id], paymentStep: e.target.value },
                                        }))
                                      }
                                    >
                                      {QUOTATION_PAYMENT_STEP_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                          {opt.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="space-y-2 col-span-2 sm:col-span-1">
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
                                {isSpecialQuotation(q.all_requirement) ? (
                                  <SpecialQuotationCombosReadonlyBlock
                                    allRequirement={q.all_requirement}
                                    items={mergeQuotationItemsWithEditData(qItems, ed)}
                                    context="order_created"
                                  />
                                ) : null}

                                {/* Editable 報價欄位；特殊報價單僅顯示表頭有值的欄位 */}
                                {showQuoteHeaderAmountsCore && (
                                <div className="grid grid-cols-2 gap-4">
                                  {sqShowHeaderNum(qe.subtotal ?? q.subtotal) && (
                                  <div className="space-y-1">
                                    <Label className="text-sm">小計</Label>
                                    <Input type="number" value={qe.subtotal ?? ""} onChange={e => updateField("subtotal", e.target.value ? Number(e.target.value) : null)} />
                                  </div>
                                  )}
                                  {sqShowHeaderNum(qe.shipping_fee ?? q.shipping_fee) && (
                                  <div className="space-y-1">
                                    <Label className="text-sm">運費</Label>
                                    <Input type="number" value={qe.shipping_fee ?? ""} onChange={e => updateField("shipping_fee", e.target.value ? Number(e.target.value) : null)} />
                                  </div>
                                  )}
                                  {sqShowHeaderNum(qe.discount_amount ?? q.discount_amount) && (
                                  <div className="space-y-1">
                                    <Label className="text-sm">折扣金額</Label>
                                    <Input type="number" value={qe.discount_amount ?? ""} onChange={e => updateField("discount_amount", e.target.value ? Number(e.target.value) : null)} />
                                  </div>
                                  )}
                                  {sqShowHeaderNum(qe.total_amount ?? q.total_amount) && (
                                  <div className="space-y-1">
                                    <Label className="text-sm">總金額</Label>
                                    <Input type="number" value={qe.total_amount ?? ""} onChange={e => updateField("total_amount", e.target.value ? Number(e.target.value) : null)} />
                                  </div>
                                  )}
                                </div>
                                )}

                                {(showQuoteHeaderAmountsCore || qItems.length > 0) && (
                                <Button
                                  variant="outline"
                                  className="w-full"
                                  onClick={() => handleSaveQuotationEdits(q.id)}
                                  disabled={savingQuotation === q.id}
                                >
                                  {savingQuotation === q.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                  儲存品項與報價表頭
                                </Button>
                                )}

                                <Separator />

                                <div className="text-sm text-muted-foreground">
                                  付款方式：{q.payment_method || "—"} ·
                                  匯款末五碼：{q.transfer_last5 || "—"} ·
                                  狀態：{paymentStepLabel(q.payment_step)}
                                </div>

                                {renderQuotationItemEditors(q.id, qItems)}
                                {renderGeneralQuotationAddItemButton(q)}
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

      <Dialog
        open={newQuotationOpen}
        onOpenChange={(open) => {
          setNewQuotationOpen(open);
          if (!open) {
            setNewQuotationStep(1);
            setNewQForm(defaultNewQuotationForm());
            setNewQuoteDraftItems([newDraftQuotationItem()]);
            setNewQuoteDraftItemPopoverOpen({});
            setNewQuoteDraftItemProductSearch({});
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>新增報價單（詢價中）</DialogTitle>
            <DialogDescription>
              依序完成三步驟。建立後請至「詢價中」展開該筆、填寫各品項單價與運費；若要經 LINE／n8n 自動發送請按「儲存資料並發送報價單」，若只要書面 PDF 給客戶請按「單獨開立報價單」。
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground pb-2 border-b">
            <span className={newQuotationStep === 1 ? "font-semibold text-foreground" : ""}>① 客戶與聯絡</span>
            <span aria-hidden>·</span>
            <span className={newQuotationStep === 2 ? "font-semibold text-foreground" : ""}>② 配送與日程</span>
            <span aria-hidden>·</span>
            <span className={newQuotationStep === 3 ? "font-semibold text-foreground" : ""}>③ 詢價內容</span>
          </div>

          {newQuotationStep === 1 && (
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label>客戶姓名（必填）</Label>
                <Input
                  value={newQForm.customerName}
                  onChange={(e) => setNewQForm((p) => ({ ...p, customerName: e.target.value }))}
                  placeholder="與客戶聯絡時使用的稱呼"
                />
              </div>
              <div className="space-y-1">
                <Label>Email（必填）</Label>
                <Input
                  type="email"
                  value={newQForm.email}
                  onChange={(e) => setNewQForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder="name@example.com"
                />
              </div>
              <div className="space-y-1">
                <Label>聯絡電話（必填，會寫入備註供報價單 PDF 使用）</Label>
                <Input
                  value={newQForm.phone}
                  onChange={(e) => setNewQForm((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="09xxxxxxxx"
                />
              </div>
              <div className="space-y-1">
                <Label>收件人（必填）</Label>
                <Input
                  value={newQForm.whoReceive}
                  onChange={(e) => setNewQForm((p) => ({ ...p, whoReceive: e.target.value }))}
                  placeholder="與黑貓／收件資訊一致"
                />
              </div>
              <div className="space-y-1">
                <Label>LINE User ID（選填）</Label>
                <Input
                  value={newQForm.lineUserId}
                  onChange={(e) => setNewQForm((p) => ({ ...p, lineUserId: e.target.value }))}
                  placeholder="Uxxxx…"
                />
              </div>
              <div className="space-y-1">
                <Label>網站會員 UUID（選填）</Label>
                <Input
                  value={newQForm.userId}
                  onChange={(e) => setNewQForm((p) => ({ ...p, userId: e.target.value }))}
                  placeholder="auth.users 的 UUID"
                />
              </div>
            </div>
          )}

          {newQuotationStep === 2 && (
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label>配送方式</Label>
                <Input
                  value={newQForm.shippingWay}
                  onChange={(e) => setNewQForm((p) => ({ ...p, shippingWay: e.target.value }))}
                  placeholder="例：黑貓、自取、面交…"
                />
              </div>
              <div className="space-y-1">
                <Label>配送地址</Label>
                <Textarea
                  value={newQForm.shippingAddress}
                  onChange={(e) => setNewQForm((p) => ({ ...p, shippingAddress: e.target.value }))}
                  placeholder="完整地址或取貨地點說明"
                  rows={3}
                />
              </div>
              <div className="space-y-1">
                <Label>希望到貨／取貨日</Label>
                <Input
                  type="date"
                  value={newQForm.expectedPickupDate}
                  onChange={(e) => setNewQForm((p) => ({ ...p, expectedPickupDate: e.target.value }))}
                />
              </div>
            </div>
          )}

          {newQuotationStep === 3 && (
            <div className="space-y-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <Label>品項列表（至少一筆，品項名稱必填）</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setNewQuoteDraftItems((prev) => [...prev, newDraftQuotationItem()])}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  新增品項
                </Button>
              </div>

              {newQuoteDraftItems.map((draft, draftIdx) => {
                const selectedProduct = draft.productId
                  ? newQuoteProducts.find((p) => p.id === draft.productId)
                  : undefined;
                const draftSearch = newQuoteDraftItemProductSearch[draft.id] ?? "";
                const filteredProductsForDraft = getFilteredProductsForSearch(draftSearch);
                const popoverOpen = newQuoteDraftItemPopoverOpen[draft.id] ?? false;

                return (
                  <div key={draft.id} className="border rounded-lg p-3 space-y-2 bg-muted/20">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">品項 {draftIdx + 1}</span>
                      {newQuoteDraftItems.length > 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive h-8"
                          onClick={() => {
                            setNewQuoteDraftItems((prev) => prev.filter((d) => d.id !== draft.id));
                            setNewQuoteDraftItemPopoverOpen((prev) => {
                              const next = { ...prev };
                              delete next[draft.id];
                              return next;
                            });
                            setNewQuoteDraftItemProductSearch((prev) => {
                              const next = { ...prev };
                              delete next[draft.id];
                              return next;
                            });
                          }}
                        >
                          刪除
                        </Button>
                      ) : null}
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">品項名稱（必填，可自訂）</Label>
                      <Input
                        value={draft.productName}
                        onChange={(e) =>
                          setNewQuoteDraftItems((prev) =>
                            prev.map((d) => (d.id === draft.id ? { ...d, productName: e.target.value } : d)),
                          )
                        }
                        placeholder="例如：客製化禮盒、企業週年禮盒 A"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">從商品庫帶入（選填）</Label>
                      <Popover
                        open={popoverOpen}
                        onOpenChange={(open) =>
                          setNewQuoteDraftItemPopoverOpen((prev) => ({ ...prev, [draft.id]: open }))
                        }
                      >
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            role="combobox"
                            aria-expanded={popoverOpen}
                            className="w-full justify-between font-normal h-9 text-sm"
                          >
                            {selectedProduct ? `已選：${selectedProduct.name}` : "從商品庫選擇…"}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[min(100vw-2rem,320px)] p-0" align="start">
                          <Command shouldFilter={false}>
                            <CommandInput
                              placeholder="輸入商品名稱搜尋…"
                              value={draftSearch}
                              onValueChange={(val) =>
                                setNewQuoteDraftItemProductSearch((prev) => ({ ...prev, [draft.id]: val }))
                              }
                            />
                            <CommandList>
                              <CommandEmpty>
                                {newQuoteProducts.length === 0 ? "商品載入中…" : "找不到商品"}
                              </CommandEmpty>
                              {Object.entries(filteredProductsForDraft).map(([category, prods]) => (
                                <CommandGroup key={category} heading={category}>
                                  {prods.map((p) => {
                                    const notice = newQuoteProductNotices[p.id];
                                    const displayPrice = notice?.price_min ?? p.price;
                                    const minQty = notice?.min_order_qty;
                                    return (
                                      <CommandItem
                                        key={p.id}
                                        value={p.id}
                                        onSelect={() => {
                                          setNewQuoteDraftItems((prev) =>
                                            prev.map((d) =>
                                              d.id === draft.id
                                                ? { ...d, productId: p.id, productName: p.name }
                                                : d,
                                            ),
                                          );
                                          setNewQuoteDraftItemPopoverOpen((prev) => ({ ...prev, [draft.id]: false }));
                                          setNewQuoteDraftItemProductSearch((prev) => ({ ...prev, [draft.id]: "" }));
                                        }}
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-4 w-4",
                                            draft.productId === p.id ? "opacity-100" : "opacity-0",
                                          )}
                                        />
                                        {[
                                          p.name,
                                          "（NT$ ",
                                          String(displayPrice),
                                          minQty != null ? `，最低${minQty}份` : "",
                                          "）",
                                        ].join("")}
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

                    <div className="space-y-1">
                      <Label className="text-xs">客製化說明（選填，留空則使用下方整體詢價說明）</Label>
                      <Textarea
                        value={draft.customization}
                        onChange={(e) =>
                          setNewQuoteDraftItems((prev) =>
                            prev.map((d) => (d.id === draft.id ? { ...d, customization: e.target.value } : d)),
                          )
                        }
                        placeholder="此品項專屬需求、數量、風格等"
                        rows={2}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">數量</Label>
                      <Input
                        type="number"
                        min={1}
                        value={draft.quantity || ""}
                        onChange={(e) =>
                          setNewQuoteDraftItems((prev) =>
                            prev.map((d) =>
                              d.id === draft.id
                                ? { ...d, quantity: e.target.value ? Math.max(1, Number(e.target.value)) : 1 }
                                : d,
                            ),
                          )
                        }
                        className="w-24"
                      />
                    </div>
                  </div>
                );
              })}

              <div className="space-y-1">
                <Label>詢價說明（必填）</Label>
                <Textarea
                  value={newQForm.inquiryNotes}
                  onChange={(e) => setNewQForm((p) => ({ ...p, inquiryNotes: e.target.value }))}
                  placeholder="整體需求、數量、參考風格、預算等，將顯示於後台「服務內容」與報價單訂購內容區塊；各品項若未填客製化說明則沿用此內容。"
                  rows={4}
                />
              </div>
              <div className="space-y-1">
                <Label>服務類型</Label>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  value={newQForm.serviceType}
                  onChange={(e) =>
                    setNewQForm((p) => ({
                      ...p,
                      serviceType: e.target.value as "custom_design" | "giftbox" | "candy_bar",
                    }))
                  }
                >
                  <option value="custom_design">客製化設計</option>
                  <option value="giftbox">禮盒</option>
                  <option value="candy_bar">甜點佈置</option>
                </select>
              </div>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between">
            <div className="flex gap-2 w-full sm:w-auto">
              {newQuotationStep > 1 ? (
                <Button type="button" variant="outline" onClick={() => setNewQuotationStep((s) => Math.max(1, s - 1))}>
                  上一步
                </Button>
              ) : null}
            </div>
            <div className="flex gap-2 w-full sm:w-auto sm:justify-end">
              {newQuotationStep < 3 ? (
                <Button
                  type="button"
                  className="flex-1 sm:flex-none"
                  onClick={() => {
                    if (newQuotationStep === 1) {
                      if (
                        !newQForm.customerName.trim() ||
                        !newQForm.email.trim() ||
                        !newQForm.phone.trim() ||
                        !newQForm.whoReceive.trim()
                      ) {
                        toast({
                          title: "請完成本步驟",
                          description: "姓名、Email、電話、收件人為必填。",
                          variant: "destructive",
                        });
                        return;
                      }
                    }
                    setNewQuotationStep((s) => Math.min(3, s + 1));
                  }}
                >
                  下一步
                </Button>
              ) : (
                <Button type="button" className="flex-1 sm:flex-none" onClick={() => void submitNewQuotation()} disabled={newQuotationSubmitting}>
                  {newQuotationSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  建立詢價單
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SpecialQuotationDialog
        open={specialQuotationOpen}
        onOpenChange={setSpecialQuotationOpen}
        onCommitted={async () => {
          await loadQuotations();
          setActiveTab("price_reply");
          window.dispatchEvent(new Event("admin-refresh-badges"));
        }}
      />

      <QuotationAiDraftDialog
        open={quotationAiDraftOpen}
        onOpenChange={setQuotationAiDraftOpen}
        onCommitted={async () => {
          await loadQuotations();
          window.dispatchEvent(new Event("admin-refresh-badges"));
        }}
      />
    </div>
  );
};

export default AdminQuotationsPanel;
