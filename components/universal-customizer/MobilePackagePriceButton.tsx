// ======================================================================
// MobilePackagePriceButton.tsx — 包裝設計器手機版購物車 icon
// ======================================================================

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ShoppingCart, X } from "lucide-react";
import type { BoxConfig } from "@/hooks/useUniversalPackageCustomizer";

interface MobilePackagePriceButtonProps {
  dessertQuantity: number;
  packagePrice: number;
  decorationPrice: number;
  totalPrice: number;
  boxConfig1: BoxConfig | null;
  boxConfig2: BoxConfig | null;
  decorationQuantity: number;
  isBoxedStyle: boolean;
}

export function MobilePackagePriceButton({
  dessertQuantity,
  packagePrice,
  decorationPrice,
  totalPrice,
  boxConfig1,
  boxConfig2,
  decorationQuantity,
  isBoxedStyle,
}: MobilePackagePriceButtonProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <>
      {/* 購物車 icon 按鈕 */}
      <div className="absolute top-4 right-4 z-50">
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
            ${totalPrice}
          </div>
        )}
      </div>

      {/* 展開的價格資訊卡片 */}
      {isExpanded && (
        <Card className="absolute top-16 right-4 w-80 p-4 shadow-xl z-50 space-y-3">
          <h4 className="text-base font-bold text-center">包裝設計價格</h4>

          <div className="space-y-2 text-sm">
            {/* 甜點數量 */}
            <div className="flex justify-between items-center pb-2 border-b border-border">
              <span className="text-muted-foreground">甜點數量</span>
              <span className="font-semibold">{dessertQuantity} 個</span>
            </div>

            {/* 包裝盒費用 */}
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">🎁 包裝盒</span>
                <span className="font-semibold">NT$ {packagePrice}</span>
              </div>
              {isBoxedStyle && boxConfig1 && (
                <div className="ml-4 space-y-1 text-xs text-muted-foreground">
                  <p>
                    規格一：{boxConfig1.capacity.option_name_zh}/{boxConfig1.color.option_name_zh}/
                    {boxConfig1.quantity}盒
                  </p>
                  {boxConfig2 && (
                    <p>
                      規格二：{boxConfig2.capacity.option_name_zh}/{boxConfig2.color.option_name_zh}/
                      {boxConfig2.quantity}盒
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* 裝飾品費用 */}
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">🎀 裝飾品</span>
                <span className="font-semibold">NT$ {decorationPrice}</span>
              </div>
              <div className="ml-4 text-xs text-muted-foreground">
                <p>
                  共 {decorationQuantity} {isBoxedStyle ? "盒" : "個"}
                </p>
              </div>
            </div>

            {/* 總價 */}
            <div className="flex justify-between items-center pt-2 border-t-2 border-primary">
              <span className="font-bold">💰 總價</span>
              <span className="font-bold text-xl text-primary">NT$ {totalPrice}</span>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
