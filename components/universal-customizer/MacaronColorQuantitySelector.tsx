// ======================================================================
// MacaronColorQuantitySelector.tsx — 馬卡龍顏色數量分配選擇器
// ======================================================================

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertCircle, Check, ExternalLink } from "lucide-react";
import type {
  MacaronColorOption,
  MacaronColorMode,
  QuantityDistributionMode,
} from "@/hooks/useMacaronColorQuantity";

interface MacaronColorQuantitySelectorProps {
  // 模式選擇
  colorMode: MacaronColorMode;
  onColorModeChange: (mode: MacaronColorMode) => void;
  
  // 數量輸入
  customQuantity: number;
  onQuantityChange: (qty: number) => void;
  quantityError: string | null;
  
  // 顏色選項
  colorOptions: MacaronColorOption[];
  maxSelectableColors: number;
  selectedColorIds: Set<number>;
  onToggleColor: (optionId: number) => void;
  
  // 數量分配
  distributionMode: QuantityDistributionMode;
  onDistributionModeChange: (mode: QuantityDistributionMode) => void;
  colorQuantities: Map<number, number>;
  onColorQuantityChange: (colorId: number, qty: number) => void;
  distributionError: string | null;
  
  // 步驟控制
  currentStep: number;
  onNextStep: () => void;
  onPreviousStep: () => void;
}

