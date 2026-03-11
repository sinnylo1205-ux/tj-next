// ======================================================================
// QuantityPriceBox.tsx — 可愛甜點風格（支援手動輸入數量 + 包裝費用）
// ======================================================================

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Minus, Plus, AlertCircle } from "lucide-react";
import { useQuantityInput } from "@/hooks/useQuantityInput";

interface ConditionalFeeDetail {
  option_id: number;
  option_name_zh: string;
  fee: number;
}

interface QuantityPriceBoxProps {
  quantity: number;
  minQuantity: number;
  unitPrice: number;
  onQuantityChange: (newQuantity: number) => void;

  // ✅ 新架構：直接接收後端分項數據（不做前端加法）
  subtotal: number; // 甜點小計 (unitPrice × quantity)
  packageFee: number; // 包裝費用
  conditionalFee: number; // 插卡費用（單一數值）
  grandTotal: number; // 總計（後端 grand_total）

  // 馬卡龍專用 props
  manualInputMode?: boolean;
  quantityError?: string | null;
  customFeeNote?: string;
  customFeeAmount?: number;

  // ✅ 條件費用明細（用於顯示插卡費細項名稱）
  conditionalFeeDetails?: ConditionalFeeDetail[];

  // ✅ 插卡費顯示（businessRules 條件加價時）
  showPhotoCardFee?: boolean;

  // ✅ 爆米花用戶自己設計包裝（7299）
  hasUserDesignPackage?: boolean;
}

export function QuantityPriceBox({
  quantity,
  minQuantity,
  unitPrice,
  onQuantityChange,
  subtotal,
  packageFee,
  conditionalFee,
  grandTotal,
  manualInputMode = false,
  quantityError,
  customFeeNote,
  customFeeAmount = 0,
  conditionalFeeDetails = [],
  showPhotoCardFee = false,
  hasUserDesignPackage = false,
}: QuantityPriceBoxProps) {
  const hasPackageFee = packageFee > 0 || hasUserDesignPackage;
  const hasConditionalFee = conditionalFee > 0;
  const hasCustomFee = customFeeAmount > 0;

  // ✅ 使用共用 hook 處理手動輸入邏輯
  const { localValue, handleInputChange, handleInputBlur, handleKeyDown } =
    useQuantityInput({
      quantity,
      minQuantity,
      onQuantityChange,
    });

  const priceColClass = "w-[8rem] shrink-0 text-right tabular-nums";
  const priceRow = (label: string, value: string, className = "") => (
    <div className="flex items-center pl-2">
      <span className="flex-1 text-left text-foreground">{label}</span>
      <span className={`${priceColClass} ${className}`}>{value}</span>
    </div>
  );

  return (
    <Card className="p-6 mt-6 bg-primary/10 rounded-xl space-y-6">
      {/* 數量選擇 */}
      <div className="flex items-center justify-between">
        <span className="text-lg font-medium text-foreground">訂購數量</span>

        {/* ✅ 統一 UI：[ - ] [ Input ] [ + ] */}
        <div className="flex items-center gap-2">
          {/* -10 按鈕 */}
          <Button
            size="icon"
            variant="outline"
            onClick={() => onQuantityChange(Math.max(minQuantity, quantity - 10))}
            disabled={quantity <= minQuantity}
            className="h-10 w-10 rounded-full"
          >
            <Minus size={20} />
          </Button>

          {/* 手動輸入框 */}
          <Input
            type="text"
            inputMode="numeric"
            value={localValue}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            onKeyDown={handleKeyDown}
            className="w-20 text-center text-xl font-bold"
          />

          {/* +10 按鈕 */}
          <Button
            size="icon"
            variant="outline"
            onClick={() => onQuantityChange(quantity + 10)}
            className="h-10 w-10 rounded-full"
          >
            <Plus size={20} />
          </Button>
        </div>
      </div>

      {/* 數量錯誤提示 */}
      {quantityError && (
        <div className="flex items-center gap-2 text-destructive text-sm">
          <AlertCircle size={16} />
          {quantityError}
        </div>
      )}

      {/* 最低訂購量說明 */}
      <p className="text-sm text-muted-foreground text-center">最低訂購量：{minQuantity} 個</p>

      {/* 指定顏色手續費提示 */}
      {customFeeNote && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-sm text-amber-800 flex items-center gap-2">
            <AlertCircle size={16} />
            {customFeeNote}
          </p>
        </div>
      )}

     {/* 價格顯示 */}
<div className="pt-4 border-t-2 border-border">
  <p className="text-lg font-medium text-foreground text-left mb-4">
    費用細項
  </p>

  {/* 費用列表 */}
<div className="mx-auto w-[360px] grid grid-cols-[1fr_120px] gap-y-3">

{/* 單價 */}
<span className="text-foreground">
  甜點單價
</span>
<span className="text-foreground tabular-nums text-right">
  NT$ {unitPrice.toLocaleString()} /個
</span>

{/* 小計 */}
<span className="font-medium">
  小計 ({quantity}個)
</span>
<span className="text-foreground tabular-nums text-right">
  NT$ {subtotal.toLocaleString()}
</span>

{/* 指定色費用 */}
{hasCustomFee && (
  <>
    <span className="text-amber-600">
      指定色費用（10%）
    </span>
    <span className="tabular-nums text-right text-amber-600">
      NT$ {customFeeAmount.toLocaleString()}
    </span>
  </>
)}

{/* 包裝費 */}
{hasPackageFee && packageFee > 0 && (
  <>
    <span>包裝費用</span>
    <span className="text-foreground tabular-nums text-right">
      NT$ {packageFee.toLocaleString()}
    </span>
  </>
)}

{/* 插卡費 */}
{hasConditionalFee && (
  <>
    <span className="text-amber-600">
      插卡費用
    </span>
    <span className="tabular-nums text-right text-amber-600">
      <span className="text-muted-foreground">… </span>
      NT$ {conditionalFee.toLocaleString()}
    </span>
  </>
)}

</div>

{/* 總計 */}
<div className="mt-6 pt-4 border-t-2 border-border text-center">
<p className="text-xl font-semibold">結算總計</p>
<p className="text-4xl font-bold text-primary mt-2 tabular-nums">
  NT$ {grandTotal.toLocaleString()}
</p>
</div>
    </div>
    </Card>
  );
}
