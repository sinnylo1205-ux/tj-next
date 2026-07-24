/**
 * 管理員「對話／截圖 → 報價草稿」：OpenAI 結構化輸出與正規化（不寫入 DB，由 API 僅回傳草稿）。
 *
 * 環境變數：
 * - OPENAI_API_KEY（必填）
 * - OPENAI_QUOTATION_MODEL（選填，預設 gpt-4o-mini；圖多可改 gpt-4o）
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { QUOTATION_KIND_SPECIAL, isSpecialQuotation, parseComboIdFromQuotationItem } from "@/lib/special-quotation";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const quotationDraftImageSchema = z.object({
  base64: z.string().min(80),
  mime_type: z.string().max(80).optional().default("image/jpeg"),
});

export const quotationDraftRequestSchema = z.object({
  text: z.string().default(""),
  /** @deprecated 單張截圖；請改用 images[]。仍支援以相容舊前端。 */
  image_base64: z.string().optional(),
  image_mime_type: z.string().max(80).optional().default("image/jpeg"),
  /** 多張截圖（建議）；與 image_base64 可並存，會合併送入模型 */
  images: z.array(quotationDraftImageSchema).max(8).optional(),
  context_year: z
    .number()
    .int()
    .min(2000)
    .max(2100)
    .optional()
    .describe("對話未寫年份時，用於補全日期（例如 4/2 → YYYY-04-02）"),
});

export type QuotationDraftRequest = z.infer<typeof quotationDraftRequestSchema>;

export type QuotationDraftImageInput = {
  base64: string;
  mimeType: string;
};

/** 合併 images[] 與舊版單張 image_base64，上限 8 張 */
export function collectQuotationDraftImages(body: QuotationDraftRequest): QuotationDraftImageInput[] {
  const out: QuotationDraftImageInput[] = [];
  for (const img of body.images ?? []) {
    if (img.base64?.trim()) {
      out.push({
        base64: img.base64.trim(),
        mimeType: img.mime_type || "image/jpeg",
      });
    }
  }
  if (body.image_base64?.trim()) {
    out.push({
      base64: body.image_base64.trim(),
      mimeType: body.image_mime_type || "image/jpeg",
    });
  }
  return out.slice(0, 8);
}

export type ProductCatalogRow = { id: string; name: string; category: string; price: number };

export type QuotationDraftResponse = {
  quotation_kind: "special" | "general";
  rationale_zh: string;
  warnings: string[];
  /** 可直接用於 supabase.from("quotation_orders").insert(...) 的欄位（不含 id） */
  quotation_order: Record<string, unknown>;
  /** 可直接用於 bulk insert quotation_order_items（不含 quotation_order_id，由前端補） */
  quotation_order_items: Record<string, unknown>[];
  /** 與 quotation_order.all_requirement 相同參考，方便前端預覽 */
  all_requirement: Record<string, unknown>;
};

