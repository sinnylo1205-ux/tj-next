import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type AdminAuthOk = {
  userId: string;
  supabase: SupabaseClient;
};

/**
 * 報價草稿／寫入 API 共用：Service Role + JWT，並確認 has_role admin。
 */
export async function assertAdminQuotationApi(req: Request): Promise<AdminAuthOk | Response> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: "伺服器未設定 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY" },
      { status: 503 },
    );
  }

  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return NextResponse.json(
      { error: "未授權：請在 Header 帶入 Authorization: Bearer <Supabase access_token>" },
      { status: 401 },
    );
  }

  const sb = createClient(url, serviceKey);
  const {
    data: { user },
    error: userErr,
  } = await sb.auth.getUser(token);
  if (userErr || !user) {
    return NextResponse.json({ error: "認證失敗或 token 已過期" }, { status: 401 });
  }

  const { data: isAdmin, error: roleErr } = await sb.rpc("has_role", {
    _user_id: user.id,
    _role: "admin",
  });
  if (roleErr || !isAdmin) {
    return NextResponse.json({ error: "僅限管理員" }, { status: 403 });
  }

  return { userId: user.id, supabase: sb };
}
