import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Search, UserPlus, ChevronDown, ChevronUp, Loader2, Send, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Json } from "@/integrations/supabase/types";
import { getEdgeFunctionErrorDetail } from "@/lib/edge-function-error";
import {
  LINE_CUSTOMER_TAGS,
  type LineCustomerTag,
  isLineCustomerTag,
  lineCustomerTagStyle,
} from "@/lib/line-customer-tags";
import { cn } from "@/lib/utils";

const LINE_LOG_POLL_MS = 12_000;

interface CustomerRow {
  name: string;
  email: string | null;
  line_user_id: string | null;
  order_count: number;
  feedbacks: Json[];
  /** 該客戶所有訂單中，expected_pickup_date 最晚的一筆（YYYY-MM-DD） */
  last_pickup_date: string | null;
  after_sales_status: string | null;
}

interface ChatStateRow {
  line_user_id: string;
  display_name: string | null;
  tag: string | null;
  reply_mode: string | null;
  /** DB 欄位為 `updated`（非 updated_at） */
  updated: string | null;
}

/** 標籤篩選：null = 全部，"__none__" = 無標籤，其餘為標籤值 */
type LineTagFilter = "all" | "none" | LineCustomerTag;

interface LineLogRow {
  id: string;
  user_id: string;
  user_text: string | null;
  ai_reply: string | null;
  admin_reply: string | null;
  received_at: string;
  message_type: string | null;
  status: string | null;
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

function lineLogToBubbles(rows: LineLogRow[]): ChatBubble[] {
  const bubbles: ChatBubble[] = [];
  for (const row of rows) {
    const ts = row.received_at;
    if (row.user_text?.trim()) {
      bubbles.push({
        id: `${row.id}-user`,
        role: "user",
        text: row.user_text.trim(),
        received_at: ts,
      });
    }
    if (row.ai_reply?.trim()) {
      bubbles.push({
        id: `${row.id}-ai`,
        role: "ai",
        text: row.ai_reply.trim(),
        received_at: ts,
      });
    }
    if (row.admin_reply?.trim()) {
      bubbles.push({
        id: `${row.id}-admin`,
        role: "admin",
        text: row.admin_reply.trim(),
        received_at: ts,
      });
    }
  }
  return bubbles;
}

function pruneOptimisticAgainstLog(
  logRows: LineLogRow[],
  optimistic: OptimisticAdminMessage[],
): OptimisticAdminMessage[] {
  const loggedAdminTexts = new Set(
    logRows.map((r) => r.admin_reply?.trim()).filter((t): t is string => Boolean(t)),
  );
  return optimistic.filter((o) => !loggedAdminTexts.has(o.text.trim()));
}

function mergeChatBubbles(logRows: LineLogRow[], optimistic: OptimisticAdminMessage[]): ChatBubble[] {
  const pending = pruneOptimisticAgainstLog(logRows, optimistic);
  const fromLog = lineLogToBubbles(logRows);
  const fromOpt: ChatBubble[] = pending.map((o) => ({
    id: o.id,
    role: "admin" as const,
    text: o.text,
    received_at: o.received_at,
  }));
  return [...fromLog, ...fromOpt].sort((a, b) => a.received_at.localeCompare(b.received_at));
}

function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const AdminCustomersPanel = () => {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const { toast } = useToast();

  // Line 客戶管理（chat_state）
  const [chatStateList, setChatStateList] = useState<ChatStateRow[]>([]);
  const [chatStateLoading, setChatStateLoading] = useState(false);
  const [chatStateUpdating, setChatStateUpdating] = useState<string | null>(null);
  const [tagSavingId, setTagSavingId] = useState<string | null>(null);
  const [lineTagFilter, setLineTagFilter] = useState<LineTagFilter>("all");
  const [afterSalesSavingName, setAfterSalesSavingName] = useState<string | null>(null);

  // LINE 對話收發
  const [lineSearch, setLineSearch] = useState("");
  const [selectedLineUserId, setSelectedLineUserId] = useState<string | null>(null);
  const [lineLogRows, setLineLogRows] = useState<LineLogRow[]>([]);
  const [lineLogLoading, setLineLogLoading] = useState(false);
  const [optimisticMessages, setOptimisticMessages] = useState<OptimisticAdminMessage[]>([]);
  const [replyDraft, setReplyDraft] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Manual add user form
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [adding, setAdding] = useState(false);

  const laterPickupDate = (current: string | null, next: string | null): string | null => {
    if (!next) return current;
    if (!current) return next;
    return next > current ? next : current;
  };

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      // Fetch all orders with relevant fields
      const { data: orders, error } = await supabase
        .from("orders")
        .select("who_receive, Email, line_user_id, user_id, feedback, expected_pickup_date")
        .not("who_receive", "is", null);

      if (error) throw error;

      // Fetch user_log_in for line_user_id mapping
      const userIds = [...new Set((orders || []).map((o) => o.user_id).filter(Boolean))] as string[];
      const userLineMap: Record<string, string | null> = {};
      if (userIds.length > 0) {
        const { data: users } = await supabase.from("user_log_in").select("id, line_user_id").in("id", userIds);
        users?.forEach((u) => {
          userLineMap[u.id] = u.line_user_id;
        });
      }

      // Group by who_receive
      const grouped: Record<string, CustomerRow> = {};
      (orders || []).forEach((order) => {
        const name = order.who_receive || "";
        if (!name) return;

        if (!grouped[name]) {
          grouped[name] = {
            name,
            email: null,
            line_user_id: null,
            order_count: 0,
            feedbacks: [],
            last_pickup_date: null,
            after_sales_status: null,
          };
        }

        grouped[name].order_count += 1;

        // Take latest non-null email
        if (order.Email && !grouped[name].email) {
          grouped[name].email = order.Email;
        }

        // LINE user ID: prefer user_log_in, fallback to orders
        if (!grouped[name].line_user_id) {
          grouped[name].line_user_id = userLineMap[order.user_id as string] || order.line_user_id || null;
        }

        // 上次購買／取貨日：取所有訂單 expected_pickup_date 中最晚的一筆
        const pu = order.expected_pickup_date as string | null | undefined;
        if (pu) {
          grouped[name].last_pickup_date = laterPickupDate(grouped[name].last_pickup_date, pu);
        }

        // Collect feedbacks
        if (order.feedback) {
          grouped[name].feedbacks.push(order.feedback);
        }
      });

      // 依「上次購買日期」（expected_pickup_date 最晚一筆）新→舊；無日期者排最後
      const sorted = Object.values(grouped).sort((a, b) => {
        const da = a.last_pickup_date;
        const db = b.last_pickup_date;
        if (da && db) return db.localeCompare(da);
        if (da && !db) return -1;
        if (!da && db) return 1;
        return a.name.localeCompare(b.name, "zh-Hant");
      });
      const names = sorted.map((c) => c.name);
      if (names.length > 0) {
        const { data: noteRows, error: noteErr } = await supabase
          .from("customer_admin_notes")
          .select("who_receive, after_sales_status")
          .in("who_receive", names);
        if (noteErr) {
          console.error("Failed to fetch customer_admin_notes:", noteErr);
        } else {
          const nm = new Map((noteRows || []).map((r) => [r.who_receive, r.after_sales_status as string | null]));
          sorted.forEach((c) => {
            c.after_sales_status = nm.get(c.name) ?? null;
          });
        }
      }

      setCustomers(sorted);
    } catch (err) {
      console.error("Failed to fetch customers:", err);
      toast({ title: "載入客戶資料失敗", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const fetchChatState = useCallback(async () => {
    setChatStateLoading(true);
    try {
      const { data, error } = await supabase
        .from("chat_state")
        .select("line_user_id, display_name, tag, reply_mode, updated")
        .order("updated", { ascending: false, nullsFirst: false });
      if (error) throw error;
      setChatStateList((data as ChatStateRow[]) || []);
    } catch (err: any) {
      console.error("Failed to fetch chat_state:", err);
      const hint =
        typeof err?.message === "string" && err.message.includes("permission")
          ? "（請確認登入帳號在 user_roles 具備 admin，且 chat_state RLS 已部署）"
          : "";
      toast({
        title: "載入 LINE 客戶失敗",
        description: `${err?.message ?? err}${hint}`,
        variant: "destructive",
      });
      setChatStateList([]);
    } finally {
      setChatStateLoading(false);
    }
  }, [toast]);

  const handleReplyModeToggle = async (lineUserId: string, currentMode: string | null) => {
    const nextMode = (currentMode === "ai" ? "human" : "ai") as "ai" | "human";
    setChatStateUpdating(lineUserId);
    try {
      const { error } = await supabase
        .from("chat_state")
        .update({ reply_mode: nextMode })
        .eq("line_user_id", lineUserId);
      if (error) throw error;
      setChatStateList((prev) =>
        prev.map((row) => (row.line_user_id === lineUserId ? { ...row, reply_mode: nextMode } : row))
      );
      toast({ title: nextMode === "ai" ? "已切換為 AI 回覆" : "已切換為人工回覆" });
    } catch (err: any) {
      toast({ title: "更新失敗", description: err.message, variant: "destructive" });
    } finally {
      setChatStateUpdating(null);
    }
  };

  const handleAfterSalesBlur = async (whoReceive: string, value: string) => {
    const row = customers.find((c) => c.name === whoReceive);
    if (!row || (row.after_sales_status ?? "") === value.trim()) return;
    setAfterSalesSavingName(whoReceive);
    try {
      const { error } = await supabase.from("customer_admin_notes").upsert(
        {
          who_receive: whoReceive,
          after_sales_status: value.trim() || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "who_receive" },
      );
      if (error) throw error;
      setCustomers((prev) =>
        prev.map((c) => (c.name === whoReceive ? { ...c, after_sales_status: value.trim() || null } : c)),
      );
      toast({ title: "售後狀況已儲存" });
    } catch (err: any) {
      toast({ title: "儲存售後狀況失敗", description: err.message, variant: "destructive" });
    } finally {
      setAfterSalesSavingName(null);
    }
  };

  const fetchLineLog = useCallback(
    async (lineUserId: string, options?: { silent?: boolean }) => {
      if (!options?.silent) setLineLogLoading(true);
      try {
        const { data, error } = await supabase
          .from("line_log")
          .select("id, user_id, user_text, ai_reply, admin_reply, received_at, message_type, status")
          .eq("user_id", lineUserId)
          .order("received_at", { ascending: true });

        if (error) throw error;

        const rows = (data as LineLogRow[]) || [];
        setLineLogRows(rows);
        setOptimisticMessages((prev) => pruneOptimisticAgainstLog(rows, prev));
      } catch (err: unknown) {
        console.error("Failed to fetch line_log:", err);
        const msg = err instanceof Error ? err.message : String(err);
        const hint =
          typeof msg === "string" && msg.includes("permission")
            ? "（請確認 line_log RLS 已部署，且帳號為 admin）"
            : "";
        if (!options?.silent) {
          toast({
            title: "載入對話失敗",
            description: `${msg}${hint}`,
            variant: "destructive",
          });
        }
        if (!options?.silent) setLineLogRows([]);
      } finally {
        if (!options?.silent) setLineLogLoading(false);
      }
    },
    [toast],
  );

  const handleSendLineReply = async () => {
    const trimmed = replyDraft.trim();
    if (!selectedLineUserId || !trimmed) return;

    setSendingReply(true);
    const optimisticId = `opt-${Date.now()}`;
    const sentAt = new Date().toISOString();
    setOptimisticMessages((prev) => [...prev, { id: optimisticId, text: trimmed, received_at: sentAt }]);
    setReplyDraft("");

    try {
      const { error } = await supabase.functions.invoke("admin-line-reply", {
        body: { line_user_id: selectedLineUserId, message_text: trimmed },
      });
      if (error) {
        const detail = await getEdgeFunctionErrorDetail(error);
        setOptimisticMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        setReplyDraft(trimmed);
        toast({ title: "送出失敗", description: detail, variant: "destructive" });
        return;
      }
      toast({ title: "已送出 LINE 訊息" });
      void fetchLineLog(selectedLineUserId, { silent: true });
    } catch (e) {
      setOptimisticMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setReplyDraft(trimmed);
      toast({
        title: "送出失敗",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setSendingReply(false);
    }
  };

  const handleTagChange = async (lineUserId: string, nextTag: LineCustomerTag | null) => {
    const row = chatStateList.find((r) => r.line_user_id === lineUserId);
    if (!row || (row.tag ?? null) === nextTag) return;
    setTagSavingId(lineUserId);
    try {
      const { error } = await supabase
        .from("chat_state")
        .update({ tag: nextTag })
        .eq("line_user_id", lineUserId);
      if (error) throw error;
      setChatStateList((prev) =>
        prev.map((r) => (r.line_user_id === lineUserId ? { ...r, tag: nextTag } : r)),
      );
      toast({ title: nextTag ? `已標記為「${nextTag}」` : "已移除標籤" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "更新標籤失敗", description: msg, variant: "destructive" });
    } finally {
      setTagSavingId(null);
    }
  };

  useEffect(() => { fetchCustomers(); }, []);
  useEffect(() => { fetchChatState(); }, [fetchChatState]);

  useEffect(() => {
    if (!selectedLineUserId) {
      setLineLogRows([]);
      setOptimisticMessages([]);
      return;
    }
    setOptimisticMessages([]);
    void fetchLineLog(selectedLineUserId);
  }, [selectedLineUserId, fetchLineLog]);

  useEffect(() => {
    if (!selectedLineUserId) return;
    const id = window.setInterval(() => {
      void fetchLineLog(selectedLineUserId, { silent: true });
    }, LINE_LOG_POLL_MS);
    return () => window.clearInterval(id);
  }, [selectedLineUserId, fetchLineLog]);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [lineLogRows, optimisticMessages, selectedLineUserId]);

  useEffect(() => {
    if (chatStateList.length === 0) {
      setSelectedLineUserId(null);
      return;
    }
    if (!selectedLineUserId || !chatStateList.some((r) => r.line_user_id === selectedLineUserId)) {
      setSelectedLineUserId(chatStateList[0].line_user_id);
    }
  }, [chatStateList, selectedLineUserId]);

  const filteredLineCustomers = useMemo(() => {
    let list = chatStateList;
    if (lineTagFilter === "none") {
      list = list.filter((r) => !r.tag);
    } else if (lineTagFilter !== "all") {
      list = list.filter((r) => r.tag === lineTagFilter);
    }
    const q = lineSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => {
      const name = (r.display_name || "").toLowerCase();
      const tag = (r.tag || "").toLowerCase();
      return name.includes(q) || tag.includes(q) || r.line_user_id.toLowerCase().includes(q);
    });
  }, [chatStateList, lineSearch, lineTagFilter]);

  const selectedChatState = useMemo(
    () => chatStateList.find((r) => r.line_user_id === selectedLineUserId) ?? null,
    [chatStateList, selectedLineUserId],
  );

  const chatBubbles = useMemo(
    () => mergeChatBubbles(lineLogRows, optimisticMessages),
    [lineLogRows, optimisticMessages],
  );

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.email || "").toLowerCase().includes(search.toLowerCase())
  );

  const handleAddUser = async () => {
    if (!newName.trim() || !newEmail.trim()) {
      toast({ title: "請填寫姓名和 Email", variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      const { error } = await supabase.from("user_log_in").insert({
        id: crypto.randomUUID(),
        name: newName.trim(),
        email: newEmail.trim(),
        phone: newPhone.trim() || null,
      });
      if (error) throw error;
      toast({ title: "✅ 用戶新增成功" });
      setAddDialogOpen(false);
      setNewName("");
      setNewEmail("");
      setNewPhone("");
    } catch (err: any) {
      console.error("Add user error:", err);
      toast({ title: "新增失敗", description: err.message, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const renderFeedback = (feedback: Json): string => {
    if (typeof feedback === "string") return feedback;
    if (typeof feedback === "object" && feedback !== null) return JSON.stringify(feedback, null, 2);
    return String(feedback);
  };

  const formatPickupDate = (iso: string | null): string => {
    if (!iso) return "—";
    const d = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" });
  };

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-6">
        <h1 className="text-xl md:text-3xl font-bold">訂單管理</h1>
      </div>

      <Tabs defaultValue="customers" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="customers">訂單客戶管理</TabsTrigger>
          <TabsTrigger value="line">Line客戶管理</TabsTrigger>
        </TabsList>

        <TabsContent value="customers" className="mt-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button><UserPlus className="mr-2 h-4 w-4" />手動新增用戶</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>新增用戶</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div><Label>姓名 *</Label><Input value={newName} onChange={e => setNewName(e.target.value)} /></div>
                  <div><Label>Email *</Label><Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} /></div>
                  <div><Label>電話</Label><Input value={newPhone} onChange={e => setNewPhone(e.target.value)} /></div>
                  <Button onClick={handleAddUser} disabled={adding} className="w-full">
                    {adding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}新增
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="relative mb-4 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜尋客戶姓名或 Email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>用戶名稱</TableHead>
                      <TableHead className="text-center whitespace-nowrap">購買次數</TableHead>
                      <TableHead
                        className="whitespace-nowrap"
                        title="該客戶所有訂單中，expected_pickup_date（預定取貨／送達日）最晚的一筆"
                      >
                        上次購買日期
                      </TableHead>
                      <TableHead className="min-w-[180px]">售後狀況</TableHead>
                      <TableHead>用戶回饋</TableHead>
                      <TableHead className="min-w-[200px]">Email / LINE</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          無客戶資料
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.map(c => (
                        <TableRow key={c.name}>
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell className="text-center font-semibold">{c.order_count}</TableCell>
                          <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                            {formatPickupDate(c.last_pickup_date)}
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-8 text-sm"
                              placeholder="售後備註…"
                              defaultValue={c.after_sales_status ?? ""}
                              onBlur={(e) => handleAfterSalesBlur(c.name, e.target.value)}
                              disabled={afterSalesSavingName === c.name}
                            />
                          </TableCell>
                          <TableCell>
                            {c.feedbacks.length === 0 ? (
                              <span className="text-muted-foreground text-sm">無</span>
                            ) : c.feedbacks.length === 1 ? (
                              <span className="text-sm whitespace-pre-wrap">{renderFeedback(c.feedbacks[0])}</span>
                            ) : (
                              <Collapsible open={expandedRow === c.name} onOpenChange={open => setExpandedRow(open ? c.name : null)}>
                                <CollapsibleTrigger asChild>
                                  <Button variant="ghost" size="sm" className="gap-1 text-sm">
                                    {c.feedbacks.length} 筆回饋
                                    {expandedRow === c.name ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                  </Button>
                                </CollapsibleTrigger>
                                <CollapsibleContent className="space-y-1 mt-1">
                                  {c.feedbacks.map((fb, i) => (
                                    <div key={i} className="text-sm bg-muted/50 p-2 rounded whitespace-pre-wrap">
                                      {renderFeedback(fb)}
                                    </div>
                                  ))}
                                </CollapsibleContent>
                              </Collapsible>
                            )}
                          </TableCell>
                          <TableCell className="text-sm align-top">
                            <div className="space-y-1.5">
                              <div>
                                <span className="text-xs text-muted-foreground">Email</span>
                                <p className="break-all">{c.email || "—"}</p>
                              </div>
                              <div>
                                <span className="text-xs text-muted-foreground">LINE</span>
                                <p className="font-mono text-xs break-all" title={c.line_user_id || ""}>
                                  {c.line_user_id || "—"}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="line" className="mt-6">
          <p className="text-sm text-muted-foreground mb-4">
            左側可為客人貼標籤（緊急／待處理／已下單）並篩選；開關 ON = AI 回覆、OFF = 人工。右側為對話與手動回覆。
          </p>
          {chatStateLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : chatStateList.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">尚無 chat_state 資料</CardContent>
            </Card>
          ) : (
            <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-12rem)] min-h-[420px] max-h-[720px]">
              {/* 左側：LINE 客戶清單（固定高度、內部捲動） */}
              <Card className="lg:w-[300px] shrink-0 flex flex-col overflow-hidden h-[240px] lg:h-full">
                <CardContent className="p-3 flex flex-col gap-3 flex-1 min-h-0 h-full">
                  <div className="shrink-0 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">標籤篩選</p>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setLineTagFilter("all")}
                        className={cn(
                          "px-2 py-0.5 rounded-full text-xs border transition-colors",
                          lineTagFilter === "all"
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background border-border hover:bg-muted",
                        )}
                      >
                        全部
                      </button>
                      <button
                        type="button"
                        onClick={() => setLineTagFilter("none")}
                        className={cn(
                          "px-2 py-0.5 rounded-full text-xs border transition-colors",
                          lineTagFilter === "none"
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background border-border hover:bg-muted",
                        )}
                      >
                        無標籤
                      </button>
                      {LINE_CUSTOMER_TAGS.map((t) => (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => setLineTagFilter(t.value)}
                          className={cn(
                            "px-2 py-0.5 rounded-full text-xs border transition-colors",
                            lineTagFilter === t.value
                              ? cn(t.badgeClass, "ring-1 ring-offset-1 ring-foreground/20 font-medium")
                              : cn(t.badgeClass, "opacity-80"),
                          )}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="relative shrink-0">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="搜尋名稱、標籤…"
                      value={lineSearch}
                      onChange={(e) => setLineSearch(e.target.value)}
                      className="pl-8 h-9 text-sm"
                    />
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
                    {filteredLineCustomers.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">無符合的客戶</p>
                    ) : (
                      filteredLineCustomers.map((row) => {
                        const isAi = (row.reply_mode || "ai") === "ai";
                        const isSelected = selectedLineUserId === row.line_user_id;
                        const switchUpdating = chatStateUpdating === row.line_user_id;
                        const tagSaving = tagSavingId === row.line_user_id;
                        const currentTag = isLineCustomerTag(row.tag) ? row.tag : null;
                        return (
                          <div
                            key={row.line_user_id}
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelectedLineUserId(row.line_user_id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setSelectedLineUserId(row.line_user_id);
                              }
                            }}
                            className={cn(
                              "rounded-lg border p-3 text-left transition-colors cursor-pointer",
                              isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
                            )}
                          >
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-sm truncate" title={row.display_name ?? ""}>
                                  {row.display_name ?? "（未命名）"}
                                </p>
                                {currentTag ? (
                                  <span
                                    className={cn(
                                      "inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] border font-medium",
                                      lineCustomerTagStyle(currentTag),
                                    )}
                                  >
                                    {currentTag}
                                  </span>
                                ) : null}
                              </div>
                              <div
                                className="shrink-0 flex flex-col items-center gap-0.5"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <span className="text-[10px] text-muted-foreground">{isAi ? "AI" : "人工"}</span>
                                {switchUpdating ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                ) : (
                                  <Switch
                                    checked={isAi}
                                    onCheckedChange={() => handleReplyModeToggle(row.line_user_id, row.reply_mode)}
                                    className="data-[state=checked]:bg-green-600 data-[state=unchecked]:bg-red-600 scale-90"
                                  />
                                )}
                              </div>
                            </div>
                            <div
                              className="flex flex-wrap gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {tagSaving ? (
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                              ) : (
                                LINE_CUSTOMER_TAGS.map((t) => {
                                  const active = currentTag === t.value;
                                  return (
                                    <button
                                      key={t.value}
                                      type="button"
                                      disabled={tagSaving}
                                      onClick={() =>
                                        void handleTagChange(
                                          row.line_user_id,
                                          active ? null : t.value,
                                        )
                                      }
                                      className={cn(
                                        "px-2 py-0.5 rounded-full text-[10px] border transition-colors",
                                        active
                                          ? cn(t.badgeClass, "ring-1 ring-foreground/25 font-semibold")
                                          : "bg-muted/50 text-muted-foreground border-transparent hover:border-border",
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

              {/* 右側：對話視窗（高度獨立，輸入框固定於底部） */}
              <Card className="flex-1 flex flex-col min-h-[360px] min-h-0 lg:h-full overflow-hidden">
                {selectedChatState ? (
                  <>
                    <div className="px-4 py-3 border-b flex items-center justify-between gap-2 shrink-0">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <h2 className="font-semibold truncate">
                            {selectedChatState.display_name ?? "（未命名）"}
                          </h2>
                          {isLineCustomerTag(selectedChatState.tag) ? (
                            <span
                              className={cn(
                                "shrink-0 px-2 py-0.5 rounded-full text-xs border font-medium",
                                lineCustomerTagStyle(selectedChatState.tag),
                              )}
                            >
                              {selectedChatState.tag}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        disabled={lineLogLoading}
                        onClick={() => selectedLineUserId && void fetchLineLog(selectedLineUserId)}
                      >
                        <RefreshCw className={cn("h-4 w-4", lineLogLoading && "animate-spin")} />
                      </Button>
                    </div>

                    <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0 bg-muted/20">
                      {lineLogLoading && chatBubbles.length === 0 ? (
                        <div className="flex justify-center py-12">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : chatBubbles.length === 0 ? (
                        <p className="text-center text-sm text-muted-foreground py-12">尚無對話紀錄</p>
                      ) : (
                        chatBubbles.map((bubble) => {
                          const isOutbound = bubble.role !== "user";
                          const label =
                            bubble.role === "user"
                              ? "客人"
                              : bubble.role === "admin"
                                ? "管理員"
                                : (selectedChatState.reply_mode || "ai") === "ai"
                                  ? "AI"
                                  : "系統";
                          return (
                            <div
                              key={bubble.id}
                              className={cn("flex", isOutbound ? "justify-end" : "justify-start")}
                            >
                              <div
                                className={cn(
                                  "max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                                  bubble.role === "user" && "bg-white border border-border",
                                  bubble.role === "ai" && "bg-green-100 text-green-950",
                                  bubble.role === "admin" && "bg-primary text-primary-foreground",
                                )}
                              >
                                <p className="text-[10px] opacity-70 mb-0.5">{label}</p>
                                <p className="whitespace-pre-wrap break-words">{bubble.text}</p>
                                <p className="text-[10px] opacity-60 mt-1 text-right">
                                  {formatMessageTime(bubble.received_at)}
                                </p>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    <div className="p-3 border-t shrink-0 space-y-2 bg-background">
                      <Textarea
                        placeholder="輸入要回覆給客人的訊息…"
                        value={replyDraft}
                        onChange={(e) => setReplyDraft(e.target.value)}
                        rows={3}
                        className="resize-none text-sm"
                        disabled={sendingReply}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void handleSendLineReply();
                          }
                        }}
                      />
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-xs text-muted-foreground">Enter 送出 · Shift+Enter 換行</span>
                        <Button
                          type="button"
                          size="sm"
                          disabled={sendingReply || !replyDraft.trim()}
                          onClick={() => void handleSendLineReply()}
                        >
                          {sendingReply ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : (
                            <Send className="h-4 w-4 mr-1" />
                          )}
                          送出
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <CardContent className="flex-1 flex items-center justify-center text-muted-foreground">
                    請從左側選擇客戶
                  </CardContent>
                )}
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminCustomersPanel;
