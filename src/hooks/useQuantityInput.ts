// ======================================================================
// useQuantityInput.ts — 手動輸入數量的本地狀態管理 Hook
// 支援 onBlur 驗證、非數字過濾、最低訂購量自動修正
// ======================================================================

import { useState, useEffect, useCallback } from "react";

interface UseQuantityInputOptions {
  quantity: number;
  minQuantity: number;
  onQuantityChange: (newQuantity: number) => void;
}

export function useQuantityInput({
  quantity,
  minQuantity,
  onQuantityChange,
}: UseQuantityInputOptions) {
  // 本地輸入值（字串，支援用戶輸入中的狀態）
  const [localValue, setLocalValue] = useState<string>(String(quantity));

  // 同步外部 quantity 變化到本地值
  useEffect(() => {
    setLocalValue(String(quantity));
  }, [quantity]);

  // 處理輸入變化（僅過濾非數字，不觸發 onQuantityChange）
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      // 只允許數字，但允許空字串（用戶清空時）
      if (value === "" || /^\d+$/.test(value)) {
        setLocalValue(value);
      }
    },
    []
  );

  // 處理 onBlur（驗證並觸發 onQuantityChange）
  const handleInputBlur = useCallback(() => {
    const parsed = parseInt(localValue, 10);

    // 空值、非數字、0、負數 → 恢復為 minQuantity
    if (isNaN(parsed) || parsed <= 0) {
      setLocalValue(String(minQuantity));
      onQuantityChange(minQuantity);
      return;
    }

    // 低於最低訂購量 → 修正為 minQuantity
    if (parsed < minQuantity) {
      setLocalValue(String(minQuantity));
      onQuantityChange(minQuantity);
      return;
    }

    // 有效值 → 觸發 onQuantityChange
    setLocalValue(String(parsed));
    onQuantityChange(parsed);
  }, [localValue, minQuantity, onQuantityChange]);

  // 處理 Enter 鍵（等同 blur）
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.currentTarget.blur();
      }
    },
    []
  );

  return {
    localValue,
    handleInputChange,
    handleInputBlur,
    handleKeyDown,
  };
}
