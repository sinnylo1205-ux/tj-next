# T&J 前端設計調整指南

本文件說明如何統一調整全網站的前端設計，包含邊框、顏色、佈局等。

---

## 1. 邊框與線條（全站淺灰，不得黑色）

### 設計原則
- 所有 grid、button、card、分隔線等邊框應使用**淺灰色**
- 禁止使用黑色邊框（`border-black`、`border-gray-900` 等）

### 調整方式

**A. 使用設計系統變數（推薦）**

在 `app/globals.css` 的 `:root` 中定義：

```css
--border: 216 12% 91%;   /* 淺灰 HSL */
--input: 216 12% 91%;
```

Tailwind 使用方式：
- `border border-border` — 一般邊框
- `border-b border-border` — 底部分隔線
- `border-t border-border` — 頂部分隔線

**B. 替換既有黑色／深色邊框**

搜尋並替換：
- `border-ink-muted/40` → `border-border`
- `border-pink-100` → `border-border`
- `border-gray-200` → `border-border`
- 任何 `border-black`、`border-gray-900` → `border-border`

**C. 元件預設**

- `Card`：已使用 `border border-border`
- `Button` outline：使用 `border-input`（與 border 同色）
- 新增元件時一律使用 `border-border` 或 `border-input`

---

## 2. 顏色系統

### 品牌色（`tailwind.config.ts` + `globals.css`）

| 變數 | 用途 |
|------|------|
| `--color-brand-50` ~ `--color-brand-600` | 主色、按鈕、強調 |
| `--color-ink` | 主要文字 |
| `--color-muted` / `ink-muted` | 次要文字 |
| `--border` | 邊框、分隔線 |

### 修改全站主色

1. 編輯 `app/globals.css` 的 `:root` 區塊
2. 調整 `--color-brand-*`、`--primary` 等 HSL 值
3. 深色模式在 `@media (prefers-color-scheme: dark)` 中調整

---

## 3. 佈局與容器

### 容器寬度

- 預設：`app/globals.css` 的 `.container` 為 `max-width: 1200px`
- 購物車等寬版：`container max-w-7xl lg:max-w-[1500px]`
- 響應式：`px-4`（手機）→ `md:px-6`（平板以上）

### 修改全站最大寬度

在 `app/globals.css`：

```css
.container {
  max-width: 1200px;  /* 改此值 */
}
```

或個別頁面用 Tailwind：`max-w-4xl`、`max-w-6xl`、`max-w-7xl` 等。

---

## 4. 購物車 Card 寬度

購物車頁面結構：

```
div.container.max-w-7xl.lg:max-w-[1500px]  ← 外層
  └── Card (無固定寬度，撐滿父層)
```

| 螢幕 | 外層 max-width | Card 實際寬度 |
|------|----------------|---------------|
| < 1024px | 1280px (max-w-7xl) | ≈ 1280px - padding |
| ≥ 1024px | 1500px | ≈ 1500px - padding |

修改方式：調整外層 `max-w-7xl` 或 `lg:max-w-[1500px]` 的 class。

---

## 5. Notice → Cart 日期傳遞

流程：**Notice 日曆選日期 → localStorage → CartContext.addToCartCustom → Cart 商品**

### 實作位置

1. **Notice（訂購須知）**：`app/product/ProductNoticeClient.tsx`
   - `handleDateSelect` 寫入 `localStorage.setItem("expected_pickup_date", format(date, "yyyy-MM-dd"))`

2. **CartContext**：`contexts/CartContext.tsx`
   - `addToCartCustom` 讀取 `localStorage.getItem("expected_pickup_date")` 並合併進 `CartItem.expected_pickup_date`

3. **客製化頁加入購物車**：`AddToCartButton`、`ClassicProduct` 等呼叫 `addToCartCustom` 時會自動帶入日期

### 修改或除錯

- 檢查 key 是否一致：`expected_pickup_date`
- 日期格式：`yyyy-MM-dd`（ISO 格式）

---

## 6. 快速搜尋與批次替換

### 找出所有邊框

```bash
rg "border-" --type-add 'ui:*.{tsx,css}' -t ui
```

### 找出可能為黑色的樣式

```bash
rg "border-black|border-gray-900|border-zinc-900|border-ink" .
```

### 統一改為設計系統邊框

將 `border-pink-100`、`border-gray-200` 等改為 `border-border`。

---

## 7. Supabase Functions 與業務邏輯

### 用戶相關（保持啟用）

- `calculate-checkout` — 結帳金額、運費、優惠碼
- `calculate-price` — 客製化價格（PriceQuantityBox / Price API）
- `notify-new-order` — n8n webhook 新訂單通知
- `ecpay-create-payment` — 綠界建立付款
- `ecpay-payment-callback` — 綠界回調
- `line-auth-callback` — LINE 登入
- `verify-line-friendship` — LINE 好友驗證
- `update-order-status` — 訂單狀態（含用戶匯款、逾時取消）

### 管理員專用（已停用）

- `delete-order` — 隱藏訂單
- `process-quotation` — 報價單轉訂單

若需啟用管理員 function，移除對應檔案中的 `_DISABLED_*` 檢查即可。

---

## 8. 建議工作流程

1. **單次調整**：直接改 `globals.css` 或個別元件
2. **全站風格**：改 `globals.css` 的 `:root` 變數
3. **新元件**：一律使用 `border-border`、`text-ink`、`text-ink-muted` 等設計系統 class
4. **驗證**：用 `rg` 搜尋 `border-black`、`border-gray-900` 確保無遺漏
