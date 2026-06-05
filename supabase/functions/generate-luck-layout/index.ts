import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.22.4";
import ExcelJS from "npm:exceljs@4.4.0";

// =====================================================================
// 幸運籤餅 CSV → Excel 排版（移植 main.py，單檔部署）
// =====================================================================

const ROW_HEIGHT_PT = 28.35;
const COLWIDTH_CONTENT = 34;
const COLWIDTH_SIDE = 3.2;
const BACKGROUND_COLOR = "FFFFFFFF";
const FONT_NAME = "Microsoft JhengHei";
const FONT_SIZE = 8;
const BORDER_COLOR = "FFAAAAAA";
const ROWS_PER_PAGE = 26;
const FORMAT_ROW_LIMIT = 2000;

const FORTUNE_COOKIE_PRODUCT_IDS = new Set(["luck", "fortune_cookie"]);

type LuckCsvRow = { text: string; qty: number };

const THIN_BORDER = {
  top: { style: "thin" as const, color: { argb: BORDER_COLOR } },
  bottom: { style: "thin" as const, color: { argb: BORDER_COLOR } },
  left: { style: "thin" as const, color: { argb: BORDER_COLOR } },
  right: { style: "thin" as const, color: { argb: BORDER_COLOR } },
};

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function detectDelimiter(sample: string): string {
  const seps = [",", ";", "\t", "|"];
  return seps.reduce((best, s) => (sample.split(s).length > sample.split(best).length ? s : best), ",");
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && ch === delimiter) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseLuckCsvText(csvContent: string): LuckCsvRow[] {
  const normalized = stripBom(csvContent).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const sample = normalized.slice(0, 2048);
  const delimiter = detectDelimiter(sample);
  const lines = normalized.split("\n").filter((l) => l.trim() !== "");
  const rows: LuckCsvRow[] = [];

  for (let i = 0; i < lines.length; i++) {
    const parts = parseCsvLine(lines[i], delimiter);
    if (parts.length < 2) continue;

    const col0 = parts[0].replace(/^"|"$/g, "").trim();
    const col1 = parts[1].replace(/^"|"$/g, "").trim();

    if (i === 0 && /^text$/i.test(col0) && /^quantity$/i.test(col1)) continue;

    if (!col0) continue;
    const qty = Number.parseInt(col1, 10);
    rows.push({ text: col0, qty: Number.isFinite(qty) && qty > 0 ? qty : 1 });
  }

  return rows;
}

function expandLuckTexts(rows: LuckCsvRow[]): string[] {
  const texts: string[] = [];
  for (const { text, qty } of rows) {
    for (let i = 0; i < qty; i++) texts.push(text);
  }
  return texts;
}

function applyBaseCellStyle(cell: ExcelJS.Cell) {
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: BACKGROUND_COLOR },
  };
  cell.font = { name: FONT_NAME, size: FONT_SIZE };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
}

function setupWorksheet(ws: ExcelJS.Worksheet) {
  ws.pageSetup.margins = {
    top: 1.91 / 2.54,
    bottom: 1.91 / 2.54,
    left: 0.64 / 2.54,
    right: 0.64 / 2.54,
    header: 0.3,
    footer: 0.3,
  };

  ws.getColumn("A").width = COLWIDTH_SIDE;
  ws.getColumn("B").width = COLWIDTH_CONTENT;
  ws.getColumn("C").width = COLWIDTH_CONTENT;
  ws.getColumn("D").width = COLWIDTH_CONTENT;
  ws.getColumn("E").width = COLWIDTH_SIDE;

  for (let r = 1; r <= FORMAT_ROW_LIMIT; r++) {
    ws.getRow(r).height = ROW_HEIGHT_PT;
    for (const col of ["A", "B", "C", "D", "E"]) {
      const cell = ws.getCell(`${col}${r}`);
      applyBaseCellStyle(cell);
      if (col === "A" || col === "E") {
        cell.border = THIN_BORDER;
      }
    }
  }
}

