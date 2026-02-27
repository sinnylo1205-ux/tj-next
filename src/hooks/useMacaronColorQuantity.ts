// ======================================================================
// useMacaronColorQuantity.ts — 馬卡龍顏色數量分配 Hook
// ======================================================================

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface MacaronColorOption {
  option_id: number;
  option_name_zh: string;
  hex: string;
  image_url: string;
  is_default?: boolean;
}

export type MacaronColorMode = "random" | "custom";
export type QuantityDistributionMode = "even" | "custom";

interface UseMacaronColorQuantityReturn {
  // 基本狀態
  colorMode: MacaronColorMode;
  setColorMode: (mode: MacaronColorMode) => void;
  
  // 顏色選項（從資料庫載入）
  colorOptions: MacaronColorOption[];
  isLoadingColors: boolean;
  
  // 數量相關
  customQuantity: number;
  setCustomQuantity: (qty: number) => void;
  quantityError: string | null;
  validateQuantity: (qty: number) => boolean;
  
  // 可選色數計算
  maxSelectableColors: number;
  
  // 顏色選擇（複選）
  selectedColorIds: Set<number>;
  toggleColorSelection: (optionId: number) => void;
  currentPreviewColor: MacaronColorOption | null; // 當前預覽的顏色（最後點擊的）
  
  // 數量分配
  distributionMode: QuantityDistributionMode;
  setDistributionMode: (mode: QuantityDistributionMode) => void;
  colorQuantities: Map<number, number>; // colorId -> quantity
  setColorQuantity: (colorId: number, qty: number) => void;
  distributionError: string | null;
  validateDistribution: () => boolean;
  
  // 10% 手續費
  customColorFee: number;
  
  // 步驟管理
  currentStep: number;
  setCurrentStep: (step: number) => void;
  goToNextStep: () => void;
  goToPreviousStep: () => void;
  
  // 預設圖片
  defaultColorOption: MacaronColorOption | null;
}

