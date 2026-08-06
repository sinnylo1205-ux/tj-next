"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import AdminOrderCustomerDetailSheet from "@/components/admin/AdminOrderCustomerDetailSheet";
import type { WakeupDraftRow } from "@/lib/customer-wakeup";

async function getAuthHeader(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  return token ? `Bearer ${token}` : null;
}

type RollupLite = {
  customer_key: string;
  customer_name: string | null;
  order_count: number;
  last_purchase_at: string | null;
  primary_email: string | null;
  primary_phone: string | null;
  line_user_id: string | null;
  has_line: boolean;
  has_email: boolean;
  admin_note?: string | null;
  customer_type?: string | null;
  company_name?: string | null;
};

function sourceLabel(source: string): string {
  if (source === "backfill") return "回填";
  if (source === "cron_14d_pickup") return "取件+14天";
  if (source === "cron_30d") return "舊滿30天";
  return source;
}

export default function AdminWakeupDraftsPanel({
  onOpenLineCustomer,
}: {
  onOpenLineCustomer?: (lineUserId: string) => void;
}) {
  const { toast } = useToast();
  const [pendingDrafts, setPendingDrafts] = useState<WakeupDraftRow[]>([]);
  const [sentDrafts, setSentDrafts] = useState<WakeupDraftRow[]>([]);
  const [nameByKey, setNameByKey] = useState<Map<string, string>>(new Map());
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [backfillBusy, setBackfillBusy] = useState(false);
  const [reviewBusyId, setReviewBusyId] = useState<string | null>(null);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [editingDraftText, setEditingDraftText] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<RollupLite | null>(null);

  const fetchDrafts = useCallback(async () => {
    setDraftsLoading(true);
    try {
      const header = await getAuthHeader();
      if (!header) return;
      const [pendingRes, sentRes, rollupRes] = await Promise.all([
        fetch("/api/admin/wakeup-review?status=pending_review", {
          headers: { Authorization: header },
        }),
        fetch("/api/admin/wakeup-review?status=sent", {
          headers: { Authorization: header },
        }),
        supabase
          .from("order_customer_rollup")
          .select(
            "customer_key,customer_name,order_count,last_purchase_at,primary_email,primary_phone,line_user_id,has_line,has_email,admin_note,customer_type,company_name",
          ),
      ]);
      const pendingJson = (await pendingRes.json()) as { drafts?: WakeupDraftRow[]; error?: string };
      const sentJson = (await sentRes.json()) as { drafts?: WakeupDraftRow[]; error?: string };
      if (!pendingRes.ok) throw new Error(pendingJson.error || "載入草稿失敗");
      if (!sentRes.ok) throw new Error(sentJson.error || "載入已發送失敗");
      setPendingDrafts(pendingJson.drafts ?? []);
      setSentDrafts((sentJson.drafts ?? []).slice(0, 30));

      const map = new Map<string, string>();
      for (const r of (rollupRes.data as RollupLite[] | null) ?? []) {
        map.set(r.customer_key, r.customer_name || r.customer_key);
      }
      setNameByKey(map);
    } catch (error) {
      console.error(error);
      setPendingDrafts([]);
      setSentDrafts([]);
      toast({
        title: "載入喚醒草稿失敗",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setDraftsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void fetchDrafts();
  }, [fetchDrafts]);

  const openCustomer = useCallback(async (customerKey: string) => {
    const { data } = await supabase
      .from("order_customer_rollup")
      .select(
        "customer_key,customer_name,order_count,last_purchase_at,primary_email,primary_phone,line_user_id,has_line,has_email,admin_note,customer_type,company_name",
      )
      .eq("customer_key", customerKey)
      .maybeSingle();
    if (data) {
      setDetailRow(data as RollupLite);
      setDetailOpen(true);
    }
  }, []);

  const runBackfill = useCallback(async () => {
    if (
      !window.confirm(
        "將為「取件日已滿 ≥ 14 天」且尚無待審草稿的客戶批次產 AI 草稿（每次最多 50 筆）。確定執行？",
      )
    ) {
      return;
    }
    setBackfillBusy(true);
    try {
      const header = await getAuthHeader();
      if (!header) throw new Error("請重新登入");
      const res = await fetch("/api/admin/wakeup-backfill", {
        method: "POST",
        headers: { Authorization: header, "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true, limit: 50 }),
      });
      const json = (await res.json()) as {
        created?: number;
        skipped?: number;
        failed?: number;
        remaining?: number;
        eligible_total?: number;
        error?: string;
        details?: string;
      };
      if (!res.ok) throw new Error(json.details || json.error || "回填失敗");
      toast({
        title: "回填完成",
        description: `新增 ${json.created ?? 0}、略過 ${json.skipped ?? 0}、失敗 ${json.failed ?? 0}（符合 ${json.eligible_total ?? 0}，剩餘 ${json.remaining ?? 0}）`,
      });
      await fetchDrafts();
    } catch (error) {
      toast({
        title: "回填失敗",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setBackfillBusy(false);
    }
  }, [toast, fetchDrafts]);

  const approveDraft = useCallback(
    async (draft: WakeupDraftRow, text: string) => {
      setReviewBusyId(draft.id);
      try {
        const header = await getAuthHeader();
        if (!header) throw new Error("請重新登入");
        const res = await fetch("/api/admin/wakeup-review", {
          method: "POST",
          headers: { Authorization: header, "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "approve_send",
            draft_id: draft.id,
            draft_text: text,
          }),
        });
        const json = (await res.json()) as { channel?: string; error?: string; details?: string };
        if (!res.ok) throw new Error(json.details || json.error || "發送失敗");
        toast({
          title: "已核准並發送",
          description: `通道：${json.channel === "line" ? "LINE" : "Email"}`,
        });
        setEditingDraftId(null);
        await fetchDrafts();
      } catch (error) {
        toast({
          title: "核准發送失敗",
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        });
      } finally {
        setReviewBusyId(null);
      }
    },
    [toast, fetchDrafts],
  );

  const dismissDraft = useCallback(
    async (draftId: string) => {
      setReviewBusyId(draftId);
      try {
        const header = await getAuthHeader();
        if (!header) throw new Error("請重新登入");
        const res = await fetch("/api/admin/wakeup-review", {
          method: "POST",
          headers: { Authorization: header, "Content-Type": "application/json" },
          body: JSON.stringify({ action: "dismiss", draft_id: draftId }),
        });
        const json = (await res.json()) as { error?: string; details?: string };
        if (!res.ok) throw new Error(json.details || json.error || "略過失敗");
        toast({ title: "已略過草稿" });
        await fetchDrafts();
      } catch (error) {
        toast({
          title: "操作失敗",
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        });
      } finally {
        setReviewBusyId(null);
      }
    },
    [toast, fetchDrafts],
  );

  const resendDraft = useCallback(
    async (draft: WakeupDraftRow, text?: string) => {
      setReviewBusyId(draft.id);
      try {
        const header = await getAuthHeader();
        if (!header) throw new Error("請重新登入");
        const res = await fetch("/api/admin/wakeup-review", {
          method: "POST",
          headers: { Authorization: header, "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "resend",
            draft_id: draft.id,
            draft_text: text ?? draft.draft_text,
          }),
        });
        const json = (await res.json()) as { channel?: string; error?: string; details?: string };
        if (!res.ok) throw new Error(json.details || json.error || "重新發送失敗");
        toast({
          title: "已重新發送",
          description: `通道：${json.channel === "line" ? "LINE" : "Email"}`,
        });
        await fetchDrafts();
      } catch (error) {
        toast({
          title: "重新發送失敗",
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        });
      } finally {
        setReviewBusyId(null);
      }
    },
    [toast, fetchDrafts],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          依訂單「取件日」滿 14 天後由 AI 產關心草稿（不自動發送）。審核通過後優先 LINE，無 LINE 則 Email。
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void runBackfill()} disabled={backfillBusy}>
            {backfillBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            <span className="ml-1">回填取件後 14 天草稿</span>
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void fetchDrafts()} disabled={draftsLoading}>
            {draftsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-1">重新整理</span>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-medium">
            待審喚醒草稿
            {draftsLoading ? "…" : `（${pendingDrafts.length}）`}
          </h3>
          {pendingDrafts.length === 0 && !draftsLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">目前沒有待審草稿</p>
          ) : (
            <div className="space-y-3 max-h-[28rem] overflow-y-auto">
              {pendingDrafts.map((d) => {
                const busy = reviewBusyId === d.id;
                const editing = editingDraftId === d.id;
                const text = editing ? editingDraftText : d.draft_text;
                const displayName =
                  nameByKey.get(d.customer_key) ||
                  (d.metadata && typeof d.metadata === "object" && "customer_name" in d.metadata
                    ? String((d.metadata as { customer_name?: unknown }).customer_name || d.customer_key)
                    : d.customer_key);
                return (
                  <div key={d.id} className="rounded-md border p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">{displayName}</span>
                      <Badge variant="outline">{d.channel === "line" ? "LINE" : "Email"}</Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        {sourceLabel(d.source)}
                      </Badge>
                    </div>
                    {editing ? (
                      <Textarea
                        value={editingDraftText}
                        onChange={(e) => setEditingDraftText(e.target.value)}
                        rows={4}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{d.draft_text}</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {!editing ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingDraftId(d.id);
                            setEditingDraftText(d.draft_text);
                          }}
                        >
                          編輯
                        </Button>
                      ) : (
                        <Button type="button" size="sm" variant="outline" onClick={() => setEditingDraftId(null)}>
                          取消編輯
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy || !text.trim()}
                        onClick={() => void approveDraft(d, text)}
                      >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                        核准發送
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void dismissDraft(d.id)}
                      >
                        略過
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="link"
                        className="px-0"
                        onClick={() => void openCustomer(d.customer_key)}
                      >
                        開啟客戶
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">
              最近已發送
              {draftsLoading ? "…" : `（${sentDrafts.length}）`}
            </h3>
            <p className="text-xs text-muted-foreground">可重新推播</p>
          </div>
          {sentDrafts.length === 0 && !draftsLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">尚無已發送紀錄</p>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {sentDrafts.map((d) => {
                const busy = reviewBusyId === d.id;
                const displayName =
                  nameByKey.get(d.customer_key) ||
                  (d.metadata && typeof d.metadata === "object" && "customer_name" in d.metadata
                    ? String((d.metadata as { customer_name?: unknown }).customer_name || d.customer_key)
                    : d.customer_key);
                const sentAt = d.sent_at
                  ? new Date(d.sent_at).toLocaleString("zh-TW", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—";
                return (
                  <div key={d.id} className="rounded-md border p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">{displayName}</span>
                      <Badge variant="outline">{d.channel === "line" ? "LINE" : "Email"}</Badge>
                      <span className="text-xs text-muted-foreground">發送於 {sentAt}</span>
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{d.draft_text}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" disabled={busy} onClick={() => void resendDraft(d)}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                        重新發送
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="link"
                        className="px-0"
                        onClick={() => void openCustomer(d.customer_key)}
                      >
                        開啟客戶
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <AdminOrderCustomerDetailSheet
        open={detailOpen}
        row={detailRow}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) setDetailRow(null);
        }}
        onSent={() => void fetchDrafts()}
      />
      {/* onOpenLineCustomer reserved for future jump from detail */}
      {onOpenLineCustomer ? null : null}
    </div>
  );
}
