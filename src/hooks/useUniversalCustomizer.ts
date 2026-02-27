// ======================================================================
// useUniversalCustomizer.ts — 統一客製化主邏輯（價格由後端計算）
// ======================================================================

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getProductConfig, type ProductConfig } from "@/config/product-registry";
import { calculatePrice, type PriceBreakdown, type PriceValidation, type ConditionalFeeDetail, debounce } from "@/lib/priceApi";

export interface ColorOption {
  option_id: number;
  option_name_zh: string;
  hex: string;
  image_url: string;
  price_modifier: number;
  sort_order_master?: number;
  is_default?: boolean;
}

export interface FlavorOption {
  option_id: number;
  option_name_zh: string;
  hex: string;
  image_url: string;
  price_modifier: number;
  sort_order_master?: number;
  is_default?: boolean;
}

export interface SizeOption {
  option_id: number;
  option_name_zh: string;
  price_modifier: number;
  sort_order?: number;
  sort_order_master?: number;
  is_default?: boolean;
}

interface ProductInfo {
  price_min: number;
  min_order_qty: number;
}

interface UseUniversalCustomizerReturn {
  // 產品資訊
  productInfo: ProductInfo;
  
  // 顏色選項（支援多色盤，例如 cupcake_cream 有奶油 + 杯子）
  colorGroups: Map<number, ColorOption[]>;
  selectedColors: Map<number, ColorOption>;
  handleColorSelect: (rootId: number, option: ColorOption) => void;
  resetColorToDefault: (rootId: number) => void;
  
  // 口味選項
  flavorGroups: Map<number, FlavorOption[]>;
  selectedFlavors: Map<number, FlavorOption>;
  handleFlavorSelect: (rootId: number, option: FlavorOption) => void;
  resetFlavorToDefault: (rootId: number) => void;
  
  // 尺寸選項
  sizeGroups: Map<number, SizeOption[]>;
  selectedSizes: Map<number, SizeOption>;
  handleSizeSelect: (rootId: number, option: SizeOption) => void;
  resetSizeToDefault: (rootId: number) => void;
  
  // 數量與價格（由後端計算）
  quantity: number;
  setQuantity: (qty: number) => void;
  unitPrice: number;
  totalPrice: number;
  
  // 業務規則（條件式費用）
  conditionalFee: number;
  conditionalFeeDetails: ConditionalFeeDetail[];
  
  // 後端價格數據
  priceData: PriceBreakdown | null;
  priceValidation: PriceValidation | null;
  isPriceLoading: boolean;
  
  // 載入狀態
  isLoading: boolean;
  error: string | null;
}