const SYSTEM_PROMPT = `你是甜點／禮盒電商後台的報價草稿助理。管理員會貼上與客戶的對話文字，或附上**一張或多張**對話截圖（多圖時請合併解讀，後段截圖可覆寫前段共識）。
請輸出「唯一一個 JSON 物件」，不要 markdown，不要註解。

## 判斷 special vs general
- **special**：同一需求內有多個「不同取貨／送達地點、或不同聯絡人、或不同日期」且語意上要拆成多筆製作／物流（例如多門市、多批次日期）。
- **general**：單一收件脈絡、單一配送與日程即可涵蓋。

## special 時 all_requirement 必須包含
- quotation_kind 固定字串 "special"
- customer_profile: { name, email }（可從對話推測，不確定則空字串）
- delivery: { method, address, receiver, phone }（表頭摘要，可空字串）
- special_quotation: {
    orderer_name: string,
    contact: { email, phone, line_user_id }（line_user_id 無則 null）,
    combos: 陣列。每個元素必須有：
      id: **合法 UUID 字串**（若無把握請仍輸出一個新 UUID，不要用人類可讀 id）,
      expected_pickup_date: "YYYY-MM-DD" 或 null,
      pickup_location, pickup_contact_name, pickup_contact_phone（可 null）,
      shipping_fee: 數字或 null（該組運費；未約定則 null 或 0，勿臆測非對話所載之運費）。
      line_subtotal、line_total:
        - **僅當**該 combo 底下「每一筆」quotation_order_items 都有**數字** unit_price 時，才由你計算並填數字：
          line_subtotal = Σ(unit_price × quantity)；shipping_fee 若為 null 則以 0 加總；line_total = line_subtotal + shipping_fee。
        - 若任一品項 unit_price 為 null／缺漏（代表詢價待補價），該 combo 的 **line_subtotal 與 line_total 必須為 null**，禁止用猜的數字填滿。
  }
- **不要**輸出 converted_order_ids。

## general 時 all_requirement 必須包含
- **不要**設 quotation_kind 為 "special"，**不要** special_quotation 區塊。
- customer_profile: { name, email }
- delivery: { method, address, receiver, phone }
- service_order: { service_type: "custom_design"|"giftbox"|"candy_bar" 擇一；selections: 字串陣列（詢價重點）}

## quotation_order_items（陣列）
每一列代表一個報價品項：
- product_name: string（若無法辨識具體商品名稱請填「待補充」，勿只填「品項」「商品」等泛泛字眼）
- quantity: number（至少 1）
- unit_price: number 或 null（詢價未談價則 null）
- category: string（請優先使用商品庫的 category；不確定則 "custom_design"）
- product_id: 若能在「商品庫」對應到 id 則填 UUID，否則 null
- **special 時必填**：combo_id 字串，必須等於該品項所屬 combo 在 special_quotation.combos[].id
- customizations_json:
   - special: { combo_id, role: "special_quotation_line", product_id }（product_id 可與欄位相同）
   - general: null 或 {}
- all_requirement: **每一品項必填物件**。至少含 **customization**: string（該品項客製／規格重點，摘自對話；無可填 ""）。可含 **note**: string（備註）。special 與 general 皆同；勿只把需求寫在第一筆而後續品項留空。

**僅有截圖、無純文字時仍必須**：從圖中辨識門市／數量／日期／聯絡方式，輸出 **非空** 的 quotation_order_items；若有多張截圖請綜合所有畫面；special 時每個 combo 至少一筆品項（可用 product_name 描述「禮盒／包數」等，quantity 為數字）。**禁止**輸出空的 quotation_order_items 陣列。

**鍵名必須完全一致**：根物件務必使用 **quotation_orders**（複數 s）與 **quotation_order_items**（複數），勿用 quotation_order、items、lines 等替代鍵。

**結構範例（special，節錄；品項皆無單價時 combo 金額須為 null）**：
{"quotation_kind":"special","rationale_zh":"…","quotation_orders":{"status":"price_asked","email":"a@b.com","who_receive":"王小姐","subtotal":null,"shipping_fee":240,"total_amount":null},"all_requirement":{"quotation_kind":"special","special_quotation":{"orderer_name":"王小姐","contact":{"email":"a@b.com","phone":null,"line_user_id":null},"combos":[{"id":"550e8400-e29b-41d4-a716-446655440001","expected_pickup_date":"2026-05-01","pickup_location":"台北店","pickup_contact_name":"李小姐","pickup_contact_phone":"0911222333","shipping_fee":240,"line_subtotal":null,"line_total":null}]}},"quotation_order_items":[{"product_name":"客製禮盒A","quantity":10,"unit_price":null,"category":"custom_design","product_id":null,"combo_id":"550e8400-e29b-41d4-a716-446655440001","customizations_json":{"combo_id":"550e8400-e29b-41d4-a716-446655440001","role":"special_quotation_line","product_id":null},"all_requirement":{"customization":"對話中與此品項有關之客製說明","note":""}}]}

## quotation_orders（物件，不含資料庫 id）
欄位與後台一致：
- status: 建議 "price_asked"（待填價）或若對話已含明確報價則 "price_reply"
- email, who_receive, notes, line_user_id, user_id（無則 null）,
- shipping_way, shipping_address_text, expected_pickup_date（無則 null）,
- subtotal, shipping_fee, total_amount, discount_amount:
  - special：僅當**每個** combo 的 line_subtotal 皆為可計算之數字時：subtotal = 各 combo line_subtotal 之和；shipping_fee = 各 combo shipping_fee（null 視 0）之和；total_amount = subtotal + shipping_fee。若有任一 combo 因缺單價而 line_subtotal 為 null，則 subtotal、total_amount 填 **null**（勿臆測全單金額）。無折扣則 discount_amount null。
  - general：若無法計算則 subtotal/total_amount 可 null，shipping_fee 0 或 null。

## 根物件鍵名（必須一致）
{
  "quotation_kind": "special" | "general",
  "rationale_zh": "簡短中文說明為何判成此類",
  "quotation_orders": { ... },
  "all_requirement": { ... },
  "quotation_order_items": [ ... ]
}

若對話後段覆寫前段（改日期、改數量、拆點），請以**最後共識**為準，並在 rationale_zh 註明你採用了最後共識。`;

