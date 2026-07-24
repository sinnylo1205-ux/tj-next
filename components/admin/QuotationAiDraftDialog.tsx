"use client";

import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, X } from "lucide-react";
import type { QuotationDraftResponse } from "@/lib/quotation-draft-ai";

const MAX_IMAGES = 8;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCommitted: () => void;
};

async function readFileAsDataUrl(file: File): Promise<{ base64: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || "");
      const m = s.match(/^data:([^;]+);base64,(.+)$/i);
      if (m) {
        resolve({ mime: m[1], base64: s });
      } else {
        reject(new Error("無法讀取圖片"));
      }
    };
    r.onerror = () => reject(new Error("讀取檔案失敗"));
    r.readAsDataURL(file);
  });
}

export function QuotationAiDraftDialog({ open, onOpenChange, onCommitted }: Props) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [contextYear, setContextYear] = useState(() => new Date().getFullYear());
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [loadingCommit, setLoadingCommit] = useState(false);
  const [draft, setDraft] = useState<QuotationDraftResponse | null>(null);

  const reset = useCallback(() => {
    setText("");
    setImageFiles([]);
    setDraft(null);
    setContextYear(new Date().getFullYear());
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleOpenChange = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const authHeader = async (): Promise<string> => {
    const { data: { session } } = await supabase.auth.getSession();
    const t = session?.access_token;
    if (!t) throw new Error("請先以管理員身分登入");
    return `Bearer ${t}`;
  };

  const addImageFiles = (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const incoming = Array.from(files);
    const nonImage = incoming.find((f) => !f.type.startsWith("image/"));
    if (nonImage) {
      toast({ title: "僅支援圖片檔", description: nonImage.name, variant: "destructive" });
      return;
    }
    setImageFiles((prev) => {
      const next = [...prev, ...incoming];
      if (next.length > MAX_IMAGES) {
        toast({
          title: `最多 ${MAX_IMAGES} 張截圖`,
          description: `已保留前 ${MAX_IMAGES} 張`,
          variant: "destructive",
        });
        return next.slice(0, MAX_IMAGES);
      }
      return next;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeImageAt = (index: number) => {
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const runDraft = async () => {
    setLoadingDraft(true);
    setDraft(null);
    try {
      if (!text.trim() && imageFiles.length === 0) {
        toast({ title: "請貼上文字或選擇截圖", variant: "destructive" });
        setLoadingDraft(false);
        return;
      }

      const images: { base64: string; mime_type: string }[] = [];
      for (const file of imageFiles) {
        if (!file.type.startsWith("image/")) {
          toast({ title: "僅支援圖片檔", description: file.name, variant: "destructive" });
          setLoadingDraft(false);
          return;
        }
        const { base64, mime } = await readFileAsDataUrl(file);
        images.push({
          base64,
          mime_type: mime || file.type || "image/jpeg",
        });
      }

      const res = await fetch("/api/admin/quotation-draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: await authHeader(),
        },
        body: JSON.stringify({
          text: text.trim(),
          images,
          context_year: contextYear,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "產生草稿失敗");
      }

      setDraft({
        quotation_kind: data.quotation_kind,
        rationale_zh: data.rationale_zh ?? "",
        warnings: Array.isArray(data.warnings) ? data.warnings : [],
        quotation_order: data.quotation_order ?? {},
        quotation_order_items: Array.isArray(data.quotation_order_items) ? data.quotation_order_items : [],
        all_requirement: data.all_requirement ?? {},
      });

      toast({
        title: "草稿已產生",
        description: "請確認下方摘要與警告，無誤後再寫入資料庫。",
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "產生草稿失敗";
      toast({ title: "AI 草稿失敗", description: msg, variant: "destructive" });
    } finally {
      setLoadingDraft(false);
    }
  };

  const runCommit = async () => {
    if (!draft) return;
    setLoadingCommit(true);
    try {
      const res = await fetch("/api/admin/quotation-draft/commit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: await authHeader(),
        },
        body: JSON.stringify({
          quotation_order: draft.quotation_order,
          quotation_order_items: draft.quotation_order_items,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "寫入失敗");
      }
      const id = data.quotation_order_id as string | undefined;
      toast({
        title: "已建立報價單",
        description: id ? `編號 #${id.slice(0, 6).toUpperCase()}` : undefined,
      });
      handleOpenChange(false);
      onCommitted();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "寫入失敗";
      toast({ title: "建立報價單失敗", description: msg, variant: "destructive" });
    } finally {
      setLoadingCommit(false);
    }
  };

  const comboIdOf = (row: Record<string, unknown>) => {
    const cj = row.customizations_json;
    if (cj && typeof cj === "object" && !Array.isArray(cj) && "combo_id" in cj) {
      return String((cj as { combo_id?: string }).combo_id ?? "—");
    }
    return "—";
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>AI建立報價單</DialogTitle>
          <DialogDescription>
            文字與圖片會送到伺服器，由 OpenAI 解析為「一般」或「特殊」報價結構；可一次上傳多張截圖。按「產生草稿」只預覽，按「建立報價單」才寫入 Supabase。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>對話或需求文字（可與截圖併用）</Label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="貼上 LINE／Email 對話全文…"
              rows={5}
              className="text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label>截圖（選填，最多 {MAX_IMAGES} 張）</Label>
            <Input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => addImageFiles(e.target.files)}
              className="text-sm"
            />
            {imageFiles.length > 0 ? (
              <ul className="space-y-1.5 pt-1">
                {imageFiles.map((file, index) => (
                  <li
                    key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                    className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs"
                  >
                    <span className="min-w-0 flex-1 truncate text-muted-foreground" title={file.name}>
                      {index + 1}. {file.name}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 shrink-0 p-0"
                      onClick={() => removeImageAt(index)}
                      aria-label={`移除 ${file.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">可一次選多張，或分次再加</p>
            )}
          </div>
          <div className="space-y-1">
            <Label>補全年份（對話只寫月/日時）</Label>
            <Input
              type="number"
              min={2000}
              max={2100}
              value={contextYear}
              onChange={(e) => setContextYear(Number(e.target.value) || new Date().getFullYear())}
              className="w-32"
            />
          </div>

          <Button type="button" className="w-full" onClick={runDraft} disabled={loadingDraft || loadingCommit}>
            {loadingDraft ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                AI 解析中…
              </>
            ) : (
              "產生草稿"
            )}
          </Button>
        </div>

        {draft ? (
          <>
            <Separator />
            <div className="space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">類型</span>
                <Badge variant={draft.quotation_kind === "special" ? "default" : "secondary"}>
                  {draft.quotation_kind === "special" ? "特殊報價" : "一般報價"}
                </Badge>
              </div>
              {draft.rationale_zh ? (
                <p>
                  <span className="font-medium text-muted-foreground">判斷說明：</span>
                  {draft.rationale_zh}
                </p>
              ) : null}
              {draft.warnings.length > 0 ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950">
                  <p className="font-medium text-xs mb-1">警告（請人工核對）</p>
                  <ul className="list-disc pl-4 text-xs space-y-0.5">
                    {draft.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <p className="text-muted-foreground text-xs">
                品項 {draft.quotation_order_items.length} 筆 · 表頭狀態：{" "}
                {String((draft.quotation_order as { status?: string }).status ?? "—")}
              </p>
              <div className="border rounded-md max-h-40 overflow-y-auto text-xs">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-2">品名</th>
                      <th className="text-right p-2 w-14">數量</th>
                      <th className="text-left p-2 w-24">combo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.quotation_order_items.map((row, idx) => {
                      const r = row as Record<string, unknown>;
                      return (
                        <tr key={idx} className="border-b last:border-0">
                          <td className="p-2 align-top">{String(r.product_name ?? "")}</td>
                          <td className="p-2 text-right align-top">{String(r.quantity ?? "")}</td>
                          <td className="p-2 align-top font-mono text-[10px] truncate" title={comboIdOf(r)}>
                            {comboIdOf(r).slice(0, 8)}…
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            關閉
          </Button>
          {draft ? (
            <Button type="button" onClick={runCommit} disabled={loadingCommit || loadingDraft}>
              {loadingCommit ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  寫入中…
                </>
              ) : (
                "建立報價單（寫入資料庫）"
              )}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
