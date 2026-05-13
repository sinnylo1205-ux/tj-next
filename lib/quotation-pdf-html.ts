/**
 * 報價單 PDF 用 HTML（與 process-quotation → n8n webhook payload 結構對齊）。
 * 輸出前對動態字串做 escape，避免 XSS。
 */

import { escapeHtmlAttr } from "@/lib/receipt-html";

/**
 * 列印→PDF 時若後備僅 Arial 等西文，中文常變空白。需含系統 CJK + Noto（由 head link 載入）。
 */
const QUOTATION_FONT_STACK =
  '"Noto Sans TC","PingFang TC","PingFang SC","Hiragino Sans GB","Microsoft JhengHei","微軟正黑體","Heiti TC","Apple LiGothic Medium","Noto Sans CJK TC",sans-serif';

export type QuotationPdfLineItem = {
  product_name: string;
  unit_price: number;
  quantity: number;
  preview_url?: string;
  why_price?: string;
  /** 與 quotation_order_items.all_requirement 對齊 */
  customization?: string;
  note?: string;
};

/** 特殊報價單 PDF：每一訂單組合一區塊 */
export type QuotationPdfSpecialSection = {
  combo_index: number;
  pickup_date?: string;
  location?: string;
  receiver?: string;
  receiver_phone?: string;
  shipping_fee: number;
  subtotal: number;
  total: number;
  lines: QuotationPdfLineItem[];
};

