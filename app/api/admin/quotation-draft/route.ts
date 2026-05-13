import { NextResponse } from "next/server";
import { assertAdminQuotationApi } from "@/lib/quotation-draft-auth";
import {
  callOpenAiQuotationDraft,
  normalizeQuotationDraft,
  quotationDraftRequestSchema,
  stripBase64ForLog,
  type ProductCatalogRow,
} from "@/lib/quotation-draft-ai";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = quotationDraftRequestSchema.extend({}).refine(
  (d) => d.text.trim().length > 0 || (d.image_base64 != null && d.image_base64.trim().length > 80),
  { message: "請提供 text（對話文字）或 image_base64（截圖 base64）" },
);

/**
 * POST /api/admin/quotation-draft
 * 產出報價單草稿（不寫入資料庫）。需管理員 JWT。
 *
 * Body JSON:
 * - text?: 對話／需求純文字
 * - image_base64?: 圖片 base64（可含 data:image/...;base64, 前綴）
 * - image_mime_type?: 預設 image/jpeg
 * - context_year?: 補全年份，預設當年
 */
export async function POST(req: Request) {
  try {
    const auth = await assertAdminQuotationApi(req);
    if (auth instanceof Response) return auth;

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "無效的 JSON body" }, { status: 400 });
    }

    const parsedBody = bodySchema.safeParse(json);
    if (!parsedBody.success) {
      const msg = parsedBody.error.issues.map((i) => i.message).join("；");
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const body = parsedBody.data;
    const contextYear = body.context_year ?? new Date().getFullYear();

    if (!process.env.OPENAI_API_KEY?.trim()) {
      return NextResponse.json({ error: "伺服器未設定 OPENAI_API_KEY" }, { status: 503 });
    }

    const { data: productsData, error: productsError } = await auth.supabase
      .from("products")
      .select("id, name, category, price")
      .or("is_hide.is.null,is_hide.eq.false")
      .order("category")
      .limit(500);

    if (productsError) {
      console.error("[quotation-draft] products", productsError);
      return NextResponse.json({ error: "無法載入商品庫" }, { status: 500 });
    }

    const productCatalog = (productsData || []) as ProductCatalogRow[];

    const raw = await callOpenAiQuotationDraft({
      text: body.text,
      imageBase64: body.image_base64,
      imageMimeType: body.image_mime_type || "image/jpeg",
      contextYear,
      productCatalog,
    });

    const draft = normalizeQuotationDraft(raw, productCatalog);

    console.log("[quotation-draft] ok", {
      admin: auth.userId,
      kind: draft.quotation_kind,
      items: draft.quotation_order_items.length,
      image: body.image_base64 ? stripBase64ForLog(body.image_base64) : null,
    });

    return NextResponse.json({
      success: true,
      ...draft,
      insert_hint: "確認無誤後請呼叫 POST /api/admin/quotation-draft/commit 寫入；或使用後台「建立報價單」按鈕。",
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "草稿產生失敗";
    console.error("[quotation-draft]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
