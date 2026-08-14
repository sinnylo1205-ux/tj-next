/** localStorage：登入／註冊／Email 驗證後續跑 AI 擬真渲染（跨分頁，避免驗證信開新分頁遺失） */

export const PENDING_AI_RENDER_KEY = "tj_pending_ai_render";

export type PendingAiRenderCartItem = {
  product_id: string;
  name: string;
  category: string;
  quantity: number;
  price: number;
  total_price: number;
  preview_url: string;
  temp_id: string;
  customizations: unknown[];
};

export type PendingAiRender = {
  v: 1;
  created_at: number;
  return_path: string;
  composite_preview_url: string;
  cart_item: PendingAiRenderCartItem;
  /** 登入回來後若已有結果可略過 API（一般為空） */
  ai_result_url?: string;
};

/** 只允許站內相對路徑，避免 open redirect */
export function sanitizeAppPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  if (trimmed.includes("://")) return null;
  return trimmed;
}

export function withResumeAiRender(path: string): string {
  const url = new URL(path, "https://placeholder.local");
  url.searchParams.set("resumeAiRender", "1");
  return `${url.pathname}${url.search}${url.hash}`;
}

export function savePendingAiRender(payload: PendingAiRender): void {
  if (typeof window === "undefined") return;
  const safePath = sanitizeAppPath(payload.return_path) || "/";
  const next: PendingAiRender = { ...payload, return_path: safePath };
  localStorage.setItem(PENDING_AI_RENDER_KEY, JSON.stringify(next));
  // 同步 sessionStorage，同頁登入流程仍可用
  try {
    sessionStorage.setItem(PENDING_AI_RENDER_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function loadPendingAiRender(): PendingAiRender | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PENDING_AI_RENDER_KEY) || sessionStorage.getItem(PENDING_AI_RENDER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingAiRender;
    if (parsed?.v !== 1 || !parsed.composite_preview_url || !parsed.cart_item) return null;
    // 2 小時內有效
    if (Date.now() - (parsed.created_at || 0) > 2 * 60 * 60 * 1000) {
      clearPendingAiRender();
      return null;
    }
    if (!sanitizeAppPath(parsed.return_path)) {
      parsed.return_path = "/";
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingAiRender(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(PENDING_AI_RENDER_KEY);
  try {
    sessionStorage.removeItem(PENDING_AI_RENDER_KEY);
  } catch {
    /* ignore */
  }
}

/** 登入頁：帶 resume 旗標的 redirect */
export function buildAiRenderLoginRedirect(currentPathWithQuery: string): string {
  const safe = sanitizeAppPath(currentPathWithQuery) || "/";
  const target = withResumeAiRender(safe);
  return `/login?redirect=${encodeURIComponent(target)}`;
}

/** 有 pending 時優先用其 return_path；否則用 query redirect */
export function resolveAuthNextPath(redirectFromQuery?: string | null): string {
  const pending = loadPendingAiRender();
  if (pending?.return_path) return withResumeAiRender(pending.return_path);
  const safe = sanitizeAppPath(redirectFromQuery);
  if (safe) {
    // 若本來就帶 resumeAiRender 則保留
    return safe;
  }
  return "/";
}

/** Supabase OAuth／Email 驗證共用 callback URL */
export function buildAuthCallbackUrl(nextPath: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const next = sanitizeAppPath(nextPath) || "/";
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
}