/** 與 Edge `webhookPayload` 一致，供單獨開立報價單預覽／列印 */
export type QuotationPdfWebhookPayload = {
  email?: string;
  line_user_id?: string;
  customer_profile: {
    name: string;
    email: string;
    shipping_way?: string;
    expected_pickup_date?: string;
    shipping_address_text?: string;
    who_receive?: string;
    notes?: string;
  };
  service_order: {
    category: string;
    items: string;
  };
  quote: {
    subtotal: number;
    shipping_fee: number;
    total_amount: number;
  };
  customizations_json: QuotationPdfLineItem[];
  /** 為 "special" 時走多組合版面（與一般報價互斥使用 middle 區塊邏輯） */
  quotation_pdf_mode?: "standard" | "special";
  special_quotation_pdf?: {
    orderer_name: string;
    contact_display: string;
    sections: QuotationPdfSpecialSection[];
    grand: { subtotal: number; shipping_fee: number; total_amount: number };
  };
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const hasValue = (v: unknown): boolean =>
  v !== null &&
  v !== undefined &&
  v !== "" &&
  !(Array.isArray(v) && v.length === 0);

const safeRows = (rows: string[]) => rows.filter((r) => r && r.trim() !== "").join("");

function safeHttpUrl(url: string): string | null {
  const t = url.trim();
  if (t.startsWith("https://") || t.startsWith("http://")) return t;
  return null;
}

function normalizePhoneFromNotes(notes: string | undefined): string {
  const rawPhone = notes?.match(/聯絡電話：([^\n]+)/)?.[1] || "";
  return rawPhone
    .replace(/、/g, ",")
    .replace(/[^\d#\-+(),]/g, "")
    .replace(/,+/g, ",")
    .replace(/^,|,$/g, "")
    .replace(/,/g, "，")
    .trim();
}

function buildServiceOrderBlocks(body: QuotationPdfWebhookPayload): string {
  const itemsText = body.service_order?.items || "";
  const catRaw = (body.service_order?.category || "").toLowerCase();

  const service_order = {
    category: catRaw,
    items_text: itemsText,
    GiftBox:
      catRaw === "giftbox"
        ? {
            budget_per_box: itemsText.match(/每盒預算[:：]\s*([^,，）]+)/)?.[1] || "",
            contents: itemsText,
            customization_options: itemsText.match(/客製化選項[:：]\s*([^）]+)/)?.[1] || "",
            design_concept: itemsText.match(/設計概念[:：]\s*([^,，）]+)/)?.[1] || "",
            reference_files: itemsText.match(/https?:\/\/[^\s，）]+/)?.[0] || "",
          }
        : null,
    candyBar:
      catRaw === "candy_bar" || catRaw === "candybar"
        ? {
            budget_range: itemsText.match(/預算範圍[:：]\s*([^,，）]+)/)?.[1] || "",
            design_concept: itemsText.match(/設計概念[:：]\s*([^,，）]+)/)?.[1] || "",
            items_required: itemsText.match(/需求品項[:：]\s*([^,，）]+)/)?.[1] || "",
            services_required: itemsText.match(/需要的服務[:：]\s*([^）]+)/)?.[1] || "",
          }
        : null,
  };

  const orderBlocks: string[] = [];

  if (service_order.category === "custom_design" && hasValue(service_order.items_text)) {
    const formattedItems = escapeHtml(
      service_order.items_text
        .split("）,")
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => (t.endsWith("）") ? t : `${t}）`))
        .join("\n\n"),
    ).replace(/\n\n/g, "<br/><br/>");

    orderBlocks.push(`
  <h3>客製化單品</h3>
  <p>${formattedItems.replace(/\n/g, "<br/>")}</p>
`);
  }

  if (service_order.GiftBox) {
    const g = service_order.GiftBox;
    const row = (label: string, value: string) =>
      hasValue(value)
        ? `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(String(value))}</td></tr>`
        : "";
    const table = `
      <table class="info-table">
        ${safeRows([
          row("每盒預算", g.budget_per_box),
          row("內容物", g.contents),
          row("客製項目", g.customization_options),
          row("設計構想", g.design_concept),
          row("參考資料", g.reference_files),
        ])}
      </table>
    `;
    orderBlocks.push(`<h3>禮盒 / 餐盒</h3>${table}`);
  }

  if (service_order.candyBar) {
    const d = service_order.candyBar;
    const row = (label: string, value: string) =>
      hasValue(value)
        ? `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(String(value))}</td></tr>`
        : "";
    const table = `
    <table class="info-table">
      ${safeRows([
        row("預算區間", d.budget_range),
        row("設計概念", d.design_concept),
        row("需求品項", d.items_required),
        row("需要的服務", d.services_required),
      ])}
    </table>
  `;
    orderBlocks.push(`<h3>甜點佈置 / Dessert Bar</h3>${table}`);
  }

  return orderBlocks.length > 0 ? orderBlocks.join("<br/>") : "<p>（本次未填寫訂購內容）</p>";
}

function buildSpecialQuotationBasicInfo(sp: NonNullable<QuotationPdfWebhookPayload["special_quotation_pdf"]>): string {
  const row = (label: string, value: unknown) =>
    hasValue(value)
      ? `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(typeof value === "string" ? value : String(value))}</td></tr>`
      : "";
  return `
  <table class="info-table">
    ${safeRows([
      row("訂購人（單位）", sp.orderer_name),
      row("聯絡方式", sp.contact_display),
    ])}
  </table>
`;
}

function formatMoney(n: number): string {
  return Number.isFinite(n) ? n.toLocaleString("zh-TW") : "0";
}

/** 訂單組合一、二、三…（1-based） */
function comboOrdinalChinese(index1Based: number): string {
  const table: Record<number, string> = {
    1: "一",
    2: "二",
    3: "三",
    4: "四",
    5: "五",
    6: "六",
    7: "七",
    8: "八",
    9: "九",
    10: "十",
    11: "十一",
    12: "十二",
    13: "十三",
    14: "十四",
    15: "十五",
    16: "十六",
    17: "十七",
    18: "十八",
    19: "十九",
    20: "二十",
    21: "二十一",
    22: "二十二",
    23: "二十三",
    24: "二十四",
    25: "二十五",
    26: "二十六",
    27: "二十七",
    28: "二十八",
    29: "二十九",
    30: "三十",
  };
  return table[index1Based] ?? String(index1Based);
}

function buildSpecialQuotationComboSections(sp: NonNullable<QuotationPdfWebhookPayload["special_quotation_pdf"]>): string {
  const blocks = sp.sections.map((sec) => {
    const comboOrdinal = comboOrdinalChinese(Math.max(1, Number(sec.combo_index) || 1));
    const lineRows = sec.lines
      .map((item, index) => {
        const up = Number(item.unit_price);
        const qty = Number(item.quantity);
        const lineTotal = (Number.isFinite(up) ? up : 0) * (Number.isFinite(qty) ? qty : 0);
        const cust = hasValue(item.customization)
          ? `<div style="margin-top:6px;color:#444;font-size:13px;line-height:1.5;"><span style="color:#666;">客製化需求：</span>${escapeHtml(String(item.customization)).replace(/\n/g, "<br/>")}</div>`
          : "";
        const noteBlock = hasValue(item.note)
          ? `<div style="margin-top:4px;color:#444;font-size:13px;line-height:1.5;"><span style="color:#666;">備註：</span>${escapeHtml(String(item.note)).replace(/\n/g, "<br/>")}</div>`
          : "";
        const whyBlock = hasValue(item.why_price)
          ? `<div style="margin-top:4px;color:#555;font-size:13px;line-height:1.5;"><span style="color:#666;">報價備註：</span>${escapeHtml(String(item.why_price)).replace(/\n/g, "<br/>")}</div>`
          : "";
        return `
        <div style="margin-bottom:10px;">
          <strong>${escapeHtml(`品項 ${index + 1}：${item.product_name || ""}`)}</strong><br/>
          單價：NT$ ${formatMoney(up)} × ${Number.isFinite(qty) ? qty : 0} ＝ NT$ ${formatMoney(lineTotal)}
          ${cust}${noteBlock}${whyBlock}
        </div>`;
      })
      .join("");

    const pickupRows = safeRows([
      hasValue(sec.pickup_date)
        ? `<tr><th>${escapeHtml("取件日期")}</th><td>${escapeHtml(String(sec.pickup_date))}</td></tr>`
        : "",
      hasValue(sec.location)
        ? `<tr><th>${escapeHtml("地點")}</th><td>${escapeHtml(String(sec.location))}</td></tr>`
        : "",
      hasValue(sec.receiver)
        ? `<tr><th>${escapeHtml("該地點取件人")}</th><td>${escapeHtml(String(sec.receiver))}</td></tr>`
        : "",
      hasValue(sec.receiver_phone)
        ? `<tr><th>${escapeHtml("取件人聯絡方式")}</th><td>${escapeHtml(String(sec.receiver_phone))}</td></tr>`
        : "",
      `<tr><th>${escapeHtml("運費")}</th><td>NT$ ${formatMoney(sec.shipping_fee)}</td></tr>`,
      `<tr><th>${escapeHtml("組合小計")}</th><td>NT$ ${formatMoney(sec.subtotal)}</td></tr>`,
      `<tr><th>${escapeHtml("組合總計")}</th><td>NT$ ${formatMoney(sec.total)}</td></tr>`,
    ]);

    return `
    <h3 style="margin-top:0;color:#7a4f52;">訂單組合${comboOrdinal}</h3>
    <table class="info-table">${pickupRows}</table>
    <div style="margin-top:12px;">${lineRows || "<p>（無品項）</p>"}</div>`;
  });

  return blocks.join('<hr style="margin:20px 0;border:none;border-top:1px solid #ebd9da;" />');
}

function buildSpecialQuotationQuoteSection(sp: NonNullable<QuotationPdfWebhookPayload["special_quotation_pdf"]>): string {
  const g = sp.grand;
  return `
  <table class="info-table">
    ${safeRows([
      `<tr><th>${escapeHtml("全單小計（各組合品項加總）")}</th><td>NT$ ${formatMoney(g.subtotal)}</td></tr>`,
      `<tr><th>${escapeHtml("全單運費加總")}</th><td>NT$ ${formatMoney(g.shipping_fee)}</td></tr>`,
      `<tr><th>${escapeHtml("報價總額")}</th><td><strong>NT$ ${formatMoney(g.total_amount)}</strong></td></tr>`,
    ])}
  </table>
`;
}

/**
 * 由與 n8n 相同的 webhook payload 產出完整 HTML 文件（可另開視窗列印或存檔）。
 */
export function buildQuotationPdfHtml(body: QuotationPdfWebhookPayload): string {
  const sp = body.special_quotation_pdf;
  const isSpecial = body.quotation_pdf_mode === "special" && !!sp;

  const cp = body.customer_profile || ({} as QuotationPdfWebhookPayload["customer_profile"]);
  const phone = normalizePhoneFromNotes(cp.notes);

  const delivery = {
    method: cp.shipping_way || "",
    address: cp.shipping_address_text || "",
    receiver: cp.who_receive || "",
    phone,
    black_date: cp.expected_pickup_date || "",
    black_date_time: "",
    special_date: "",
    special_date_time: "",
    self_pick_date: "",
    self_pick_time: "",
  };

  const quote = {
    total_price: body.quote?.total_amount ?? "",
    subtotal: body.quote?.subtotal ?? "",
    shipping_fee: body.quote?.shipping_fee ?? "",
    items: body.customizations_json || [],
  };

  const today = new Date().toLocaleDateString("zh-TW");

  const row = (label: string, value: unknown, opts?: { rawHtml?: boolean }) =>
    hasValue(value)
      ? `<tr><th>${escapeHtml(label)}</th><td>${
          opts?.rawHtml ? String(value) : escapeHtml(typeof value === "string" ? value : String(value))
        }</td></tr>`
      : "";

  const basicInfo = isSpecial && sp ? buildSpecialQuotationBasicInfo(sp) : `
  <table class="info-table">
    ${safeRows([
      row("姓名", cp.name || ""),
      row("Email", cp.email || ""),
      row("用途", ""),
      row("配送方式", delivery.method),
      row("黑貓送達日期", delivery.black_date),
      row("黑貓送達時段", delivery.black_date_time),
      row("專件配送日期", delivery.special_date),
      row("專件抵達時間", delivery.special_date_time),
      row("自取日期", delivery.self_pick_date),
      row("自取時間", delivery.self_pick_time),
      row("收件人", delivery.receiver),
      row("聯絡電話", delivery.phone),
      row("配送地址", delivery.address),
    ])}
  </table>
`;

  const orderContent = isSpecial && sp
    ? `<p style="margin:0;color:#666;font-size:14px;line-height:1.65;">本報價為<strong>特殊報價單</strong>（多訂單組合）。各組合之取件地點、聯絡人、品項與金額，請見下方<strong>報價結果</strong>區塊內之<strong>報價明細</strong>。</p>`
    : buildServiceOrderBlocks(body);

  const quoteBreakdownHTML = quote.items
    .map((item, index) => {
      const title = `第 ${index + 1} 項：${escapeHtml(item.product_name || "")}`;
      const up = Number(item.unit_price);
      const qty = Number(item.quantity);
      const priceLine = `單價：NT$ ${Number.isFinite(up) ? up.toLocaleString("zh-TW") : "0"} × ${Number.isFinite(qty) ? qty : 0}`;
      const reason = item.why_price ? escapeHtml(item.why_price).replace(/\n/g, "<br/>") : "";
      return `
      <div style="margin-bottom:12px;">
        <strong>${title}</strong><br/>
        ${priceLine}<br/>
        ${reason}
      </div>
    `;
    })
    .join("");

  const previewImagesHTML = quote.items
    .filter((i) => i.preview_url && safeHttpUrl(i.preview_url))
    .map((item, index) => {
      const href = escapeHtmlAttr(safeHttpUrl(item.preview_url!)!);
      return `
    <div style="margin-bottom:6px;">
      合成圖 ${index + 1}：
      <a href="${href}" target="_blank" rel="noopener noreferrer">點我查看</a>
    </div>
  `;
    })
    .join("");

  const totalNum = Number(quote.total_price);
  const subNum = Number(quote.subtotal);
  const shipNum = Number(quote.shipping_fee);

  const quoteSection =
    isSpecial && sp
      ? `
  <div class="special-quote-detail" style="margin-bottom:18px;">
    <h3 style="margin:0 0 12px 0;color:#5a3d3f;font-size:17px;">報價明細（依訂單組合）</h3>
    ${buildSpecialQuotationComboSections(sp)}
  </div>
  ${buildSpecialQuotationQuoteSection(sp)}
`
      : `
  <table class="info-table">
    ${safeRows([
      row(
        "最終價格",
        hasValue(quote.total_price) && Number.isFinite(totalNum)
          ? `NT$ ${totalNum.toLocaleString("zh-TW")}`
          : "",
      ),
      row("報價明細", quoteBreakdownHTML, { rawHtml: true }),
      row(
        "小計",
        hasValue(quote.subtotal) && Number.isFinite(subNum) ? `NT$ ${subNum.toLocaleString("zh-TW")}` : "",
      ),
      row(
        "運費",
        hasValue(quote.shipping_fee) && Number.isFinite(shipNum)
          ? `NT$ ${shipNum.toLocaleString("zh-TW")}`
          : "NT$ 0",
      ),
      row("合成圖預覽", previewImagesHTML, { rawHtml: true }),
    ])}
  </table>
`;

  const section = (title: string, content: string) =>
    content.trim()
      ? `
      <div class="section">
        <h2>${escapeHtml(title)}</h2>
        ${content}
      </div>
    `
      : "";

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700&display=block" rel="stylesheet" />
<style>
  body {
    font-family: ${QUOTATION_FONT_STACK};
    padding: 40px;
    background: #fafafa;
    color: #333;
  }

 .header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 28px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 18px;
}

.logo {
  width: 70px;
}

.brand h1 {
  font-size: 28px;
  font-weight: 600;
  color: #5a3d3f;
  letter-spacing: 1px;
}

  .date {
    font-size: 14px;
    color: #666;
  }

  .section {
    background: #fff;
    border-radius: 12px;
    padding: 24px;
    margin-bottom: 26px;
    border-top: 6px solid #ebd9da;
  }

  h2 {
    margin-top: 0;
    color: #5a3d3f;
    font-size: 18px;
  }

  h3 {
    color: #7a4f52;
  }

  table.info-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 8px;
  }

  table.info-table th,

  table.info-table td {
    border: 2px solid #ffffff;
    padding: 10px;
    vertical-align: top;
  }

  table.info-table th {
    width: 30%;
    background: #f3e6e7;
    text-align: left;
    color: #5a3d3f;
  }

  table.info-table td {
    background: #fafafa;
  }

  .footer {
    background: #fff;
    border-radius: 12px;
    padding: 24px;
    border: 3px solid #ebd9da;
    margin-top: 24px;
  }

  .notice {
    margin-top: 28px;
    padding: 16px 18px;
    border-radius: 10px;
    background: #fff6f6;
    border: 1.5px solid #f1c6c6;
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }

  .notice-icon {
    font-size: 22px;
    line-height: 1;
    margin-top: 2px;
  }

  .notice-text {
    font-size: 15px;
    line-height: 1.6;
    color: #5a3d3f;
  }

  .signature-area {
  margin-top: 32px;
  display: flex;
  justify-content: space-between;
  gap: 40px;
}

.signature-block {
  flex: 1;
}

.signature-title {
  font-size: 15px;
  color: #5a3d3f;
  margin-bottom: 12px;
  font-weight: 500;
}

.signature-line {
  border-bottom: 2px solid #5a3d3f;
  height: 40px;
}

.signature-date-line {
  border-bottom: 2px solid #5a3d3f;
  height: 40px;
  width: 70%;
}

/* ========== 列印／另存 PDF ==========
   難點：Chrome 列印引擎 ≠ 螢幕排版；flex/float 易壞；對「整塊」設 page-break-inside:avoid
   若內容高一頁，常裁切或留白。此處用 grid、大區塊允許分頁、小區塊（notice）才 avoid。 */
@page {
  size: A4;
  margin: 10mm;
}

@media print {
  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    box-sizing: border-box !important;
  }

  /* 列印引擎需明確可列印中文的字族，否則易退回無 CJK 的字體 */
  body,
  body * {
    font-family: ${QUOTATION_FONT_STACK} !important;
  }

  html,
  body {
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    background: #fafafa !important;
    color: #333 !important;
    overflow: visible !important;
  }

  body {
    padding: 6mm 8mm 10mm !important;
    font-size: 10.5pt !important;
  }

  /* 列印用 Grid：比 float／flex 在 Chrome 列印預覽穩定 */
  .header {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: start !important;
    gap: 8pt !important;
    position: static !important;
    float: none !important;
    width: 100% !important;
    min-height: 0 !important;
    margin-bottom: 14pt !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }

  .brand {
    display: grid !important;
    grid-template-columns: auto minmax(0, 1fr) !important;
    align-items: center !important;
    gap: 10pt !important;
    float: none !important;
    width: auto !important;
    max-width: 100% !important;
    min-width: 0 !important;
  }

  .brand .logo {
    float: none !important;
    width: 48pt !important;
    height: auto !important;
    max-width: 100% !important;
  }

  .brand h1 {
    margin: 0 !important;
    padding: 0 !important;
    font-size: 17pt !important;
    line-height: 1.2 !important;
    overflow: visible !important;
    word-break: break-word !important;
  }

  .header > .date {
    position: static !important;
    float: none !important;
    text-align: right !important;
    white-space: nowrap !important;
    font-size: 10pt !important;
    padding-top: 4pt !important;
    max-width: none !important;
  }

  /* 勿對整塊長內容禁止分頁，否則 Chrome 常裁切或擠壞（資訊「跑不出來」主因之一） */
  .section {
    overflow: visible !important;
    max-height: none !important;
    break-inside: auto !important;
    page-break-inside: auto !important;
    margin-bottom: 14pt !important;
    box-shadow: none !important;
  }

  .footer {
    overflow: visible !important;
    max-height: none !important;
    break-inside: auto !important;
    page-break-inside: auto !important;
    margin-top: 12pt !important;
    box-shadow: none !important;
  }

  .notice {
    display: block !important;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }

  .notice-icon {
    display: inline-block !important;
    vertical-align: top !important;
    margin-right: 8px !important;
  }

  .notice-text {
    display: inline-block !important;
    max-width: calc(100% - 40px) !important;
    vertical-align: top !important;
  }

  .signature-area {
    display: table !important;
    width: 100% !important;
    table-layout: fixed !important;
    border-collapse: separate !important;
    border-spacing: 12pt 0 !important;
    margin-top: 12pt !important;
  }

  .signature-block {
    display: table-cell !important;
    width: 50% !important;
    vertical-align: top !important;
    float: none !important;
  }

  table.info-table th,
  table.info-table td {
    border: 1px solid #c9b5b7 !important;
  }

  table.info-table th {
    background: #f3e6e7 !important;
  }

  table.info-table td {
    background: #fafafa !important;
  }

  table.info-table {
    break-inside: auto !important;
    page-break-inside: auto !important;
  }

  a {
    color: #5a3d3f !important;
    text-decoration: underline !important;
  }
}

