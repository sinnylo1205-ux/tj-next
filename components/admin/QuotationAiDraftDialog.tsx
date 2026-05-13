"use client";

import { useState, useCallback } from "react";
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
import { Loader2 } from "lucide-react";
import type { QuotationDraftResponse } from "@/lib/quotation-draft-ai";

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
  const [text, setText] = useState("");
  const [contextYear, setContextYear] = useState(() => new Date().getFullYear());
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [loadingCommit, setLoadingCommit] = useState(false);
  const [draft, setDraft] = useState<QuotationDraftResponse | null>(null);

  const reset = useCallback(() => {
    setText("");
    setImageFile(null);
    setDraft(null);
    setContextYear(new Date().getFullYear());
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

  const runDraft = async () => {
    setLoadingDraft(true);
    setDraft(null);
    try {
      let image_base64: string | undefined;
      let image_mime_type = "image/jpeg";
      if (imageFile) {
        if (!imageFile.type.startsWith("image/")) {
          toast({ title: "僅支援圖片檔", variant: "destructive" });
          setLoadingDraft(false);
          return;
        }
        const { base64, mime } = await readFileAsDataUrl(imageFile);
        image_base64 = base64;
        image_mime_type = mime || imageFile.type || "image/jpeg";
      }

      if (!text.trim() && !image_base64) {
        toast({ title: "請貼上文字或選擇截圖", variant: "destructive" });
        setLoadingDraft(false);
        return;
      }

      const res = await fetch("/api/admin/quotation-draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: await authHeader(),
        },
        body: JSON.stringify({
          text: text.trim(),
          image_base64,
          image_mime_type,
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
          <DialogTitle>從對話／截圖建立報價（AI 草稿）</DialogTitle>
          <DialogDescription>
            文字與圖片會送到伺服器，由 OpenAI 解析為「一般」或「特殊」報價結構；按「產生草稿」只預覽，按「建立報價單」才寫入 Supabase。
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
            <Label>截圖（選填）</Label>
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
            {imageFile ? (
              <p className="text-xs text-muted-foreground">已選：{imageFile.name}</p>
            ) : null}
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
