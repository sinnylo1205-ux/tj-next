"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, Loader2, Copy, Trash2, AlertTriangle, X, ImageIcon, Film } from "lucide-react";

interface UploadRecord {
  url: string;
  fileName: string;
  uploadedAt: string;
  mediaType: "image" | "video";
}

const IG_PHOTO_FOLDER = "IG/photo";
const IG_REELS_FOLDER = "IG/reels";

function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

function isVideoFile(file: File) {
  return file.type.startsWith("video/");
}

import { prepareImageForUpload } from "@/lib/prepare-upload-image-client";
import { SafeImage } from "@/components/SafeImage";

const HISTORY_KEY = "admin_ig_upload_history";

const BatchUploadTab = () => {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadTotal, setUploadTotal] = useState(0);
  const [batchResults, setBatchResults] = useState<UploadRecord[]>([]);
  const [history, setHistory] = useState<UploadRecord[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(HISTORY_KEY);
      if (stored) setHistory(JSON.parse(stored));
    } catch {}
  }, []);

  const saveHistory = (records: UploadRecord[]) => {
    const updated = [...records, ...history];
    setHistory(updated);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  };

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setSelectedFiles((prev) => [...prev, ...files]);
    setBatchResults([]);
    e.target.value = "";
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const clearSelectedFiles = () => {
    setSelectedFiles([]);
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    setUploading(true);
    setUploadProgress(0);
    setUploadTotal(selectedFiles.length);
    const results: UploadRecord[] = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      try {
        if (!isImageFile(file) && !isVideoFile(file)) {
          toast({ title: `不支援的檔案: ${file.name}`, description: "請上傳照片或影片", variant: "destructive" });
          setUploadProgress(i + 1);
          continue;
        }

        const baseName = file.name.replace(/\.\w+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_");
        const isVideo = isVideoFile(file);

        let uploadBlob: Blob | File;
        let fileName: string;
        let contentType: string;
        let displayName: string;

        if (isVideo) {
          const ext = file.name.split(".").pop()?.toLowerCase() || "mp4";
          fileName = `${IG_REELS_FOLDER}/${Date.now()}_${baseName}.${ext}`;
          uploadBlob = file;
          contentType = file.type || "video/mp4";
          displayName = file.name;
        } else {
          const webpFile = await prepareImageForUpload(file);
          fileName = `${IG_PHOTO_FOLDER}/${Date.now()}_${baseName}.webp`;
          uploadBlob = webpFile;
          contentType = "image/webp";
          displayName = webpFile.name;
        }

        const { error } = await supabase.storage
          .from("custom_asset")
          .upload(fileName, uploadBlob, { upsert: true, contentType });
        if (error) {
          toast({ title: `上傳失敗: ${file.name}`, description: error.message, variant: "destructive" });
        } else {
          const { data } = supabase.storage.from("custom_asset").getPublicUrl(fileName);
          results.push({
            url: data.publicUrl,
            fileName: displayName,
            uploadedAt: new Date().toISOString(),
            mediaType: isVideo ? "video" : "image",
          });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "處理失敗";
        toast({ title: `處理失敗: ${file.name}`, description: message, variant: "destructive" });
      }
      setUploadProgress(i + 1);
    }

    setBatchResults(results);
    if (results.length > 0) {
      saveHistory(results);
      const photoCount = results.filter((r) => r.mediaType === "image").length;
      const videoCount = results.filter((r) => r.mediaType === "video").length;
      const parts: string[] = [];
      if (photoCount > 0) parts.push(`${photoCount} 張照片`);
      if (videoCount > 0) parts.push(`${videoCount} 支影片`);
      toast({ title: `✅ 已上傳 ${parts.join("、")}` });
    }
    setSelectedFiles([]);
    setUploading(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "✅ 已複製" });
  };

  const copyAll = (records: UploadRecord[]) => {
    const text = records.map((r) => r.url).join("\n");
    navigator.clipboard.writeText(text);
    toast({ title: `✅ 已複製 ${records.length} 個連結` });
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem(HISTORY_KEY);
    toast({ title: "紀錄已清除" });
  };

  return (
    <div className="space-y-6">
      {/* Warning */}
      <Card className="border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-950/20">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" />
          <div className="text-sm space-y-1">
            <p className="font-medium">提醒</p>
            <p className="text-muted-foreground">
              請先將檔名改為<strong>英文</strong>，上傳後將公開連結貼到 Google Sheet。
            </p>
            <ul className="text-muted-foreground list-disc pl-4 space-y-0.5">
              <li>
                <strong>照片</strong> → 自動上傳至 <code className="text-xs bg-muted px-1 rounded">IG/photo/</code>
              </li>
              <li>
                <strong>影片</strong> → 自動上傳至 <code className="text-xs bg-muted px-1 rounded">IG/reels/</code>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Upload area */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Upload className="h-4 w-4 mr-2" />
              {selectedFiles.length > 0 ? "繼續選擇" : "選擇照片或影片"}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={handleFilesSelected}
            />
            {selectedFiles.length > 0 && (
              <>
                <span className="text-sm text-muted-foreground">已選 {selectedFiles.length} 個檔案</span>
                <Button onClick={handleUpload} disabled={uploading}>
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  開始上傳
                </Button>
                <Button variant="ghost" size="sm" onClick={clearSelectedFiles} disabled={uploading}>
                  <Trash2 className="h-4 w-4 mr-1" /> 清除已選
                </Button>
              </>
            )}
          </div>

          {/* Selected files preview */}
          {selectedFiles.length > 0 && !uploading && (
            <div className="flex flex-wrap gap-2">
              {selectedFiles.map((file, i) => (
                <div key={i} className="flex items-center gap-1.5 bg-muted/50 rounded px-2 py-1 text-xs">
                  {isVideoFile(file) ? (
                    <Film className="h-3 w-3 text-muted-foreground shrink-0" />
                  ) : (
                    <ImageIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                  )}
                  <span className="max-w-[150px] truncate">{file.name}</span>
                  <span className="text-muted-foreground shrink-0">
                    → {isVideoFile(file) ? "IG/reels" : "IG/photo"}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {uploading && (
            <div className="space-y-2">
              <Progress value={(uploadProgress / uploadTotal) * 100} />
              <p className="text-xs text-muted-foreground">
                {uploadProgress} / {uploadTotal}
              </p>
            </div>
          )}

          {batchResults.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">本次上傳結果</p>
                <Button size="sm" variant="outline" onClick={() => copyAll(batchResults)}>
                  <Copy className="h-3 w-3 mr-1" /> 全部複製
                </Button>
              </div>
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {batchResults.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1.5">
                    {r.mediaType === "video" ? (
                      <div className="h-10 w-10 shrink-0 rounded bg-muted flex items-center justify-center">
                        <Film className="h-4 w-4 text-muted-foreground" />
                      </div>
                    ) : (
                      <SafeImage
                        src={r.url}
                        alt={r.fileName}
                        width={40}
                        height={40}
                        className="h-10 w-10 shrink-0 rounded object-cover"
                        sizes="40px"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    )}
                    <span className="font-medium shrink-0">{r.fileName}</span>
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline truncate flex-1"
                    >
                      {r.url}
                    </a>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 shrink-0"
                      onClick={() => copyToClipboard(r.url)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">📋 上傳紀錄</p>
            {history.length > 0 && (
              <Button size="sm" variant="ghost" className="text-destructive" onClick={clearHistory}>
                <Trash2 className="h-3 w-3 mr-1" /> 清除紀錄
              </Button>
            )}
          </div>
          {history.length === 0 ? (
            <p className="text-xs text-muted-foreground">尚無上傳紀錄</p>
          ) : (
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {history.map((r, i) => {
                const isVideo = r.mediaType === "video" || r.url.includes("/IG/reels/");
                return (
                <div key={i} className="flex items-center gap-2 text-xs bg-muted/30 rounded px-2 py-1.5">
                  {isVideo ? (
                    <div className="h-8 w-8 shrink-0 rounded bg-muted flex items-center justify-center">
                      <Film className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  ) : (
                    <SafeImage
                      src={r.url}
                      alt={r.fileName}
                      width={32}
                      height={32}
                      className="h-8 w-8 shrink-0 rounded object-cover"
                      sizes="32px"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  )}
                  <span className="text-muted-foreground shrink-0 w-32">
                    {new Date(r.uploadedAt).toLocaleString("zh-TW")}
                  </span>
                  <span className="font-medium shrink-0">{r.fileName}</span>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline truncate flex-1"
                  >
                    {r.url}
                  </a>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 shrink-0"
                    onClick={() => copyToClipboard(r.url)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default BatchUploadTab;
