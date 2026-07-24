"use client";

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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { Check, ChevronsUpDown, Loader2, MessageCircle, RefreshCw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  updateOrdersContactForCustomer,
  updateOrdersMetaForCustomer,
  upsertCustomerCompanyName,
} from "@/lib/order-customer-contact";

type ContactFilter = "all" | "has_line" | "has_email" | "no_contact" | "repeat" | "unpaid";

const CUSTOMER_TYPE_OPTIONS = [
  { value: "general", label: "一般用戶" },
  { value: "flash_ip", label: "快閃店/IP" },
  { value: "pr_agent", label: "公關代理" },
  { value: "company_self", label: "公司自己" },
] as const;

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
  admin_note?: string | null;
  customer_type?: string | null;
  /** 發票抬頭（來自訂單，唯讀來源） */
  tax_title?: string | null;
  /** 管理員手寫覆蓋（存 CRM，不影響訂單） */
  company_name_override?: string | null;
  /** 顯示用：手寫優先，否則發票抬頭 */
  company_name?: string | null;
}

function formatPurchaseDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function membershipLabel(customerKey: string): string | null {
  if (customerKey.startsWith("user:")) return "網站會員";
  if (customerKey.startsWith("name:")) return "依姓名歸戶";
  return null;
}

function orderCustomerTypeLabel(v: string | null | undefined): string | null {
  if (!v) return null;
  if (v === "pr_agency") return "公關代理";
  return CUSTOMER_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

function ContactTags({
  row,
  onClick,
}: {
  row: OrderCustomerRow;
  onClick: () => void;
}) {
  const hasAny = row.has_line || row.has_email || row.has_phone;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-wrap gap-1 rounded-md text-left hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title="點擊檢視／編輯聯絡方式"
    >
      {!hasAny ? (
        <Badge variant="outline" className="text-muted-foreground cursor-pointer">
          無聯絡
        </Badge>
      ) : (
        <>
          {row.has_line && (
            <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200 cursor-pointer">
              LINE
            </Badge>
          )}
          {row.has_email && (
            <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-200 cursor-pointer">
              Email
            </Badge>
          )}
          {row.has_phone && (
            <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-amber-200 cursor-pointer">
              電話
            </Badge>
          )}
        </>
      )}
    </button>
  );
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
  const [savingMetaKey, setSavingMetaKey] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("order_customer_rollup")
        .select(
          "customer_key,customer_name,order_count,verified_order_count,unpaid_order_count,has_unpaid_orders,last_purchase_at,primary_email,primary_phone,line_user_id,has_line,has_email,has_phone,is_repeat_customer,admin_note,customer_type,tax_title,company_name_override,company_name",
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
    setSaving(true);
    try {
      const { updatedCount } = await updateOrdersContactForCustomer(supabase, editRow.customer_key, {
        email: editEmail,
        phone: editPhone,
        line_user_id: editLineUserId,
      });
      toast({
        title: "已更新聯絡資訊",
        description: `已寫入 ${updatedCount} 筆訂單（Email / 電話 / LINE user_id）`,
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

  const updateCustomerType = useCallback(
    async (row: OrderCustomerRow, type: string | null) => {
      setSavingMetaKey(`${row.customer_key}:type`);
      try {
        const { updatedCount } = await updateOrdersMetaForCustomer(supabase, row.customer_key, {
          customer_type: type,
        });
        setRows((prev) =>
          prev.map((r) => (r.customer_key === row.customer_key ? { ...r, customer_type: type } : r)),
        );
        toast({
          title: type ? "已更新客戶類型" : "已清除客戶類型",
          description: `已寫入 ${updatedCount} 筆訂單`,
        });
      } catch (error) {
        toast({
          title: "更新客戶類型失敗",
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        });
      } finally {
        setSavingMetaKey(null);
      }
    },
    [toast],
  );

  const saveAdminNote = useCallback(
    async (row: OrderCustomerRow, value: string) => {
      const next = value.trim() || null;
      const prev = row.admin_note?.trim() || null;
      if (next === prev) return;
      setSavingMetaKey(`${row.customer_key}:note`);
      try {
        const { updatedCount } = await updateOrdersMetaForCustomer(supabase, row.customer_key, {
          admin_note: next,
        });
        setRows((prevRows) =>
          prevRows.map((r) => (r.customer_key === row.customer_key ? { ...r, admin_note: next } : r)),
        );
        toast({
          title: "已更新管理員備注",
          description: `已寫入 ${updatedCount} 筆訂單`,
        });
      } catch (error) {
        toast({
          title: "更新備注失敗",
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        });
      } finally {
        setSavingMetaKey(null);
      }
    },
    [toast],
  );

  const saveCompanyName = useCallback(
    async (row: OrderCustomerRow, value: string): Promise<string> => {
      const nextOverride = value.trim() || null;
      const prevOverride = row.company_name_override?.trim() || null;
      const tax = row.tax_title?.trim() || null;
      const displayPrev = row.company_name?.trim() || "";

      // 沒有手寫覆蓋時，輸入與發票抬頭相同 → 不寫入
      if (nextOverride === prevOverride) return displayPrev;
      if (!prevOverride && nextOverride === tax) return displayPrev;
      // 沒有手寫覆蓋卻清空 → 還原顯示發票抬頭／空
      if (!prevOverride && !nextOverride) return displayPrev;

      setSavingMetaKey(`${row.customer_key}:company`);
      try {
        await upsertCustomerCompanyName(supabase, row.customer_key, nextOverride);
        const companyName = nextOverride || tax;
        setRows((prevRows) =>
          prevRows.map((r) =>
            r.customer_key === row.customer_key
              ? {
                  ...r,
                  company_name_override: nextOverride,
                  company_name: companyName,
                }
              : r,
          ),
        );
        toast({
          title: nextOverride ? "已更新公司名稱" : "已清除手寫公司名稱",
          description: nextOverride
            ? "僅寫入客戶總覽，不影響訂單管理"
            : tax
              ? "已改回顯示發票抬頭"
              : "目前無發票抬頭，顯示「無」",
        });
        return companyName ?? "";
      } catch (error) {
        toast({
          title: "更新公司名稱失敗",
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        });
        return displayPrev;
      } finally {
        setSavingMetaKey(null);
      }
    },
    [toast],
  );

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
      const blob = [
        r.customer_name ?? "",
        r.primary_email ?? "",
        r.primary_phone ?? "",
        r.customer_key,
        r.admin_note ?? "",
        orderCustomerTypeLabel(r.customer_type) ?? "",
        r.company_name ?? "",
        r.tax_title ?? "",
      ]
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
        合併；手動單以收件人姓名（完全一致）合併。點擊聯絡標籤可檢視／編輯聯絡方式；客戶類型與備注會批次寫入該客戶的所有訂單。
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜尋姓名、Email、電話、備注…"
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
                  <TableHead className="min-w-[120px]">客戶類型</TableHead>
                  <TableHead className="min-w-[140px]">公司名稱</TableHead>
                  <TableHead className="min-w-[160px]">管理員備注</TableHead>
                  <TableHead className="text-center whitespace-nowrap">購買次數</TableHead>
                  <TableHead className="whitespace-nowrap">上次購買日期</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                      無符合條件的客戶
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((row) => {
                    const typeBusy = savingMetaKey === `${row.customer_key}:type`;
                    const noteBusy = savingMetaKey === `${row.customer_key}:note`;
                    const companyBusy = savingMetaKey === `${row.customer_key}:company`;
                    const typeLabel = orderCustomerTypeLabel(row.customer_type);
                    const companyDisplay = row.company_name?.trim() || "";
                    const companyFromTaxOnly =
                      !row.company_name_override?.trim() && Boolean(row.tax_title?.trim());
                    return (
                      <TableRow key={row.customer_key}>
                        <TableCell className="font-medium">
                          <div>{row.customer_name || "—"}</div>
                          {membershipLabel(row.customer_key) ? (
                            <span className="text-xs text-muted-foreground">
                              {membershipLabel(row.customer_key)}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <ContactTags row={row} onClick={() => openEdit(row)} />
                        </TableCell>
                        <TableCell>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 max-w-[140px] justify-between gap-1 px-2 font-normal"
                                disabled={typeBusy}
                              >
                                <span className="truncate">
                                  {typeBusy ? "更新中…" : typeLabel || "選擇類型"}
                                </span>
                                <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-44 p-1" align="start">
                              {CUSTOMER_TYPE_OPTIONS.map((opt) => {
                                const selected = row.customer_type === opt.value;
                                return (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    className={cn(
                                      "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted",
                                      selected && "bg-muted",
                                    )}
                                    onClick={() => void updateCustomerType(row, opt.value)}
                                  >
                                    <Check className={cn("h-3.5 w-3.5", selected ? "opacity-100" : "opacity-0")} />
                                    {opt.label}
                                  </button>
                                );
                              })}
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted"
                                onClick={() => void updateCustomerType(row, null)}
                              >
                                清除標籤
                              </button>
                            </PopoverContent>
                          </Popover>
                        </TableCell>
                        <TableCell className="min-w-[140px]">
                          <Input
                            key={`${row.customer_key}-company-${row.company_name_override ?? ""}-${row.tax_title ?? ""}`}
                            defaultValue={companyDisplay}
                            disabled={companyBusy}
                            placeholder="無"
                            className={cn(
                              "h-8 text-sm",
                              !companyDisplay && "placeholder:text-muted-foreground",
                              companyFromTaxOnly && "text-foreground",
                            )}
                            title={
                              companyFromTaxOnly
                                ? "來源：發票抬頭（可手寫覆蓋；不會改訂單）"
                                : row.company_name_override?.trim()
                                  ? "手寫公司名稱（僅客戶總覽）"
                                  : "可手寫補充；不會寫入訂單管理"
                            }
                            onBlur={(e) => {
                              void (async () => {
                                const restored = await saveCompanyName(row, e.target.value);
                                if (e.target.value.trim() !== restored) {
                                  e.target.value = restored;
                                }
                              })();
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            key={`${row.customer_key}-${row.admin_note ?? ""}`}
                            defaultValue={row.admin_note ?? ""}
                            disabled={noteBusy}
                            placeholder="備注…"
                            className="h-8 text-sm"
                            onBlur={(e) => void saveAdminNote(row, e.target.value)}
                          />
                        </TableCell>
                        <TableCell className="text-center font-semibold">
                          <div>{row.order_count}</div>
                          {row.has_unpaid_orders ? (
                            <Badge
                              variant="outline"
                              className="mt-0.5 text-[10px] text-amber-700 border-amber-300 bg-amber-50"
                            >
                              待付款 {row.unpaid_order_count ?? "?"}
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {formatPurchaseDate(row.last_purchase_at)}
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

      <p className="text-xs text-muted-foreground">
        共 {filtered.length} 位客戶
        {search || contactFilter !== "all" ? `（已篩選，總計 ${rows.length} 位）` : ""}
      </p>

      <Dialog open={editOpen} onOpenChange={(open) => !open && closeEdit()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>聯絡方式</DialogTitle>
            <DialogDescription>
              {editRow ? (
                <>
                  {editRow.customer_name || "—"}（{editRow.order_count} 筆訂單）
                  <br />
                  儲存後會批次寫入此客戶名下所有訂單的 <code className="text-xs">Email</code>、
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
              {editLineUserId.trim() && onOpenLineCustomer ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-1"
                  onClick={() => {
                    onOpenLineCustomer(editLineUserId.trim());
                    closeEdit();
                  }}
                >
                  <MessageCircle className="h-4 w-4 mr-1" />
                  開啟 LINE 客戶經營
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  與訂單管理編輯相同；填入後可跳轉 LINE 客戶經營，並供 CRM 訂單歸屬使用。
                </p>
              )}
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
