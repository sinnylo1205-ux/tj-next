import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Search, UserPlus, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Json } from "@/integrations/supabase/types";

interface CustomerRow {
  name: string;
  email: string | null;
  line_user_id: string | null;
  order_count: number;
  feedbacks: Json[];
}

interface ChatStateRow {
  line_user_id: string;
  display_name: string | null;
  note: string | null;
  reply_mode: string | null;
  created_at: string | null;
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
  const [noteSavingId, setNoteSavingId] = useState<string | null>(null);

  // Manual add user form
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [adding, setAdding] = useState(false);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      // Fetch all orders with relevant fields
      const { data: orders, error } = await supabase
        .from("orders")
        .select("who_receive, Email, line_user_id, user_id, feedback")
        .not("who_receive", "is", null);

      if (error) throw error;

      // Fetch user_log_in for line_user_id mapping
      const userIds = [...new Set((orders || []).map(o => o.user_id))];
      const { data: users } = await supabase
        .from("user_log_in")
        .select("id, line_user_id")
        .in("id", userIds);

      const userLineMap: Record<string, string | null> = {};
      users?.forEach(u => { userLineMap[u.id] = u.line_user_id; });

      // Group by who_receive
      const grouped: Record<string, CustomerRow> = {};
      (orders || []).forEach(order => {
        const name = order.who_receive || "";
        if (!name) return;

        if (!grouped[name]) {
          grouped[name] = {
            name,
            email: null,
            line_user_id: null,
            order_count: 0,
            feedbacks: [],
          };
        }

        grouped[name].order_count += 1;

        // Take latest non-null email
        if (order.Email && !grouped[name].email) {
          grouped[name].email = order.Email;
        }

        // LINE user ID: prefer user_log_in, fallback to orders
        if (!grouped[name].line_user_id) {
          grouped[name].line_user_id = userLineMap[order.user_id] || order.line_user_id || null;
        }

        // Collect feedbacks
        if (order.feedback) {
          grouped[name].feedbacks.push(order.feedback);
        }
      });

      setCustomers(Object.values(grouped).sort((a, b) => b.order_count - a.order_count));
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
        .select("line_user_id, display_name, note, reply_mode, created_at")
        .order("created_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      setChatStateList((data as ChatStateRow[]) || []);
    } catch (err: any) {
      console.error("Failed to fetch chat_state:", err);
      toast({ title: "載入 LINE 客戶失敗", description: err.message, variant: "destructive" });
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

  const handleNoteBlur = async (lineUserId: string, value: string) => {
    const row = chatStateList.find((r) => r.line_user_id === lineUserId);
    if (!row || (row.note ?? "") === value.trim()) return;
    setNoteSavingId(lineUserId);
    try {
      const { error } = await supabase
        .from("chat_state")
        .update({ note: value.trim() || null })
        .eq("line_user_id", lineUserId);
      if (error) throw error;
      setChatStateList((prev) =>
        prev.map((r) => (r.line_user_id === lineUserId ? { ...r, note: value.trim() || null } : r))
      );
      toast({ title: "備註已儲存" });
    } catch (err: any) {
      toast({ title: "儲存備註失敗", description: err.message, variant: "destructive" });
    } finally {
      setNoteSavingId(null);
    }
  };

  useEffect(() => { fetchCustomers(); }, []);
  useEffect(() => { fetchChatState(); }, [fetchChatState]);

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
                      <TableHead>Email</TableHead>
                      <TableHead>LINE User ID</TableHead>
                      <TableHead className="text-center">購買次數</TableHead>
                      <TableHead>用戶回饋</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          無客戶資料
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.map(c => (
                        <TableRow key={c.name}>
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell className="text-sm">{c.email || "-"}</TableCell>
                          <TableCell className="text-xs font-mono max-w-[150px] truncate" title={c.line_user_id || ""}>
                            {c.line_user_id || "-"}
                          </TableCell>
                          <TableCell className="text-center font-semibold">{c.order_count}</TableCell>
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
            來源：chat_state。開關 ON = AI 回覆（綠）、OFF = 人工回覆（紅）。
          </p>
          {chatStateLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[140px] max-w-[160px]">display_name</TableHead>
                      <TableHead className="text-center w-[140px]">reply_mode</TableHead>
                      <TableHead>note</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {chatStateList.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                          尚無 chat_state 資料
                        </TableCell>
                      </TableRow>
                    ) : (
                      chatStateList.map((row) => {
                        const isAi = (row.reply_mode || "ai") === "ai";
                        const switchUpdating = chatStateUpdating === row.line_user_id;
                        const noteSaving = noteSavingId === row.line_user_id;
                        return (
                          <TableRow key={row.line_user_id}>
                            <TableCell className="font-medium w-[140px] max-w-[160px] truncate" title={row.display_name ?? ""}>{row.display_name ?? "—"}</TableCell>
                            <TableCell className="text-center">
                              {switchUpdating ? (
                                <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
                              ) : (
                                <Switch
                                  checked={isAi}
                                  onCheckedChange={() => handleReplyModeToggle(row.line_user_id, row.reply_mode)}
                                  className="data-[state=checked]:bg-green-600 data-[state=unchecked]:bg-red-600"
                                />
                              )}
                            </TableCell>
                            <TableCell className="min-w-[200px]">
                              <Input
                                className="h-8 text-sm"
                                placeholder="備註..."
                                defaultValue={row.note ?? ""}
                                onBlur={(e) => handleNoteBlur(row.line_user_id, e.target.value)}
                                disabled={noteSaving}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminCustomersPanel;
