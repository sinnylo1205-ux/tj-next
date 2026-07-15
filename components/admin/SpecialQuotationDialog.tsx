"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ChevronsUpDown, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { QUOTATION_KIND_SPECIAL, type SpecialQuotationComboPayload, type SpecialQuotationRoot } from "@/lib/special-quotation";
import { buildSpecialQuotationPdfPayload, type SpecialComboPdfInput } from "@/lib/special-quotation-pdf";
import { buildQuotationPdfHtml } from "@/lib/quotation-pdf-html";

export interface SpecialQuotationProductRow {
  id: string;
  name: string;
  category: string;
  price: number;
}

export interface ProductNoticeRow {
  product_id: string;
  min_order_qty: number | null;
  price_min: number | null;
}

type LineForm = { id: string; productId: string; productName: string; unit_price: number; quantity: number };
type ComboForm = {
  id: string;
  expected_pickup_date: string;
  pickup_location: string;
  pickup_contact_name: string;
  pickup_contact_phone: string;
  shipping_fee: string;
  lines: LineForm[];
};

const newLine = (): LineForm => ({
  id: crypto.randomUUID(),
  productId: "",
  productName: "",
  unit_price: 0,
  quantity: 1,
});

const newCombo = (): ComboForm => ({
  id: crypto.randomUUID(),
  expected_pickup_date: "",
  pickup_location: "",
  pickup_contact_name: "",
  pickup_contact_phone: "",
  shipping_fee: "0",
  lines: [newLine()],
});

const defaultForm = () => ({
  ordererName: "",
  email: "",
  phone: "",
  lineUserId: "",
  combos: [newCombo()] as ComboForm[],
});

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCommitted: () => void;
};

