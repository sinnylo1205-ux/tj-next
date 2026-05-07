import { NextResponse } from "next/server";
import {
  DEFAULT_UPLOAD_MAX_LONG_EDGE,
  processImageBufferWithSharp,
} from "@/lib/sharp-process-upload";

export const runtime = "nodejs";

const MAX_INPUT_BYTES = 20 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "缺少檔案欄位 file" }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "僅支援圖片" }, { status: 400 });
    }

    const maxRaw = form.get("max");
    const parsedMax =
      typeof maxRaw === "string" && maxRaw.trim() !== ""
        ? Number.parseInt(maxRaw, 10)
        : Number.NaN;
    const maxLongEdge = Number.isFinite(parsedMax) && parsedMax > 0 ? parsedMax : DEFAULT_UPLOAD_MAX_LONG_EDGE;

    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length > MAX_INPUT_BYTES) {
      return NextResponse.json({ error: "檔案過大（上限 20MB）" }, { status: 413 });
    }

    const out = await processImageBufferWithSharp(buf, { maxLongEdge });

    return new NextResponse(new Uint8Array(out), {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "處理失敗";
    console.error("[process-upload-image]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
