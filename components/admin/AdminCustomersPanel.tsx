import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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

const AdminCustomersPanel = () => {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const { toast } = useToast();

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

  useEffect(() => { fetchCustomers(); }, []);

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
        <h1 className="text-xl md:text-3xl font-bold">客戶管理</h1>
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
    </div>
  );
};

export default AdminCustomersPanel;
