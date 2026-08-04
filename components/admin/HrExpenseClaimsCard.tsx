"use client";

import { useCallback, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Plus, Trash2, ExternalLink, Receipt } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  HR_EXPENSE_PROOF_BUCKET,
  HR_EXPENSE_PROOF_SIGNED_URL_SECONDS,
  buildHrExpenseProofObjectPath,
  resolveHrExpenseProofRefCandidates,
} from "@/lib/hr-expense-proof-storage";

export interface HrExpenseClaim {
  id: number;
  employeeId: string;
  yearMonth: string;
  title: string;
  amount: number;
  proofUrl: string | null;
  proofPath: string | null;
}

interface EmployeeOption {
  id: string;
  name: string;
  color: string;
  textColor: string;
}

interface HrExpenseClaimsCardProps {
  yearMonth: string; // yyyy-MM
  monthLabel: string;
  employees: EmployeeOption[];
  claims: HrExpenseClaim[];
  onClaimsChange: (next: HrExpenseClaim[]) => void;
}

function mapRow(r: {
  id: number;
  employee_id: string;
  year_month: string;
  title: string;
  amount: number | string;
  proof_url: string | null;
  proof_path: string | null;
}): HrExpenseClaim {
  return {
    id: r.id,
    employeeId: r.employee_id,
    yearMonth: r.year_month,
    title: r.title,
    amount: Number(r.amount),
    proofUrl: r.proof_url,
    proofPath: r.proof_path,
  };
}

