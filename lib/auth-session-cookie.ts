import type { Session } from "@supabase/supabase-js";

export const AUTH_ACCESS_COOKIE = "tj_access_token";

export function isAdminAppPath(path: string | null | undefined): boolean {
  if (!path) return false;
  const pathname = path.split("?")[0] ?? "";
  return pathname === "/admin" || pathname === "/admin-text" || pathname.startsWith("/admin/");
}

/** 把目前 session 同步到 httpOnly cookie，讓 middleware 能在伺服器檢查 /admin */
export async function syncAuthSessionCookie(session: Session | null): Promise<void> {
  try {
    if (!session?.access_token) {
      await fetch("/api/auth/session", { method: "DELETE" });
      return;
    }
    await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: session.access_token,
        expires_in: session.expires_in,
      }),
    });
  } catch {
    /* 網路失敗時仍靠頁面端檢查 */
  }
}
