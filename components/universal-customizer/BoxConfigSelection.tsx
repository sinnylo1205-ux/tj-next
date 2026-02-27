// ======================================================================
// BoxConfigSelection.tsx — 盒裝配置選擇器（容量、顏色、數量、驗證）
// ======================================================================

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { BoxCapacityOption, BoxColorOption, BoxConfig } from "@/hooks/useUniversalPackageCustomizer";

interface BoxConfigSelectionProps {
  dessertQuantity: number;
  boxConfig1: BoxConfig | null;
  boxConfig2: BoxConfig | null;
  onConfig1Change: (config: BoxConfig | null) => void;
  onConfig2Change: (config: BoxConfig | null) => void;
  capacityOptions: BoxCapacityOption[];
  colorOptionsMap: Map<number, BoxColorOption[]>;
  // ✅ 新增：當容量選擇時立即通知父組件（用於早期渲染盒子預覽）
  onCapacitySelect?: (capacity: BoxCapacityOption, configIndex: 1 | 2) => void;
  // ✅ 新增：當顏色選擇時立即通知父組件（用於即時渲染盒子預覽）
  onColorSelect?: (color: BoxColorOption, configIndex: 1 | 2) => void;
}

export function BoxConfigSelection({
  dessertQuantity,
  boxConfig1,
  boxConfig2,
  onConfig1Change,
  onConfig2Change,
  capacityOptions,
  colorOptionsMap,
  onCapacitySelect,
  onColorSelect,
}: BoxConfigSelectionProps) {
  // 配置一的臨時狀態
  const [tempCapacity1, setTempCapacity1] = useState<BoxCapacityOption | null>(null);
  const [tempColor1, setTempColor1] = useState<BoxColorOption | null>(null);
  const [tempQuantity1, setTempQuantity1] = useState("");

  // 配置二的臨時狀態
  const [showConfig2, setShowConfig2] = useState(false);
  const [tempCapacity2, setTempCapacity2] = useState<BoxCapacityOption | null>(null);
  const [tempColor2, setTempColor2] = useState<BoxColorOption | null>(null);
  const [tempQuantity2, setTempQuantity2] = useState("");

  // 彈窗狀態
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // 配置一的顏色選項
  const colorOptions1 = tempCapacity1 ? colorOptionsMap.get(tempCapacity1.option_id) || [] : [];

  // 配置二的顏色選項
  const colorOptions2 = tempCapacity2 ? colorOptionsMap.get(tempCapacity2.option_id) || [] : [];

  // ✅ 判斷是否跳過顏色步驟（macaron/donut 沒有顏色選項）
  const skipColorStep1 = tempCapacity1 && colorOptions1.length === 0;
  const skipColorStep2 = tempCapacity2 && colorOptions2.length === 0;

  // ✅ 當選擇容量時，如果只有一個顏色選項（虛擬顏色），自動選擇它
  useEffect(() => {
    if (tempCapacity1 && !tempColor1 && colorOptions1.length === 1) {
      // 自動選擇唯一的顏色選項（虛擬或真實）
      setTempColor1(colorOptions1[0]);
    } else if (skipColorStep1 && tempCapacity1 && !tempColor1) {
      // fallback：如果沒有顏色選項，創建虛擬顏色選項
      const capacityFromMetadata = getCapacityFromOption(tempCapacity1);
      const virtualColor: BoxColorOption = {
        option_id: tempCapacity1.option_id,
        option_name_zh: tempCapacity1.option_name_zh,
        price_modifier: tempCapacity1.price_modifier,
        box_capacity: capacityFromMetadata,
        item_image_url: tempCapacity1.item_image_url || "",
        sort_order: 0,
      };
      setTempColor1(virtualColor);
    }
  }, [skipColorStep1, tempCapacity1, tempColor1, colorOptions1]);

  useEffect(() => {
    if (tempCapacity2 && !tempColor2 && colorOptions2.length === 1) {
      setTempColor2(colorOptions2[0]);
    } else if (skipColorStep2 && tempCapacity2 && !tempColor2) {
      const capacityFromMetadata = getCapacityFromOption(tempCapacity2);
      const virtualColor: BoxColorOption = {
        option_id: tempCapacity2.option_id,
        option_name_zh: tempCapacity2.option_name_zh,
        price_modifier: tempCapacity2.price_modifier,
        box_capacity: capacityFromMetadata,
        item_image_url: tempCapacity2.item_image_url || "",
        sort_order: 0,
      };
      setTempColor2(virtualColor);
    }
  }, [skipColorStep2, tempCapacity2, tempColor2, colorOptions2]);

  // ✅ 從 capacity option 讀取容量（優先從 option.capacity，其次從名稱解析）
  function getCapacityFromOption(option: BoxCapacityOption): number {
    // 優先使用 option 中的 capacity 欄位（來自 metadata_product）
    if ((option as any).capacity) {
      return (option as any).capacity;
    }
    // fallback: 從名稱解析
    return getCapacityFromName(option.option_name_zh);
  }

  // 從名稱中解析容量數字
  function getCapacityFromName(name: string): number {
    if (name.includes("單入") || name.includes("一入")) return 1;
    if (name.includes("二入") || name.includes("2入")) return 2;
    if (name.includes("四入") || name.includes("4入")) return 4;
    if (name.includes("六入") || name.includes("6入")) return 6;
    return 1;
  }

  // 處理容量選擇
  const handleCapacity1Select = (option: BoxCapacityOption) => {
    setTempCapacity1(option);
    setTempColor1(null); // 重置顏色選擇
    // ✅ 立即通知父組件容量選擇，用於早期渲染
    onCapacitySelect?.(option, 1);
  };

  const handleCapacity2Select = (option: BoxCapacityOption) => {
    setTempCapacity2(option);
    setTempColor2(null);
    onCapacitySelect?.(option, 2);
  };

  // 驗證並確認配置
  const handleValidate = () => {
    const qty1 = parseInt(tempQuantity1) || 0;
    const qty2 = showConfig2 ? parseInt(tempQuantity2) || 0 : 0;

    const capacity1 = tempColor1?.box_capacity || getCapacityFromName(tempCapacity1?.option_name_zh || "");
    const capacity2 = tempColor2?.box_capacity || getCapacityFromName(tempCapacity2?.option_name_zh || "");

    const totalCapacity = capacity1 * qty1 + capacity2 * qty2;

    if (totalCapacity !== dessertQuantity) {
      setErrorMessage("錯誤！您的購買的禮盒無法正確分裝您訂購的甜點數量");
      setShowErrorDialog(true);
    } else {
      setShowConfirmDialog(true);
    }
  };

  // 確認配置
  const handleConfirm = () => {
    if (tempCapacity1 && tempColor1 && tempQuantity1) {
      onConfig1Change({
        capacity: tempCapacity1,
        color: tempColor1,
        quantity: parseInt(tempQuantity1),
        totalCapacity: tempColor1.box_capacity * parseInt(tempQuantity1),
      });
    }

    if (showConfig2 && tempCapacity2 && tempColor2 && tempQuantity2) {
      onConfig2Change({
        capacity: tempCapacity2,
        color: tempColor2,
        quantity: parseInt(tempQuantity2),
        totalCapacity: tempColor2.box_capacity * parseInt(tempQuantity2),
      });
    } else {
      onConfig2Change(null);
    }

    setShowConfirmDialog(false);
  };

  return (
    <div className="space-y-6">
      {/* 配置一 */}
      <div className="space-y-4 p-4 border-2 border-primary/20 rounded-xl bg-card">
        <h4 className="font-semibold text-lg">規格一</h4>

        {/* 步驟 1: 選擇盒子容量（Grid 顯示照片） */}
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">1. 選擇盒子容量</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {capacityOptions.map((option) => {
              const isSelected = tempCapacity1?.option_id === option.option_id;
              return (
                <button
                  key={option.option_id}
                  onClick={() => handleCapacity1Select(option)}
                  className={`flex flex-col items-center p-3 rounded-xl border-2 transition-all ${
                    isSelected ? "border-primary bg-primary/10 scale-105" : "border-border hover:border-primary/50"
                  }`}
                >
                  {option.item_image_url && (
                    <img
                      src={option.item_image_url}
                      alt={option.option_name_zh}
                      className="w-16 h-16 object-contain mb-2"
                    />
                  )}
                  <span className="text-sm font-medium">{option.option_name_zh}</span>
                  {option.price_modifier !== 0 && (
                    <span className="text-xs text-muted-foreground">+NT$ {option.price_modifier}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 步驟 2: 選擇顏色（只有當有顏色選項時才顯示） */}
        {tempCapacity1 && colorOptions1.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">2. 選擇盒子顏色</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {colorOptions1.map((color) => (
                <button
                  key={color.option_id}
                  onClick={() => {
                    setTempColor1(color);
                    onColorSelect?.(color, 1); // ✅ 立即通知父組件顏色選擇
                  }}
                  className={`flex flex-col items-center p-3 rounded-xl border-2 transition-all ${
                    tempColor1?.option_id === color.option_id
                      ? "border-primary bg-primary/10 scale-105"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  {color.item_image_url && (
                    <img
                      src={color.item_image_url}
                      alt={color.option_name_zh}
                      className="w-16 h-16 object-contain mb-2"
                    />
                  )}
                  <span className="text-sm font-medium">{color.option_name_zh}</span>
                  {color.price_modifier !== 0 && (
                    <span className="text-xs text-muted-foreground">+NT$ {color.price_modifier}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 步驟 3: 輸入數量（顏色選擇後或跳過顏色步驟後顯示） */}
        {tempColor1 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {skipColorStep1 ? "2" : "3"}. 您選擇「{tempCapacity1?.option_name_zh}」
              {!skipColorStep1 && `的「${tempColor1.option_name_zh}」`}禮盒，請問您需要幾個禮盒呢？
            </p>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="1"
                value={tempQuantity1}
                onChange={(e) => setTempQuantity1(e.target.value)}
                placeholder="請輸入數量"
                className="max-w-xs"
              />
              <span className="text-sm">個</span>
            </div>
          </div>
        )}
      </div>

      {/* 是否繼續選擇配置二 */}
      {tempCapacity1 && tempColor1 && tempQuantity1 && !showConfig2 && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">需要第二種規格的盒子嗎？</p>
          <div className="flex gap-2">
            <Button onClick={() => setShowConfig2(true)} variant="outline">
              需要
            </Button>
            <Button onClick={handleValidate} variant="default">
              不需要
            </Button>
          </div>
        </div>
      )}

      {/* 配置二 */}
      {showConfig2 && (
        <div className="space-y-4 p-4 border-2 border-primary/20 rounded-xl bg-card">
          <h4 className="font-semibold text-lg">規格二</h4>

          {/* 步驟 1: 選擇盒子容量（Grid 顯示照片） */}
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">1. 選擇盒子容量</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {capacityOptions.map((option) => {
                const isSelected = tempCapacity2?.option_id === option.option_id;
                return (
                  <button
                    key={option.option_id}
                    onClick={() => handleCapacity2Select(option)}
                    className={`flex flex-col items-center p-3 rounded-xl border-2 transition-all ${
                      isSelected ? "border-primary bg-primary/10 scale-105" : "border-border hover:border-primary/50"
                    }`}
                  >
                    {option.item_image_url && (
                      <img
                        src={option.item_image_url}
                        alt={option.option_name_zh}
                        className="w-16 h-16 object-contain mb-2"
                      />
                    )}
                    <span className="text-sm font-medium">{option.option_name_zh}</span>
                    {option.price_modifier !== 0 && (
                      <span className="text-xs text-muted-foreground">+NT$ {option.price_modifier}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 步驟 2: 選擇顏色（只有當有顏色選項時才顯示） */}
          {tempCapacity2 && colorOptions2.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">2. 選擇盒子顏色</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {colorOptions2.map((color) => (
                  <button
                    key={color.option_id}
                    onClick={() => {
                      setTempColor2(color);
                      onColorSelect?.(color, 2); // ✅ 立即通知父組件顏色選擇
                    }}
                    className={`flex flex-col items-center p-3 rounded-xl border-2 transition-all ${
                      tempColor2?.option_id === color.option_id
                        ? "border-primary bg-primary/10 scale-105"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    {color.item_image_url && (
                      <img
                        src={color.item_image_url}
                        alt={color.option_name_zh}
                        className="w-16 h-16 object-contain mb-2"
                      />
                    )}
                    <span className="text-sm font-medium">{color.option_name_zh}</span>
                    {color.price_modifier !== 0 && (
                      <span className="text-xs text-muted-foreground">+NT$ {color.price_modifier}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 步驟 3: 輸入數量 */}
          {tempColor2 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {skipColorStep2 ? "2" : "3"}. 您選擇「{tempCapacity2?.option_name_zh}」
                {!skipColorStep2 && `的「${tempColor2.option_name_zh}」`}禮盒，請問您需要幾個禮盒呢？
              </p>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="1"
                  value={tempQuantity2}
                  onChange={(e) => setTempQuantity2(e.target.value)}
                  placeholder="請輸入數量"
                  className="max-w-xs"
                />
                <span className="text-sm">個</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 驗證按鈕 */}
      {tempCapacity1 && tempColor1 && tempQuantity1 && showConfig2 && tempCapacity2 && tempColor2 && tempQuantity2 && (
        <Button onClick={handleValidate} variant="default" className="w-full">
          驗證並確認配置
        </Button>
      )}

      {/* 錯誤彈窗 */}
      <AlertDialog open={showErrorDialog} onOpenChange={setShowErrorDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>❌ {errorMessage}</AlertDialogTitle>
            <AlertDialogDescription>請重新調整盒子配置，確保總容量與甜點訂購數量一致。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowErrorDialog(false)}>確定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 確認彈窗 */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認盒子配置</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>您選擇：</p>
              <p>
                1. {tempCapacity1?.option_name_zh}
                {!skipColorStep1 && `/${tempColor1?.option_name_zh}`}禮盒，共 {tempQuantity1} 盒
              </p>
              {showConfig2 && tempCapacity2 && tempColor2 && tempQuantity2 && (
                <p>
                  2. {tempCapacity2.option_name_zh}
                  {!skipColorStep2 && `/${tempColor2.option_name_zh}`}禮盒，共 {tempQuantity2} 盒
                </p>
              )}
              <p className="mt-4 font-semibold">我們將會以該數量進行分裝</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>確認</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