export function SpecialQuotationDialog({ open, onOpenChange, onCommitted }: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [products, setProducts] = useState<SpecialQuotationProductRow[]>([]);
  const [productsByCategory, setProductsByCategory] = useState<Record<string, SpecialQuotationProductRow[]>>({});
  const [productNotices, setProductNotices] = useState<Record<string, ProductNoticeRow>>({});
  const [productSearch, setProductSearch] = useState<Record<string, string>>({});
  const [productPopoverOpen, setProductPopoverOpen] = useState<Record<string, boolean>>({});

  const lineKey = (comboId: string, lineId: string) => `${comboId}:${lineId}`;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data: productsData, error: productsError } = await supabase
        .from("products")
        .select("id, name, category, price")
        .or("is_hide.is.null,is_hide.eq.false")
        .order("category");
      if (cancelled) return;
      if (!productsError && productsData) {
        setProducts(productsData as SpecialQuotationProductRow[]);
        const grouped: Record<string, SpecialQuotationProductRow[]> = {};
        (productsData as SpecialQuotationProductRow[]).forEach((p) => {
          const cat = p.category || "未分類";
          if (!grouped[cat]) grouped[cat] = [];
          grouped[cat].push(p);
        });
        setProductsByCategory(grouped);
      }
      const { data: noticesData, error: noticesError } = await supabase.from("product_notice").select("product_id, min_order_qty, price_min");
      if (cancelled) return;
      if (!noticesError && noticesData) {
        const noticesMap: Record<string, ProductNoticeRow> = {};
        (noticesData as ProductNoticeRow[]).forEach((n) => {
          if (n.product_id) noticesMap[n.product_id] = n;
        });
        setProductNotices(noticesMap);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const reset = useCallback(() => {
    setStep(1);
    setForm(defaultForm());
    setProductSearch({});
    setProductPopoverOpen({});
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const filterProducts = useCallback(
    (query: string) => {
      if (!query.trim()) return productsByCategory;
      const q = query.toLowerCase();
      const out: Record<string, SpecialQuotationProductRow[]> = {};
      Object.entries(productsByCategory).forEach(([cat, prods]) => {
        const m = prods.filter((p) => p.name.toLowerCase().includes(q));
        if (m.length) out[cat] = m;
      });
      return out;
    },
    [productsByCategory],
  );

  const addCombo = () => setForm((p) => ({ ...p, combos: [...p.combos, newCombo()] }));
  const removeCombo = (comboId: string) =>
    setForm((p) => (p.combos.length <= 1 ? p : { ...p, combos: p.combos.filter((c) => c.id !== comboId) }));

  const addLine = (comboId: string) =>
    setForm((p) => ({
      ...p,
      combos: p.combos.map((c) => (c.id === comboId ? { ...c, lines: [...c.lines, newLine()] } : c)),
    }));

  const removeLine = (comboId: string, lineId: string) =>
    setForm((p) => ({
      ...p,
      combos: p.combos.map((c) =>
        c.id !== comboId
          ? c
          : c.lines.length <= 1
            ? c
            : { ...c, lines: c.lines.filter((l) => l.id !== lineId) },
      ),
    }));

  const comboLineSubtotal = (c: ComboForm) =>
    c.lines.reduce((s, l) => s + (Number(l.unit_price) || 0) * (Number(l.quantity) || 0), 0);

  const comboTotals = useMemo(() => {
    let grandSub = 0;
    let grandShip = 0;
    for (const c of form.combos) {
      const sub = comboLineSubtotal(c);
      const ship = Number(c.shipping_fee) || 0;
      grandSub += sub;
      grandShip += ship;
    }
    return { grandSub, grandShip, grandTotal: grandSub + grandShip };
  }, [form.combos]);

  const openPdfWindow = (payload: ReturnType<typeof buildSpecialQuotationPdfPayload>) => {
    const html = buildQuotationPdfHtml(payload);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank", "noopener,noreferrer");
    if (!w) {
      toast({
        title: "無法開啟新視窗",
        description: "請允許彈出視窗後再試；或使用 ⌘P 列印報價單。",
        variant: "destructive",
      });
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } else {
      toast({
        title: "✅ 已建立特殊報價單",
        description: "已在新分頁開啟報價單，請用 ⌘P／Ctrl+P 另存為 PDF。",
      });
    }
    setTimeout(() => URL.revokeObjectURL(url), 600_000);
  };

  const submit = async () => {
    const orderer = form.ordererName.trim();
    if (!orderer) {
      toast({ title: "請填寫訂購人（單位）", variant: "destructive" });
      return;
    }
    for (const c of form.combos) {
      if (!c.lines.some((l) => (l.productName.trim() || l.productId) && (Number(l.quantity) || 0) > 0)) {
        toast({ title: "每個訂單組合至少需一筆有效品項", variant: "destructive" });
        return;
      }
      for (const l of c.lines) {
        if (!l.productName.trim() && !l.productId.trim()) continue;
        if ((Number(l.quantity) || 0) <= 0) {
          toast({ title: "品項數量需大於 0", variant: "destructive" });
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const combosPayload: SpecialQuotationComboPayload[] = [];
      const pdfCombos: SpecialComboPdfInput[] = [];
      let idx = 0;
      let grandSubtotal = 0;
      let grandShipping = 0;

      for (const c of form.combos) {
        idx += 1;
        const lineSubtotal = comboLineSubtotal(c);
        const ship = Number(c.shipping_fee) || 0;
        const lineTotal = lineSubtotal + ship;
        grandSubtotal += lineSubtotal;
        grandShipping += ship;
        combosPayload.push({
          id: c.id,
          expected_pickup_date: c.expected_pickup_date.trim() || null,
          pickup_location: c.pickup_location.trim() || null,
          pickup_contact_name: c.pickup_contact_name.trim() || null,
          pickup_contact_phone: c.pickup_contact_phone.trim() || null,
          shipping_fee: ship,
          line_subtotal: lineSubtotal,
          line_total: lineTotal,
        });
        const pdfLines = c.lines
          .filter((l) => l.productName.trim() || l.productId)
          .map((l) => {
            const pr = l.productId ? products.find((p) => p.id === l.productId) : undefined;
            return {
              product_name: l.productName.trim() || pr?.name || "品項",
              unit_price: Number(l.unit_price) || 0,
              quantity: Number(l.quantity) || 0,
            };
          });
        pdfCombos.push({
          id: c.id,
          comboIndex: idx,
          expected_pickup_date: c.expected_pickup_date,
          pickup_location: c.pickup_location,
          pickup_contact_name: c.pickup_contact_name,
          pickup_contact_phone: c.pickup_contact_phone,
          shipping_fee: ship,
          lines: pdfLines,
        });
      }

      const grandTotal = grandSubtotal + grandShipping;

      const specialRoot: SpecialQuotationRoot = {
        orderer_name: orderer,
        contact: {
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          line_user_id: form.lineUserId.trim() || null,
        },
        combos: combosPayload,
      };

      const all_requirement = {
        quotation_kind: QUOTATION_KIND_SPECIAL,
        customer_profile: {
          name: orderer,
          email: form.email.trim() || "",
        },
        delivery: {
          method: "",
          address: "",
          receiver: orderer,
          phone: form.phone.trim() || "",
        },
        special_quotation: specialRoot,
      };

      const notesParts: string[] = [];
      if (form.phone.trim()) notesParts.push(`聯絡電話：${form.phone.trim()}`);
      if (form.email.trim()) notesParts.push(`Email：${form.email.trim()}`);
      const notes = notesParts.join("\n") || null;

      const { data: row, error: qErr } = await supabase
        .from("quotation_orders")
        .insert({
          status: "price_reply",
          email: form.email.trim() || null,
          who_receive: orderer,
          shipping_way: null,
          shipping_address_text: null,
          expected_pickup_date: null,
          notes,
          line_user_id: form.lineUserId.trim() || null,
          user_id: null,
          all_requirement,
          subtotal: grandSubtotal,
          shipping_fee: grandShipping,
          total_amount: grandTotal,
          discount_amount: null,
        })
        .select("id")
        .single();

      if (qErr) throw qErr;
      if (!row?.id) throw new Error("建立失敗");

      const inserts: Record<string, unknown>[] = [];
      for (const c of form.combos) {
        for (const l of c.lines) {
          if (!l.productName.trim() && !l.productId.trim()) continue;
          const pr = l.productId ? products.find((p) => p.id === l.productId) : undefined;
          const cat = (pr?.category || "custom_design").toString().slice(0, 200);
          const customizations: Record<string, unknown> = {
            combo_id: c.id,
            role: "special_quotation_line",
          };
          if (l.productId.trim()) customizations.product_id = l.productId.trim();
          inserts.push({
            quotation_order_id: row.id,
            product_name: (l.productName.trim() || pr?.name || "品項").slice(0, 500),
            quantity: Number(l.quantity) || 1,
            unit_price: Number(l.unit_price) || 0,
            preview_url: null,
            category: cat,
            all_requirement: {},
            customizations_json: customizations,
            quantity_description: null,
          });
        }
      }

      if (inserts.length) {
        const { error: itemErr } = await supabase.from("quotation_order_items").insert(inserts);
        if (itemErr) throw itemErr;
      }

      const pdfPayload = buildSpecialQuotationPdfPayload({
        ordererName: orderer,
        contact: {
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          line_user_id: form.lineUserId.trim() || null,
        },
        combos: pdfCombos,
        grandSubtotal,
        grandShipping,
        grandTotal,
      });
      openPdfWindow(pdfPayload);

      onOpenChange(false);
      onCommitted();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "建立失敗";
      toast({ title: "建立特殊報價單失敗", description: msg, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const renderProductPicker = (comboId: string, line: LineForm) => {
    const key = lineKey(comboId, line.id);
    const search = productSearch[key] ?? "";
    const filtered = filterProducts(search);
    return (
      <Popover
        modal
        open={productPopoverOpen[key] ?? false}
        onOpenChange={(o) => setProductPopoverOpen((prev) => ({ ...prev, [key]: o }))}
      >
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="shrink-0 h-9 px-2 text-xs">
            商品庫
            <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(100vw-2rem,300px)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="搜尋商品…"
              value={search}
              onValueChange={(v) => setProductSearch((prev) => ({ ...prev, [key]: v }))}
            />
            <CommandList>
              <CommandEmpty>{products.length === 0 ? "載入中…" : "找不到"}</CommandEmpty>
              {Object.entries(filtered).map(([category, prods]) => (
                <CommandGroup key={category} heading={category}>
                  {prods.map((p) => {
                    const notice = productNotices[p.id];
                    const displayPrice = notice?.price_min ?? p.price;
                    const minQty = notice?.min_order_qty;
                    return (
                      <CommandItem
                        key={p.id}
                        value={p.id}
                        onSelect={() => {
                          setForm((prev) => ({
                            ...prev,
                            combos: prev.combos.map((co) =>
                              co.id !== comboId
                                ? co
                                : {
                                    ...co,
                                    lines: co.lines.map((ln) =>
                                      ln.id === line.id
                                        ? {
                                            ...ln,
                                            productId: p.id,
                                            productName: p.name,
                                            unit_price: displayPrice ?? p.price ?? 0,
                                          }
                                        : ln,
                                    ),
                                  },
                            ),
                          }));
                          setProductPopoverOpen((prev) => ({ ...prev, [key]: false }));
                          setProductSearch((prev) => ({ ...prev, [key]: "" }));
                        }}
                      >
                        <Check className={cn("mr-2 h-3 w-3", line.productId === p.id ? "opacity-100" : "opacity-0")} />
                        {[p.name, "（NT$ ", String(displayPrice), minQty != null ? `，最低${minQty}份` : "", "）"].join("")}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>建立特殊報價單（多訂單組合）</DialogTitle>
          <DialogDescription>
            建立後狀態為「已報價」，並另開報價單 HTML 供列印；轉訂單時將依組合拆成多筆訂單。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground pb-2 border-b">
          <span className={step === 1 ? "font-semibold text-foreground" : ""}>① 基礎資訊</span>
          <span aria-hidden>·</span>
          <span className={step === 2 ? "font-semibold text-foreground" : ""}>② 訂單組合與品項</span>
        </div>

        {step === 1 && (
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>訂購人（單位）</Label>
              <Input value={form.ordererName} onChange={(e) => setForm((p) => ({ ...p, ordererName: e.target.value }))} placeholder="公司或單位名稱" />
            </div>
            <div className="space-y-1">
              <Label>Email（選填）</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>電話（選填）</Label>
              <Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>LINE User ID（選填）</Label>
              <Input value={form.lineUserId} onChange={(e) => setForm((p) => ({ ...p, lineUserId: e.target.value }))} placeholder="U…" />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6 py-2">
            {form.combos.map((combo, ci) => (
              <div key={combo.id} className="border rounded-lg p-4 space-y-3 bg-muted/20">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">訂單組合 {ci + 1}</span>
                  {form.combos.length > 1 ? (
                    <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => removeCombo(combo.id)}>
                      移除此組合
                    </Button>
                  ) : null}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">取件日期</Label>
                    <Input type="date" value={combo.expected_pickup_date} onChange={(e) => setForm((p) => ({ ...p, combos: p.combos.map((c) => (c.id === combo.id ? { ...c, expected_pickup_date: e.target.value } : c)) }))} />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs">地點</Label>
                    <Input value={combo.pickup_location} onChange={(e) => setForm((p) => ({ ...p, combos: p.combos.map((c) => (c.id === combo.id ? { ...c, pickup_location: e.target.value } : c)) }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">該地點取件人</Label>
                    <Input value={combo.pickup_contact_name} onChange={(e) => setForm((p) => ({ ...p, combos: p.combos.map((c) => (c.id === combo.id ? { ...c, pickup_contact_name: e.target.value } : c)) }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">取件人電話</Label>
                    <Input value={combo.pickup_contact_phone} onChange={(e) => setForm((p) => ({ ...p, combos: p.combos.map((c) => (c.id === combo.id ? { ...c, pickup_contact_phone: e.target.value } : c)) }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">運費</Label>
                    <Input type="number" min={0} value={combo.shipping_fee} onChange={(e) => setForm((p) => ({ ...p, combos: p.combos.map((c) => (c.id === combo.id ? { ...c, shipping_fee: e.target.value } : c)) }))} />
                  </div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label className="text-xs">品項</Label>
                  {combo.lines.map((line) => (
                    <div key={line.id} className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
                      <div className="flex-1 min-w-0 space-y-1">
                        <Label className="text-xs">品項名稱</Label>
                        <div className="flex gap-2">
                          <Input
                            className="flex-1 min-w-0"
                            placeholder="可自訂品項名稱"
                            value={line.productName}
                            onChange={(e) =>
                              setForm((p) => ({
                                ...p,
                                combos: p.combos.map((c) =>
                                  c.id !== combo.id
                                    ? c
                                    : {
                                        ...c,
                                        lines: c.lines.map((ln) =>
                                          ln.id === line.id ? { ...ln, productName: e.target.value } : ln,
                                        ),
                                      },
                                ),
                              }))
                            }
                          />
                          {renderProductPicker(combo.id, line)}
                        </div>
                      </div>
                      <div className="w-full sm:w-24 space-y-1">
                        <Label className="text-xs">單價</Label>
                        <Input
                          type="number"
                          min={0}
                          value={line.unit_price || ""}
                          onChange={(e) =>
                            setForm((p) => ({
                              ...p,
                              combos: p.combos.map((c) =>
                                c.id !== combo.id
                                  ? c
                                  : {
                                      ...c,
                                      lines: c.lines.map((ln) =>
                                        ln.id === line.id ? { ...ln, unit_price: e.target.value ? Number(e.target.value) : 0 } : ln,
                                      ),
                                    },
                              ),
                            }))
                          }
                        />
                      </div>
                      <div className="w-full sm:w-20 space-y-1">
                        <Label className="text-xs">數量</Label>
                        <Input
                          type="number"
                          min={1}
                          value={line.quantity || ""}
                          onChange={(e) =>
                            setForm((p) => ({
                              ...p,
                              combos: p.combos.map((c) =>
                                c.id !== combo.id
                                  ? c
                                  : {
                                      ...c,
                                      lines: c.lines.map((ln) =>
                                        ln.id === line.id ? { ...ln, quantity: e.target.value ? Number(e.target.value) : 1 } : ln,
                                      ),
                                    },
                              ),
                            }))
                          }
                        />
                      </div>
                      {combo.lines.length > 1 ? (
                        <Button type="button" variant="outline" size="sm" onClick={() => removeLine(combo.id, line.id)}>
                          刪列
                        </Button>
                      ) : (
                        <div className="w-14 shrink-0" />
                      )}
                    </div>
                  ))}
                  <Button type="button" variant="secondary" size="sm" onClick={() => addLine(combo.id)}>
                    新增品項
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  組合小計 NT$ {comboLineSubtotal(combo).toLocaleString()} + 運費 NT${" "}
                  {(Number(combo.shipping_fee) || 0).toLocaleString()} ＝ NT${" "}
                  {(comboLineSubtotal(combo) + (Number(combo.shipping_fee) || 0)).toLocaleString()}
                </p>
              </div>
            ))}
            <Button type="button" variant="outline" onClick={addCombo}>
              新增訂單組合
            </Button>
            <Separator />
            <div className="text-sm font-medium space-y-1">
              <div className="flex justify-between">
                <span>全單品項小計</span>
                <span>NT$ {comboTotals.grandSub.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>全單運費加總</span>
                <span>NT$ {comboTotals.grandShip.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-base">
                <span>報價總額</span>
                <span>NT$ {comboTotals.grandTotal.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between">
          <div className="flex gap-2">
            {step > 1 ? (
              <Button type="button" variant="outline" onClick={() => setStep((s) => Math.max(1, s - 1))}>
                上一步
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2 sm:justify-end">
            {step < 2 ? (
              <Button
                type="button"
                onClick={() => {
                  if (!form.ordererName.trim()) {
                    toast({ title: "請填寫訂購人（單位）", variant: "destructive" });
                    return;
                  }
                  setStep(2);
                }}
              >
                下一步
              </Button>
            ) : (
              <Button type="button" disabled={submitting} onClick={() => void submit()}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                建立並開啟報價單
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
