"use client";

import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LineUserIdInput } from "./LineUserIdInput";
import {
  recomputeComboAmounts,
  type SpecialQuotationComboPayload,
  type SpecialQuotationItemLike,
  type SpecialQuotationRoot,
} from "@/lib/special-quotation";

function comboOrdinalChinese(index1Based: number): string {
  const table: Record<number, string> = {
    1: "一", 2: "二", 3: "三", 4: "四", 5: "五", 6: "六", 7: "七", 8: "八", 9: "九", 10: "十",
    11: "十一", 12: "十二", 13: "十三", 14: "十四", 15: "十五", 16: "十六", 17: "十七", 18: "十八", 19: "十九", 20: "二十",
  };
  return table[index1Based] ?? String(index1Based);
}

function formatMoney(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "待補";
  return v.toLocaleString();
}

type SpecialQuotationEditBlockProps = {
  specialEdit: SpecialQuotationRoot;
  onSpecialEditChange: (next: SpecialQuotationRoot) => void;
  itemsByComboId: Map<string, SpecialQuotationItemLike[]>;
  unassignedItems: SpecialQuotationItemLike[];
  renderItemEditor: (item: SpecialQuotationItemLike) => ReactNode;
  hasConvertedOrders?: boolean;
  context: "price_asked" | "price_reply" | "order_created";
};

export function SpecialQuotationEditBlock({
  specialEdit,
  onSpecialEditChange,
  itemsByComboId,
  unassignedItems,
  renderItemEditor,
  hasConvertedOrders,
  context,
}: SpecialQuotationEditBlockProps) {
  const notice =
    context === "price_asked"
      ? "特殊報價單 · 請於各訂單組合下填寫品項單價與運費，儲存後寫入 all_requirement。"
      : context === "order_created"
        ? "特殊報價單 · 已建立訂單；修改報價單不會自動回寫 orders。"
        : "特殊報價單 · 各訂單組合與品項並列編輯。";

  const updateCombo = (comboId: string, patch: Partial<SpecialQuotationComboPayload>) => {
    onSpecialEditChange({
      ...specialEdit,
      combos: specialEdit.combos.map((c) => {
        if (c.id !== comboId) return c;
        const merged = { ...c, ...patch };
        const items = itemsByComboId.get(comboId) ?? [];
        const amounts = recomputeComboAmounts(merged, items);
        return { ...merged, ...amounts };
      }),
    });
  };

  const updateContact = (patch: Partial<SpecialQuotationRoot["contact"]>) => {
    onSpecialEditChange({
      ...specialEdit,
      contact: { ...specialEdit.contact, ...patch },
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm rounded-md border border-amber-200 bg-amber-50 text-amber-950 px-3 py-2">{notice}</p>
      {hasConvertedOrders ? (
        <p className="text-xs text-amber-800 border border-amber-300 rounded-md px-3 py-2 bg-amber-50/80">
          此報價單已轉出訂單；此處修改僅更新報價單資料，不會同步至已建立的 orders。
        </p>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 border rounded-lg bg-muted/20">
        <div className="space-y-1 md:col-span-2">
          <Label className="text-sm">訂購人（單位）</Label>
          <Input
            value={specialEdit.orderer_name}
            onChange={(e) => onSpecialEditChange({ ...specialEdit, orderer_name: e.target.value })}
            placeholder="勁力--聖祥"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-sm">聯絡 Email</Label>
          <Input
            type="email"
            value={specialEdit.contact.email ?? ""}
            onChange={(e) => updateContact({ email: e.target.value || null })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-sm">聯絡電話</Label>
          <Input
            value={specialEdit.contact.phone ?? ""}
            onChange={(e) => updateContact({ phone: e.target.value || null })}
          />
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label className="text-sm">LINE User ID</Label>
          <LineUserIdInput
            value={specialEdit.contact.line_user_id ?? ""}
            onChange={(v) => updateContact({ line_user_id: v || null })}
            placeholder="Uxxxxxxxx..."
          />
        </div>
      </div>

      {specialEdit.combos.map((combo, comboIdx) => {
        const ordinal = comboOrdinalChinese(comboIdx + 1);
        const comboItems = itemsByComboId.get(combo.id) ?? [];
        const amounts = recomputeComboAmounts(combo, comboItems);
        return (
          <div key={combo.id} className="p-4 border rounded-lg bg-background space-y-3">
            <p className="text-sm font-semibold">訂單組合{ordinal}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">預計取件日</Label>
                <Input
                  type="date"
                  value={combo.expected_pickup_date ?? ""}
                  onChange={(e) => updateCombo(combo.id, { expected_pickup_date: e.target.value || null })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">取件地點</Label>
                <Input
                  value={combo.pickup_location ?? ""}
                  onChange={(e) => updateCombo(combo.id, { pickup_location: e.target.value || null })}
                  placeholder="桃園F11"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">取件聯絡人</Label>
                <Input
                  value={combo.pickup_contact_name ?? ""}
                  onChange={(e) => updateCombo(combo.id, { pickup_contact_name: e.target.value || null })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">取件電話</Label>
                <Input
                  value={combo.pickup_contact_phone ?? ""}
                  onChange={(e) => updateCombo(combo.id, { pickup_contact_phone: e.target.value || null })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">運費</Label>
                <Input
                  type="number"
                  min={0}
                  value={combo.shipping_fee}
                  onChange={(e) => updateCombo(combo.id, { shipping_fee: Number(e.target.value) || 0 })}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              小計 NT$ {formatMoney(amounts.line_subtotal)} · 運費 NT$ {formatMoney(combo.shipping_fee)} · 合計 NT${" "}
              {formatMoney(amounts.line_total)}
            </p>

            {comboItems.length === 0 ? (
              <p className="text-xs text-amber-800 border-t pt-2">此組合尚無對應品項（請檢查品項 combo_id）。</p>
            ) : (
              <div className="space-y-3 border-t pt-3">
                {comboItems.map((item) => (
                  <div key={item.id}>{renderItemEditor(item)}</div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {unassignedItems.length > 0 ? (
        <div className="p-4 border border-amber-300 rounded-lg bg-amber-50/50 space-y-3">
          <p className="text-sm font-medium text-amber-900">未分組品項（combo_id 無法對應任一組合）</p>
          {unassignedItems.map((item) => (
            <div key={item.id}>{renderItemEditor(item)}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
