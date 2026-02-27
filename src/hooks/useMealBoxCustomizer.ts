// ======================================================================
// useMealBoxCustomizer.ts — 餐盒客製化狀態管理 Hook（價格由後端計算）
// ======================================================================

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { calculatePrice, type PriceBreakdown, type PriceValidation, debounce } from "@/lib/priceApi";

export interface DessertOption {
  option_id: number;
  option_name_zh: string;
  item_image_url: string | null;
  price_modifier: number;
  category: "salt" | "sweet"; // 從 metadata_product 解析
}

export interface SelectedItem {
  option_id: number;
  name: string;
  image_url: string | null;
}

interface UseMealBoxCustomizerProps {
  productId: string; // box_3 or box_6
}

interface ProductNoticeData {
  price_min: number | null;
  special_requiered: string | null;
  min_order_qty: number | null;
}

export function useMealBoxCustomizer({ productId }: UseMealBoxCustomizerProps) {
  const [slots, setSlots] = useState<string[]>([]);
  const [dessertOptions, setDessertOptions] = useState<DessertOption[]>([]);
  const [selectedItems, setSelectedItems] = useState<Record<string, SelectedItem>>({});
  const [basePrice, setBasePrice] = useState(0);
  const [minOrderQty, setMinOrderQty] = useState(1);
  const [quantity, setQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 後端價格數據
  const [priceData, setPriceData] = useState<PriceBreakdown | null>(null);
  const [priceValidation, setPriceValidation] = useState<PriceValidation | null>(null);
  const [isPriceLoading, setIsPriceLoading] = useState(false);

  // 載入資料
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // 1. 載入 slots 配置和基礎價格（從 product_notice）
        const { data: noticeData, error: noticeError } = await supabase
          .from("product_notice")
          .select("price_min, special_requiered, min_order_qty")
          .eq("product_id", productId)
          .maybeSingle();

        if (noticeError) throw noticeError;

        if (noticeData) {
          const notice = noticeData as ProductNoticeData;
          setBasePrice(notice.price_min || 0);
          const minQty = notice.min_order_qty || 1;
          setMinOrderQty(minQty);
          setQuantity(minQty);

          // 解析 slots 陣列
          if (notice.special_requiered) {
            try {
              const parsed = JSON.parse(notice.special_requiered);
              if (parsed.slots && Array.isArray(parsed.slots)) {
                setSlots(parsed.slots);
              }
            } catch (e) {
              console.error("Failed to parse special_requiered:", e);
              // 設定預設 slots
              setSlots(productId === "box_6" 
                ? ["A1", "B1", "C1", "A2", "B2", "C2"] 
                : ["A1", "B1", "C1"]);
            }
          }
        }

        // 2. 載入點心選項（從 product_options）
        const { data: optionsData, error: optionsError } = await supabase
          .from("product_options")
          .select("option_id, option_name_zh, item_image_url, price_modifier, metadata_product")
          .eq("product_id", productId)
          .neq("option_id", 25); // 排除根選項

        if (optionsError) throw optionsError;

        if (optionsData) {
          // 只保留有有效 category (salt/sweet) 的選項
          const parsedOptions: DessertOption[] = optionsData
            .filter((opt) => {
              if (!opt.metadata_product) return false;
              const meta = opt.metadata_product as { category?: string };
              return meta.category === "salt" || meta.category === "sweet";
            })
            .map((opt) => {
              const meta = opt.metadata_product as { category?: string };
              return {
                option_id: opt.option_id,
                option_name_zh: opt.option_name_zh || "",
                item_image_url: opt.item_image_url,
                price_modifier: opt.price_modifier || 0,
                category: meta.category as "salt" | "sweet",
              };
            });
          setDessertOptions(parsedOptions);
        }
      } catch (err) {
        console.error("Error loading meal box data:", err);
        setError("載入資料失敗");
      } finally {
        setIsLoading(false);
      }
    };

    if (productId) {
      loadData();
    }
  }, [productId]);

  // ==================== 呼叫後端計算價格（debounced）====================
  const fetchPrice = useCallback(async () => {
    if (!productId || isLoading) return;

    setIsPriceLoading(true);

    // 收集所有選中的 option_id
    const selectedOptionIds = Object.values(selectedItems).map((item) => item.option_id);

    const response = await calculatePrice({
      product_id: productId,
      quantity,
      selected_option_ids: selectedOptionIds,
    });

    if (response.success && response.data) {
      setPriceData(response.data.breakdown);
      setPriceValidation(response.data.validation);
    } else {
      console.error("❌ Price calculation failed:", response.error);
    }

    setIsPriceLoading(false);
  }, [productId, quantity, selectedItems, isLoading]);

  // Debounced price fetch
  const debouncedFetchPrice = useRef(debounce(fetchPrice, 300));

  // 當選項或數量變化時，呼叫後端計算價格
  useEffect(() => {
    if (!isLoading) {
      debouncedFetchPrice.current();
    }
  }, [quantity, selectedItems, isLoading]);

  // 選擇某個 slot 的商品
  const selectItemForSlot = useCallback((slotId: string, option: DessertOption) => {
    setSelectedItems((prev) => ({
      ...prev,
      [slotId]: {
        option_id: option.option_id,
        name: option.option_name_zh,
        image_url: option.item_image_url,
      },
    }));
  }, []);

  // 清除某個 slot
  const clearSlot = useCallback((slotId: string) => {
    setSelectedItems((prev) => {
      const newItems = { ...prev };
      delete newItems[slotId];
      return newItems;
    });
  }, []);

  // 增加數量
  const incrementQuantity = useCallback(() => {
    setQuantity((prev) => prev + 1);
  }, []);

  // 減少數量
  const decrementQuantity = useCallback(() => {
    setQuantity((prev) => Math.max(minOrderQty, prev - 1));
  }, [minOrderQty]);

  // 設定數量
  const setQuantityValue = useCallback((value: number) => {
    setQuantity(Math.max(minOrderQty, value));
  }, []);

  // 從後端數據取得總價
  const totalPrice = priceData?.grand_total ?? (basePrice * quantity);

  // 檢查是否所有 slot 都已選擇
  const allSlotsSelected = slots.length > 0 && slots.every((slot) => selectedItems[slot]);

  // 依分類過濾選項
  const getSaltOptions = useCallback(() => {
    return dessertOptions.filter((opt) => opt.category === "salt");
  }, [dessertOptions]);

  const getSweetOptions = useCallback(() => {
    return dessertOptions.filter((opt) => opt.category === "sweet");
  }, [dessertOptions]);

  // 組成購物車 customizations_json
  const buildCustomizationsJson = useCallback(() => {
    const slotsData: Record<string, { option_id: number; name: string }> = {};
    for (const [slotId, item] of Object.entries(selectedItems)) {
      slotsData[slotId] = {
        option_id: item.option_id,
        name: item.name,
      };
    }
    return {
      slots: slotsData,
    };
  }, [selectedItems]);

  return {
    slots,
    dessertOptions,
    minOrderQty,
    selectedItems,
    basePrice,
    quantity,
    totalPrice,
    isLoading,
    error,
    selectItemForSlot,
    clearSlot,
    incrementQuantity,
    decrementQuantity,
    setQuantityValue,
    allSlotsSelected,
    getSaltOptions,
    getSweetOptions,
    buildCustomizationsJson,
    // 後端價格數據
    priceData,
    priceValidation,
    isPriceLoading,
  };
}
