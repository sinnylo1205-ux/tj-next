/**
 * 將使用者選擇的圖片送交 `/api/process-upload-image`（Sharp：等比例縮小長邊 + WebP），
 * 回傳可再交由 Supabase Storage `upload` 的 `File`。
 * 僅限瀏覽器／Client Component 使用。
 */

export type PrepareImageForUploadOptions = {
  /** 長邊像素上限，預設與伺服端 `DEFAULT_UPLOAD_MAX_LONG_EDGE` 一致 */
  maxLongEdge?: number;
};

export async function prepareImageForUpload(
  file: File,
  options?: PrepareImageForUploadOptions,
): Promise<File> {
  if (!file.type.startsWith("image/")) {
    throw new Error("僅能上傳圖片檔案");
  }

  const fd = new FormData();
  fd.append("file", file);
  if (options?.maxLongEdge != null && options.maxLongEdge > 0) {
    fd.append("max", String(Math.round(options.maxLongEdge)));
  }

  const res = await fetch("/api/process-upload-image", { method: "POST", body: fd });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = (await res.json()) as { error?: string };
      if (j?.error) detail = j.error;
    } catch {
      try {
        detail = await res.text();
      } catch {
        /* ignore */
      }
    }
    throw new Error(detail || `圖片處理失敗 (${res.status})`);
  }

  const blob = await res.blob();
  const baseName = file.name.replace(/\.\w+$/i, "") || "image";
  return new File([blob], `${baseName}.webp`, { type: "image/webp" });
}
