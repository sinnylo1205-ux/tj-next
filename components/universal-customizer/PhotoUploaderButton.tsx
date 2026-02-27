// ======================================================================
// PhotoUploaderButton.tsx — 獨立照片上傳按鈕（基於 Customizer.tsx）
// ======================================================================

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface PhotoUploaderButtonProps {
  onUpload: (file: File) => Promise<void>;
  isUploading?: boolean;
  hasUploaded?: boolean;
}

function validatePhotoFile(file: File): string | null {
  const allowedTypes = new Set(["image/png", "image/jpeg"]);

  if (!file.type?.startsWith("image/")) return "只能上傳圖片檔案（PNG 或 JPG）";
  if (!allowedTypes.has(file.type)) return "只支援 PNG 或 JPG 格式";
  if (file.size > 2 * 1024 * 1024) return "圖片大小不能超過 2MB";

  return null;
}

export function PhotoUploaderButton({
  onUpload,
  isUploading = false,
  hasUploaded = false,
}: PhotoUploaderButtonProps) {
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string>("");

  return (
    <div className="space-y-2">
      <input
        type="file"
        accept="image/png,image/jpeg,image/jpg"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          // 允許使用者再次選同一個檔案
          e.target.value = "";
          if (!file) return;

          const validationError = validatePhotoFile(file);
          if (validationError) {
            setAlertMessage(`${validationError}。請上傳合規照片。`);
            setAlertOpen(true);
            return;
          }

          try {
            await onUpload(file);
          } catch (err) {
            setAlertMessage(err instanceof Error ? err.message : "上傳失敗，請稍後再試");
            setAlertOpen(true);
          }
        }}
        disabled={isUploading}
        className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 disabled:opacity-50"
      />

      <p className="text-xs text-muted-foreground">請上傳 PNG 或 JPG 格式照片，大小不超過 2MB</p>
      {isUploading && <p className="text-xs text-muted-foreground">上傳中…</p>}
      {hasUploaded && <p className="text-xs text-primary">照片已上傳</p>}

      <AlertDialog open={alertOpen} onOpenChange={setAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>照片不符合規範</AlertDialogTitle>
            <AlertDialogDescription>{alertMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>我知道了</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

