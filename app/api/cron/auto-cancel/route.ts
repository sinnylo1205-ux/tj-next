import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Vercel Cron 每分鐘呼叫此 API，轉發至 Supabase Edge Function 執行 24 小時逾時訂單自動取消。
 * 需在 Vercel 環境變數設定 CRON_SECRET，且與 Supabase 的 CRON_SECRET 一致。
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return NextResponse.json({ error: "Missing NEXT_PUBLIC_SUPABASE_URL" }, { status: 500 });
  }

  const fnUrl = `${supabaseUrl}/functions/v1/auto-cancel-expired-orders`;
  const res = await fetch(fnUrl, {
    headers: { "x-cron-secret": cronSecret },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
