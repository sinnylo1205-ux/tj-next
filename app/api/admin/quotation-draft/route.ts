import { NextResponse } from "next/server";
import { assertAdminQuotationApi } from "@/lib/quotation-draft-auth";
import {
  callOpenAiQuotationDraft,
  collectQuotationDraftImages,
  normalizeQuotationDraft,
  quotationDraftRequestSchema,
  stripBase64ForLog,
  type ProductCatalogRow,
} from "@/lib/quotation-draft-ai";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = quotationDraftRequestSchema.extend({}).superRefine((d, ctx) => {
  const images = collectQuotationDraftImages(d);
  if (d.text.trim().length === 0 && images.length === 0) {
    ctx.addIssue({
      code: "custom",
      message: "請提供 text（對話文字）或至少一張截圖（images / image_base64）",
    });
  }
});

/**
 * POST /api/admin/quotation-draft
 * 產出報價單草稿（不寫入資料庫）。需管理員 JWT。
 *
 * Body JSON:
 * - text?: 對話／需求純文字
 * - images?: { base64, mime_type? }[]（最多 8 張；建議）
 * - image_base64?: 單張圖片（舊版相容，會與 images 合併）
 * - image_mime_type?: 單張 MIME，預設 image/jpeg
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
    const images = collectQuotationDraftImages(body);

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
      images,
      contextYear,
      productCatalog,
    });

    const draft = normalizeQuotationDraft(raw, productCatalog);

    console.log("[quotation-draft] ok", {
      admin: auth.userId,
      kind: draft.quotation_kind,
      items: draft.quotation_order_items.length,
      image_count: images.length,
      images: images.map((img) => stripBase64ForLog(img.base64)),
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
