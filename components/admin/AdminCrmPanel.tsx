import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Search, Send, Sparkles } from "lucide-react";
import { getEdgeFunctionErrorDetail } from "@/lib/edge-function-error";
import {
  LINE_CUSTOMER_TAGS,
  isLineCustomerTag,
  lineCustomerTagStyle,
  type LineCustomerTag,
} from "@/lib/line-customer-tags";
import { cn } from "@/lib/utils";
import AdminCrmAnalysisPanel from "./AdminCrmAnalysisPanel";

const LINE_LOG_POLL_MS = 12_000;

const MOBILE_TABS = ["接線清單", "客戶詳情", "執行把關"] as const;

type LineTagFilter = "all" | "none" | LineCustomerTag;
type CustomerModeFilter = "ordered_only" | "all";

interface Customer360Row {
  line_user_id: string;
  display_name: string | null;
  tag: string | null;
  reply_mode: string | null;
  last_message_at: string | null;
  order_count: number | null;
  lifetime_value: number | null;
  last_pickup_date: string | null;
  is_repeat_customer: boolean | null;
  primary_email: string | null;
  who_receive_names: string | null;
  has_orders: boolean | null;
}

interface LineLogRow {
  id: string;
  user_id: string;
  user_text: string | null;
  ai_reply: string | null;
  admin_reply: string | null;
  received_at: string;
}

interface OptimisticAdminMessage {
  id: string;
  text: string;
  received_at: string;
}

type ChatBubbleRole = "user" | "ai" | "admin";
interface ChatBubble {
  id: string;
  role: ChatBubbleRole;
  text: string;
  received_at: string;
}

interface CrmOrder {
  id: string;
  created_at: string;
  expected_pickup_date: string | null;
  total_amount: number | null;
  order_status: string | null;
  payment_step: string | null;
}

interface CrmOrderItem {
  order_id: string;
  product_name: string | null;
  quantity: number | null;
}

interface CrmInsights {
  interested_products: string[];
  last_ordered_products: string[];
  purchase_motivation: string;
  usage_occasion: string;
  confidence: number;
  rationale_zh: string;
  suggested_tag: LineCustomerTag | null;
  recommended_products: string[];
  suggested_send_window: string;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function lineLogToBubbles(rows: LineLogRow[]): ChatBubble[] {
  const out: ChatBubble[] = [];
  rows.forEach((row) => {
    if (row.user_text?.trim()) {
      out.push({ id: `${row.id}-u`, role: "user", text: row.user_text.trim(), received_at: row.received_at });
    }
    if (row.ai_reply?.trim()) {
      out.push({ id: `${row.id}-a`, role: "ai", text: row.ai_reply.trim(), received_at: row.received_at });
    }
    if (row.admin_reply?.trim()) {
      out.push({ id: `${row.id}-m`, role: "admin", text: row.admin_reply.trim(), received_at: row.received_at });
    }
  });
  return out.sort((a, b) => a.received_at.localeCompare(b.received_at));
}

export default function AdminCrmPanel() {
  const { toast } = useToast();
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const [mobileTab, setMobileTab] = useState(0);
  const [crmView, setCrmView] = useState<"crm" | "analysis">("crm");

  const goToTab = useCallback((index: number) => {
    setMobileTab(index);
    const el = carouselRef.current;
    if (el) el.scrollTo({ left: index * el.clientWidth, behavior: "smooth" });
  }, []);

  const handleSelectFromAnalysis = useCallback(
    (lineUserId: string) => {
      setSelectedLineUserId(lineUserId);
      setCrmView("crm");
      goToTab(1);
    },
    [goToTab],
  );

  const handleCarouselScroll = useCallback(() => {
    const el = carouselRef.current;
    if (!el || el.clientWidth === 0) return;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    setMobileTab((prev) => (prev === index ? prev : index));
  }, []);

  // 左欄
  const [customerRows, setCustomerRows] = useState<Customer360Row[]>([]);
  const [leftLoading, setLeftLoading] = useState(false);
  const [lineSearch, setLineSearch] = useState("");
  const [lineTagFilter, setLineTagFilter] = useState<LineTagFilter>("all");
  const [modeFilter, setModeFilter] = useState<CustomerModeFilter>("all");
  const [selectedLineUserId, setSelectedLineUserId] = useState<string | null>(null);
  const [chatStateUpdating, setChatStateUpdating] = useState<string | null>(null);
  const [tagSavingId, setTagSavingId] = useState<string | null>(null);

  // 中欄
  const [lineLogRows, setLineLogRows] = useState<LineLogRow[]>([]);
  const [lineLogLoading, setLineLogLoading] = useState(false);
  const [orders, setOrders] = useState<CrmOrder[]>([]);
  const [orderItems, setOrderItems] = useState<CrmOrderItem[]>([]);
  const [orderFactsLoading, setOrderFactsLoading] = useState(false);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insights, setInsights] = useState<CrmInsights | null>(null);

