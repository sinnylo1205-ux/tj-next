/**
 * 將圖片檔案（或 Blob）轉為 WebP 格式。
 * 使用 Canvas API，僅限瀏覽器端。
 */
export function convertToWebP(file: File | Blob, quality = 0.85): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas not supported"));
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("WebP 轉換失敗"));
          const originalName = file instanceof File ? file.name : "image";
          const webpFile = new File(
            [blob],
            originalName.replace(/\.\w+$/, ".webp"),
            { type: "image/webp" },
          );
          URL.revokeObjectURL(img.src);
          resolve(webpFile);
        },
        "image/webp",
        quality,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error("圖片載入失敗"));
    };
    img.src = URL.createObjectURL(file);
  });
}
