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
import { SafeImage } from "@/components/SafeImage";

function getCapacityFromName(name: string): number {
  if (name.includes("單入") || name.includes("一入")) return 1;
  if (name.includes("二入") || name.includes("2入")) return 2;
  if (name.includes("四入") || name.includes("4入")) return 4;
  if (name.includes("六入") || name.includes("6入")) return 6;
  return 1;
}

function getCapacityFromOption(option: BoxCapacityOption): number {
  if (option.capacity) return option.capacity;
  return getCapacityFromName(option.option_name_zh);
}

function makeVirtualColor(capacity: BoxCapacityOption): BoxColorOption {
  return {
    option_id: capacity.option_id * 10000,
    option_name_zh: capacity.option_name_zh,
    price_modifier: capacity.price_modifier || 0,
    box_capacity: getCapacityFromOption(capacity),
    item_image_url: capacity.item_image_url || "",
    sort_order: 0,
  };
}

/** 無顏色或多餘載入前：自動帶入唯一顏色／虛擬顏色；有多色則回 null 讓使用者選 */
function pickAutoColor(
  capacity: BoxCapacityOption,
  colorOptionsMap: Map<number, BoxColorOption[]>,
): BoxColorOption | null {
  const colors = colorOptionsMap.get(capacity.option_id) || [];
  if (colors.length === 1) return colors[0];
  if (colors.length === 0) return makeVirtualColor(capacity);
  return null;
}

