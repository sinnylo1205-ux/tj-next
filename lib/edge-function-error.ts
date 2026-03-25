/**
 * Supabase functions.invoke 在 Edge Function 回傳非 2xx 時，error.message 常只有
 * 「Edge Function returned a non-2xx status code」。此函式嘗試從 error.context（Response）讀取 JSON body。
 */
export async function getEdgeFunctionErrorDetail(error: unknown): Promise<string> {
  const e = error as { message?: string; context?: unknown };
  const ctx = e.context;

  if (ctx && typeof ctx === "object" && ctx !== null && "body" in ctx && typeof (ctx as { body?: string }).body === "string") {
    try {
      const parsed = JSON.parse((ctx as { body: string }).body) as { error?: string; details?: string };
      if (parsed.details) return String(parsed.details);
      if (parsed.error) return String(parsed.error);
    } catch {
      /* ignore */
    }
  }

  if (ctx instanceof Response) {
    try {
      const clone = ctx.clone();
      const text = await clone.text();
      if (text) {
        try {
          const parsed = JSON.parse(text) as { error?: string; details?: string };
          if (parsed.details) return String(parsed.details);
          if (parsed.error) return String(parsed.error);
        } catch {
          return text.slice(0, 300);
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (e.message && !/^edge function returned a non-2xx status code$/i.test(e.message.trim())) {
    return e.message;
  }

  return "Edge Function 回傳錯誤（非 2xx）。請確認已部署最新 admin-update-order、且資料庫已執行相關 migration。";
}
