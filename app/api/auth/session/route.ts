import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { AUTH_ACCESS_COOKIE } from "@/lib/auth-session-cookie";

export const runtime = "nodejs";

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    return NextResponse.json({ error: "伺服器未設定 Supabase" }, { status: 503 });
  }

  let body: { access_token?: unknown; expires_in?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "參數錯誤" }, { status: 400 });
  }

  const accessToken = typeof body.access_token === "string" ? body.access_token.trim() : "";
  if (!accessToken) {
    return NextResponse.json({ error: "缺少 access_token" }, { status: 400 });
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) {
    return NextResponse.json({ error: "token 無效" }, { status: 401 });
  }

  const rawTtl = typeof body.expires_in === "number" ? body.expires_in : Number(body.expires_in);
  const maxAge = Math.max(60, Math.min(Number.isFinite(rawTtl) ? rawTtl : 3600, 60 * 60 * 24 * 7));

  const jar = await cookies();
  jar.set(AUTH_ACCESS_COOKIE, accessToken, cookieOptions(maxAge));
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const jar = await cookies();
  jar.set(AUTH_ACCESS_COOKIE, "", cookieOptions(0));
  return NextResponse.json({ ok: true });
}
