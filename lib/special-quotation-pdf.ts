import type {
  QuotationPdfLineItem,
  QuotationPdfSpecialSection,
  QuotationPdfWebhookPayload,
} from "@/lib/quotation-pdf-html";

export type SpecialComboPdfLineInput = {
  product_name: string;
  unit_price: number;
  quantity: number;
  preview_url?: string;
};

export type SpecialComboPdfInput = {
  id: string;
  comboIndex: number;
  expected_pickup_date?: string | null;
  pickup_location?: string | null;
  pickup_contact_name?: string | null;
  pickup_contact_phone?: string | null;
  shipping_fee: number;
  lines: SpecialComboPdfLineInput[];
};

/** 建立特殊報價單「另開 HTML 列印」用 payload（與 buildQuotationPdfHtml 對齊） */
export function buildSpecialQuotationPdfPayload(input: {
  ordererName: string;
  contact: { email?: string | null; phone?: string | null; line_user_id?: string | null };
  combos: SpecialComboPdfInput[];
  grandSubtotal: number;
  grandShipping: number;
  grandTotal: number;
}): QuotationPdfWebhookPayload {
  const contact_display =
    [
      input.contact.email ? `Email：${input.contact.email}` : "",
      input.contact.phone ? `電話：${input.contact.phone}` : "",
      input.contact.line_user_id ? `LINE：${input.contact.line_user_id}` : "",
    ]
      .filter(Boolean)
      .join("　") || "—";

  const sections: QuotationPdfSpecialSection[] = input.combos.map((c) => {
    const lines: QuotationPdfLineItem[] = c.lines.map((l) => ({
      product_name: l.product_name,
      unit_price: l.unit_price,
      quantity: l.quantity,
      preview_url: l.preview_url,
    }));
    const subtotal = lines.reduce((s, l) => s + Number(l.unit_price || 0) * Number(l.quantity || 0), 0);
    const total = subtotal + Number(c.shipping_fee || 0);
    return {
      combo_index: c.comboIndex,
      pickup_date: c.expected_pickup_date?.trim() || undefined,
      location: c.pickup_location?.trim() || undefined,
      receiver: c.pickup_contact_name?.trim() || undefined,
      receiver_phone: c.pickup_contact_phone?.trim() || undefined,
      shipping_fee: Number(c.shipping_fee) || 0,
      subtotal,
      total,
      lines,
    };
  });

  return {
    quotation_pdf_mode: "special",
    special_quotation_pdf: {
      orderer_name: input.ordererName,
      contact_display,
      sections,
      grand: {
        subtotal: input.grandSubtotal,
        shipping_fee: input.grandShipping,
        total_amount: input.grandTotal,
      },
    },
    email: input.contact.email ?? "",
    line_user_id: input.contact.line_user_id ?? "",
    customer_profile: {
      name: input.ordererName,
      email: input.contact.email || "",
      who_receive: input.ordererName,
      notes: `特殊報價單（多組合）聯絡：${contact_display}`,
      shipping_way: "",
      expected_pickup_date: "",
      shipping_address_text: "",
    },
    service_order: { category: "custom_design", items: "特殊報價單（多訂單組合）" },
    quote: {
      subtotal: input.grandSubtotal,
      shipping_fee: input.grandShipping,
      total_amount: input.grandTotal,
    },
    customizations_json: [],
  };
}