function makeEmptyRow(ws: ExcelJS.Worksheet, row: number) {
  for (const col of ["A", "B", "C", "D", "E"]) {
    const cell = ws.getCell(`${col}${row}`);
    cell.value = "";
    cell.border = THIN_BORDER;
    applyBaseCellStyle(cell);
  }
}

function getLuckTextCsvUrl(customizationsJson: unknown): string | null {
  if (!customizationsJson) return null;
  const list = Array.isArray(customizationsJson)
    ? customizationsJson
    : typeof customizationsJson === "string"
      ? (() => {
          try {
            const p = JSON.parse(customizationsJson);
            return Array.isArray(p) ? p : [p];
          } catch {
            return [];
          }
        })()
      : typeof customizationsJson === "object"
        ? [customizationsJson]
        : [];

  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as Record<string, unknown>;
    if (c.group !== "text") continue;
    const value = c.value;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const url = (value as { url?: unknown }).url;
      if (typeof url === "string" && url.trim()) return url.trim();
    }
    const items = c.items;
    if (Array.isArray(items) && items[0] && typeof items[0] === "object") {
      const url = (items[0] as { url?: unknown }).url;
      if (typeof url === "string" && url.trim()) return url.trim();
    }
  }
  return null;
}

function isLuckTextCsvEligible(productId: string | null | undefined, customizationsJson: unknown): boolean {
  if (!productId || !FORTUNE_COOKIE_PRODUCT_IDS.has(productId)) return false;
  const url = getLuckTextCsvUrl(customizationsJson);
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.includes("customizer_uploads") || lower.endsWith(".csv") || lower.includes(".csv?");
}

async function buildLuckLayoutXlsxBuffer(rows: LuckCsvRow[]): Promise<Uint8Array> {
  const texts = expandLuckTexts(rows);
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("簽文模板");
  setupWorksheet(ws);

  const colCycle = ["B", "C", "D"] as const;
  let rowCursor = 1;
  let colIndex = 0;

  makeEmptyRow(ws, rowCursor);
  rowCursor += 1;

  for (const text of texts) {
    const col = colCycle[colIndex];
    ws.getCell(`${col}${rowCursor}`).value = text;

    colIndex += 1;
    if (colIndex >= 3) {
      colIndex = 0;
      rowCursor += 1;

      if ((rowCursor - 1) % ROWS_PER_PAGE === 0) {
        makeEmptyRow(ws, rowCursor);
        rowCursor += 1;
        makeEmptyRow(ws, rowCursor);
        rowCursor += 1;
      }
    }
  }

  const buf = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buf);
}

// =====================================================================
// Edge Function handler
// =====================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LUCK_LAYOUT_PREFIX = "website_img/luck_layouts";

const RequestSchema = z.object({
  order_id: z.string().uuid("訂單 ID 格式錯誤"),
  order_item_id: z.number().int().positive().optional(),
});

type OrderItemRow = {
  order_item_id: number;
  order_id: string;
  product_id: string | null;
  customizations_json: unknown;
  luck_layout_xlsx_url: string | null;
  luck_layout_status: string | null;
};

async function isAdmin(supabaseAdmin: ReturnType<typeof createClient>, userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return Boolean(data);
}