export async function fetchHrExpenseClaims(yearMonth: string): Promise<HrExpenseClaim[]> {
  const { data, error } = await supabase
    .from("hr_expense_claims")
    .select("*")
    .eq("year_month", yearMonth)
    .order("id", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export default function HrExpenseClaimsCard({
  yearMonth,
  monthLabel,
  employees,
  claims,
  onClaimsChange,
}: HrExpenseClaimsCardProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState<string>(employees[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const totalsByEmp = useMemo(() => {
    const m = new Map<string, number>();
    claims.forEach((c) => {
      m.set(c.employeeId, (m.get(c.employeeId) ?? 0) + c.amount);
    });
    return m;
  }, [claims]);

  const resetForm = useCallback(() => {
    setTitle("");
    setAmount("");
    setFile(null);
    setEmployeeId(employees[0]?.id ?? "");
  }, [employees]);

  const openDialog = useCallback(() => {
    resetForm();
    setOpen(true);
  }, [resetForm]);

  const uploadProof = async (empId: string, f: File): Promise<{ path: string }> => {
    // Supabase Storage key 僅允許 ASCII；中文檔名會觸發 Invalid key
    const path = buildHrExpenseProofObjectPath({
      yearMonth,
      employeeId: empId,
      uniqueSuffix: `${Date.now()}-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
      fileName: f.name,
    });
    const { error } = await supabase.storage.from(HR_EXPENSE_PROOF_BUCKET).upload(path, f, {
      upsert: false,
      contentType: f.type || "application/octet-stream",
      cacheControl: "3600",
    });
    if (error) throw error;
    // Do not store getPublicUrl — bucket is private; view via signed URL.
    return { path };
  };

  const openProof = async (claim: HrExpenseClaim) => {
    const candidates = resolveHrExpenseProofRefCandidates({
      proofPath: claim.proofPath,
      proofUrl: claim.proofUrl,
    });
    if (candidates.length === 0) {
      toast({ title: "找不到證明文件", variant: "destructive" });
      return;
    }

    let lastError: string | null = null;
    for (const ref of candidates) {
      const { data, error } = await supabase.storage
        .from(ref.bucket)
        .createSignedUrl(ref.path, HR_EXPENSE_PROOF_SIGNED_URL_SECONDS);
      if (!error && data?.signedUrl) {
        window.open(data.signedUrl, "_blank", "noopener,noreferrer");
        return;
      }
      lastError = error?.message ?? "建立下載連結失敗";
    }

    toast({
      title: "無法開啟證明文件",
      description: lastError ?? "請稍後再試",
      variant: "destructive",
    });
  };

  const handleSave = async () => {
    const t = title.trim();
    const amt = Number(amount);
    if (!employeeId) {
      toast({ title: "請選擇報帳人員", variant: "destructive" });
      return;
    }
    if (!t) {
      toast({ title: "請填寫報帳名目", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(amt) || amt < 0) {
      toast({ title: "請填寫有效的請款金額", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      let proofPath: string | null = null;
      if (file) {
        const up = await uploadProof(employeeId, file);
        proofPath = up.path;
      }

      const { data, error } = await supabase
        .from("hr_expense_claims")
        .insert({
          employee_id: employeeId,
          year_month: yearMonth,
          title: t,
          amount: amt,
          proof_url: null,
          proof_path: proofPath,
        })
        .select("*")
        .single();
      if (error) throw error;

      onClaimsChange([...claims, mapRow(data)]);
      toast({ title: "已新增請款報帳" });
      setOpen(false);
      resetForm();
    } catch (error) {
      toast({
        title: "新增失敗",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (claim: HrExpenseClaim) => {
    setDeletingId(claim.id);
    try {
      const { error } = await supabase.from("hr_expense_claims").delete().eq("id", claim.id);
      if (error) throw error;
      const proofRefs = resolveHrExpenseProofRefCandidates({
        proofPath: claim.proofPath,
        proofUrl: claim.proofUrl,
      });
      for (const ref of proofRefs) {
        await supabase.storage.from(ref.bucket).remove([ref.path]);
      }
      onClaimsChange(claims.filter((c) => c.id !== claim.id));
      toast({ title: "已刪除報帳項目" });
    } catch (error) {
      toast({
        title: "刪除失敗",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Receipt className="h-4 w-4" />
                請款報帳區
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {monthLabel} — 報帳項目會列入該員工匯出檔，並計入「薪水＋請款」最終金額
              </p>
            </div>
            <Button type="button" onClick={openDialog}>
              <Plus className="h-4 w-4 mr-1.5" />
              新增報帳
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3 text-sm">
            {employees.map((emp) => (
              <div
                key={emp.id}
                className="rounded-md border px-3 py-1.5"
                style={{ borderColor: emp.textColor, backgroundColor: emp.color }}
              >
                <span style={{ color: emp.textColor }} className="font-medium">
                  {emp.name}
                </span>
                <span className="ml-2 tabular-nums" style={{ color: emp.textColor }}>
                  請款合計 ${(totalsByEmp.get(emp.id) ?? 0).toLocaleString("zh-TW")}
                </span>
              </div>
            ))}
          </div>

          {claims.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">本月尚無報帳項目</p>
          ) : (
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">人員</th>
                    <th className="px-3 py-2 font-medium">報帳名目</th>
                    <th className="px-3 py-2 font-medium text-right">金額</th>
                    <th className="px-3 py-2 font-medium">證明文件</th>
                    <th className="px-3 py-2 font-medium w-16" />
                  </tr>
                </thead>
                <tbody>
                  {claims.map((c) => {
                    const emp = employees.find((e) => e.id === c.employeeId);
                    return (
                      <tr key={c.id} className="border-t">
                        <td className="px-3 py-2">{emp?.name ?? c.employeeId}</td>
                        <td className="px-3 py-2">{c.title}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          ${c.amount.toLocaleString("zh-TW")}
                        </td>
                        <td className="px-3 py-2">
                          {c.proofPath || c.proofUrl ? (
                            <button
                              type="button"
                              onClick={() => void openProof(c)}
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                            >
                              查看
                              <ExternalLink className="h-3 w-3" />
                            </button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            disabled={deletingId === c.id}
                            onClick={() => void handleDelete(c)}
                          >
                            {deletingId === c.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(v) => !saving && setOpen(v)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新增請款報帳</DialogTitle>
            <DialogDescription>
              選擇人員後依序填寫名目、上傳證明、輸入金額。僅寫入人事報帳，不影響排班。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-2">
              <Label>報帳人員</Label>
              <div className="flex flex-wrap gap-2">
                {employees.map((emp) => {
                  const selected = employeeId === emp.id;
                  return (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => setEmployeeId(emp.id)}
                      className={cn(
                        "rounded-md border px-3 py-1.5 text-sm transition-colors",
                        selected ? "outline outline-2 outline-offset-1" : "opacity-70 hover:opacity-100",
                      )}
                      style={{
                        backgroundColor: emp.color,
                        color: emp.textColor,
                        borderColor: emp.textColor,
                        outlineColor: selected ? emp.textColor : undefined,
                      }}
                    >
                      {emp.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="hr-expense-title">報帳名目</Label>
              <Input
                id="hr-expense-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：交通費、材料費…"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hr-expense-proof">證明文件（選填）</Label>
              <Input
                id="hr-expense-proof"
                type="file"
                accept="image/*,.pdf,.heic,.heif"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <p className="text-xs text-muted-foreground truncate">已選：{file.name}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="hr-expense-amount">請款金額（元）</Label>
              <Input
                id="hr-expense-amount"
                type="number"
                min={0}
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="button" disabled={saving} onClick={() => void handleSave()}>
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              儲存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
