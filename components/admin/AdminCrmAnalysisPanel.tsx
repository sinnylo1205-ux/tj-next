import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Sparkles, RefreshCw } from "lucide-react";
import { lineCustomerTagStyle } from "@/lib/line-customer-tags";
import { cn } from "@/lib/utils";

interface ReportPayload {
  scope_days: number;
  generated_at: string;
  kpi: {
    total: number;
    intent: { 高意願: number; 中意願: number; 低意願: number; 未標: number };
    high_intent_total: number;
    high_intent_not_ordered: number;
    high_intent_conversion_rate: number;
  };
  top_products: Array<{ name: string; count: number }>;
  high_intent_not_ordered_list: Array<{
    line_user_id: string;
    display_name: string | null;
    lifetime_value: number;
    last_message_at: string | null;
    primary_email: string | null;
  }>;
  ai: {
    common_questions: string[];
    best_lead_profile: string;
    weekly_actions: string[];
    model: string;
  };
}

const SCOPE_DAYS = 90;

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function AdminCrmAnalysisPanel({
  onSelectCustomer,
}: {
  onSelectCustomer: (lineUserId: string) => void;
}) {
  const { toast } = useToast();
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const authHeader = useCallback(async (): Promise<string> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("請先重新登入管理員帳號");
    return `Bearer ${token}`;
  }, []);

  const fetchCached = useCallback(async () => {
    setLoading(true);
    try {
      const header = await authHeader();
      const res = await fetch("/api/admin/crm-aggregate", { headers: { Authorization: header } });
      const json = (await res.json()) as { report?: { report?: ReportPayload } | null; error?: string };
      if (!res.ok) throw new Error(json.error || "讀取報表失敗");
      setReport(json.report?.report ?? null);
    } catch (error) {
      toast({
        title: "載入分析報表失敗",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [authHeader, toast]);

  useEffect(() => {
    void fetchCached();
  }, [fetchCached]);

  const runFullAnalysis = useCallback(async () => {
    setRunning(true);
    setProgress({ done: 0, total: 0 });
    try {
      const header = await authHeader();

      // 第一階段：分批跑單客洞察 + 自動寫標籤
      let offset = 0;
      let guard = 0;
      let totalProcessed = 0;
      let totalFailed = 0;
      let lastFailReason = "";
      for (;;) {
        guard += 1;
        if (guard > 1000) break; // 安全上限
        const res = await fetch("/api/admin/crm-insights-batch", {
          method: "POST",
          headers: { Authorization: header, "Content-Type": "application/json" },
          body: JSON.stringify({ days: SCOPE_DAYS, offset, limit: 10 }),
        });
        const json = (await res.json()) as {
          ok?: boolean;
          total?: number;
          next_offset?: number;
          done?: boolean;
          processed_count?: number;
          failed_count?: number;
          failed?: Array<{ line_user_id: string; error: string }>;
          error?: string;
          details?: string;
        };
        if (!res.ok || !json.ok) throw new Error(json.details || json.error || "批次分析失敗");
        totalProcessed += json.processed_count ?? 0;
        totalFailed += json.failed_count ?? 0;
        if (json.failed?.length) lastFailReason = json.failed[0].error;
        offset = json.next_offset ?? offset;
        setProgress({ done: Math.min(offset, json.total ?? offset), total: json.total ?? offset });
        if (json.done) break;
      }

      // 全數失敗時，直接把 OpenAI 的原始錯誤拋出，避免「看似完成卻沒標籤」
      if (totalProcessed === 0 && totalFailed > 0) {
        throw new Error(`全部 ${totalFailed} 筆都失敗。原因：${lastFailReason || "未知"}`);
      }
      if (totalFailed > 0) {
        toast({
          title: "部分客戶分析失敗",
          description: `成功 ${totalProcessed} 筆、失敗 ${totalFailed} 筆。最後一筆失敗原因：${lastFailReason || "未知"}`,
          variant: "destructive",
        });
      }

      // 第二階段：聚合 + AI 文字洞察
      const aggRes = await fetch("/api/admin/crm-aggregate", {
        method: "POST",
        headers: { Authorization: header, "Content-Type": "application/json" },
        body: JSON.stringify({ days: SCOPE_DAYS }),
      });
      const aggJson = (await aggRes.json()) as { ok?: boolean; report?: ReportPayload; error?: string; details?: string };
      if (!aggRes.ok || !aggJson.report) throw new Error(aggJson.details || aggJson.error || "聚合分析失敗");
      setReport(aggJson.report);
      toast({ title: "分析完成", description: `成功分析 ${totalProcessed} 位（近 ${SCOPE_DAYS} 天有互動）` });
    } catch (error) {
      toast({
        title: "一鍵分析失敗",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }, [authHeader, toast]);

  const intentEntries: Array<{ key: string; value: number; tag: string | null }> = report
    ? [
        { key: "🔥 高意願", value: report.kpi.intent.高意願, tag: "高意願" },
        { key: "🌤 中意願", value: report.kpi.intent.中意願, tag: "中意願" },
        { key: "❄️ 低意願", value: report.kpi.intent.低意願, tag: "低意願" },
        { key: "未標", value: report.kpi.intent.未標, tag: null },
      ]
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {report ? (
            <>分析範圍：近 {report.scope_days} 天　|　上次分析：{formatDateTime(report.generated_at)}</>
          ) : (
            <>尚無分析報表，點右側按鈕開始</>
          )}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" disabled={loading || running} onClick={() => void fetchCached()}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            <span className="ml-1">重新整理</span>
          </Button>
          <Button type="button" size="sm" disabled={running} onClick={() => void runFullAnalysis()}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            <span className="ml-1">
              {running
                ? progress
                  ? `分析中 ${progress.done}/${progress.total}`
                  : "分析中…"
                : "一鍵分析所有對話"}
            </span>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !report ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            還沒有分析結果。按「一鍵分析所有對話」會先逐一分析近 {SCOPE_DAYS} 天有互動的客戶（並自動標上意願標籤），再彙整成報表。
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPI */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">分析客戶數</p>
                <p className="text-2xl font-semibold">{report.kpi.total}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">高意願客戶</p>
                <p className="text-2xl font-semibold text-red-700">{report.kpi.high_intent_total}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">高意願未成交</p>
                <p className="text-2xl font-semibold text-amber-700">{report.kpi.high_intent_not_ordered}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">高意願轉換率</p>
                <p className="text-2xl font-semibold text-emerald-700">
                  {Math.round(report.kpi.high_intent_conversion_rate * 100)}%
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 意願分布 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">意願分布</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {intentEntries.map((e) => {
                  const pct = report.kpi.total > 0 ? Math.round((e.value / report.kpi.total) * 100) : 0;
                  return (
                    <div key={e.key} className="flex items-center gap-2">
                      <span className={cn("w-20 shrink-0 text-xs px-1.5 py-0.5 rounded border text-center", lineCustomerTagStyle(e.tag))}>
                        {e.key}
                      </span>
                      <div className="flex-1 h-2.5 rounded bg-muted overflow-hidden">
                        <div className="h-full bg-primary/70" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
                        {e.value}（{pct}%）
                      </span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* 熱門品項 Top5 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">熱門/被詢問品項 Top 5</CardTitle>
              </CardHeader>
              <CardContent>
                {report.top_products.length === 0 ? (
                  <p className="text-sm text-muted-foreground">尚無資料</p>
                ) : (
                  <ol className="space-y-1.5">
                    {report.top_products.map((p, i) => (
                      <li key={p.name} className="flex justify-between text-sm">
                        <span className="truncate">{i + 1}. {p.name}</span>
                        <span className="text-muted-foreground shrink-0 ml-2">{p.count}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          </div>

          {/* AI 文字洞察 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">AI 洞察</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground mb-1">最可能下單客戶特徵</p>
                <p>{report.ai.best_lead_profile || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">常見問題／需求類型</p>
                {report.ai.common_questions.length === 0 ? (
                  <p>—</p>
                ) : (
                  <ul className="list-disc pl-5 space-y-0.5">
                    {report.ai.common_questions.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-muted-foreground mb-1">本週建議行動</p>
                {report.ai.weekly_actions.length === 0 ? (
                  <p>—</p>
                ) : (
                  <ul className="list-disc pl-5 space-y-0.5">
                    {report.ai.weekly_actions.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 高意願未成交名單 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">高意願未成交（最該追的客人）</CardTitle>
            </CardHeader>
            <CardContent>
              {report.high_intent_not_ordered_list.length === 0 ? (
                <p className="text-sm text-muted-foreground">目前沒有高意願未成交客戶</p>
              ) : (
                <div className="divide-y">
                  {report.high_intent_not_ordered_list.map((c) => (
                    <button
                      key={c.line_user_id}
                      type="button"
                      onClick={() => onSelectCustomer(c.line_user_id)}
                      className="w-full flex items-center justify-between gap-2 py-2 text-left hover:bg-muted/50 rounded px-1"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{c.display_name || "（未命名）"}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {c.primary_email || c.line_user_id}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{formatDateTime(c.last_message_at)}</span>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