export function useMacaronColorQuantity(
  baseQuantity: number,
  baseUnitPrice: number
): UseMacaronColorQuantityReturn {
  // 基本狀態
  const [colorMode, setColorMode] = useState<MacaronColorMode>("random");
  const [colorOptions, setColorOptions] = useState<MacaronColorOption[]>([]);
  const [isLoadingColors, setIsLoadingColors] = useState(true);
  
  // 數量相關
  const [customQuantity, setCustomQuantityState] = useState<number>(100);
  const [quantityError, setQuantityError] = useState<string | null>(null);
  
  // 顏色選擇
  const [selectedColorIds, setSelectedColorIds] = useState<Set<number>>(new Set());
  const [currentPreviewColor, setCurrentPreviewColor] = useState<MacaronColorOption | null>(null);
  
  // 數量分配
  const [distributionMode, setDistributionMode] = useState<QuantityDistributionMode>("even");
  const [colorQuantities, setColorQuantities] = useState<Map<number, number>>(new Map());
  const [distributionError, setDistributionError] = useState<string | null>(null);
  
  // 步驟管理
  const [currentStep, setCurrentStep] = useState(1);
  
  // 載入馬卡龍顏色選項（parent_id = 13）
  useEffect(() => {
    const loadColorOptions = async () => {
      setIsLoadingColors(true);
      try {
        const { data, error } = await supabase
          .from("master_options")
          .select("option_id, option_name_zh, metadata_master, is_default, sort_order_master")
          .eq("parent_id", 13)
          .order("sort_order_master");
        
        if (error) throw error;
        
        const options: MacaronColorOption[] = (data || []).map((item: any) => ({
          option_id: item.option_id,
          option_name_zh: item.option_name_zh,
          hex: item.metadata_master?.hex || "#ffffff",
          image_url: toPublicUrl(item.metadata_master?.image_url),
          is_default: item.is_default,
        }));
        
        setColorOptions(options);
        
        // 設定預設顏色為預覽
        const defaultOption = options.find((opt) => opt.is_default) || options[0];
        if (defaultOption) {
          setCurrentPreviewColor(defaultOption);
        }
      } catch (err) {
        console.error("載入馬卡龍顏色失敗:", err);
      } finally {
        setIsLoadingColors(false);
      }
    };
    
    loadColorOptions();
  }, []);
  
  // URL 轉換工具
  function toPublicUrl(path?: string | null): string {
    if (!path) return "";
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    const cleanPath = path.replace(/^\/+/, "").replace(/^custom_assets?\//, "");
    return `https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/${cleanPath}`;
  }
  
  // 預設顏色選項
  const defaultColorOption = colorOptions.find((opt) => opt.is_default) || colorOptions[0] || null;
  
  // 計算可選色數（每100個可選1色，最多9色）
  const maxSelectableColors = Math.min(Math.floor(customQuantity / 100), 9);
  
  // 驗證數量（必須是100的倍數，最少100）
  const validateQuantity = useCallback((qty: number): boolean => {
    if (qty < 100) {
      setQuantityError("最低訂購量為 100 顆");
      return false;
    }
    if (qty % 100 !== 0) {
      setQuantityError("數量必須是 100 的倍數（例如：100、200、300...）");
      return false;
    }
    setQuantityError(null);
    return true;
  }, []);
  
  // 設定數量並驗證
  const setCustomQuantity = useCallback((qty: number) => {
    setCustomQuantityState(qty);
    validateQuantity(qty);
    
    // 清除超出範圍的顏色選擇
    const newMax = Math.min(Math.floor(qty / 100), 9);
    if (selectedColorIds.size > newMax) {
      const arr = Array.from(selectedColorIds).slice(0, newMax);
      setSelectedColorIds(new Set(arr));
    }
  }, [validateQuantity, selectedColorIds]);
  
  // 切換顏色選擇
  const toggleColorSelection = useCallback((optionId: number) => {
    const option = colorOptions.find((o) => o.option_id === optionId);
    
    setSelectedColorIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(optionId)) {
        newSet.delete(optionId);
      } else {
        // 檢查是否超出可選數量
        if (newSet.size >= maxSelectableColors) {
          return prev; // 不允許超出
        }
        newSet.add(optionId);
      }
      return newSet;
    });
    
    // 更新預覽顏色為當前點擊的
    if (option) {
      setCurrentPreviewColor(option);
    }
  }, [colorOptions, maxSelectableColors]);
  
  // 設定單個顏色的數量
  const setColorQuantity = useCallback((colorId: number, qty: number) => {
    setColorQuantities((prev) => {
      const newMap = new Map(prev);
      newMap.set(colorId, qty);
      return newMap;
    });
  }, []);
  
  // 驗證數量分配
  const validateDistribution = useCallback((): boolean => {
    if (distributionMode === "even") {
      setDistributionError(null);
      return true;
    }
    
    // 自定義模式：檢查總和是否等於訂購數量
    let total = 0;
    selectedColorIds.forEach((id) => {
      total += colorQuantities.get(id) || 0;
    });
    
    if (total !== customQuantity) {
      setDistributionError(`數量分配總和 (${total}) 必須等於訂購數量 (${customQuantity})`);
      return false;
    }
    
    setDistributionError(null);
    return true;
  }, [distributionMode, selectedColorIds, colorQuantities, customQuantity]);
  
  // 10% 手續費
  const customColorFee = colorMode === "custom" ? Math.round(baseUnitPrice * customQuantity * 0.1) : 0;
  
  // 步驟導航
  const goToNextStep = useCallback(() => {
    if (currentStep === 2 && !validateQuantity(customQuantity)) return;
    if (currentStep === 3 && selectedColorIds.size === 0) return;
    if (currentStep === 4 && !validateDistribution()) return;
    setCurrentStep((prev) => prev + 1);
  }, [currentStep, customQuantity, validateQuantity, selectedColorIds.size, validateDistribution]);
  
  const goToPreviousStep = useCallback(() => {
    setCurrentStep((prev) => Math.max(1, prev - 1));
  }, []);
  
  // 當分配模式改變時，重置分配
  useEffect(() => {
    if (distributionMode === "even" && selectedColorIds.size > 0) {
      const evenQty = Math.floor(customQuantity / selectedColorIds.size);
      const remainder = customQuantity % selectedColorIds.size;
      const newMap = new Map<number, number>();
      
      let index = 0;
      selectedColorIds.forEach((id) => {
        // 第一個顏色獲得餘數
        newMap.set(id, index === 0 ? evenQty + remainder : evenQty);
        index++;
      });
      
      setColorQuantities(newMap);
    }
  }, [distributionMode, selectedColorIds, customQuantity]);
  
  // ✅ 當 colorQuantities 變化時自動重新驗證（修復按鈕無法恢復可點擊的問題）
  useEffect(() => {
    if (distributionMode === "custom" && selectedColorIds.size > 0) {
      // 計算當前總和
      let total = 0;
      selectedColorIds.forEach((id) => {
        total += colorQuantities.get(id) || 0;
      });
      
      // 自動更新錯誤狀態
      if (total !== customQuantity) {
        setDistributionError(`數量分配總和 (${total}) 必須等於訂購數量 (${customQuantity})`);
      } else {
        setDistributionError(null);
      }
    }
  }, [colorQuantities, distributionMode, selectedColorIds, customQuantity]);
  
  return {
    colorMode,
    setColorMode,
    colorOptions,
    isLoadingColors,
    customQuantity,
    setCustomQuantity,
    quantityError,
    validateQuantity,
    maxSelectableColors,
    selectedColorIds,
    toggleColorSelection,
    currentPreviewColor,
    distributionMode,
    setDistributionMode,
    colorQuantities,
    setColorQuantity,
    distributionError,
    validateDistribution,
    customColorFee,
    currentStep,
    setCurrentStep,
    goToNextStep,
    goToPreviousStep,
    defaultColorOption,
  };
}
