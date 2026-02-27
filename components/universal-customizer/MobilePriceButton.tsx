// ======================================================================
// MobilePriceButton.tsx — 手機版購物車 icon（展開/收起價格資訊）
// ======================================================================

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ShoppingCart, X, AlertCircle, Minus, Plus } from "lucide-react";
import { useQuantityInput } from "@/hooks/useQuantityInput";

interface ConditionalFeeDetail {
  option_id: number;
  option_name_zh: string;
  fee: number;
}

interface MobilePriceButtonProps {
  quantity: number;
  minQuantity: number;
  unitPrice: number;
  onQuantityChange: (newQuantity: number) => void;

  // ✅ 新架構：直接接收後端分項數據（不做前端加法）
  subtotal: number; // 甜點小計 (unitPrice × quantity)
  packageFee: number; // 包裝費用
  conditionalFee: number; // 插卡費用（單一數值）
  grandTotal: number; // 總計（後端 grand_total）

  /** ⭐ 可調整位置 */
  offsetTop?: number; // px
  offsetRight?: number; // px

  // ✅ 與 QuantityPriceBox 同步的 props
  customFeeNote?: string; // 馬卡龍指定顏色提示
  customFeeAmount?: number; // 馬卡龍指定顏色費用
  conditionalFeeDetails?: ConditionalFeeDetail[]; // 條件費用明細
  hasUserDesignPackage?: boolean; // 爆米花自己設計包裝
}

export function MobilePriceButton({
  quantity,
  minQuantity,
  unitPrice,
  onQuantityChange,
  subtotal,
  packageFee,
  conditionalFee,
  grandTotal,
  offsetTop = 16,
  offsetRight = 16,
  customFeeNote,
  customFeeAmount = 0,
  conditionalFeeDetails = [],
  hasUserDesignPackage = false,
}: MobilePriceButtonProps) {
  const [isExpanded, setIsExpanded] = useState(false);

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

  return (
    <>
      {/* 購物車 icon 按鈕：改用 props 控制位置 */}
      <div
        className="absolute z-50"
        style={{
          top: offsetTop,
          right: offsetRight,
        }}
      >
        <Button
          variant="outline"
          size="icon"
          onClick={() => setIsExpanded(!isExpanded)}
          className="rounded-full w-12 h-12 bg-white shadow-lg"
        >
          {isExpanded ? <X size={20} /> : <ShoppingCart size={20} />}
        </Button>

        {/* 價格提示氣泡 */}
        {!isExpanded && (
          <div className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground text-xs font-bold rounded-full px-2 py-0.5">
            ${grandTotal.toLocaleString()}
          </div>
        )}
      </div>

      {/* 展開的價格資訊卡片 */}
      {isExpanded && (
        <Card
          className="absolute w-80 p-4 shadow-xl z-50"
          style={{
            top: offsetTop + 52, // icon 底下展開卡片
            right: offsetRight,
          }}
        >
          <div className="space-y-3">
            {/* ✅ 數量調整區（統一 UI：[ - ] [ Input ] [ + ]） */}
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">訂購數量</span>
              <div className="flex items-center gap-2">
                {/* -10 按鈕 */}
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => onQuantityChange(Math.max(minQuantity, quantity - 10))}
                  disabled={quantity <= minQuantity}
                  className="h-8 w-8 rounded-full"
                >
                  <Minus size={16} />
                </Button>

                {/* 手動輸入框 */}
                <Input
                  type="text"
                  inputMode="numeric"
                  value={localValue}
                  onChange={handleInputChange}
                  onBlur={handleInputBlur}
                  onKeyDown={handleKeyDown}
                  className="w-16 h-8 text-center text-base font-bold"
                />

                {/* +10 按鈕 */}
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => onQuantityChange(quantity + 10)}
                  className="h-8 w-8 rounded-full"
                >
                  <Plus size={16} />
                </Button>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">甜點本身金額</span>
              <span className="text-base font-semibold">NT$ {unitPrice.toLocaleString()}</span>
            </div>

            {/* 馬卡龍指定顏色提示 */}
            {customFeeNote && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2">
                <p className="text-xs text-amber-800 flex items-center gap-1">
                  <AlertCircle size={12} />
                  {customFeeNote}
                </p>
              </div>
            )}

            {/* ✅ 費用明細區 */}
            <div className="pt-2 border-t border-border space-y-1">
              {/* 小計（甜點總價，不含任何額外費用） */}
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">小計</span>
                <span>NT$ {subtotal.toLocaleString()}</span>
              </div>

              {/* 馬卡龍指定色費用 */}
              {hasCustomFee && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">指定色費用（10%）</span>
                  <span className="text-amber-600">NT$ {customFeeAmount.toLocaleString()}</span>
                </div>
              )}

              {/* 包裝費用 */}
              {hasPackageFee && packageFee > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">包裝費用</span>
                  <span>NT$ {packageFee.toLocaleString()}</span>
                </div>
              )}

              {/* 插卡費用 */}
              {hasConditionalFee && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">插卡費用</span>
                  <span className="text-amber-600">NT$ {conditionalFee.toLocaleString()}</span>
                </div>
              )}
            </div>

            {/* 總計 */}
            <div className="flex justify-between items-center pt-2 border-t border-border">
              <span className="text-base font-bold">總計</span>
              <span className="text-xl font-bold text-primary">NT$ {grandTotal.toLocaleString()}</span>
            </div>

            <p className="text-xs text-muted-foreground text-center">最低訂購量：{minQuantity} 個</p>
          </div>
        </Card>
      )}
    </>
  );
}