  // 右欄
  const [optimisticMessages, setOptimisticMessages] = useState<OptimisticAdminMessage[]>([]);
  const [replyDraft, setReplyDraft] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [draftingMessage, setDraftingMessage] = useState(false);

  const authHeader = useCallback(async (): Promise<string> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("請先重新登入管理員帳號");
    return `Bearer ${token}`;
  }, []);

  const fetchCustomers = useCallback(async () => {
    setLeftLoading(true);
    try {
      const { data, error } = await supabase
        .from("customer_360")
        .select(
          "line_user_id,display_name,tag,reply_mode,last_message_at,order_count,lifetime_value,last_pickup_date,is_repeat_customer,primary_email,who_receive_names,has_orders",
        )
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      const rows = (data as Customer360Row[]) || [];
      setCustomerRows(rows);
      if (!selectedLineUserId && rows.length > 0) setSelectedLineUserId(rows[0].line_user_id);
    } catch (error) {
      toast({
        title: "載入 CRM 客戶失敗",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
      setCustomerRows([]);
    } finally {
      setLeftLoading(false);
    }
  }, [toast, selectedLineUserId]);

  const fetchLineLog = useCallback(
    async (lineUserId: string, opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLineLogLoading(true);
      try {
        const { data, error } = await supabase
          .from("line_log")
          .select("id,user_id,user_text,ai_reply,admin_reply,received_at")
          .eq("user_id", lineUserId)
          .order("received_at", { ascending: true });
        if (error) throw error;
        setLineLogRows((data as LineLogRow[]) || []);
      } catch (error) {
        if (!opts?.silent) {
          toast({
            title: "載入對話失敗",
            description: error instanceof Error ? error.message : String(error),
            variant: "destructive",
          });
        }
      } finally {
        if (!opts?.silent) setLineLogLoading(false);
      }
    },
    [toast],
  );

  const fetchOrderFacts = useCallback(
    async (lineUserId: string) => {
      setOrderFactsLoading(true);
      try {
        const { data: users } = await supabase.from("user_log_in").select("id").eq("line_user_id", lineUserId);
        const userIds = (users ?? []).map((u) => u.id);

        const byLine = await supabase
          .from("orders")
          .select("id,created_at,expected_pickup_date,total_amount,order_status,payment_step")
          .eq("line_user_id", lineUserId)
          .order("created_at", { ascending: false })
          .limit(60);
        const byUser =
          userIds.length > 0
            ? await supabase
                .from("orders")
                .select("id,created_at,expected_pickup_date,total_amount,order_status,payment_step")
                .in("user_id", userIds)
                .order("created_at", { ascending: false })
                .limit(60)
            : { data: [] as CrmOrder[], error: null };
        if (byLine.error || byUser.error) throw new Error(byLine.error?.message || byUser.error?.message);
        const map = new Map<string, CrmOrder>();
        [...((byLine.data as CrmOrder[]) || []), ...((byUser.data as CrmOrder[]) || [])].forEach((o) => map.set(o.id, o));
        const merged = Array.from(map.values()).sort((a, b) => b.created_at.localeCompare(a.created_at));
        setOrders(merged);

        const orderIds = merged.map((o) => o.id);
        if (orderIds.length === 0) {
          setOrderItems([]);
          return;
        }
        const { data: itemRows, error: itemErr } = await supabase
          .from("order_items")
          .select("order_id,product_name,quantity")
          .in("order_id", orderIds);
        if (itemErr) throw itemErr;
        setOrderItems((itemRows as CrmOrderItem[]) || []);
      } catch (error) {
        toast({
          title: "載入訂單事實失敗",
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        });
        setOrders([]);
        setOrderItems([]);
      } finally {
        setOrderFactsLoading(false);
      }
    },
    [toast],
  );

  const fetchInsights = useCallback(async (lineUserId: string) => {
    const { data, error } = await supabase
      .from("customer_ai_insights")
      .select("insights")
      .eq("line_user_id", lineUserId)
      .maybeSingle();
    if (error) throw error;
    setInsights((data?.insights as CrmInsights) || null);
  }, []);

  const generateInsights = useCallback(async () => {
    if (!selectedLineUserId) return;
    setInsightsLoading(true);
    try {
      const header = await authHeader();
      const res = await fetch("/api/admin/crm-insights", {
        method: "POST",
        headers: { Authorization: header, "Content-Type": "application/json" },
        body: JSON.stringify({ line_user_id: selectedLineUserId }),
      });
      const json = (await res.json()) as { insights?: CrmInsights; error?: string; details?: string };
      if (!res.ok || !json.insights) throw new Error(json.details || json.error || "產生洞察失敗");
      setInsights(json.insights);
      toast({ title: "AI 洞察已更新" });
    } catch (error) {
      toast({
        title: "AI 洞察失敗",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setInsightsLoading(false);
    }
  }, [selectedLineUserId, toast, authHeader]);

  const generateMessageDraft = useCallback(async () => {
    if (!selectedLineUserId) return;
    setDraftingMessage(true);
    try {
      const header = await authHeader();
      const res = await fetch("/api/admin/crm-message-draft", {
        method: "POST",
        headers: { Authorization: header, "Content-Type": "application/json" },
        body: JSON.stringify({ line_user_id: selectedLineUserId, objective: "回購關懷" }),
      });
      const json = (await res.json()) as { draft?: { draft_text: string }; error?: string; details?: string };
      if (!res.ok || !json.draft?.draft_text) throw new Error(json.details || json.error || "產生文案失敗");
      setReplyDraft(json.draft.draft_text);
      toast({ title: "已產生 AI 草稿" });
    } catch (error) {
      toast({
        title: "AI 草稿失敗",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setDraftingMessage(false);
    }
  }, [selectedLineUserId, toast, authHeader]);

  const handleReplyModeToggle = useCallback(
    async (lineUserId: string, currentMode: string | null) => {
      const nextMode = currentMode === "ai" ? "human" : "ai";
      setChatStateUpdating(lineUserId);
      try {
        const { error } = await supabase.from("chat_state").update({ reply_mode: nextMode }).eq("line_user_id", lineUserId);
        if (error) throw error;
        setCustomerRows((prev) => prev.map((r) => (r.line_user_id === lineUserId ? { ...r, reply_mode: nextMode } : r)));
      } catch (error) {
        toast({
          title: "更新回覆模式失敗",
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        });
      } finally {
        setChatStateUpdating(null);
      }
    },
    [toast],
  );

  const handleTagChange = useCallback(
    async (lineUserId: string, nextTag: LineCustomerTag | null) => {
      setTagSavingId(lineUserId);
      try {
        const { error } = await supabase
          .from("chat_state")
          .update({ tag: nextTag, tag_source: "manual" })
          .eq("line_user_id", lineUserId);
        if (error) throw error;
        setCustomerRows((prev) => prev.map((r) => (r.line_user_id === lineUserId ? { ...r, tag: nextTag } : r)));
      } catch (error) {
        toast({
          title: "更新標籤失敗",
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        });
      } finally {
        setTagSavingId(null);
      }
    },
    [toast],
  );

  const handleApplySuggestedTag = useCallback(async () => {
    if (!selectedLineUserId || !insights?.suggested_tag) return;
    await handleTagChange(selectedLineUserId, insights.suggested_tag);
    toast({ title: `已套用建議標籤：${insights.suggested_tag}` });
  }, [selectedLineUserId, insights, handleTagChange, toast]);

  const handleSendLineReply = useCallback(async () => {
    const text = replyDraft.trim();
    if (!selectedLineUserId || !text) return;
    const optimisticId = `opt-${Date.now()}`;
    setOptimisticMessages((prev) => [...prev, { id: optimisticId, text, received_at: new Date().toISOString() }]);
    setReplyDraft("");
    setSendingReply(true);
    try {
      const { error } = await supabase.functions.invoke("admin-line-reply", {
        body: { line_user_id: selectedLineUserId, message_text: text },
      });
      if (error) {
        const detail = await getEdgeFunctionErrorDetail(error);
        throw new Error(detail);
      }
      toast({ title: "已送出 LINE 訊息" });
      void fetchLineLog(selectedLineUserId, { silent: true });
    } catch (error) {
      setOptimisticMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setReplyDraft(text);
      toast({
        title: "送出失敗",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setSendingReply(false);
    }
  }, [replyDraft, selectedLineUserId, toast, fetchLineLog]);

  useEffect(() => {
    void fetchCustomers();
  }, [fetchCustomers]);

  useEffect(() => {
    if (!selectedLineUserId) {
      setLineLogRows([]);
      setOrders([]);
      setOrderItems([]);
      setInsights(null);
      return;
    }
    void Promise.all([
      fetchLineLog(selectedLineUserId),
      fetchOrderFacts(selectedLineUserId),
      fetchInsights(selectedLineUserId).catch(() => setInsights(null)),
    ]);
  }, [selectedLineUserId, fetchLineLog, fetchOrderFacts, fetchInsights]);

  useEffect(() => {
    if (!selectedLineUserId) return;
    const id = window.setInterval(() => void fetchLineLog(selectedLineUserId, { silent: true }), LINE_LOG_POLL_MS);
    return () => window.clearInterval(id);
  }, [selectedLineUserId, fetchLineLog]);

  useEffect(() => {
    if (!chatScrollRef.current) return;
    chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [lineLogRows, optimisticMessages]);

  const selectedCustomer = useMemo(
    () => customerRows.find((r) => r.line_user_id === selectedLineUserId) ?? null,
    [customerRows, selectedLineUserId],
  );

  const filteredCustomers = useMemo(() => {
    let list = customerRows;
    if (modeFilter === "ordered_only") list = list.filter((r) => Boolean(r.has_orders));
    if (lineTagFilter === "none") list = list.filter((r) => !r.tag);
    if (lineTagFilter !== "none" && lineTagFilter !== "all") list = list.filter((r) => r.tag === lineTagFilter);
    const q = lineSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => {
      const values = [r.display_name ?? "", r.tag ?? "", r.primary_email ?? "", r.who_receive_names ?? ""]
        .join(" ")
        .toLowerCase();
      return values.includes(q);
    });
  }, [customerRows, modeFilter, lineTagFilter, lineSearch]);

  const chatBubbles = useMemo(() => {
    const merged = [...lineLogToBubbles(lineLogRows)];
    optimisticMessages.forEach((m) => {
      if (!merged.some((b) => b.role === "admin" && b.text === m.text && b.received_at >= m.received_at)) {
        merged.push({ id: m.id, role: "admin", text: m.text, received_at: m.received_at });
      }
    });
    return merged.sort((a, b) => a.received_at.localeCompare(b.received_at));
  }, [lineLogRows, optimisticMessages]);

  const validOrders = useMemo(
    () => orders.filter((o) => ["processing", "shipped", "delivered"].includes(String(o.order_status ?? "")) && o.payment_step === "verified"),
    [orders],
  );

  const orderLtv = useMemo(() => validOrders.reduce((s, o) => s + Number(o.total_amount ?? 0), 0), [validOrders]);

  const topProducts = useMemo(() => {
    const m = new Map<string, number>();
    orderItems.forEach((i) => {
      const n = i.product_name || "未命名品項";
      m.set(n, (m.get(n) ?? 0) + Number(i.quantity ?? 1));
    });
    return Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, qty]) => `${name} x${qty}`);
  }, [orderItems]);

  return (
    <div className="p-4 md:p-8">
      <div className="mb-4">
        <h1 className="text-xl md:text-3xl font-bold">客戶 CRM</h1>
        <p className="text-sm text-muted-foreground mt-1">
          左欄接線效率、中欄內容品質、右欄執行把關（LINE 優先）。
        </p>
      </div>

      <div className="mb-4 inline-flex gap-1 rounded-lg border p-1 bg-muted/40">
        <button
          type="button"
          onClick={() => setCrmView("crm")}
          className={cn(
            "px-3 py-1.5 text-sm rounded-md transition-colors",
            crmView === "crm" ? "bg-background shadow font-medium" : "text-muted-foreground",
          )}
        >
          客戶經營
        </button>
        <button
          type="button"
          onClick={() => setCrmView("analysis")}
          className={cn(
            "px-3 py-1.5 text-sm rounded-md transition-colors",
            crmView === "analysis" ? "bg-background shadow font-medium" : "text-muted-foreground",
          )}
        >
          整體分析
        </button>
      </div>

      {crmView === "analysis" ? (
        <AdminCrmAnalysisPanel onSelectCustomer={handleSelectFromAnalysis} />
      ) : (
        <>
      <div className="xl:hidden mb-3 grid grid-cols-3 gap-1 rounded-lg border p-1 bg-muted/40">
        {MOBILE_TABS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => goToTab(i)}
            className={cn(
              "py-2 text-sm rounded-md transition-colors",
              mobileTab === i ? "bg-background shadow font-medium" : "text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        ref={carouselRef}
        onScroll={handleCarouselScroll}
        className="flex xl:grid xl:grid-cols-[320px_minmax(0,1fr)_380px] gap-4 h-[calc(100vh-13rem)] min-h-[560px] overflow-x-auto xl:overflow-x-visible snap-x snap-mandatory scroll-smooth"
      >
        <Card className="shrink-0 w-full xl:w-auto snap-start flex flex-col min-h-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">接線清單</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 flex flex-col gap-3 min-h-0">
            <div className="flex gap-1">
              <Button
                type="button"
                variant={modeFilter === "ordered_only" ? "default" : "outline"}
                size="sm"
                onClick={() => setModeFilter("ordered_only")}
              >
                有下單
              </Button>
              <Button
                type="button"
                variant={modeFilter === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setModeFilter("all")}
              >
                全部
              </Button>
            </div>
            <div className="flex flex-wrap gap-1">
              <Button type="button" size="sm" variant={lineTagFilter === "all" ? "default" : "outline"} onClick={() => setLineTagFilter("all")}>全部</Button>
              <Button type="button" size="sm" variant={lineTagFilter === "none" ? "default" : "outline"} onClick={() => setLineTagFilter("none")}>無標籤</Button>
              {LINE_CUSTOMER_TAGS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  className={cn(
                    "px-2 py-1 rounded text-xs border",
                    lineTagFilter === t.value ? cn(t.badgeClass, "ring-1 ring-foreground/25") : cn(t.badgeClass, "opacity-80"),
                  )}
                  onClick={() => setLineTagFilter(t.value)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8 h-9" placeholder="搜尋名稱、標籤、Email" value={lineSearch} onChange={(e) => setLineSearch(e.target.value)} />
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
              {leftLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredCustomers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">無符合的客戶</p>
              ) : (
                filteredCustomers.map((row) => {
                  const isAi = (row.reply_mode || "ai") === "ai";
                  const activeTag = isLineCustomerTag(row.tag) ? row.tag : null;
                  const isSelected = row.line_user_id === selectedLineUserId;
                  const switchUpdating = chatStateUpdating === row.line_user_id;
                  const savingTag = tagSavingId === row.line_user_id;
                  return (
                    <div
                      key={row.line_user_id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setSelectedLineUserId(row.line_user_id);
                        goToTab(1);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedLineUserId(row.line_user_id);
                          goToTab(1);
                        }
                      }}
                      className={cn("rounded-lg border p-2.5 space-y-2", isSelected ? "border-primary bg-primary/5" : "border-border")}
                    >
                      <div className="flex justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{row.display_name || "（未命名）"}</p>
                          <p className="text-[11px] text-muted-foreground">訂單 {row.order_count ?? 0} 筆</p>
                          {activeTag ? (
                            <span className={cn("inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] border", lineCustomerTagStyle(activeTag))}>
                              {activeTag}
                            </span>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-center" onClick={(e) => e.stopPropagation()}>
                          <p className="text-[10px] text-muted-foreground mb-1">{isAi ? "AI" : "人工"}</p>
                          {switchUpdating ? (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          ) : (
                            <Switch
                              checked={isAi}
                              onCheckedChange={() => void handleReplyModeToggle(row.line_user_id, row.reply_mode)}
                              className="data-[state=checked]:bg-green-600 data-[state=unchecked]:bg-red-600 scale-90"
                            />
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                        {savingTag ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : (
                          LINE_CUSTOMER_TAGS.map((t) => {
                            const active = activeTag === t.value;
                            return (
                              <button
                                key={t.value}
                                type="button"
                                onClick={() => void handleTagChange(row.line_user_id, active ? null : t.value)}
                                className={cn(
                                  "px-2 py-0.5 rounded-full text-[10px] border",
                                  active ? cn(t.badgeClass, "ring-1 ring-foreground/25 font-semibold") : "bg-muted/50 text-muted-foreground",
                                )}
                              >
                                {t.label}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        <div className="shrink-0 w-full xl:w-auto snap-start grid grid-rows-[auto_auto_auto_minmax(0,1fr)] gap-4 min-h-0">
          <div className="rounded-lg border bg-muted/40 px-3 py-2">
            {selectedCustomer ? (
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-semibold truncate">{selectedCustomer.display_name || "（未命名）"}</span>
                {isLineCustomerTag(selectedCustomer.tag) ? (
                  <span className={cn("shrink-0 px-1.5 py-0.5 rounded-full text-[10px] border", lineCustomerTagStyle(selectedCustomer.tag))}>
                    {selectedCustomer.tag}
                  </span>
                ) : null}
                <span className="ml-auto shrink-0 text-xs text-muted-foreground truncate max-w-[55%]">
                  {selectedCustomer.primary_email || selectedCustomer.line_user_id}
                </span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">請先選擇客戶</p>
            )}
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">訂單事實</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {orderFactsLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" /> 載入中
                </div>
              ) : !selectedCustomer ? (
                <p className="text-sm text-muted-foreground">請先選擇客戶</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-md border p-2">
                      <p className="text-muted-foreground">有效訂單數</p>
                      <p className="text-lg font-semibold">{validOrders.length}</p>
                    </div>
                    <div className="rounded-md border p-2">
                      <p className="text-muted-foreground">LTV</p>
                      <p className="text-lg font-semibold">NT${orderLtv.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="text-sm space-y-1">
                    <p className="text-muted-foreground">最近取貨日：{formatDate(selectedCustomer.last_pickup_date)}</p>
                    <p className="text-muted-foreground">
                      是否回購：{validOrders.length >= 2 || selectedCustomer.is_repeat_customer ? "是" : "否"}
                    </p>
                    {topProducts.length > 0 ? (
                      <p className="text-muted-foreground">常見品項：{topProducts.join("、")}</p>
                    ) : (
                      <p className="text-muted-foreground">常見品項：—</p>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">AI 洞察</CardTitle>
              <Button type="button" size="sm" variant="outline" disabled={!selectedLineUserId || insightsLoading} onClick={() => void generateInsights()}>
                {insightsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                <span className="ml-1">更新洞察</span>
              </Button>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              {!insights ? (
                <p className="text-muted-foreground">尚未產生洞察</p>
              ) : (
                <>
                  <p><span className="text-muted-foreground">感興趣品項：</span>{insights.interested_products.join("、") || "—"}</p>
                  <p><span className="text-muted-foreground">購買動機：</span>{insights.purchase_motivation || "—"}</p>
                  <p><span className="text-muted-foreground">使用場合：</span>{insights.usage_occasion || "—"}</p>
                  <p><span className="text-muted-foreground">建議時段：</span>{insights.suggested_send_window || "—"}</p>
                  {insights.suggested_tag ? (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">建議標籤：{insights.suggested_tag}</span>
                      <Button type="button" size="sm" variant="outline" onClick={() => void handleApplySuggestedTag()}>
                        一鍵套用
                      </Button>
                    </div>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>

          <Card className="min-h-0 flex flex-col">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2 min-w-0">
                <span className="shrink-0">對話紀錄</span>
                {selectedCustomer ? (
                  <span className="text-sm font-normal text-muted-foreground truncate">
                    · {selectedCustomer.display_name || "（未命名）"}
                  </span>
                ) : null}
              </CardTitle>
              <Button type="button" size="sm" variant="outline" disabled={!selectedLineUserId || lineLogLoading} onClick={() => selectedLineUserId && void fetchLineLog(selectedLineUserId)}>
                <RefreshCw className={cn("h-4 w-4", lineLogLoading && "animate-spin")} />
              </Button>
            </CardHeader>
            <CardContent ref={chatScrollRef} className="flex-1 min-h-0 overflow-y-auto space-y-2">
              {lineLogLoading && chatBubbles.length === 0 ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : chatBubbles.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">尚無對話紀錄</p>
              ) : (
                chatBubbles.map((bubble) => {
                  const outbound = bubble.role !== "user";
                  const label = bubble.role === "user" ? "客人" : bubble.role === "admin" ? "管理員" : "AI";
                  return (
                    <div key={bubble.id} className={cn("flex", outbound ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "max-w-[82%] rounded-xl px-3 py-2 text-sm",
                          bubble.role === "user" && "bg-white border border-border",
                          bubble.role === "ai" && "bg-green-100 text-green-950",
                          bubble.role === "admin" && "bg-primary text-primary-foreground",
                        )}
                      >
                        <p className="text-[10px] opacity-70 mb-0.5">{label}</p>
                        <p className="whitespace-pre-wrap break-words">{bubble.text}</p>
                        <p className="text-[10px] opacity-65 mt-1 text-right">{formatDateTime(bubble.received_at)}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="shrink-0 w-full xl:w-auto snap-start flex flex-col min-h-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">執行把關</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 flex-1 min-h-0 overflow-y-auto">
            {!selectedCustomer ? (
              <p className="text-sm text-muted-foreground">請先選擇客戶</p>
            ) : (
              <>
                <div className="text-sm rounded-md border p-2">
                  <p className="font-medium">{selectedCustomer.display_name || "（未命名）"}</p>
                  <p className="text-muted-foreground">LINE：{selectedCustomer.line_user_id}</p>
                  <p className="text-muted-foreground">Email：{selectedCustomer.primary_email || "—"}</p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={!selectedLineUserId || draftingMessage} onClick={() => void generateMessageDraft()}>
                    {draftingMessage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    <span className="ml-1">產生 AI 草稿</span>
                  </Button>
                </div>
                <Textarea
                  placeholder="輸入要回覆給客人的訊息…"
                  rows={12}
                  value={replyDraft}
                  onChange={(e) => setReplyDraft(e.target.value)}
                  disabled={sendingReply}
                  className="resize-none"
                />
                <div className="flex justify-end">
                  <Button type="button" disabled={sendingReply || !replyDraft.trim()} onClick={() => void handleSendLineReply()}>
                    {sendingReply ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                    送出 LINE 訊息
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
        </>
      )}
    </div>
  );
}
