// ======================================================================
// usePhotoUpload.ts — 照片上傳邏輯（基於 Customizer.tsx）
// ======================================================================

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { prepareImageForUpload } from "@/lib/prepare-upload-image-client";
import type { DecorationOption } from "./useHierarchicalOptions";

interface PhotoFrame {
  type: "diamond" | "irregular" | "circle" | "square" | "none";
  position: { x: number; y: number; width: number; height: number };
  rotation?: number;
}

interface UsePhotoUploadReturn {
  // 照片框架設定
  photoFrame: PhotoFrame | null;

  // 上傳的照片
  uploadedPhotoUrl: string | null;
  setUploadedPhotoUrl: React.Dispatch<React.SetStateAction<string | null>>;

  // 照片上傳處理
  handlePhotoUpload: (file: File) => Promise<void>;

  // 照片清除處理
  handlePhotoClear: () => Promise<void>;

  // 照片選項
  photoOptions: DecorationOption[];

  // 載入狀態
  isUploading: boolean;
  uploadError: string | null;

  // 當前上傳的檔案路徑（用於刪除）
  uploadedFilePath: string | null;
}

export function usePhotoUpload(
  decorationOptions: DecorationOption[],
  selectedDecorations: Set<number>,
): UsePhotoUploadReturn {
  const [photoFrame, setPhotoFrame] = useState<PhotoFrame | null>(null);
  const [uploadedPhotoUrl, setUploadedPhotoUrl] = useState<string | null>(null);
  const [uploadedFilePath, setUploadedFilePath] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // 過濾出照片上傳選項
  const photoOptions = decorationOptions.filter((opt) => opt.metadata_product?.requires_photo_upload === true);

  // ==================== 監聽選中的裝飾，更新照片框架 ====================
  useEffect(() => {
    // 找出選中的照片框選項
    const selectedPhotoOption = decorationOptions.find(
      (opt) => selectedDecorations.has(opt.option_id) && opt.metadata_product?.requires_photo_upload,
    );

    if (selectedPhotoOption) {
      const meta = selectedPhotoOption.metadata_product!;
      setPhotoFrame({
        type: meta.photo_carrier_type || "none",
        position: {
          x: meta.ui_x ?? 0,
          y: meta.ui_y ?? 0,
          width: meta.ui_width ?? 150,
          height: meta.ui_height ?? 150,
        },
        rotation: meta.rotation ?? 0,
      });
    } else {
      setPhotoFrame(null);
      setUploadedPhotoUrl(null);
      setUploadedFilePath(null);
    }
  }, [decorationOptions, selectedDecorations]);

  // ==================== 處理照片上傳 ====================
  const handlePhotoUpload = async (file: File) => {
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      // 1. 驗證檔案類型
      if (!file.type.startsWith("image/")) {
        throw new Error("只能上傳圖片檔案");
      }

      // 原檔可較大；經 Sharp 壓縮後應符合 Storage 限制
      if (file.size > 20 * 1024 * 1024) {
        throw new Error("圖片原檔不能超過 20MB");
      }

      const webpFile = await prepareImageForUpload(file);
      if (webpFile.size > 2 * 1024 * 1024) {
        throw new Error("壓縮後圖片仍超過 2MB，請換一張較小的圖");
      }
      const cleanFileName = `photo_${Date.now()}_${Math.random().toString(36).substring(7)}.webp`;

      const { data, error } = await supabase.storage.from("customizer_uploads").upload(cleanFileName, webpFile, {
        cacheControl: "3600",
        upsert: false,
        contentType: "image/webp",
      });

      if (error) throw error;

      // 保存檔案路徑（用於刪除）
      setUploadedFilePath(cleanFileName);

      // ✅ 3. 取得公開 URL (錯誤就在這裡！原本是 fileName，要改成 cleanFileName)
      const { data: urlData } = supabase.storage.from("customizer_uploads").getPublicUrl(cleanFileName); // <--- 這裡也要改成 cleanFileName

      setUploadedPhotoUrl(urlData.publicUrl);
      console.log("✅ 照片已上傳:", urlData.publicUrl);
    } catch (err) {
      console.error("❌ 照片上傳失敗:", err);
      setUploadError(err instanceof Error ? err.message : "上傳失敗");
    } finally {
      setIsUploading(false);
    }
  };

  // ==================== 處理照片清除 ====================
  // 注意：只清除本地狀態，不從 Storage 刪除檔案
  // Storage 檔案由 Supabase lifecycle policy 自動清理
  const handlePhotoClear = async () => {
    setUploadedPhotoUrl(null);
    setUploadedFilePath(null);
    setUploadError(null);
    console.log("✅ 照片已從本地狀態清除（Storage 檔案將由 lifecycle policy 自動清理）");
  };

  return {
    photoFrame,
    uploadedPhotoUrl,
    setUploadedPhotoUrl,
    handlePhotoUpload,
    handlePhotoClear,
    photoOptions,
    isUploading,
    uploadError,
    uploadedFilePath,
  };
}
