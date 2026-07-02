import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MessageCircle, RefreshCw, Search } from "lucide-react";

type ContactFilter = "all" | "has_line" | "has_email" | "no_contact" | "repeat";

interface OrderCustomerRow {
  customer_key: string;
  customer_name: string | null;
  order_count: number;
  last_purchase_at: string | null;
  primary_email: string | null;
  primary_phone: string | null;
  line_user_id: string | null;
  has_line: boolean;
  has_email: boolean;
  has_phone: boolean;
  is_repeat_customer: boolean;
}

function formatPurchaseDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function ContactTags({ row }: { row: OrderCustomerRow }) {
  const hasAny = row.has_line || row.has_email || row.has_phone;
  if (!hasAny) {
    return <Badge variant="outline" className="text-muted-foreground">無聯絡</Badge>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {row.has_line && (
        <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200">
          LINE
        </Badge>
      )}
      {row.has_email && (
        <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-200">
          Email
        </Badge>
      )}
      {row.has_phone && (
        <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-amber-200">
          電話
        </Badge>
      )}
    </div>
  );
}

function formatContact(row: OrderCustomerRow): string {
  const parts: string[] = [];
  if (row.primary_email) parts.push(row.primary_email);
  if (row.primary_phone) parts.push(row.primary_phone);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

export default function AdminOrderCustomersPanel({
  onOpenLineCustomer,
}: {
  onOpenLineCustomer?: (lineUserId: string) => void;
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState<OrderCustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [contactFilter, setContactFilter] = useState<ContactFilter>("all");

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("order_customer_rollup")
        .select(
          "customer_key,customer_name,order_count,last_purchase_at,primary_email,primary_phone,line_user_id,has_line,has_email,has_phone,is_repeat_customer",
        )
        .order("last_purchase_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      setRows((data as OrderCustomerRow[]) ?? []);
    } catch (error) {
      toast({
        title: "載入訂單客戶失敗",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (contactFilter === "has_line") list = list.filter((r) => r.has_line);
    if (contactFilter === "has_email") list = list.filter((r) => r.has_email);
    if (contactFilter === "no_contact") list = list.filter((r) => !r.has_line && !r.has_email && !r.has_phone);
    if (contactFilter === "repeat") list = list.filter((r) => r.is_repeat_customer);

    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => {
      const blob = [r.customer_name ?? "", r.primary_email ?? "", r.primary_phone ?? "", r.customer_key]
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [rows, search, contactFilter]);

  const filterButtons: { id: ContactFilter; label: string }[] = [
    { id: "all", label: "全部" },
    { id: "has_line", label: "有 LINE" },
    { id: "has_email", label: "有 Email" },
    { id: "no_contact", label: "無聯絡" },
    { id: "repeat", label: "回購客" },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        依有效訂單彙整所有客戶。會員以 user_id 合併；手動單以收件人姓名（完全一致）合併，不沿用管理員 user_id。
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜尋姓名、Email、電話…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void fetchRows()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-1">重新整理</span>
        </Button>
      </div>

      <div className="flex flex-wrap gap-1">
        {filterButtons.map((f) => (
          <Button
            key={f.id}
            type="button"
            size="sm"
            variant={contactFilter === f.id ? "default" : "outline"}
            onClick={() => setContactFilter(f.id)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>客戶名稱</TableHead>
                  <TableHead>聯絡標籤</TableHead>
                  <TableHead className="min-w-[200px]">聯絡方式</TableHead>
                  <TableHead className="text-center whitespace-nowrap">購買次數</TableHead>
                  <TableHead className="whitespace-nowrap">上次購買日期</TableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                      無符合條件的客戶
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((row) => (
                    <TableRow key={row.customer_key}>
                      <TableCell className="font-medium">
                        <div>{row.customer_name || "—"}</div>
                        {row.customer_key.startsWith("user:") && (
                          <span className="text-xs text-muted-foreground">網站會員</span>
                        )}
                        {row.customer_key.startsWith("name:") && (
                          <span className="text-xs text-muted-foreground">姓名合併</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <ContactTags row={row} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatContact(row)}</TableCell>
                      <TableCell className="text-center font-semibold">{row.order_count}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatPurchaseDate(row.last_purchase_at)}
                      </TableCell>
                      <TableCell>
                        {row.line_user_id && onOpenLineCustomer ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => onOpenLineCustomer(row.line_user_id!)}
                          >
                            <MessageCircle className="h-4 w-4 mr-1" />
                            LINE
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        共 {filtered.length} 位客戶
        {search || contactFilter !== "all" ? `（已篩選，總計 ${rows.length} 位）` : ""}
      </p>
    </div>
  );
}
