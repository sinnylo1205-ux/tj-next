"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Send } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { getEdgeFunctionErrorDetail } from "@/lib/edge-function-error";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** 畫布預設內容：管理員可任意編輯或刪除 */
const CANVAS_INSTRUCTIONS = `說明：建議管理員填寫以下資訊
運費、運送方式、預計取件日、品項名稱、單價、數量、地址、誰收件、客製化需求


`;

const EXAMPLE_ORDER_TEXT = `目前Back Order訂單如下:

客製紅絲絨抹茶蛋糕卷（約寬10公分 * 高7公分 * 切片厚度4公分）：$95/個
預計3/09到貨: 100個 (此批請完全比照2/23送的打樣生產)
預計3/16到貨: 100個 (待確認3/09的出貨是否需調整)
預計3/23到貨: 100個 (待確認3/09的出貨是否需調整)
預計3/30到貨: 100個 (待確認3/09的出貨是否需調整)

客製4吋輕乳酪蛋糕（約直徑10公分）：$80/個
預計3/09到貨: 100個 (此批請完全比照2/13送的打樣生產)
預計3/16到貨: 100個 (待確認3/09的出貨是否需調整)
預計3/23到貨: 100個 (待確認3/09的出貨是否需調整)
預計3/30到貨: 100個 (待確認3/09的出貨是否需調整)

保存方式與效期：冷凍30天（自出貨日計）`;

export default function AdminTextPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState(CANVAS_INSTRUCTIONS);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      const { data: roleRow, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (error || !roleRow) {
        toast({ title: "權限不足", description: "您沒有管理員權限", variant: "destructive" });
        router.push("/");
        return;
      }
      setLoading(false);
    };
    void run();
  }, [router, toast]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      toast({ title: "請貼上訂單文字", variant: "destructive" });
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("text-to-order", {
        body: { text: trimmed },
      });
      if (error) {
        const detail = await getEdgeFunctionErrorDetail(error);
        toast({ title: "傳送失敗", description: detail, variant: "destructive" });
        return;
      }
      setResult(typeof data === "object" ? JSON.stringify(data, null, 2) : String(data ?? ""));
      toast({ title: "已送出", description: "n8n 已處理回應" });
    } catch (e) {
      toast({
        title: "傳送失敗",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background admin-font admin-theme">
        <p className="text-muted-foreground">載入中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background admin-font admin-theme">
      <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
        <div className="mb-8">
          <Link
            href="/admin"
            className={cn(
              "inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4",
            )}
          >
            <ArrowLeft className="h-4 w-4" />
            返回後台
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            管理員貼上訂單文字訊息
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            將整段訂單／Back Order 文字貼在下方，送出後會由伺服器轉送至 n8n 進行 AI 分析。
          </p>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4 md:p-6 shadow-sm">
            <label htmlFor="order-text" className="block text-sm font-medium text-foreground mb-2">
              訂單文字（畫布）
            </label>
            <Textarea
              id="order-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="min-h-[320px] md:min-h-[420px] font-mono text-sm resize-y"
              disabled={sending}
              spellCheck={false}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setText(CANVAS_INSTRUCTIONS)}
                disabled={sending}
              >
                還原說明文字
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setText(`${CANVAS_INSTRUCTIONS.trimEnd()}\n\n${EXAMPLE_ORDER_TEXT}`)
                }
                disabled={sending}
              >
                填入範例文字
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={() => void handleSend()} disabled={sending}>
              {sending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  傳送中…
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  傳送分析
                </>
              )}
            </Button>
          </div>

          {result !== null && (
            <div className="rounded-xl border border-border bg-muted/40 p-4">
              <p className="text-sm font-medium text-foreground mb-2">n8n 回應</p>
              <pre className="text-xs md:text-sm whitespace-pre-wrap break-words font-mono text-muted-foreground max-h-[480px] overflow-auto">
                {result}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
