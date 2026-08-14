/**
 * 客製編輯器 AI 擬真渲染（OpenAI Images edits）。
 *
 * 環境變數：
 * - OPENAI_API_KEY（必填）
 * - OPENAI_IMAGE_MODEL（選填，預設 gpt-image-2）
 * - NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY（上傳結果圖）
 */

import { createClient } from "@supabase/supabase-js";
import { processImageBufferWithSharp } from "@/lib/sharp-process-upload";

export const AI_RENDER_DAILY_LIMIT = 3;
export const AI_RENDER_BUCKET = "customizer_uploads";
export const AI_RENDER_MAX_SOURCE_BYTES = 10 * 1024 * 1024;
export const AI_RENDER_FETCH_TIMEOUT_MS = 20_000;

export const AI_PHOTOREAL_PROMPT =
  "Transform this product customization mockup into a photorealistic studio photograph of the same dessert/gift product. " +
  "Keep the exact composition, proportions, colors, decorations, photo placement, and any visible text content. " +
  "Use natural soft studio lighting, shallow depth of field, realistic materials and frosting texture. " +
  "Do not add logos, watermarks, or extra props that change the design.";

export function getTaipeiDayBounds(now = new Date()): { startIso: string; endIso: string; dayLabel: string } {
  const dayLabel = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return {
    dayLabel,
    startIso: `${dayLabel}T00:00:00+08:00`,
    endIso: `${dayLabel}T23:59:59.999+08:00`,
  };
}

export function isAllowedCustomizerUploadUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    if (u.username || u.password) return false;
    const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
      : "";
    if (!supabaseHost || u.hostname !== supabaseHost) return false;
    return u.pathname.includes(`/${AI_RENDER_BUCKET}/`) || u.pathname.includes(`/${AI_RENDER_BUCKET}`);
  } catch {
    return false;
  }
}

function quotaExceededError(): Error {
  const err = new Error(`今日 AI 擬真渲染已達上限（${AI_RENDER_DAILY_LIMIT} 次），請明天再試`);
  (err as Error & { status?: number }).status = 429;
  return err;
}

async function readResponseWithLimit(res: Response, maxBytes: number): Promise<Buffer> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error("合成圖過大");
  }

  const reader = res.body?.getReader();
  if (!reader) {
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) throw new Error("合成圖過大");
    return buf;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error("合成圖過大");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** 今日已開始的渲染次數（含進行中／失敗／關閉分頁；一開始就占額度） */
async function countUsageToday(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: { from: (table: string) => any },
  userId: string,
): Promise<number> {
  const { startIso, endIso } = getTaipeiDayBounds();
  const { count, error } = await supabase
    .from("ai_render_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", startIso)
    .lte("created_at", endIso);

  if (error) throw new Error(`查詢渲染額度失敗：${error.message}`);
  return count ?? 0;
}

function guessMimeFromUrl(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes(".png")) return "image/png";
  if (lower.includes(".jpg") || lower.includes(".jpeg")) return "image/jpeg";
  if (lower.includes(".webp")) return "image/webp";
  return "image/webp";
}

function extFromMime(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  return "webp";
}

export type AiRenderSuccess = {
  result_url: string;
  remaining_today: number;
  used_today: number;
};

/**
 * 下載合成圖 → OpenAI edits → WebP → 上傳 customizer_uploads → 寫入 usage。
 */
export async function runAiPhotorealRender(params: {
  userId: string;
  sourceImageUrl: string;
}): Promise<AiRenderSuccess> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("缺少環境變數 OPENAI_API_KEY");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceKey) {
    throw new Error("缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");
  }

  if (!isAllowedCustomizerUploadUrl(params.sourceImageUrl)) {
    throw new Error("來源圖必須為 customizer_uploads 公開連結");
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const { startIso, endIso } = getTaipeiDayBounds();

  // 先原子占額度，再下載／呼叫 OpenAI，避免並行請求突破每日上限
  const { data: reservedId, error: reserveError } = await supabase.rpc("try_reserve_ai_render", {
    p_user_id: params.userId,
    p_source_image_url: params.sourceImageUrl,
    p_daily_limit: AI_RENDER_DAILY_LIMIT,
    p_start: startIso,
    p_end: endIso,
  });

  if (reserveError) {
    throw new Error(`無法鎖定渲染額度：${reserveError.message}`);
  }
  if (!reservedId) {
    throw quotaExceededError();
  }
  const usageId = String(reservedId);

  let srcRes: Response;
  try {
    srcRes = await fetch(params.sourceImageUrl, {
      signal: AbortSignal.timeout(AI_RENDER_FETCH_TIMEOUT_MS),
    });
  } catch {
    throw new Error("無法下載合成圖（逾時或網路錯誤）");
  }
  if (!srcRes.ok) {
    throw new Error(`無法下載合成圖（HTTP ${srcRes.status}）`);
  }
  const srcBuf = await readResponseWithLimit(srcRes, AI_RENDER_MAX_SOURCE_BYTES);
  if (srcBuf.length < 100) throw new Error("合成圖檔案無效");

  const newUsed = await countUsageToday(supabase, params.userId);
  const mime = srcRes.headers.get("content-type")?.split(";")[0]?.trim() || guessMimeFromUrl(params.sourceImageUrl);
  const model = process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2";

  const form = new FormData();
  form.append("model", model);
  form.append("prompt", AI_PHOTOREAL_PROMPT);
  form.append("size", "1024x1024");
  form.append(
    "image",
    new Blob([new Uint8Array(srcBuf)], { type: mime }),
    `source.${extFromMime(mime)}`,
  );

  const openaiRes = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });

  const openaiJson = (await openaiRes.json().catch(() => null)) as {
    data?: Array<{ b64_json?: string; url?: string }>;
    error?: { message?: string };
  } | null;

  if (!openaiRes.ok) {
    const msg = openaiJson?.error?.message || `OpenAI 影像 API 失敗（HTTP ${openaiRes.status}）`;
    throw new Error(msg);
  }

  const b64 = openaiJson?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI 未回傳影像資料");

  const rawOut = Buffer.from(b64, "base64");
  const webp = await processImageBufferWithSharp(rawOut, { maxLongEdge: 1920, quality: 82 });
  const fileName = `ai-render-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.webp`;

  const { error: uploadError } = await supabase.storage
    .from(AI_RENDER_BUCKET)
    .upload(fileName, webp, { contentType: "image/webp", upsert: false });

  if (uploadError) {
    throw new Error(`上傳擬真圖失敗：${uploadError.message}`);
  }

  const { data: urlData } = supabase.storage.from(AI_RENDER_BUCKET).getPublicUrl(fileName);
  const resultUrl = urlData.publicUrl;

  const { error: updateError } = await supabase
    .from("ai_render_usage")
    .update({ result_image_url: resultUrl })
    .eq("id", usageId);

  if (updateError) {
    throw new Error(`更新使用紀錄失敗：${updateError.message}`);
  }

  return {
    result_url: resultUrl,
    used_today: newUsed,
    remaining_today: Math.max(0, AI_RENDER_DAILY_LIMIT - newUsed),
  };
}