const toPublicUrl = (path?: string | null): string => {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  const cleanPath = path.replace(/^\/+/, "").replace(/^custom_assets?\//, "custom_asset/");
  return `https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/${cleanPath}`;
};

export function useUniversalCustomizer(productId: string): UseUniversalCustomizerReturn {
  const [config, setConfig] = useState<ProductConfig | null>(null);
  const [productInfo, setProductInfo] = useState<ProductInfo>({ price_min: 0, min_order_qty: 1 });
  
  // 顏色選項（支援多色盤）
  const [colorGroups, setColorGroups] = useState<Map<number, ColorOption[]>>(new Map());
  const [selectedColors, setSelectedColors] = useState<Map<number, ColorOption>>(new Map());
  
  // 口味選項
  const [flavorGroups, setFlavorGroups] = useState<Map<number, FlavorOption[]>>(new Map());
  const [selectedFlavors, setSelectedFlavors] = useState<Map<number, FlavorOption>>(new Map());
  
  // 尺寸選項
  const [sizeGroups, setSizeGroups] = useState<Map<number, SizeOption[]>>(new Map());
  const [selectedSizes, setSelectedSizes] = useState<Map<number, SizeOption>>(new Map());
  
  // 數量
  const [quantity, setQuantity] = useState(1);
  
  // 後端價格數據
  const [priceData, setPriceData] = useState<PriceBreakdown | null>(null);
  const [priceValidation, setPriceValidation] = useState<PriceValidation | null>(null);
  const [isPriceLoading, setIsPriceLoading] = useState(false);
  
  // 載入狀態
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ==================== 載入產品配置 ====================
  useEffect(() => {
    const loadedConfig = getProductConfig(productId);
    if (!loadedConfig) {
      setError(`找不到產品配置: ${productId}`);
      setIsLoading(false);
      return;
    }
    setConfig(loadedConfig);
  }, [productId]);

  // ==================== 載入產品資料 ====================
  useEffect(() => {
    if (!config) return;

    const loadData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // 1. 載入產品價格與最小數量
        const { data: productData, error: productError } = await supabase
          .from("product_notice")
          .select("price_min, min_order_qty")
          .eq("product_id", productId)
          .single();

        if (productError) throw productError;

        if (productData) {
          const info = {
            price_min: productData.price_min || 0,
            min_order_qty: productData.min_order_qty || 1,
          };
          setProductInfo(info);
          setQuantity(info.min_order_qty);
        }

        // 2. 載入顏色選項（支援多色盤）
        if (config.colorRootIds && config.colorRootIds.length > 0) {
          const newColorGroups = new Map<number, ColorOption[]>();
          const newSelectedColors = new Map<number, ColorOption>();

          for (const rootId of config.colorRootIds) {
            const { data: colorData, error: colorError } = await supabase
              .from("master_options")
              .select("option_id, option_name_zh, metadata_master, price_modifier, sort_order_master, is_default")
              .eq("parent_id", rootId)
              .order("price_modifier", { ascending: true })
              .order("sort_order_master", { ascending: true });

            if (colorError) throw colorError;

            const options = (colorData || [])
              .map((opt) => {
                const metadata = opt.metadata_master as { hex: string; image_url: string } | null;
                const imageUrl = toPublicUrl(metadata?.image_url);
                return {
                  option_id: opt.option_id,
                  option_name_zh: opt.option_name_zh,
                  hex: metadata?.hex || "#ffffff",
                  image_url: imageUrl,
                  price_modifier: opt.price_modifier || 0,
                  sort_order_master: opt.sort_order_master ?? 9999,
                  is_default: opt.is_default || false,
                };
              })
              .sort((a, b) => a.sort_order_master - b.sort_order_master);

            newColorGroups.set(rootId, options);
            
            // 預設選擇 is_default = true 的選項，若無則選第一個
            const defaultOption = options.find((opt) => opt.is_default) || options[0];
            if (defaultOption) {
              newSelectedColors.set(rootId, defaultOption);
            }

            // 預載圖片
            if (config.preloadDefault) {
              options.forEach((opt) => {
                const img = new Image();
                img.src = opt.image_url;
              });
            }
          }

          setColorGroups(newColorGroups);
          setSelectedColors(newSelectedColors);
        }

        // 3. 載入口味選項
        if (config.flavorRootIds && config.flavorRootIds.length > 0) {
          const newFlavorGroups = new Map<number, FlavorOption[]>();
          const newSelectedFlavors = new Map<number, FlavorOption>();

          for (const rootId of config.flavorRootIds) {
            const { data: flavorData, error: flavorError } = await supabase
              .from("master_options")
              .select("option_id, option_name_zh, metadata_master, price_modifier, sort_order_master, is_default")
              .eq("parent_id", rootId)
              .order("price_modifier", { ascending: true })
              .order("sort_order_master", { ascending: true });

            if (flavorError) throw flavorError;

            const options = (flavorData || [])
              .map((opt) => {
                const metadata = opt.metadata_master as { hex?: string; image_url: string } | null;
                return {
                  option_id: opt.option_id,
                  option_name_zh: opt.option_name_zh,
                  hex: metadata?.hex || "#ffffff",
                  image_url: toPublicUrl(metadata?.image_url),
                  price_modifier: opt.price_modifier || 0,
                  sort_order_master: opt.sort_order_master ?? 9999,
                  is_default: opt.is_default || false,
                };
              })
              .sort((a, b) => a.sort_order_master - b.sort_order_master);

            newFlavorGroups.set(rootId, options);
            
            // 預設選擇 is_default = true 的選項，若無則選第一個
            const defaultOption = options.find((opt) => opt.is_default) || options[0];
            if (defaultOption) {
              newSelectedFlavors.set(rootId, defaultOption);
            }

            if (config.preloadDefault) {
              options.forEach((opt) => {
                const img = new Image();
                img.src = opt.image_url;
              });
            }
          }

          setFlavorGroups(newFlavorGroups);
          setSelectedFlavors(newSelectedFlavors);
        }

        // 4. 載入尺寸選項與形狀選項（合併處理避免 race condition）
        const newSizeGroups = new Map<number, SizeOption[]>();
        const newSelectedSizes = new Map<number, SizeOption>();

        // 4a. 載入尺寸選項
        if (config.sizeRootIds && config.sizeRootIds.length > 0) {
          for (const rootId of config.sizeRootIds) {
            const { data: sizeData, error: sizeError } = await supabase
              .from("master_options")
              .select("option_id, option_name_zh, price_modifier, sort_order_master, is_default")
              .eq("parent_id", rootId)
              .order("price_modifier", { ascending: true })
              .order("sort_order_master", { ascending: true });

            if (sizeError) throw sizeError;

            // 從 product_options 載入圖片 URL
            const optionIds = (sizeData || []).map((opt) => opt.option_id);
            const { data: poData, error: poError } = await supabase
              .from("product_options")
              .select("option_id, item_image_url")
              .eq("product_id", productId)
              .in("option_id", optionIds);

            if (poError) throw poError;

            const imageMap = new Map(
              (poData || []).map((po) => [po.option_id, toPublicUrl(po.item_image_url)])
            );

            const options = (sizeData || []).map((opt) => ({
              option_id: opt.option_id,
              option_name_zh: opt.option_name_zh,
              price_modifier: opt.price_modifier || 0,
              sort_order_master: opt.sort_order_master ?? 9999,
              is_default: opt.is_default || false,
              image_url: imageMap.get(opt.option_id) || "",
            }));

            newSizeGroups.set(rootId, options);
            
            // 預設選擇 is_default = true 的選項，若無則選第一個
            const defaultOption = options.find((opt) => opt.is_default) || options[0];
            if (defaultOption) {
              newSelectedSizes.set(rootId, defaultOption);
            }
          }
        }

        // 4b. 載入形狀選項（cookie 專用）
        if (config.shapeRootId) {
          const rootId = config.shapeRootId;
          const { data: shapeData, error: shapeError } = await supabase
            .from("master_options")
            .select("option_id, option_name_zh, price_modifier, sort_order_master, is_default")
            .eq("parent_id", rootId)
            .order("price_modifier", { ascending: true })
            .order("sort_order_master", { ascending: true });

          if (shapeError) throw shapeError;

          // 從 product_options 載入圖片 URL
          const optionIds = (shapeData || []).map((opt) => opt.option_id);
          const { data: poData, error: poError } = await supabase
            .from("product_options")
            .select("option_id, item_image_url")
            .eq("product_id", productId)
            .in("option_id", optionIds);

          if (poError) throw poError;

          const imageMap = new Map(
            (poData || []).map((po) => [po.option_id, toPublicUrl(po.item_image_url)])
          );

          const options = (shapeData || []).map((opt) => ({
            option_id: opt.option_id,
            option_name_zh: opt.option_name_zh,
            price_modifier: opt.price_modifier || 0,
            sort_order_master: opt.sort_order_master ?? 9999,
            is_default: opt.is_default || false,
            image_url: imageMap.get(opt.option_id) || "",
          }));

          // 將形狀選項也存入 sizeGroups
          newSizeGroups.set(rootId, options);

          // 預設選擇 is_default = true 的選項，若無則選第一個
          const defaultOption = options.find((opt) => opt.is_default) || options[0];
          if (defaultOption) {
            newSelectedSizes.set(rootId, defaultOption);
          }
        }

        // 統一設置 sizeGroups 和 selectedSizes
        setSizeGroups(newSizeGroups);
        setSelectedSizes(newSelectedSizes);

        setIsLoading(false);
      } catch (err) {
        console.error("❌ 載入資料失敗:", err);
        setError(err instanceof Error ? err.message : "載入失敗");
        setIsLoading(false);
      }
    };

    loadData();
  }, [config, productId]);

  // ==================== 呼叫後端計算價格（debounced）====================
  // ✅ 使用 useRef 保存最新的 state，避免 debounce 閉包問題
  const latestStateRef = useRef({
    productId,
    quantity,
    selectedColors,
    selectedFlavors,
    selectedSizes,
    isLoading,
  });

  // 每次 state 變化時更新 ref
  useEffect(() => {
    latestStateRef.current = {
      productId,
      quantity,
      selectedColors,
      selectedFlavors,
      selectedSizes,
      isLoading,
    };
  }, [productId, quantity, selectedColors, selectedFlavors, selectedSizes, isLoading]);

  const fetchPrice = useCallback(async () => {
    const { productId, quantity, selectedColors, selectedFlavors, selectedSizes, isLoading } = latestStateRef.current;
    if (!productId || isLoading) return;

    setIsPriceLoading(true);

    // 收集所有選中的 option_id
    const selectedOptionIds: number[] = [];
    selectedColors.forEach((color) => selectedOptionIds.push(color.option_id));
    selectedFlavors.forEach((flavor) => selectedOptionIds.push(flavor.option_id));
    selectedSizes.forEach((size) => selectedOptionIds.push(size.option_id));

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
  }, []);

  // Debounced price fetch - 只建立一次
  const debouncedFetchPrice = useRef(debounce(fetchPrice, 300));

  // 當選項或數量變化時，呼叫後端計算價格
  useEffect(() => {
    if (!isLoading) {
      debouncedFetchPrice.current();
    }
  }, [quantity, selectedColors, selectedFlavors, selectedSizes, isLoading]);

  // ==================== 從後端數據取得價格 ====================
  const unitPrice = priceData?.unit_price ?? productInfo.price_min;
  const totalPrice = priceData?.grand_total ?? (unitPrice * quantity);
  const conditionalFee = priceData?.conditional_fee ?? 0;
  const conditionalFeeDetails = priceData?.conditional_fee_details ?? [];

  // ==================== 選擇處理 ====================
  const handleColorSelect = (rootId: number, option: ColorOption) => {
    setSelectedColors((prev) => {
      const newMap = new Map(prev);
      newMap.set(rootId, option);
      return newMap;
    });
  };

  const handleFlavorSelect = (rootId: number, option: FlavorOption) => {
    setSelectedFlavors((prev) => {
      const newMap = new Map(prev);
      newMap.set(rootId, option);
      return newMap;
    });
  };

  const handleSizeSelect = (rootId: number, option: SizeOption) => {
    setSelectedSizes((prev) => {
      const newMap = new Map(prev);
      newMap.set(rootId, option);
      return newMap;
    });
  };

  // ==================== 清除（重設為預設）處理 ====================
  const resetColorToDefault = useCallback((rootId: number) => {
    const options = colorGroups.get(rootId) || [];
    const defaultOption = options.find((opt) => opt.is_default) || options[0];
    if (defaultOption) {
      setSelectedColors((prev) => {
        const newMap = new Map(prev);
        newMap.set(rootId, defaultOption);
        return newMap;
      });
    }
  }, [colorGroups]);

  const resetFlavorToDefault = useCallback((rootId: number) => {
    const options = flavorGroups.get(rootId) || [];
    const defaultOption = options.find((opt) => opt.is_default) || options[0];
    if (defaultOption) {
      setSelectedFlavors((prev) => {
        const newMap = new Map(prev);
        newMap.set(rootId, defaultOption);
        return newMap;
      });
    }
  }, [flavorGroups]);

  const resetSizeToDefault = useCallback((rootId: number) => {
    const options = sizeGroups.get(rootId) || [];
    const defaultOption = options.find((opt) => opt.is_default) || options[0];
    if (defaultOption) {
      setSelectedSizes((prev) => {
        const newMap = new Map(prev);
        newMap.set(rootId, defaultOption);
        return newMap;
      });
    }
  }, [sizeGroups]);

  return {
    productInfo,
    colorGroups,
    selectedColors,
    handleColorSelect,
    resetColorToDefault,
    flavorGroups,
    selectedFlavors,
    handleFlavorSelect,
    resetFlavorToDefault,
    sizeGroups,
    selectedSizes,
    handleSizeSelect,
    resetSizeToDefault,
    quantity,
    setQuantity,
    unitPrice,
    totalPrice,
    conditionalFee,
    conditionalFeeDetails,
    priceData,
    priceValidation,
    isPriceLoading,
    isLoading,
    error,
  };
}
