import type { QuotationPdfLineItem, QuotationPdfWebhookPayload } from "@/lib/quotation-pdf-html";
import { isCustomerSource, type CustomerSource } from "@/lib/customer-source";

export { isCustomerSource, type CustomerSource };

export const CHECKOUT_INTENT_KEY = "tj_checkout_intent";
export type CheckoutIntent = "order" | "quotation";

export type CreateQuotationItemInput = {
  product_id?: string | null;
  name?: string | null;
  product_name?: string | null;
  quantity: number;
  price?: number | null;
  total_price?: number | null;
  category?: string | null;
  is_package_design?: boolean | null;
  /** 購物車合成預覽圖公開 URL */
  preview_url?: string | null;
  customizations?: unknown;
  customizations_json?: unknown;
};

function isHttpUrl(raw: unknown): raw is string {
  return typeof raw === "string" && /^https?:\/\//i.test(raw.trim());
}

/** 從 cart 品項抽出合成圖 URL（preview_url 或 screenshot 客製項） */
export function resolveCartItemPreviewUrl(item: CreateQuotationItemInput): string | null {
  if (isHttpUrl(item.preview_url)) return item.preview_url.trim();

  const raw = item.customizations_json ?? item.customizations;
  let list: unknown[] = [];
  if (Array.isArray(raw)) list = raw;
  else if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.options)) list = o.options;
    else if (Array.isArray(o.customizations)) list = o.customizations;
  }

  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const c = entry as Record<string, unknown>;
    const group = typeof c.group === "string" ? c.group : "";
    if (group !== "screenshot" && group !== "package_screenshot") continue;
    if (isHttpUrl(c.url)) return c.url.trim();
    if (Array.isArray(c.items)) {
      for (const it of c.items) {
        if (it && typeof it === "object") {
          const u = (it as { url?: unknown }).url;
          if (isHttpUrl(u)) return u.trim();
        } else if (isHttpUrl(it)) {
          return it.trim();
        }
      }
    }
  }
  return null;
}

export type CreateQuotationInput = {
  user_id: string;
  email?: string | null;
  who_receive: string;
  phone: string;
  address: string;
  shipping_way: string;
  expected_pickup_date?: string | null;
  notes?: string | null;
  customer_source: CustomerSource;
  subtotal: number;
  shipping_fee: number;
  total_amount: number;
  items: CreateQuotationItemInput[];
  product_name_map?: Record<string, string>;
};

/** 從客製陣列抽出純文字摘要（不含圖片 URL） */
export function summarizeCustomizationsText(raw: unknown): string {
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.options)) list = o.options;
    else if (Array.isArray(o.customizations)) list = o.customizations;
  }
  const parts: string[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const c = entry as Record<string, unknown>;
    const group =
      (typeof c.group_name_zh === "string" && c.group_name_zh.trim()) ||
      (typeof c.group === "string" && c.group.trim()) ||
      "";
    const details = c.details && typeof c.details === "object" ? (c.details as Record<string, unknown>) : null;
    const option =
      (typeof c.option_name_zh === "string" && c.option_name_zh.trim()) ||
      (details && typeof details.option_name_zh === "string" && details.option_name_zh.trim()) ||
      (typeof c.option_value === "string" && c.option_value.trim()) ||
      "";
    if (group && option) parts.push(`${group}：${option}`);
    else if (option) parts.push(option);
    else if (group) parts.push(group);
  }
  return parts.join("；").slice(0, 2000);
}

function unitPriceOf(item: CreateQuotationItemInput): number {
  const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
  const total = Number(item.total_price ?? item.price ?? 0);
  return Number.isFinite(total) ? total / qty : 0;
}

function isPackageDesign(item: CreateQuotationItemInput): boolean {
  if (item.is_package_design) return true;
  const name = item.name || item.product_name || "";
  return typeof name === "string" && name.includes("包裝設計");
}

export function buildCartQuotationRows(input: CreateQuotationInput): {
  quotation_order: Record<string, unknown>;
  quotation_order_items: Record<string, unknown>[];
  pdf_input: QuotationPdfWebhookPayload;
} {
  const who = input.who_receive.trim();
  const phone = input.phone.trim();
  const address = input.address.trim();
  const shippingAddressText = `${phone}\n${address}`;
  const email = input.email?.trim() || null;
  const pickup = input.expected_pickup_date || null;
  const notes = input.notes?.trim() || null;

  const pdfLines: QuotationPdfLineItem[] = [];
  const quotation_order_items: Record<string, unknown>[] = [];

  for (const item of input.items) {
    const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
    const unit_price = unitPriceOf(item);
    const pid = item.product_id ? String(item.product_id) : "";
    const product_name =
      (pid && input.product_name_map?.[pid]) ||
      item.product_name ||
      item.name ||
      pid ||
      "未命名商品";
    const customization = summarizeCustomizationsText(item.customizations_json ?? item.customizations);
    const packageDesign = isPackageDesign(item);
    const preview_url = resolveCartItemPreviewUrl(item);

    quotation_order_items.push({
      product_name,
      quantity: qty,
      unit_price,
      preview_url,
      category: item.category || (packageDesign ? "package" : "custom_design"),
      all_requirement: {
        customization,
        note: "",
      },
      customizations_json: {
        product_id: pid || null,
        role: "cart_prequote_line",
        summary: customization || null,
        preview_url,
      },
      quantity_description: packageDesign
        ? "與訂購之甜點數量一致，如有加購盒子，則與禮盒數量一致。"
        : null,
    });

    pdfLines.push({
      product_name,
      unit_price,
      quantity: qty,
      customization: customization || undefined,
      preview_url: preview_url || undefined,
    });
  }

  const quotation_order: Record<string, unknown> = {
    status: "price_reply",
    user_id: input.user_id,
    email,
    who_receive: who,
    recipient_name: who,
    notes,
    shipping_way: input.shipping_way,
    shipping_address_text: shippingAddressText,
    expected_pickup_date: pickup,
    subtotal: input.subtotal,
    shipping_fee: input.shipping_fee,
    total_amount: input.total_amount,
    customer_source: input.customer_source,
    all_requirement: {
      source: "cart_checkout_prequote",
      customer_profile: {
        name: who,
        email: email || "",
      },
      delivery: {
        method: input.shipping_way,
        receiver: who,
        phone,
        address,
        expected_pickup_date: pickup,
      },
      service_order: {
        service_type: "custom_design",
        items: pdfLines.map((l) => `${l.product_name} x${l.quantity}`).join("\n"),
      },
    },
  };

  const itemsContentText = pdfLines.map((l) => `${l.product_name} x${l.quantity}`).join("\n");

  const pdf_input: QuotationPdfWebhookPayload = {
    email: email || undefined,
    customer_profile: {
      name: who,
      email: email || "",
      shipping_way: input.shipping_way,
      expected_pickup_date: pickup || undefined,
      shipping_address_text: shippingAddressText,
      who_receive: who,
      notes: notes || undefined,
    },
    service_order: {
      category: "custom_design",
      items: itemsContentText,
    },
    quote: {
      subtotal: input.subtotal,
      shipping_fee: input.shipping_fee,
      total_amount: input.total_amount,
    },
    customizations_json: pdfLines,
    quotation_pdf_mode: "standard",
  };

  return { quotation_order, quotation_order_items, pdf_input };
}