export function MacaronColorQuantitySelector({
  colorMode,
  onColorModeChange,
  customQuantity,
  onQuantityChange,
  quantityError,
  colorOptions,
  maxSelectableColors,
  selectedColorIds,
  onToggleColor,
  distributionMode,
  onDistributionModeChange,
  colorQuantities,
  onColorQuantityChange,
  distributionError,
  currentStep,
  onNextStep,
  onPreviousStep,
}: MacaronColorQuantitySelectorProps) {
  
  // ==================== 步驟 1：模式選擇 ====================
  if (currentStep === 1) {
    return (
      <div className="space-y-4">
        <h4 className="font-medium text-foreground">選擇馬卡龍顏色方式</h4>
        
        {/* 隨機出貨 */}
        <button
          onClick={() => onColorModeChange("random")}
          className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
            colorMode === "random"
              ? "border-primary bg-primary/10"
              : "border-border hover:border-primary/50"
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-foreground">預設（六個顏色隨機出貨）</p>
              <p className="text-sm text-muted-foreground mt-1">
                由店家隨機搭配六種經典口味
              </p>
            </div>
            {colorMode === "random" && <Check className="text-primary" size={24} />}
          </div>
          <a
            href="https://i.postimg.cc/xCDr4jW1/wang-zhan-su-cai-(1).png"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-2 text-sm text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink size={14} />
            查看隨機口味
          </a>
        </button>
        
        {/* 指定顏色 */}
        <button
          onClick={() => onColorModeChange("custom")}
          className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
            colorMode === "custom"
              ? "border-primary bg-primary/10"
              : "border-border hover:border-primary/50"
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-foreground">指定顏色（每一百個可指定一色）</p>
              <p className="text-sm text-muted-foreground mt-1">
                自選您喜愛的馬卡龍顏色
              </p>
            </div>
            {colorMode === "custom" && <Check className="text-primary" size={24} />}
          </div>
        </button>
        
        {colorMode === "custom" && (
          <Button onClick={onNextStep} className="w-full mt-4">
            下一步：輸入數量
          </Button>
        )}
      </div>
    );
  }
  
  // ==================== 步驟 2：數量輸入 ====================
  if (currentStep === 2) {
    return (
      <div className="space-y-4">
        <h4 className="font-medium text-foreground">輸入訂購數量</h4>
        
        <div className="space-y-2">
          <Input
            type="number"
            min={100}
            step={100}
            value={customQuantity}
            onChange={(e) => onQuantityChange(Number(e.target.value))}
            placeholder="請輸入數量（100的倍數）"
            className="text-center text-xl font-bold"
          />
          
          {quantityError && (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle size={16} />
              {quantityError}
            </div>
          )}
          
          <p className="text-sm text-muted-foreground">
            • 最低訂購量：100 顆
          </p>
          <p className="text-sm text-muted-foreground">
            • 數量必須是 100 的倍數（例如：100、200、300...）
          </p>
        </div>
        
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-sm text-amber-800 flex items-center gap-2">
            <AlertCircle size={16} />
            ⚠️ 指定顏色將加收訂單金額 10% 手續費
          </p>
        </div>
        
        {!quantityError && customQuantity >= 100 && (
          <p className="text-sm text-primary font-medium">
            ✨ 訂購 {customQuantity} 顆，可選擇 {maxSelectableColors} 種顏色
          </p>
        )}
        
        <div className="flex gap-3 mt-4">
          <Button variant="outline" onClick={onPreviousStep} className="flex-1">
            上一步
          </Button>
          <Button
            onClick={onNextStep}
            className="flex-1"
            disabled={!!quantityError || customQuantity < 100}
          >
            下一步：選擇顏色
          </Button>
        </div>
      </div>
    );
  }
  
  // ==================== 步驟 3：顏色選擇 ====================
  if (currentStep === 3) {
    return (
      <div className="space-y-4">
        <h4 className="font-medium text-foreground">
          選擇馬卡龍顏色（最多選 {maxSelectableColors} 色，已選 {selectedColorIds.size} 色）
        </h4>
        
        <div className="flex flex-wrap gap-3">
          {colorOptions.map((option) => {
            const isSelected = selectedColorIds.has(option.option_id);
            const isDisabled = !isSelected && selectedColorIds.size >= maxSelectableColors;
            
            return (
              <div key={option.option_id} className="flex flex-col items-center gap-1 w-14">
                <button
                  onClick={() => onToggleColor(option.option_id)}
                  disabled={isDisabled}
                  className={`
                    w-12 h-12 rounded-full border-2 transition-all relative
                    ${isSelected ? "border-primary scale-110 shadow-lg" : "border-gray-300"}
                    ${isDisabled ? "opacity-40 cursor-not-allowed" : "hover:scale-105"}
                  `}
                  style={{ backgroundColor: option.hex }}
                  title={option.option_name_zh}
                >
                  {isSelected && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Check className="text-white drop-shadow-md" size={20} />
                    </div>
                  )}
                </button>
                <span className="text-xs text-muted-foreground text-center leading-tight">
                  {option.option_name_zh}
                </span>
              </div>
            );
          })}
        </div>
        
        <div className="flex gap-3 mt-4">
          <Button variant="outline" onClick={onPreviousStep} className="flex-1">
            上一步
          </Button>
          <Button
            onClick={onNextStep}
            className="flex-1"
            disabled={selectedColorIds.size === 0}
          >
            下一步：分配數量
          </Button>
        </div>
      </div>
    );
  }
  
  // ==================== 步驟 4：數量分配 ====================
  if (currentStep === 4) {
    const selectedOptions = colorOptions.filter((o) => selectedColorIds.has(o.option_id));
    
    return (
      <div className="space-y-4">
        <h4 className="font-medium text-foreground">分配各顏色數量</h4>
        
        {/* 分配模式選擇 */}
        <div className="flex gap-3">
          <button
            onClick={() => onDistributionModeChange("even")}
            className={`flex-1 p-3 rounded-lg border-2 transition-all ${
              distributionMode === "even"
                ? "border-primary bg-primary/10"
                : "border-border hover:border-primary/50"
            }`}
          >
            <p className="font-medium">平均分配</p>
          </button>
          <button
            onClick={() => onDistributionModeChange("custom")}
            className={`flex-1 p-3 rounded-lg border-2 transition-all ${
              distributionMode === "custom"
                ? "border-primary bg-primary/10"
                : "border-border hover:border-primary/50"
            }`}
          >
            <p className="font-medium">自定義分配</p>
          </button>
        </div>
        
        {/* 數量分配表格 */}
        <div className="space-y-3">
          {selectedOptions.map((option) => {
            const qty = colorQuantities.get(option.option_id) || 0;
            
            return (
              <div
                key={option.option_id}
                className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg"
              >
                <div
                  className="w-8 h-8 rounded-full border border-gray-300"
                  style={{ backgroundColor: option.hex }}
                />
                <span className="flex-1 font-medium">{option.option_name_zh}</span>
                
                {distributionMode === "even" ? (
                  <span className="text-lg font-bold text-primary">{qty} 顆</span>
                ) : (
                  <Input
                    type="number"
                    min={0}
                    max={customQuantity}
                    value={qty}
                    onChange={(e) => onColorQuantityChange(option.option_id, Number(e.target.value))}
                    className="w-24 text-center"
                  />
                )}
              </div>
            );
          })}
        </div>
        
        {/* 總計 */}
        <div className="flex justify-between items-center p-3 bg-primary/10 rounded-lg">
          <span className="font-medium">總計</span>
          <span className="text-lg font-bold">
            {Array.from(colorQuantities.values()).reduce((a, b) => a + b, 0)} / {customQuantity} 顆
          </span>
        </div>
        
        {distributionError && (
          <div className="flex items-center gap-2 text-destructive text-sm">
            <AlertCircle size={16} />
            {distributionError}
          </div>
        )}
        
        <div className="flex gap-3 mt-4">
          <Button variant="outline" onClick={onPreviousStep} className="flex-1">
            上一步
          </Button>
          <Button
            onClick={onNextStep}
            className="flex-1"
            disabled={distributionMode === "custom" && !!distributionError}
          >
            確認分配
          </Button>
        </div>
      </div>
    );
  }
  
  // 步驟 5+：已完成顏色分配，顯示摘要
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-foreground">✅ 顏色分配已完成</h4>
        <Button variant="ghost" size="sm" onClick={() => onPreviousStep()}>
          修改
        </Button>
      </div>
      
      <div className="space-y-2 p-4 bg-muted/30 rounded-lg">
        {colorOptions
          .filter((o) => selectedColorIds.has(o.option_id))
          .map((option) => (
            <div key={option.option_id} className="flex items-center gap-2">
              <div
                className="w-5 h-5 rounded-full border"
                style={{ backgroundColor: option.hex }}
              />
              <span className="flex-1">{option.option_name_zh}</span>
              <span className="font-medium">
                {colorQuantities.get(option.option_id) || 0} 顆
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}
