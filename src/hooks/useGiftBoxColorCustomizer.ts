// ======================================================================
// useGiftBoxColorCustomizer.ts — 禮盒顏色選擇器（對應 7287/7288/7289）
// ======================================================================

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { calculatePrice, type PriceBreakdown, type PriceValidation, debounce } from "@/lib/priceApi";

// 禮盒顏色選項介面
export interface GiftBoxColorOption {
  option_id: number;
  option_name_zh: string;
  hex: string;
  item_image_url: string;
  price_modifier: number;
  sort_order?: number;
  is_default?: boolean;
}

// 禮盒產品與顏色 root ID 對應
const GIFTBOX_COLOR_ROOTS: Record<string, number> = {
  giftbox_big: 7287,
  giftbox_midium: 7288,  // 注意：product_id 中有 typo
  giftbox_small: 7289,
};

interface UseGiftBoxColorCustomizerReturn {
  // 顏色選項
  colorOptions: GiftBoxColorOption[];
  selectedColor: GiftBoxColorOption | null;
  handleColorSelect: (option: GiftBoxColorOption) => void;
  
  // 後端價格數據
  priceData: PriceBreakdown | null;
  priceValidation: PriceValidation | null;
  isPriceLoading: boolean;
  
  // 載入狀態
  isLoading: boolean;
  error: string | null;
  
  // 是否支援禮盒顏色選擇
  isSupported: boolean;
}

const toPublicUrl = (path?: string | null): string => {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  const cleanPath = path.replace(/^\/+/, "").replace(/^custom_assets?\//, "custom_asset/");
  return `https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/${cleanPath}`;
};

export function useGiftBoxColorCustomizer(productId: string): UseGiftBoxColorCustomizerReturn {
  // 顏色選項狀態
  const [colorOptions, setColorOptions] = useState<GiftBoxColorOption[]>([]);
  const [selectedColor, setSelectedColor] = useState<GiftBoxColorOption | null>(null);
  
  // 後端價格數據
  const [priceData, setPriceData] = useState<PriceBreakdown | null>(null);
  const [priceValidation, setPriceValidation] = useState<PriceValidation | null>(null);
  const [isPriceLoading, setIsPriceLoading] = useState(false);
  
  // 載入狀態
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // 檢查是否支援禮盒顏色選擇
  const colorRootId = GIFTBOX_COLOR_ROOTS[productId];
  const isSupported = !!colorRootId;

  // ==================== 載入禮盒顏色選項 ====================
  useEffect(() => {
    if (!isSupported) {
      setIsLoading(false);
      return;
    }

    const loadColorOptions = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // 1. 從 master_options 載入顏色選項（根據 parent_id）
        const { data: colorData, error: colorError } = await supabase
          .from("master_options")
          .select("option_id, option_name_zh, metadata_master, price_modifier, sort_order_master, is_default")
          .eq("parent_id", colorRootId)
          .order("price_modifier", { ascending: true })
          .order("sort_order_master", { ascending: true });

        if (colorError) throw colorError;

        // 2. 從 product_options 載入圖片 URL
        const optionIds = (colorData || []).map((opt) => opt.option_id);
        const { data: poData, error: poError } = await supabase
          .from("product_options")
          .select("option_id, item_image_url")
          .eq("product_id", productId)
          .in("option_id", optionIds);

        if (poError) throw poError;

        const imageMap = new Map(
          (poData || []).map((po) => [po.option_id, toPublicUrl(po.item_image_url)])
        );

        const options: GiftBoxColorOption[] = (colorData || [])
          .map((opt) => {
            const metadata = opt.metadata_master as { hex?: string; image_url?: string } | null;
            return {
              option_id: opt.option_id,
              option_name_zh: opt.option_name_zh,
              hex: metadata?.hex || "#ffffff",
              item_image_url: imageMap.get(opt.option_id) || toPublicUrl(metadata?.image_url) || "",
              price_modifier: opt.price_modifier || 0,
              sort_order: opt.sort_order_master ?? 9999,
              is_default: opt.is_default || false,
            };
          })
          .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999));

        setColorOptions(options);

        // 預設選擇 is_default = true 的選項，若無則選第一個
        const defaultOption = options.find((opt) => opt.is_default) || options[0];
        if (defaultOption) {
          setSelectedColor(defaultOption);
        }

        setIsLoading(false);
      } catch (err) {
        console.error("❌ 載入禮盒顏色失敗:", err);
        setError(err instanceof Error ? err.message : "載入失敗");
        setIsLoading(false);
      }
    };

    loadColorOptions();
  }, [productId, colorRootId, isSupported]);

  // ==================== 呼叫後端計算價格（debounced）====================
  const latestStateRef = useRef({
    productId,
    selectedColor,
    isLoading,
  });

  useEffect(() => {
    latestStateRef.current = {
      productId,
      selectedColor,
      isLoading,
    };
  }, [productId, selectedColor, isLoading]);

  const fetchPrice = useCallback(async () => {
    const { productId, selectedColor, isLoading } = latestStateRef.current;
    if (!productId || isLoading || !selectedColor) return;

    setIsPriceLoading(true);

    const response = await calculatePrice({
      product_id: productId,
      quantity: 1,
      selected_option_ids: [selectedColor.option_id],
    });

    if (response.success && response.data) {
      setPriceData(response.data.breakdown);
      setPriceValidation(response.data.validation);
    } else {
      console.error("❌ GiftBox color price calculation failed:", response.error);
    }

    setIsPriceLoading(false);
  }, []);

  const debouncedFetchPrice = useRef(debounce(fetchPrice, 300));

  useEffect(() => {
    if (!isLoading && selectedColor) {
      debouncedFetchPrice.current();
    }
  }, [selectedColor, isLoading]);

  // ==================== 顏色選擇處理 ====================
  const handleColorSelect = (option: GiftBoxColorOption) => {
    setSelectedColor(option);
  };

  return {
    colorOptions,
    selectedColor,
    handleColorSelect,
    priceData,
    priceValidation,
    isPriceLoading,
    isLoading,
    error,
    isSupported,
  };
}