async function processOrderItem(
  supabaseAdmin: ReturnType<typeof createClient>,
  item: OrderItemRow,
): Promise<{ order_item_id: number; status: string; url?: string; error?: string }> {
  const { order_item_id, order_id, product_id, customizations_json } = item;

  if (!isLuckTextCsvEligible(product_id, customizations_json)) {
    await supabaseAdmin
      .from("order_items")
      .update({ luck_layout_status: "skipped", luck_layout_error: null })
      .eq("order_item_id", order_item_id);
    return { order_item_id, status: "skipped" };
  }

  const csvUrl = getLuckTextCsvUrl(customizations_json);
  if (!csvUrl) {
    await supabaseAdmin
      .from("order_items")
      .update({ luck_layout_status: "skipped", luck_layout_error: null })
      .eq("order_item_id", order_item_id);
    return { order_item_id, status: "skipped" };
  }

  await supabaseAdmin
    .from("order_items")
    .update({ luck_layout_status: "pending", luck_layout_error: null })
    .eq("order_item_id", order_item_id);

  try {
    const csvRes = await fetch(csvUrl);
    if (!csvRes.ok) {
      throw new Error(`下載 CSV 失敗 (${csvRes.status})`);
    }
    const csvText = await csvRes.text();
    const rows = parseLuckCsvText(csvText);
    if (rows.length === 0) {
      throw new Error("CSV 無有效簽文資料");
    }

    const xlsxBytes = await buildLuckLayoutXlsxBuffer(rows);
    const storagePath = `${LUCK_LAYOUT_PREFIX}/${order_id}/${order_item_id}.xlsx`;

    const { error: uploadError } = await supabaseAdmin.storage.from("custom_asset").upload(storagePath, xlsxBytes, {
      upsert: true,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      cacheControl: "3600",
    });
    if (uploadError) throw new Error(uploadError.message);

    const { data: pub } = supabaseAdmin.storage.from("custom_asset").getPublicUrl(storagePath);
    const publicUrl = pub.publicUrl;

    await supabaseAdmin
      .from("order_items")
      .update({
        luck_layout_xlsx_url: publicUrl,
        luck_layout_status: "ready",
        luck_layout_error: null,
      })
      .eq("order_item_id", order_item_id);

    return { order_item_id, status: "ready", url: publicUrl };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[generate-luck-layout] item ${order_item_id} failed:`, message);
    await supabaseAdmin
      .from("order_items")
      .update({
        luck_layout_status: "failed",
        luck_layout_error: message.slice(0, 500),
      })
      .eq("order_item_id", order_item_id);
    return { order_item_id, status: "failed", error: message };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "未授權" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const {
      data: { user: authUser },
      error: authError,
    } = await supabaseAuth.auth.getUser();
    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: "身分驗證失敗" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawData = await req.json();
    const parseResult = RequestSchema.safeParse(rawData);
    if (!parseResult.success) {
      return new Response(JSON.stringify({ error: "參數驗證失敗", details: parseResult.error.flatten() }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { order_id, order_item_id } = parseResult.data;

    const { data: orderRow, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("id, user_id")
      .eq("id", order_id)
      .single();

    if (orderError || !orderRow) {
      return new Response(JSON.stringify({ error: "找不到訂單" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userIsAdmin = await isAdmin(supabaseAdmin, authUser.id);
    if (orderRow.user_id !== authUser.id && !userIsAdmin) {
      return new Response(JSON.stringify({ error: "無權限處理此訂單" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let query = supabaseAdmin
      .from("order_items")
      .select("order_item_id, order_id, product_id, customizations_json, luck_layout_xlsx_url, luck_layout_status")
      .eq("order_id", order_id);

    if (order_item_id != null) {
      query = query.eq("order_item_id", order_item_id);
    }

    const { data: items, error: itemsError } = await query;
    if (itemsError) {
      return new Response(JSON.stringify({ error: itemsError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const targets =
      order_item_id != null
        ? (items ?? []).filter((it) => it.order_item_id === order_item_id)
        : (items ?? []).filter((it) => isLuckTextCsvEligible(it.product_id, it.customizations_json));

    if (targets.length === 0) {
      return new Response(JSON.stringify({ ok: true, results: [], message: "無需排版的幸運籤餅品項" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = [];
    for (const item of targets as OrderItemRow[]) {
      results.push(await processOrderItem(supabaseAdmin, item));
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[generate-luck-layout] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "未知錯誤" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
