/**
 * 免用統一發票收據 HTML（與 n8n / edge 組裝邏輯對齊，供後台「等待付款」預覽下載）。
 * 動態欄位皆經 escape，避免 XSS。
 */

export type ReceiptLineItem = {
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
};

export type ReceiptAssemblyInput = {
  receiptDate: string;
  tax_title: string;
  tax_id: string;
  items: ReceiptLineItem[];
  shipping_fee: number;
  total_amount: number;
  total_amount_chinese: string;
};

const STAMP_BIG =
  "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/others/big_c.png";
const STAMP_SMALL =
  "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/others/small__c.png";

export function escapeHtmlAttr(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** 整數金額轉中文大寫（收據用，0～億級） */
export function ntdIntegerToChineseCapital(num: number): string {
  if (!Number.isFinite(num) || num < 0) return "";
  const n = Math.min(Math.floor(Math.abs(num)), 999999999);
  if (n === 0) return "零元整";

  const DIGITS = ["零", "壹", "貳", "參", "肆", "伍", "陸", "柒", "捌", "玖"] as const;
  const UNITS4 = ["", "拾", "佰", "仟"] as const;
  const SECTIONS = ["", "萬", "億"] as const;

  function fourToZh(chunk: number): string {
    if (chunk === 0) return "";
    let out = "";
    let lastWasZero = false;
    for (let i = 3; i >= 0; i--) {
      const d = Math.floor(chunk / 10 ** i) % 10;
      if (d === 0) {
        if (out && !lastWasZero) {
          out += DIGITS[0];
          lastWasZero = true;
        }
        continue;
      }
      lastWasZero = false;
      if (d === 1 && i === 1) out += "拾";
      else out += DIGITS[d] + UNITS4[i];
    }
    return out.replace(/零+$/g, "");
  }

  let remaining = n;
  const parts: string[] = [];
  for (let s = 0; s < 3 && remaining > 0; s++) {
    const chunk = remaining % 10000;
    remaining = Math.floor(remaining / 10000);
    if (chunk !== 0) {
      parts.unshift(fourToZh(chunk) + SECTIONS[s]);
    }
  }

  let body = parts.join("") || DIGITS[0];
  body = body.replace(/^壹拾/g, "拾");
  return `${body}元整`;
}

export function buildReceiptHtml(data: ReceiptAssemblyInput): string {
  const receiptDate = escapeHtmlAttr(data.receiptDate || "");
  const taxTitle = escapeHtmlAttr(data.tax_title || "");
  const taxId = escapeHtmlAttr(data.tax_id || "");
  const totalChinese = escapeHtmlAttr(data.total_amount_chinese || "");
  const shippingFee = Number(data.shipping_fee) || 0;
  const totalAmount = Number(data.total_amount) || 0;

  const items: ReceiptLineItem[] = [...(data.items || [])].map((row) => ({
    product_name: String(row.product_name ?? ""),
    quantity: Number(row.quantity) || 0,
    unit_price: Number(row.unit_price) || 0,
    subtotal: Number(row.subtotal) || 0,
  }));

  if (shippingFee > 0) {
    items.push({
      product_name: "運費",
      quantity: 1,
      unit_price: shippingFee,
      subtotal: shippingFee,
    });
  }

  let itemRows = "";
  let rowCount = 0;

  items.forEach((item, index) => {
    const name = escapeHtmlAttr(item.product_name);
    const qty = escapeHtmlAttr(String(item.quantity));
    const up = escapeHtmlAttr(String(item.unit_price));
    const st = escapeHtmlAttr(String(item.subtotal));
    if (index === 0) {
      itemRows += `
      <tr>
        <td>${name}</td>
        <td>${qty}</td>
        <td>${up}</td>
        <td>${st}</td>
        <td rowspan="6" class="stamp-cell">
          <img src="${STAMP_BIG}" class="big-stamp" alt="" />
        </td>
      </tr>
    `;
    } else {
      itemRows += `
      <tr>
        <td>${name}</td>
        <td>${qty}</td>
        <td>${up}</td>
        <td>${st}</td>
      </tr>
    `;
    }
    rowCount++;
  });

  while (rowCount < 6) {
    itemRows += `
    <tr>
      <td>&nbsp;</td>
      <td></td>
      <td></td>
      <td></td>
    </tr>
  `;
    rowCount++;
  }

  const totalAmountStr = escapeHtmlAttr(String(totalAmount));

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8" />

<style>
@page { size: A4; margin: 20mm; }

body {
  margin: 0;
  font-family: "Noto Sans TC", sans-serif;
}

.receipt-wrapper {
  width: 150mm;
  height: 100mm;
  margin: 0 auto;
  padding: 6mm;
  box-sizing: border-box;
  border: 2px solid #000;
}

.title {
  text-align: center;
  font-size: 20px;
  font-weight: 900;
  letter-spacing: 2px;
  border-bottom: 2px solid #000;
  padding-bottom: 4px;
  margin-bottom: 6px;
}

.header-info {
  font-size: 12px;
  font-weight: 700;
  line-height: 1.4;
  margin-bottom: 6px;
}

.main-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  border: 2px solid #000;
  font-size: 11px;
}

.main-table th,
.main-table td {
  border: 1px solid #000;
  padding: 3px;
  text-align: center;
}

.main-table th {
  font-weight: 900;
}

.stamp-cell {
  width: 28%;
  vertical-align: middle;
}

.big-stamp {
  width: 75%;
}

.bottom-total-cell {
  height: 8mm;
  text-align: center;
  vertical-align: middle;
}

.cash-cell {
  position: relative;
  height: 8mm;
  padding: 0;
}

.total-text {
  font-family: "DFKai-SB", "標楷體", serif;
  font-size: 14px;
  font-weight: 700;
  transform: scaleX(0.85);
  display: inline-block;
  letter-spacing: 1px;
  white-space: nowrap;
}

.cash-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 16mm;
}

.cash-box {
  border: 2px solid #000;
  padding: 3px 6px;
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
  line-height: 1;
}

.small-stamp {
  width: 10mm;
  height: auto;
}
</style>
</head>

<body>

<div class="receipt-wrapper">

<div class="title">
T&amp;J客製化甜點　免用統一發票收據
</div>

<div class="header-info">
日期：${receiptDate}<br/>
買受人：${taxTitle}<br/>
統一編號：${taxId}
</div>

<table class="main-table">

<tr>
  <th style="width:30%">品名</th>
  <th style="width:10%">數量</th>
  <th style="width:12%">單價</th>
  <th style="width:12%">總價</th>
  <th>收據專用章</th>
</tr>

${itemRows}

<tr>
  <td colspan="4" class="bottom-total-cell">
    <div class="total-text">
      合計新臺幣　${totalChinese}（${totalAmountStr}元）
    </div>
  </td>

  <td class="cash-cell">
    <div class="cash-wrapper">
      <div class="cash-box">銀貨兩訖</div>
      <img src="${STAMP_SMALL}" class="small-stamp" alt="" />
    </div>
  </td>
</tr>

</table>

</div>

</body>
</html>`;
}

export function triggerDownloadHtmlFile(html: string, filename: string): void {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