function configsEqual(a: BoxConfig | null, b: BoxConfig | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.capacity.option_id === b.capacity.option_id &&
    a.color.option_id === b.color.option_id &&
    a.quantity === b.quantity &&
    a.totalCapacity === b.totalCapacity
  );
}

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

  // 無真實顏色（馬卡龍／甜甜圈等）時跳過顏色步驟
  const isVirtualColorOnly = (colors: BoxColorOption[], capacity: BoxCapacityOption | null) =>
    colors.length === 1 &&
    (colors[0].option_name_zh === "預設" ||
      (capacity != null && colors[0].option_id === capacity.option_id * 10000));
  const skipColorStep1 = Boolean(
    tempCapacity1 && (colorOptions1.length === 0 || isVirtualColorOnly(colorOptions1, tempCapacity1)),
  );
  const skipColorStep2 = Boolean(
    tempCapacity2 && (colorOptions2.length === 0 || isVirtualColorOnly(colorOptions2, tempCapacity2)),
  );

  // 容量選項載入後補上自動顏色，並通知預覽
  useEffect(() => {
    if (!tempCapacity1 || tempColor1) return;
    const auto = pickAutoColor(tempCapacity1, colorOptionsMap);
    if (!auto) return;
    setTempColor1(auto);
    onColorSelect?.(auto, 1);
  }, [tempCapacity1, tempColor1, colorOptionsMap, onColorSelect]);

  useEffect(() => {
    if (!tempCapacity2 || tempColor2) return;
    const auto = pickAutoColor(tempCapacity2, colorOptionsMap);
    if (!auto) return;
    setTempColor2(auto);
    onColorSelect?.(auto, 2);
  }, [tempCapacity2, tempColor2, colorOptionsMap, onColorSelect]);

  const applyColor = (color: BoxColorOption, configIndex: 1 | 2) => {
    if (configIndex === 1) setTempColor1(color);
    else setTempColor2(color);
    onColorSelect?.(color, configIndex);
  };

  const handleCapacity1Select = (option: BoxCapacityOption) => {
    setTempCapacity1(option);
    onCapacitySelect?.(option, 1);
    const auto = pickAutoColor(option, colorOptionsMap);
    setTempColor1(auto);
    if (auto) onColorSelect?.(auto, 1);
  };

  const handleCapacity2Select = (option: BoxCapacityOption) => {
    setTempCapacity2(option);
    onCapacitySelect?.(option, 2);
    const auto = pickAutoColor(option, colorOptionsMap);
    setTempColor2(auto);
    if (auto) onColorSelect?.(auto, 2);
  };

  const handleCancelConfig2 = () => {
    setShowConfig2(false);
    setTempCapacity2(null);
    setTempColor2(null);
    setTempQuantity2("");
  };

  const qty1 = parseInt(tempQuantity1, 10) || 0;
  const qty2 = showConfig2 ? parseInt(tempQuantity2, 10) || 0 : 0;
  const capacity1 = tempColor1?.box_capacity || (tempCapacity1 ? getCapacityFromOption(tempCapacity1) : 0);
  const capacity2 =
    showConfig2 && tempColor2
      ? tempColor2.box_capacity || (tempCapacity2 ? getCapacityFromOption(tempCapacity2) : 0)
      : 0;
  const spec1Filled = Boolean(tempCapacity1 && tempColor1 && qty1 > 0);
  const spec2Filled = Boolean(showConfig2 && tempCapacity2 && tempColor2 && qty2 > 0);
  const packedTotal = capacity1 * qty1 + (showConfig2 ? capacity2 * qty2 : 0);
  const remaining = dessertQuantity - packedTotal;
  const isComplete = spec1Filled && (!showConfig2 || spec2Filled) && packedTotal === dessertQuantity;

  // 規格填完且總容量吻合時自動寫入，不必再點「不需要」
  useEffect(() => {
    if (!spec1Filled) {
      if (boxConfig1) onConfig1Change(null);
      if (boxConfig2) onConfig2Change(null);
      return;
    }

    if (showConfig2 && !spec2Filled) {
      if (boxConfig1) onConfig1Change(null);
      if (boxConfig2) onConfig2Change(null);
      return;
    }

    if (packedTotal !== dessertQuantity) {
      if (boxConfig1) onConfig1Change(null);
      if (boxConfig2) onConfig2Change(null);
      return;
    }

    const next1: BoxConfig = {
      capacity: tempCapacity1!,
      color: tempColor1!,
      quantity: qty1,
      totalCapacity: capacity1 * qty1,
    };
    const next2: BoxConfig | null =
      showConfig2 && tempCapacity2 && tempColor2 && qty2 > 0
        ? {
            capacity: tempCapacity2,
            color: tempColor2,
            quantity: qty2,
            totalCapacity: capacity2 * qty2,
          }
        : null;

    if (!configsEqual(boxConfig1, next1)) onConfig1Change(next1);
    if (!configsEqual(boxConfig2, next2)) onConfig2Change(next2);
  }, [
    spec1Filled,
    spec2Filled,
    showConfig2,
    packedTotal,
    dessertQuantity,
    tempCapacity1,
    tempColor1,
    qty1,
    capacity1,
    tempCapacity2,
    tempColor2,
    qty2,
    capacity2,
    boxConfig1,
    boxConfig2,
    onConfig1Change,
    onConfig2Change,
  ]);

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
        <h4 className="font-semibold text-lg flex items-center justify-between gap-2">
          <span>規格一</span>
          {isComplete && !showConfig2 && (
            <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
              已完成配置
            </span>
          )}
        </h4>

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
                    <SafeImage
                      src={option.item_image_url}
                      alt={option.option_name_zh}
                      width={64}
                      height={64}
                      className="mb-2 h-16 w-16 object-contain"
                      sizes="64px"
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
        {tempCapacity1 && colorOptions1.length > 0 && !skipColorStep1 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">2. 選擇盒子顏色</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {colorOptions1.map((color) => (
                <button
                  key={color.option_id}
                  onClick={() => applyColor(color, 1)}
                  className={`flex flex-col items-center p-3 rounded-xl border-2 transition-all ${
                    tempColor1?.option_id === color.option_id
                      ? "border-primary bg-primary/10 scale-105"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  {color.item_image_url && (
                    <SafeImage
                      src={color.item_image_url}
                      alt={color.option_name_zh}
                      width={64}
                      height={64}
                      className="mb-2 h-16 w-16 object-contain"
                      sizes="64px"
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

      {/* 規格一填完後：容量吻合則自動完成；不足／超出才問第二種規格 */}
      {spec1Filled && !showConfig2 && (
        <div className="space-y-2">
          {isComplete ? (
            <p className="text-sm text-emerald-700">
              已自動完成配置：{tempCapacity1?.option_name_zh} × {qty1} 盒，剛好分裝 {dessertQuantity}{" "}
              顆。可直接加入購物車。
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {remaining > 0
                  ? `目前可裝 ${packedTotal} 顆，還差 ${remaining} 顆。請調整盒數，或新增第二種規格。`
                  : `目前可裝 ${packedTotal} 顆，比訂購數量多 ${Math.abs(remaining)} 顆。請減少盒數。`}
              </p>
              {remaining > 0 && (
                <>
                  <p className="text-sm text-muted-foreground">需要第二種規格的盒子嗎？</p>
                  <div className="flex gap-2">
                    <Button onClick={() => setShowConfig2(true)} variant="outline">
                      需要
                    </Button>
                    <Button onClick={handleValidate} variant="default">
                      不需要，只用這一種
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* 配置二 */}
      {showConfig2 && (
        <div className="space-y-4 p-4 border-2 border-primary/20 rounded-xl bg-card">
        <h4 className="font-semibold text-lg flex items-center justify-between gap-2">
          <span>規格二</span>
          <Button type="button" variant="ghost" size="sm" onClick={handleCancelConfig2}>
            返回（不需要第二種規格）
          </Button>
        </h4>

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
                      <SafeImage
                        src={option.item_image_url}
                        alt={option.option_name_zh}
                        width={64}
                        height={64}
                        className="mb-2 h-16 w-16 object-contain"
                        sizes="64px"
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
          {tempCapacity2 && colorOptions2.length > 0 && !skipColorStep2 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">2. 選擇盒子顏色</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {colorOptions2.map((color) => (
                  <button
                    key={color.option_id}
                    onClick={() => applyColor(color, 2)}
                    className={`flex flex-col items-center p-3 rounded-xl border-2 transition-all ${
                      tempColor2?.option_id === color.option_id
                        ? "border-primary bg-primary/10 scale-105"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    {color.item_image_url && (
                      <SafeImage
                        src={color.item_image_url}
                        alt={color.option_name_zh}
                        width={64}
                        height={64}
                        className="mb-2 h-16 w-16 object-contain"
                        sizes="64px"
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

      {/* 驗證按鈕：規格二填完但尚未吻合時才需要手動驗證 */}
      {spec2Filled && !isComplete && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {remaining > 0
              ? `目前可裝 ${packedTotal} 顆，還差 ${remaining} 顆。`
              : `目前可裝 ${packedTotal} 顆，比訂購數量多 ${Math.abs(remaining)} 顆。`}
          </p>
          <Button onClick={handleValidate} variant="default" className="w-full">
            驗證並確認配置
          </Button>
        </div>
      )}
      {showConfig2 && isComplete && (
        <p className="text-sm text-emerald-700">
          已自動完成配置，兩種規格合計剛好分裝 {dessertQuantity} 顆。可直接加入購物車。
        </p>
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
