import sharp from "sharp";

/** 內文／一般上傳：長邊上限（等比例 `fit: inside`） */
export const DEFAULT_UPLOAD_MAX_LONG_EDGE = 1920;
export const DEFAULT_UPLOAD_WEBP_QUALITY = 82;

const MAX_ALLOWED_LONG_EDGE = 4096;

/**
 * 伺服端專用：等比例縮小長邊、EXIF 轉正、輸出 WebP。
 * 僅供 Route Handler 呼叫，勿從 Client Component 匯入。
 */
export async function processImageBufferWithSharp(
  buffer: Buffer,
  options?: { maxLongEdge?: number; quality?: number },
): Promise<Buffer> {
  const maxLongEdge = Math.min(
    MAX_ALLOWED_LONG_EDGE,
    Math.max(64, options?.maxLongEdge ?? DEFAULT_UPLOAD_MAX_LONG_EDGE),
  );
  const quality = Math.min(100, Math.max(20, options?.quality ?? DEFAULT_UPLOAD_WEBP_QUALITY));

  return sharp(buffer)
    .rotate()
    .resize(maxLongEdge, maxLongEdge, { fit: "inside", withoutEnlargement: true })
    .webp({ quality })
    .toBuffer();
}
