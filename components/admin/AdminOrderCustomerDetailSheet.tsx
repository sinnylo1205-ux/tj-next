"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Sparkles, Send } from "lucide-react";
import type { CustomerOrderSummary, WakeupDraftRow } from "@/lib/customer-wakeup";

type CustomerLite = {
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

async function getAuthHeader(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  return token ? `Bearer ${token}` : null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function channelLabel(row: CustomerLite | null | undefined): string {
  if (!row) return "無可用通道";
  if (row.has_line && row.line_user_id) return "LINE";
  if (row.has_email && row.primary_email) return "Email";
  return "無可用通道";
}

export default function AdminOrderCustomerDetailSheet({
  open,
  row,
  onOpenChange,
  onSent,
}: {
  open: boolean;
  row: CustomerLite | null;
  onOpenChange: (open: boolean) => void;
  onSent?: () => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<CustomerOrderSummary[]>([]);
  const [pendingDraft, setPendingDraft] = useState<WakeupDraftRow | null>(null);
  const [optOut, setOptOut] = useState(false);
  const [message, setMessage] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const loadSeqRef = useRef(0);
  const activeCustomerKeyRef = useRef<string | null>(null);

  useEffect(() => {
    activeCustomerKeyRef.current = row?.customer_key ?? null;
  }, [row?.customer_key]);

  const loadDetail = useCallback(async () => {
    if (!row) return;
    const requestKey = row.customer_key;
    const seq = ++loadSeqRef.current;
    setLoading(true);
    try {
      const header = await getAuthHeader();
      if (!header) throw new Error("請重新登入");
      const res = await fetch(
        `/api/admin/wakeup-customer?customer_key=${encodeURIComponent(requestKey)}`,
        { headers: { Authorization: header } },
      );
      const json = (await res.json()) as {
        orders?: CustomerOrderSummary[];
        pending_draft?: WakeupDraftRow | null;
        wakeup_opt_out?: boolean;
        error?: string;
        details?: string;
      };
      if (!res.ok) throw new Error(json.details || json.error || "載入失敗");
      // 忽略過期回應，避免客戶 A 的草稿覆寫到目前檢視的客戶 B
      if (seq !== loadSeqRef.current || activeCustomerKeyRef.current !== requestKey) {
        return;
      }
      setOrders(json.orders ?? []);
      setPendingDraft(json.pending_draft ?? null);
      setOptOut(Boolean(json.wakeup_opt_out));
      if (json.pending_draft?.draft_text) {
        setMessage(json.pending_draft.draft_text);
      } else {
        setMessage("");
      }
    } catch (error) {
      if (seq !== loadSeqRef.current || activeCustomerKeyRef.current !== requestKey) {
        return;
      }
      toast({
        title: "載入客戶詳情失敗",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      if (seq === loadSeqRef.current) {
        setLoading(false);
      }
    }
  }, [row, toast]);

  useEffect(() => {
    if (open && row) void loadDetail();
  }, [open, row, loadDetail]);

  const generateAi = useCallback(async () => {
    if (!row) return;
    setAiBusy(true);
    try {
      const header = await getAuthHeader();
      if (!header) throw new Error("請重新登入");
      const res = await fetch("/api/admin/wakeup-draft", {
        method: "POST",
        headers: { Authorization: header, "Content-Type": "application/json" },
        body: JSON.stringify({ customer_key: row.customer_key }),
      });
      const json = (await res.json()) as { draft_text?: string; error?: string; details?: string };
      if (!res.ok || !json.draft_text) throw new Error(json.details || json.error || "產生失敗");
      setMessage(json.draft_text);
      toast({ title: "已產生 AI 草稿", description: `將經 ${channelLabel(row)} 發送（需再按發送）` });
    } catch (error) {
      toast({
        title: "AI 草稿失敗",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setAiBusy(false);
    }
  }, [row, toast]);

  const sendNow = useCallback(async () => {
    if (!row || !message.trim()) return;
    const customerKey = row.customer_key;
    const draftId = pendingDraft?.id ?? null;
    if (draftId && pendingDraft?.customer_key && pendingDraft.customer_key !== customerKey) {
      toast({
        title: "發送失敗",
        description: "草稿與目前客戶不一致，請重新載入後再試",
        variant: "destructive",
      });
      return;
    }
    setSendBusy(true);
    try {
      const header = await getAuthHeader();
      if (!header) throw new Error("請重新登入");
      if (activeCustomerKeyRef.current !== customerKey) {
        throw new Error("客戶已切換，已取消發送");
      }
      const res = await fetch("/api/admin/wakeup-send", {
        method: "POST",
        headers: { Authorization: header, "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_key: customerKey,
          message_text: message.trim(),
          customer_name: row.customer_name,
          line_user_id: row.line_user_id,
          email: row.primary_email,
          draft_id: draftId,
        }),
      });
      const json = (await res.json()) as { channel?: string; error?: string; details?: string };
      if (!res.ok) throw new Error(json.details || json.error || "發送失敗");
      if (activeCustomerKeyRef.current !== customerKey) return;
      toast({ title: "已發送", description: `通道：${json.channel === "line" ? "LINE" : "Email"}` });
      setPendingDraft(null);
      onSent?.();
      await loadDetail();
    } catch (error) {
      if (activeCustomerKeyRef.current !== customerKey) return;
      toast({
        title: "發送失敗",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setSendBusy(false);
    }
  }, [row, message, pendingDraft, toast, onSent, loadDetail]);

  const dismissDraft = useCallback(async () => {
    if (!pendingDraft || !row) return;
    if (pendingDraft.customer_key !== row.customer_key) {
      toast({
        title: "操作失敗",
        description: "草稿與目前客戶不一致，請重新載入後再試",
        variant: "destructive",
      });
      return;
    }
    const draftId = pendingDraft.id;
    const customerKey = row.customer_key;
    setReviewBusy(true);
    try {
      const header = await getAuthHeader();
      if (!header) throw new Error("請重新登入");
      if (activeCustomerKeyRef.current !== customerKey) {
        throw new Error("客戶已切換，已取消略過");
      }
      const res = await fetch("/api/admin/wakeup-review", {
        method: "POST",
        headers: { Authorization: header, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss", draft_id: draftId }),
      });
      const json = (await res.json()) as { error?: string; details?: string };
      if (!res.ok) throw new Error(json.details || json.error || "略過失敗");
      if (activeCustomerKeyRef.current !== customerKey) return;
      toast({ title: "已略過此草稿" });
      setPendingDraft(null);
      onSent?.();
    } catch (error) {
      if (activeCustomerKeyRef.current !== customerKey) return;
      toast({
        title: "操作失敗",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setReviewBusy(false);
    }
  }, [pendingDraft, row, toast, onSent]);

  const toggleOptOut = useCallback(async () => {
    if (!row) return;
    setReviewBusy(true);
    try {
      const header = await getAuthHeader();
      if (!header) throw new Error("請重新登入");
      const next = !optOut;
      const res = await fetch("/api/admin/wakeup-review", {
        method: "POST",
        headers: { Authorization: header, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "opt_out",
          customer_key: row.customer_key,
          wakeup_opt_out: next,
        }),
      });
      const json = (await res.json()) as { error?: string; details?: string };
      if (!res.ok) throw new Error(json.details || json.error || "更新失敗");
      setOptOut(next);
      toast({ title: next ? "已關閉自動喚醒草稿" : "已開啟自動喚醒草稿" });
    } catch (error) {
      toast({
        title: "更新失敗",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setReviewBusy(false);
    }
  }, [row, optOut, toast]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{row?.customer_name || "客戶詳情"}</SheetTitle>
          <SheetDescription>
            {row ? (
              <>
                {row.order_count} 筆訂單 · 上次購買 {formatDate(row.last_purchase_at)}
                <br />
                喚醒通道：{channelLabel(row)}
                {row.company_name ? ` · ${row.company_name}` : ""}
              </>
            ) : null}
          </SheetDescription>
        </SheetHeader>

        {loading || !row ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            <div className="space-y-2 text-sm">
              <div className="flex flex-wrap gap-1">
                {row?.has_line ? (
                  <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200">
                    LINE
                  </Badge>
                ) : null}
                {row?.has_email ? (
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-200">
                    Email
                  </Badge>
                ) : null}
                {row?.admin_note ? (
                  <span className="text-muted-foreground">備注：{row.admin_note}</span>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground break-all">
                {row?.primary_email || "—"} · {row?.primary_phone || "—"}
                {row?.line_user_id ? ` · ${row.line_user_id}` : ""}
              </p>
            </div>

            <div>
              <h3 className="text-sm font-medium mb-2">訂單概況</h3>
              <div className="rounded-md border overflow-x-auto max-h-56">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>日期</TableHead>
                      <TableHead>狀態</TableHead>
                      <TableHead>付款</TableHead>
                      <TableHead>金額</TableHead>
                      <TableHead>品項</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                          無有效訂單
                        </TableCell>
                      </TableRow>
                    ) : (
                      orders.map((o) => (
                        <TableRow key={o.id}>
                          <TableCell className="whitespace-nowrap text-xs">{formatDate(o.created_at)}</TableCell>
                          <TableCell className="text-xs">{o.order_status || "—"}</TableCell>
                          <TableCell className="text-xs">{o.payment_step || "—"}</TableCell>
                          <TableCell className="text-xs">
                            {o.total_amount != null ? `$${Math.round(o.total_amount)}` : "—"}
                          </TableCell>
                          <TableCell className="text-xs max-w-[140px] truncate" title={o.items_summary}>
                            {o.items_summary}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium">會員喚醒</h3>
                {pendingDraft ? (
                  <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">
                    待審草稿
                  </Badge>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                手寫或 AI 產文後發送。優先 LINE，無 LINE 則 Email。提及上次訂單、感謝、詢問回饋、邀請再訂。
              </p>
              <div className="space-y-2">
                <Label htmlFor="wakeup-message">訊息內容</Label>
                <Textarea
                  id="wakeup-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  placeholder="輸入關心訊息…"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => void generateAi()} disabled={aiBusy}>
                  {aiBusy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
                  產生 AI 草稿
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void sendNow()}
                  disabled={sendBusy || !row || !message.trim() || channelLabel(row) === "無可用通道"}
                >
                  {sendBusy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                  發送（{channelLabel(row)}）
                </Button>
                {pendingDraft ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void dismissDraft()}
                    disabled={reviewBusy}
                  >
                    略過待審草稿
                  </Button>
                ) : null}
              </div>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="px-0 h-auto text-xs"
                onClick={() => void toggleOptOut()}
                disabled={reviewBusy}
              >
                {optOut ? "重新開啟自動產草稿" : "關閉此客戶自動產草稿"}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
