import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MessageCircle, Pencil, RefreshCw, Search } from "lucide-react";
import { type OrderCustomerContactPatch, updateOrdersContactForCustomer } from "@/lib/order-customer-contact";

type ContactFilter = "all" | "has_line" | "has_email" | "no_contact" | "repeat" | "unpaid";

interface OrderCustomerRow {
  customer_key: string;
  customer_name: string | null;
  order_count: number;
  verified_order_count?: number;
  unpaid_order_count?: number;
  has_unpaid_orders?: boolean;
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

function customerTypeLabel(customerKey: string): string | null {
  if (customerKey.startsWith("user:")) return "網站會員";
  if (customerKey.startsWith("name:")) return "依姓名歸戶";
  return null;
}

function normalizedContactValue(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function buildChangedContactPatch(
  row: OrderCustomerRow,
  nextEmail: string,
  nextPhone: string,
  nextLineUserId: string,
): OrderCustomerContactPatch {
  const patch: OrderCustomerContactPatch = {};

  if (normalizedContactValue(nextEmail) !== normalizedContactValue(row.primary_email)) {
    patch.email = nextEmail;
  }
  if (normalizedContactValue(nextPhone) !== normalizedContactValue(row.primary_phone)) {
    patch.phone = nextPhone;
  }
  if (normalizedContactValue(nextLineUserId) !== normalizedContactValue(row.line_user_id)) {
    patch.line_user_id = nextLineUserId;
  }

  return patch;
}

function contactPatchLabels(patch: OrderCustomerContactPatch): string {
  const labels: string[] = [];
  if (patch.email !== undefined) labels.push("Email");
  if (patch.phone !== undefined) labels.push("電話");
  if (patch.line_user_id !== undefined) labels.push("LINE user_id");
  return labels.join(" / ");
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

  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<OrderCustomerRow | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editLineUserId, setEditLineUserId] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("order_customer_rollup")
        .select(
          "customer_key,customer_name,order_count,verified_order_count,unpaid_order_count,has_unpaid_orders,last_purchase_at,primary_email,primary_phone,line_user_id,has_line,has_email,has_phone,is_repeat_customer",
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

  const openEdit = useCallback((row: OrderCustomerRow) => {
    setEditRow(row);
    setEditEmail(row.primary_email ?? "");
    setEditPhone(row.primary_phone ?? "");
    setEditLineUserId(row.line_user_id ?? "");
    setEditOpen(true);
  }, []);

  const closeEdit = useCallback(() => {
    setEditOpen(false);
    setEditRow(null);
    setSaving(false);
  }, []);

  const saveContact = useCallback(async () => {
    if (!editRow) return;
    const patch = buildChangedContactPatch(editRow, editEmail, editPhone, editLineUserId);
    if (Object.keys(patch).length === 0) {
      toast({
        title: "沒有變更",
        description: "聯絡資訊未變更，未寫入訂單。",
      });
      return;
    }
    setSaving(true);
    try {
      const { updatedCount } = await updateOrdersContactForCustomer(supabase, editRow.customer_key, patch);
      toast({
        title: "已更新聯絡資訊",
        description: `已寫入 ${updatedCount} 筆訂單（${contactPatchLabels(patch)}）`,
      });
      closeEdit();
      await fetchRows();
    } catch (error) {
      toast({
        title: "更新失敗",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }, [editRow, editEmail, editPhone, editLineUserId, toast, closeEdit, fetchRows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (contactFilter === "has_line") list = list.filter((r) => r.has_line);
    if (contactFilter === "has_email") list = list.filter((r) => r.has_email);
    if (contactFilter === "no_contact") list = list.filter((r) => !r.has_line && !r.has_email && !r.has_phone);
    if (contactFilter === "repeat") list = list.filter((r) => r.is_repeat_customer);
    if (contactFilter === "unpaid") list = list.filter((r) => r.has_unpaid_orders);

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
    { id: "unpaid", label: "有待付款" },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        依有效訂單彙整所有客戶（含未匯款、待確認匯款；不含已取消、退貨、隱藏單）。會員以 user_id
        合併；手動單以收件人姓名（完全一致）合併。可編輯聯絡資訊並批次寫入該客戶的所有訂單。
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
                  <TableHead className="min-w-[120px]">操作</TableHead>
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
                        {customerTypeLabel(row.customer_key) ? (
                          <span className="text-xs text-muted-foreground">{customerTypeLabel(row.customer_key)}</span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <ContactTags row={row} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatContact(row)}</TableCell>
                      <TableCell className="text-center font-semibold">
                        <div>{row.order_count}</div>
                        {row.has_unpaid_orders ? (
                          <Badge variant="outline" className="mt-0.5 text-[10px] text-amber-700 border-amber-300 bg-amber-50">
                            待付款 {row.unpaid_order_count ?? "?"}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatPurchaseDate(row.last_purchase_at)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => openEdit(row)}
                          >
                            <Pencil className="h-4 w-4 mr-1" />
                            聯絡
                          </Button>
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

      <p className="text-xs text-muted-foreground">
        共 {filtered.length} 位客戶
        {search || contactFilter !== "all" ? `（已篩選，總計 ${rows.length} 位）` : ""}
      </p>

      <Dialog open={editOpen} onOpenChange={(open) => !open && closeEdit()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>編輯聯絡資訊</DialogTitle>
            <DialogDescription>
              {editRow ? (
                <>
                  {editRow.customer_name || "—"}（{editRow.order_count} 筆訂單）
                  <br />
                  儲存後只會批次寫入有變更的 <code className="text-xs">Email</code>、
                  <code className="text-xs">phone</code>、<code className="text-xs">line_user_id</code>。
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="crm-contact-email">Email</Label>
              <Input
                id="crm-contact-email"
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="name@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="crm-contact-phone">電話</Label>
              <Input
                id="crm-contact-phone"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="09xxxxxxxx"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="crm-contact-line">LINE user_id</Label>
              <Input
                id="crm-contact-line"
                value={editLineUserId}
                onChange={(e) => setEditLineUserId(e.target.value)}
                placeholder="Uxxxxxxxx..."
              />
              <p className="text-xs text-muted-foreground">
                與訂單管理編輯相同；填入後可從此處跳轉 LINE 客戶經營，並供 CRM 訂單歸屬使用。
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeEdit} disabled={saving}>
              取消
            </Button>
            <Button type="button" onClick={() => void saveContact()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              儲存至訂單
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
