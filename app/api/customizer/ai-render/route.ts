import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAuthenticatedUser } from "@/lib/checkout-auth";
import { runAiPhotorealRender } from "@/lib/ai-render-image";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  source_image_url: z.string().url(),
});

/**
 * POST /api/customizer/ai-render
 * 會員限定：合成圖 → OpenAI gpt-image-2 擬真 → WebP 上傳 customizer_uploads。
 * 每日（Asia/Taipei）成功上限 3 次。
 */
export async function POST(req: Request) {
  try {
    const auth = await assertAuthenticatedUser(req);
    if (auth instanceof Response) return auth;

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "無效的 JSON body" }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "請提供有效的 source_image_url" }, { status: 400 });
    }

    const result = await runAiPhotorealRender({
      userId: auth.userId,
      sourceImageUrl: parsed.data.source_image_url,
    });

    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI 擬真渲染失敗";
    const status = (e as Error & { status?: number }).status === 429 ? 429 : 500;
    console.error("[ai-render]", msg);
    return NextResponse.json({ error: msg }, { status });
  }
}
