// ======================================================================
// PackageQuantityPriceBox.tsx — 包裝價格顯示盒（三價格）
// ======================================================================

import { Card } from "@/components/ui/card";
import type { BoxConfig } from "@/hooks/useUniversalPackageCustomizer";

interface PackageQuantityPriceBoxProps {
  dessertQuantity: number;
  packagePrice: number;
  decorationPrice: number;
  totalPrice: number;
  boxConfig1: BoxConfig | null;
  boxConfig2: BoxConfig | null;
  decorationQuantity: number;
  isBoxedStyle: boolean;
}

export function PackageQuantityPriceBox({
  dessertQuantity,
  packagePrice,
  decorationPrice,
  totalPrice,
  boxConfig1,
  boxConfig2,
  decorationQuantity,
  isBoxedStyle,
}: PackageQuantityPriceBoxProps) {
  return (
    <Card className="p-6 space-y-4 bg-card border-2 border-primary/20">
      <h3 className="text-xl font-bold text-center">包裝設計價格</h3>

      <div className="space-y-3 text-sm">
        {/* 甜點數量 */}
        <div className="flex justify-between items-center pb-2 border-b border-border">
          <span className="text-muted-foreground">上一頁訂購的甜點數量</span>
          <span className="font-semibold">{dessertQuantity} 個</span>
        </div>

        {/* 包裝盒費用 */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">🎁包裝盒費用</span>
            <span className="font-semibold text-lg">NT$ {packagePrice}</span>
          </div>
          {isBoxedStyle && boxConfig1 && (
            <div className="ml-4 space-y-1 text-xs text-muted-foreground">
              <p>
                ├─ 規格一：{boxConfig1.capacity.option_name_zh}/{boxConfig1.color.option_name_zh}/{boxConfig1.quantity}
                盒 @ NT${boxConfig1.color.price_modifier} = NT$
                {boxConfig1.color.price_modifier * boxConfig1.quantity}
              </p>
              {boxConfig2 && (
                <p>
                  └─ 規格二：{boxConfig2.capacity.option_name_zh}/{boxConfig2.color.option_name_zh}/
                  {boxConfig2.quantity}盒 @ NT${boxConfig2.color.price_modifier} = NT$
                  {boxConfig2.color.price_modifier * boxConfig2.quantity}
                </p>
              )}
            </div>
          )}
        </div>

        {/* 裝飾品費用 */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">🎀 裝飾品費用</span>
            <span className="font-semibold text-lg">NT$ {decorationPrice}</span>
          </div>
          <div className="ml-4 text-xs text-muted-foreground">
            <p>
              └─ 共 {decorationQuantity} {isBoxedStyle ? "盒" : "個"}，每
              {isBoxedStyle ? "盒" : "個"}一組裝飾
            </p>
          </div>
        </div>

        {/* 總價 */}
        <div className="flex justify-between items-center pt-3 border-t-2 border-primary">
          <span className="font-bold text-lg">💰 包裝設計總價</span>
          <span className="font-bold text-2xl text-primary">NT$ {totalPrice}</span>
        </div>
      </div>
    </Card>
  );
}