function isUuid(s: unknown): s is string {
  return typeof s === "string" && UUID_RE.test(s.trim());
}

function stripDataUrlPrefix(b64: string): string {
  const m = b64.match(/^data:([^;]+);base64,(.+)$/i);
  return m ? m[2].trim() : b64.trim();
}

/** 模型偶爾用錯鍵名，先正規成我們吃的形狀 */
function coerceModelRoot(root: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...root };

  const items = out.quotation_order_items;
  if (!Array.isArray(items) || items.length === 0) {
    for (const k of ["items", "line_items", "order_items", "quotation_items"] as const) {
      const v = out[k];
      if (Array.isArray(v) && v.length > 0) {
        out.quotation_order_items = v;
        break;
      }
    }
  }

  if (!out.quotation_orders || typeof out.quotation_orders !== "object") {
    const qo = out.quotation_order;
    if (qo && typeof qo === "object" && !Array.isArray(qo)) {
      out.quotation_orders = qo;
    }
  }

  return out;
}

export async function callOpenAiQuotationDraft(params: {
  text: string;
  /** @deprecated 請改用 images */
  imageBase64?: string;
  imageMimeType?: string;
  images?: QuotationDraftImageInput[];
  contextYear: number;
  productCatalog: ProductCatalogRow[];
}): Promise<Record<string, unknown>> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error("缺少環境變數 OPENAI_API_KEY");
  }

  const catalogLines = params.productCatalog
    .slice(0, 400)
    .map((p) => `- ${p.id} | ${p.name} | ${p.category} | 參考單價 ${p.price}`)
    .join("\n");

  const yearHint = `若對話只寫「月/日」未寫年份，預設年份為 ${params.contextYear}。`;

  const images: QuotationDraftImageInput[] = [
    ...(params.images ?? []),
    ...(params.imageBase64?.trim()
      ? [{ base64: params.imageBase64.trim(), mimeType: params.imageMimeType || "image/jpeg" }]
      : []),
  ].slice(0, 8);

  const userText = [
    yearHint,
    "",
    "【商品庫（請盡量對應 product_id）】",
    catalogLines || "(無商品資料)",
    "",
    "【對話／需求文字】",
    params.text.trim() || "(未提供純文字，請僅依圖片內容解析)",
    "",
    images.length > 1
      ? `【附圖】共 ${images.length} 張截圖，請依序合併解讀；若資訊衝突以較後的截圖為準。`
      : images.length === 1
        ? "【附圖】1 張截圖，請一併解析。"
        : "",
    "",
    "【輸出約束】根物件鍵名務必為 quotation_orders（複數）與 quotation_order_items（複數）；品項每一列須含 quantity、product_name、all_requirement（至少含 customization 字串），special 時須含 combo_id（與 combos[].id 一致）。無法辨識品名時 product_name 請填「待補充」。special 時：若某 combo 下任一品項 unit_price 為 null，該 combo 的 line_subtotal、line_total 必為 null；僅當該 combo 下所有品項皆有數字 unit_price 時才填寫 line_subtotal（Σ單價×數量）與 line_total（加 shipping_fee）。",
  ]
    .filter(Boolean)
    .join("\n");

  const userContent: unknown[] = [{ type: "text", text: userText }];

  for (const img of images) {
    const raw = stripDataUrlPrefix(img.base64);
    const mime = img.mimeType || "image/jpeg";
    userContent.push({
      type: "image_url",
      image_url: { url: `data:${mime};base64,${raw}`, detail: "high" },
    });
  }

  const model = process.env.OPENAI_QUOTATION_MODEL?.trim() || "gpt-4o-mini";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.15,
      max_tokens: 12000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    }),
  });

  const rawJson = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const msg =
      typeof rawJson.error === "object" && rawJson.error !== null && "message" in rawJson.error
        ? String((rawJson.error as { message?: string }).message)
        : JSON.stringify(rawJson);
    throw new Error(`OpenAI 請求失敗: ${msg}`);
  }

  const choices = rawJson.choices as unknown;
  const first = Array.isArray(choices) ? choices[0] : null;
  const finishReason =
    first && typeof first === "object" && first !== null && "finish_reason" in first
      ? String((first as { finish_reason?: string }).finish_reason ?? "")
      : "";
  if (finishReason && finishReason !== "stop") {
    console.warn("[quotation-draft-ai] OpenAI finish_reason:", finishReason);
  }

  const message = first && typeof first === "object" && first !== null && "message" in first
    ? (first as { message?: { content?: string } }).message
    : null;
  const content = message?.content?.trim();
  if (!content) {
    throw new Error("OpenAI 回傳無內容");
  }

  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return coerceModelRoot(parsed);
  } catch {
    throw new Error("OpenAI 回傳非合法 JSON");
  }
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function numOr0(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** AI 未辨識出合理品名時統一為「待補充」，並過濾泛泛／佔位字串 */
function finalizeProductName(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return "待補充";
  const lower = s.toLowerCase();
  const generic = new Set([
    "品項",
    "詢價品項",
    "商品",
    "產品",
    "item",
    "items",
    "product",
    "unknown",
    "n/a",
    "na",
    "待定",
    "待確認",
  ]);
  if (generic.has(s) || generic.has(lower)) return "待補充";
  if (s.startsWith("（請修改）")) return "待補充";
  return s.slice(0, 500);
}

function shippingFeeNum(raw: unknown): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 該 combo 下品項若皆具 unit_price，則 line_subtotal = Σ(單價×數量)、line_total = line_subtotal + shipping_fee；
 * 否則 line_subtotal／line_total 為 null（不採信模型臆測）。
 */
function computeComboLineAmountsFromItems(
  comboId: string,
  itemRows: Array<{ quantity: number; unit_price: number | null; customizations_json: unknown }>,
  shippingRaw: unknown,
): { line_subtotal: number | null; line_total: number | null; shipping_fee: number } {
  const shipping_fee = shippingFeeNum(shippingRaw);
  const belonging = itemRows.filter(
    (it) => parseComboIdFromQuotationItem(it.customizations_json) === comboId,
  );
  if (belonging.length === 0) {
    return { line_subtotal: null, line_total: null, shipping_fee };
  }
  for (const it of belonging) {
    if (it.unit_price === null || it.unit_price === undefined) {
      return { line_subtotal: null, line_total: null, shipping_fee };
    }
  }
  const line_subtotal = belonging.reduce((s, it) => s + (it.unit_price as number) * it.quantity, 0);
  return { line_subtotal, line_total: line_subtotal + shipping_fee, shipping_fee };
}

function modelComboHadGuessedAmounts(cr: Record<string, unknown>): boolean {
  const sub = cr.line_subtotal;
  const tot = cr.line_total;
  if (sub !== null && sub !== undefined && sub !== "" && numOr0(sub) !== 0) return true;
  if (tot !== null && tot !== undefined && tot !== "" && numOr0(tot) !== 0) return true;
  return false;
}

function pickTrimString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** 品項 all_requirement：合併模型 all_requirement 與常見誤放頂層鍵（customization / note） */
function itemAllRequirementFromModelRow(r: Record<string, unknown>): Record<string, unknown> {
  const base: Record<string, unknown> = { ...(asRecord(r.all_requirement) ?? {}) };
  let customization = pickTrimString(base.customization);
  if (!customization) {
    customization =
      pickTrimString(r.customization) ||
      pickTrimString(r.item_customization) ||
      pickTrimString(r.customer_request) ||
      pickTrimString(r.notes);
  }
  if (customization) base.customization = customization;
  else delete base.customization;

  let note = pickTrimString(base.note);
  if (!note) {
    note = pickTrimString(r.note) || pickTrimString(r.item_note);
  }
  if (note) base.note = note;
  else delete base.note;

  return base;
}

/** 正規化 UUID、補齊 special 表頭金額、整理品項 customizations_json */
export function normalizeQuotationDraft(
  parsed: Record<string, unknown>,
  catalog: ProductCatalogRow[],
): QuotationDraftResponse {
  const warnings: string[] = [];
  const catalogIds = new Set(catalog.map((p) => p.id));
  const kindRaw = parsed.quotation_kind;
  const rationale_zh =
    typeof parsed.rationale_zh === "string" ? parsed.rationale_zh : "";

  const allReq = asRecord(parsed.all_requirement) ?? {};
  let quotation_kind: "special" | "general" =
    kindRaw === "special" || isSpecialQuotation(allReq) ? "special" : "general";

  if (quotation_kind === "special") {
    const sq = asRecord(allReq.special_quotation);
    if (!sq) {
      warnings.push("模型未輸出 special_quotation，已降級為 general");
      quotation_kind = "general";
      delete allReq.quotation_kind;
      delete allReq.special_quotation;
    } else {
      allReq.quotation_kind = QUOTATION_KIND_SPECIAL;
      const combosRaw = asArray(sq.combos);
      const idMap = new Map<string, string>();

      const combosWithIds = combosRaw.map((c, idx) => {
        const cr = asRecord(c) ?? {};
        let id = typeof cr.id === "string" ? cr.id.trim() : "";
        if (!isUuid(id)) {
          const old = id || `legacy-${idx}`;
          id = randomUUID();
          idMap.set(old, id);
          if (!isUuid(cr.id as string)) {
            warnings.push(`combo id 非 UUID 已重新產生：${old} → ${id}`);
          }
        }
        return {
          ...cr,
          id,
          expected_pickup_date: cr.expected_pickup_date ?? null,
          pickup_location: cr.pickup_location ?? null,
          pickup_contact_name: cr.pickup_contact_name ?? null,
          pickup_contact_phone: cr.pickup_contact_phone ?? null,
        };
      });

      const items = asArray(parsed.quotation_order_items).map((row, i) => {
        const r = asRecord(row) ?? {};
        let comboId =
          typeof r.combo_id === "string"
            ? r.combo_id.trim()
            : typeof asRecord(r.customizations_json)?.combo_id === "string"
              ? String(asRecord(r.customizations_json)!.combo_id).trim()
              : "";

        if (comboId && idMap.has(comboId)) {
          comboId = idMap.get(comboId)!;
        }
        const firstComboId = String(asRecord(combosWithIds[0])?.id ?? "").trim();
        if (comboId && !combosWithIds.some((co) => asRecord(co)?.id === comboId)) {
          warnings.push(
            firstComboId
              ? `品項 #${i} 的 combo_id 無對應 combo，已指派至第一組`
              : `品項 #${i} 的 combo_id 無對應 combo，已清空（請人工修正）`,
          );
          comboId = firstComboId;
        }
        if (!comboId && firstComboId) {
          warnings.push(`品項 #${i} 缺少有效 combo_id，已指派至第一組`);
          comboId = firstComboId;
        }

        const productId =
          typeof r.product_id === "string" && isUuid(r.product_id) ? r.product_id.trim() : null;
        if (productId && !catalogIds.has(productId)) {
          warnings.push(`品項 #${i} 的 product_id 不在商品庫：${productId}`);
        }
        const cust = comboId
          ? {
              combo_id: comboId,
              role: "special_quotation_line",
              product_id: productId,
            }
          : null;

        return {
          product_name: finalizeProductName(r.product_name),
          quantity: Math.max(1, Math.floor(numOr0(r.quantity)) || 1),
          unit_price: r.unit_price === null || r.unit_price === undefined ? null : numOr0(r.unit_price),
          category: String(r.category ?? "custom_design").slice(0, 200),
          preview_url: r.preview_url ?? null,
          all_requirement: itemAllRequirementFromModelRow(r),
          customizations_json: cust,
          quantity_description: r.quantity_description ?? null,
        };
      });

      let itemsForOutput = items;
      if (itemsForOutput.length === 0 && combosWithIds.length > 0) {
        warnings.push(
          "模型未回傳品項列：已為每個訂單組合各建立一筆佔位品項（請至後台改成實際品名／數量／單價）。",
        );
        itemsForOutput = combosWithIds.map((co) => {
          const cr = asRecord(co) ?? {};
          const cid = String(cr.id ?? "");
          return {
            product_name: "待補充",
            quantity: 1,
            unit_price: null,
            category: "custom_design",
            preview_url: null,
            all_requirement: {},
            customizations_json: cid
              ? { combo_id: cid, role: "special_quotation_line", product_id: null }
              : null,
            quantity_description: null,
          };
        });
      }

      let strippedModelComboMoney = false;
      const newCombos = combosWithIds.map((co) => {
        const cr = asRecord(co) ?? {};
        const id = String(cr.id ?? "");
        const calc = computeComboLineAmountsFromItems(
          id,
          itemsForOutput as Array<{
            quantity: number;
            unit_price: number | null;
            customizations_json: unknown;
          }>,
          cr.shipping_fee,
        );
        if (calc.line_subtotal === null && modelComboHadGuessedAmounts(cr)) {
          strippedModelComboMoney = true;
        }
        return {
          ...cr,
          id,
          expected_pickup_date: cr.expected_pickup_date ?? null,
          pickup_location: cr.pickup_location ?? null,
          pickup_contact_name: cr.pickup_contact_name ?? null,
          pickup_contact_phone: cr.pickup_contact_phone ?? null,
          shipping_fee: calc.shipping_fee,
          line_subtotal: calc.line_subtotal,
          line_total: calc.line_total,
        };
      });

      if (strippedModelComboMoney) {
        warnings.push(
          "部分訂單組合之品項缺少單價：已將該組 line_subtotal／line_total 設為 null，並忽略模型推測金額。",
        );
      }

      allReq.special_quotation = { ...sq, combos: newCombos };

      let grandShip = 0;
      const comboSubs: (number | null)[] = [];
      for (const co of newCombos) {
        const cr = asRecord(co) ?? {};
        grandShip += shippingFeeNum(cr.shipping_fee);
        const sub = cr.line_subtotal;
        comboSubs.push(sub === null || sub === undefined ? null : numOr0(sub));
      }
      const allCombosPriced = comboSubs.every((s) => s !== null);
      const grandSub = allCombosPriced ? comboSubs.reduce<number>((a, s) => a + (s as number), 0) : null;

      const qo = asRecord(parsed.quotation_orders) ?? {};
      const mergedOrder: Record<string, unknown> = {
        ...qo,
        subtotal: grandSub !== null ? grandSub : null,
        shipping_fee: grandShip,
        total_amount: grandSub !== null ? grandSub + grandShip : null,
      };

      const itemsOut = itemsForOutput.map((it) => {
        const ir = asRecord(it) ?? {};
        return { ...ir, customizations_json: ir.customizations_json ?? null };
      });

      return {
        quotation_kind: "special",
        rationale_zh,
        warnings,
        quotation_order: { ...mergedOrder, all_requirement: allReq },
        quotation_order_items: itemsOut,
        all_requirement: allReq,
      };
    }
  }

  /* general */
  const qo = asRecord(parsed.quotation_orders) ?? {};
  const itemsOut = asArray(parsed.quotation_order_items).map((row, i) => {
    const r = asRecord(row) ?? {};
    if (!r.product_name || !String(r.product_name).trim()) {
      warnings.push(`品項 #${i} 缺少 product_name，已填「待補充」`);
    }
    const pid = typeof r.product_id === "string" && isUuid(r.product_id) ? r.product_id.trim() : null;
    if (pid && !catalogIds.has(pid)) {
      warnings.push(`品項 #${i} 的 product_id 不在商品庫：${pid}`);
    }
    return {
      product_name: finalizeProductName(r.product_name),
      quantity: Math.max(1, Math.floor(numOr0(r.quantity)) || 1),
      unit_price: r.unit_price === null || r.unit_price === undefined ? null : numOr0(r.unit_price),
      category: String(r.category ?? "custom_design").slice(0, 200),
      preview_url: r.preview_url ?? null,
      all_requirement: itemAllRequirementFromModelRow(r),
      customizations_json: r.customizations_json ?? null,
      quantity_description: r.quantity_description ?? null,
    };
  });

  return {
    quotation_kind: "general",
    rationale_zh,
    warnings,
    quotation_order: { ...qo, all_requirement: allReq },
    quotation_order_items: itemsOut,
    all_requirement: allReq,
  };
}

export function stripBase64ForLog(b64: string): string {
  const s = stripDataUrlPrefix(b64);
  return s.length > 40 ? `${s.slice(0, 20)}…${s.slice(-8)} (${s.length} chars)` : s;
}