</style>
</head>

<body>

<div class="header">
  <div class="brand">

   <img
  src="https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/logo.png"
  class="logo"
  alt="T&amp;J"
/>
    <h1>T&amp;J 客製化甜點</h1>
  </div>
  <div class="date">報價日期：${escapeHtml(today)}</div>
</div>

${section("基本資訊", basicInfo)}
${section(isSpecial ? "訂單組合說明" : "訂購內容", orderContent)}
${section("報價結果", quoteSection)}

<div class="footer">
  <table class="info-table">
    <tr><th>銀行</th><td>國泰世華 北新分行（013）</td></tr>
    <tr><th>帳號</th><td>226-03-500474-1</td></tr>
    <tr><th>戶名</th><td>舒喜坊 倪筠舒</td></tr>
  </table>

  <div class="notice">
    <div class="notice-icon">⚠️</div>
    <div class="notice-text">
      如您對於本報價單內容沒有疑問，可直接完成匯款並回覆「<strong>匯款末五碼</strong>」，<br/>
      我們將立即為您排入製作訂單，<strong>匯款視同訂單建立</strong>。
    </div>
  </div>
  <div class="signature-area">
  <div class="signature-block">
    <div class="signature-title">客戶簽章</div>
    <div class="signature-line"></div>
  </div>

  <div class="signature-block">
    <div class="signature-title">簽署日期</div>
    <div class="signature-date-line"></div>
  </div>
</div>
</div>

</body>
</html>`;
}
