// ======================================================================
// useUniversalPackageCustomizer.ts — 包裝設計器核心邏輯（價格由後端計算）
// ======================================================================

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { calculatePrice, type PriceBreakdown, type PriceValidation, debounce } from "@/lib/priceApi";

export interface PackageStyleOption {
  option_id: number;
  option_name_zh: string;
  price_modifier: number | null; // ✅ 支援 null（不顯示價格）
  is_default?: boolean;
  item_image_url?: string;
}

export interface BoxCapacityOption {
  option_id: number;
  option_name_zh: string;
  price_modifier: number;
  sort_order?: number;
  item_image_url?: string;
  capacity?: number; // ✅ 新增：從 metadata_product.capacity 讀取
}

export interface BoxColorOption {
  option_id: number;
  option_name_zh: string;
  price_modifier: number;
  box_capacity: number; // 從 metadata_product.capacity 讀取
  item_image_url: string;
  sort_order?: number;
}

export interface BoxConfig {
  capacity: BoxCapacityOption;
  color: BoxColorOption;
  quantity: number;
  totalCapacity: number;
}

interface UseUniversalPackageCustomizerReturn {
  // 包裝款式選項
  packageStyleOptions: PackageStyleOption[];
  selectedPackageStyle: PackageStyleOption | null;
  handlePackageStyleSelect: (option: PackageStyleOption) => void;
  resetToDefault: () => void;
  
  // 盒裝配置
  boxCapacityOptions: BoxCapacityOption[];
  boxColorOptionsMap: Map<number, BoxColorOption[]>;
  boxConfig1: BoxConfig | null;
  boxConfig2: BoxConfig | null;
  setBoxConfig1: (config: BoxConfig | null) => void;
  setBoxConfig2: (config: BoxConfig | null) => void;
  
  // 裝飾品數量（根據包裝款式動態計算）
  decorationQuantity: number;
  
  // 價格計算（由後端計算）
  packageStylePrice: number;   // 非盒裝款式價格
  packagePrice: number;        // 盒裝總價
  decorationPrice: number;     // 裝飾品總價（單價 × 數量）
  totalPrice: number;          // packageStylePrice + packagePrice + decorationPrice
  
  // 裝飾品單價（外部傳入）
  decorationUnitPrice: number;
  setDecorationUnitPrice: (price: number) => void;
  
  // 包裝裝飾 option IDs（供外部傳遞給後端）
  packageDecorationIds: number[];
  setPackageDecorationIds: (ids: number[]) => void;
  
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

export function useUniversalPackageCustomizer(
  productId: string,
  dessertQuantity: number
): UseUniversalPackageCustomizerReturn {
  // 包裝款式選項
  const [packageStyleOptions, setPackageStyleOptions] = useState<PackageStyleOption[]>([]);
  const [selectedPackageStyle, setSelectedPackageStyle] = useState<PackageStyleOption | null>(null);
  
  // 盒裝配置選項
  const [boxCapacityOptions, setBoxCapacityOptions] = useState<BoxCapacityOption[]>([]);
  const [boxColorOptionsMap, setBoxColorOptionsMap] = useState<Map<number, BoxColorOption[]>>(new Map());
  const [boxConfig1, setBoxConfig1] = useState<BoxConfig | null>(null);
  const [boxConfig2, setBoxConfig2] = useState<BoxConfig | null>(null);
  
  // 裝飾品單價（由外部傳入）
  const [decorationUnitPrice, setDecorationUnitPrice] = useState(0);
  
  // 包裝裝飾 option IDs（由外部傳入）
  const [packageDecorationIds, setPackageDecorationIds] = useState<number[]>([]);
  
  // 後端價格數據
  const [priceData, setPriceData] = useState<PriceBreakdown | null>(null);
  const [priceValidation, setPriceValidation] = useState<PriceValidation | null>(null);
  const [isPriceLoading, setIsPriceLoading] = useState(false);
  
  // 載入狀態
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ==================== 載入包裝款式選項（7027 的子選項）====================
  useEffect(() => {
    const loadPackageStyles = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // 1. 從 product_options 載入該產品的包裝款式選項
        const { data: poData, error: poError } = await supabase
          .from("product_options")
          .select("option_id, item_image_url, is_hide")
          .eq("product_id", productId)
          .neq("is_hide", true); // ✅ 過濾 is_hide=true

        if (poError) throw poError;

        const allowedOptionIds = (poData || []).map((po) => po.option_id);
        const imageMap = new Map(
          (poData || []).map((po) => [po.option_id, toPublicUrl(po.item_image_url)])
        );

        // 2. 從 master_options 載入 7027 的子選項（水晶杯、盒裝等）
        const { data: styleData, error: styleError } = await supabase
          .from("master_options")
          .select("option_id, option_name_zh, price_modifier, is_default, is_hide")
          .eq("parent_id", 7027)
          .in("option_id", allowedOptionIds)
          .neq("is_hide", true) // ✅ 過濾 is_hide=true
          .order("sort_order_master", { ascending: true });

        if (styleError) throw styleError;

        const options = (styleData || []).map((opt) => ({
          option_id: opt.option_id,
          option_name_zh: opt.option_name_zh,
          price_modifier: opt.price_modifier, // ✅ 保留 null（不轉換為 0）
          is_default: opt.is_default || false,
          item_image_url: imageMap.get(opt.option_id) || "",
        }));

        setPackageStyleOptions(options);

        // 預設選擇 is_default = true 的選項
        const defaultOption = options.find((opt) => opt.is_default) || options[0];
        if (defaultOption) {
          setSelectedPackageStyle(defaultOption);
        }

        setIsLoading(false);
      } catch (err) {
        console.error("❌ 載入包裝款式失敗:", err);
        setError(err instanceof Error ? err.message : "載入失敗");
        setIsLoading(false);
      }
    };

    loadPackageStyles();
  }, [productId]);

  // ==================== 載入盒裝配置選項（7030 的子層級）====================
  useEffect(() => {
    const loadBoxOptions = async () => {
      try {
        // 1. 先從 product_options 載入該產品允許的容量選項（包含 metadata_product 和 price_modifier）
        const { data: poCapacityData, error: poCapacityError } = await supabase
          .from("product_options")
          .select("option_id, item_image_url, metadata_product, is_hide, price_modifier")
          .eq("product_id", productId)
          .neq("is_hide", true); // ✅ 過濾 is_hide=true

        if (poCapacityError) throw poCapacityError;

        const allowedCapacityIds = (poCapacityData || []).map((po) => po.option_id);
        const capacityImageMap = new Map(
          (poCapacityData || []).map((po) => [po.option_id, toPublicUrl(po.item_image_url)])
        );
        // ✅ 儲存 metadata_product 中的 capacity
        const capacityMetadataMap = new Map(
          (poCapacityData || []).map((po) => [po.option_id, (po.metadata_product as { capacity?: number })?.capacity])
        );
        // ✅ 新增：儲存 product_options 中的 price_modifier（優先使用）
        const poPriceModifierMap = new Map(
          (poCapacityData || []).map((po) => [po.option_id, po.price_modifier])
        );

        // 2. 載入容量選項（7037-7041：單入、二入、四入、六入），並篩選該產品允許的選項
        const { data: capacityData, error: capacityError } = await supabase
          .from("master_options")
          .select("option_id, option_name_zh, price_modifier, sort_order_master, is_hide")
          .eq("parent_id", 7030)
          .in("option_id", allowedCapacityIds)
          .neq("is_hide", true) // ✅ 過濾 is_hide=true
          .order("sort_order_master", { ascending: true });

        if (capacityError) throw capacityError;

        const capacities = (capacityData || []).map((opt) => {
          // ✅ 優先使用 product_options 的 price_modifier，其次用 master_options
          const poPrice = poPriceModifierMap.get(opt.option_id);
          const finalPrice = poPrice !== null && poPrice !== undefined ? poPrice : (opt.price_modifier || 0);
          
          return {
            option_id: opt.option_id,
            option_name_zh: opt.option_name_zh,
            price_modifier: finalPrice,
            sort_order: opt.sort_order_master ?? 9999,
            item_image_url: capacityImageMap.get(opt.option_id) || "",
            capacity: capacityMetadataMap.get(opt.option_id) || undefined,
          };
        });

        setBoxCapacityOptions(capacities);

        // 3. 為每個容量載入顏色選項（7056-7067：粉色、藍色、牛皮、白色）
        const colorMap = new Map<number, BoxColorOption[]>();

        for (const capacity of capacities) {
          const { data: colorData, error: colorError } = await supabase
            .from("master_options")
            .select("option_id, option_name_zh, price_modifier, metadata_master, sort_order_master, is_hide")
            .eq("parent_id", capacity.option_id)
            .neq("is_hide", true) // ✅ 過濾 is_hide=true
            .order("sort_order_master", { ascending: true });

          if (colorError) throw colorError;

          // 從 product_options 載入圖片 URL（並篩選該產品的選項）
          const optionIds = (colorData || []).map((opt) => opt.option_id);
          const { data: poData, error: poError } = await supabase
            .from("product_options")
            .select("option_id, item_image_url, metadata_product, is_hide")
            .eq("product_id", productId)
            .in("option_id", optionIds)
            .neq("is_hide", true); // ✅ 過濾 is_hide=true

          if (poError) throw poError;

          const imageUrlMap = new Map(
            (poData || []).map((po) => [po.option_id, toPublicUrl(po.item_image_url)])
          );

          const metadataMap = new Map(
            (poData || []).map((po) => [po.option_id, po.metadata_product])
          );

          const colors = (colorData || [])
            .filter((opt) => imageUrlMap.has(opt.option_id)) // 只保留該產品有的顏色選項
            .map((opt) => {
              const metadata = metadataMap.get(opt.option_id) as { capacity?: number } | null;
              return {
                option_id: opt.option_id,
                option_name_zh: opt.option_name_zh,
                price_modifier: opt.price_modifier || 0,
                box_capacity: metadata?.capacity || capacity.capacity || 1, // ✅ 優先從 metadata，其次從 capacity option
                item_image_url: imageUrlMap.get(opt.option_id) || "",
                sort_order: opt.sort_order_master ?? 9999,
              };
            });

          // ✅ 新增：如果沒有顏色選項但容量有圖片，創建虛擬顏色選項
          if (colors.length === 0 && capacity.item_image_url) {
            const virtualColor: BoxColorOption = {
              option_id: capacity.option_id * 10000, // 創建唯一 ID
              option_name_zh: "預設",
              price_modifier: 0,
              box_capacity: capacity.capacity || 1,
              item_image_url: capacity.item_image_url,
              sort_order: 0,
            };
            colorMap.set(capacity.option_id, [virtualColor]);
          } else {
            colorMap.set(capacity.option_id, colors);
          }
        }

        setBoxColorOptionsMap(colorMap);
      } catch (err) {
        console.error("❌ 載入盒裝選項失敗:", err);
      }
    };

    loadBoxOptions();
  }, [productId]);

  // ==================== 計算裝飾品數量（根據包裝款式動態調整）====================
  const decorationQuantity = (() => {
    // 如果選擇盒裝（7030），數量 = 盒子總數
    if (selectedPackageStyle?.option_id === 7030) {
      const totalBoxes =
        (boxConfig1?.quantity || 0) +
        (boxConfig2?.quantity || 0);
      return totalBoxes;
    }
    // 否則（預設包裝），數量 = 甜點訂購數量
    return dessertQuantity;
  })();

  // ==================== 呼叫後端計算價格（debounced）====================
  // ✅ 使用 useRef 保存最新的 state，避免 debounce 閉包問題
  const latestStateRef = useRef({
    productId,
    dessertQuantity,
    selectedPackageStyle,
    boxConfig1,
    boxConfig2,
    decorationQuantity,
    packageDecorationIds,
    isLoading,
  });

  // 每次 state 變化時更新 ref
  useEffect(() => {
    latestStateRef.current = {
      productId,
      dessertQuantity,
      selectedPackageStyle,
      boxConfig1,
      boxConfig2,
      decorationQuantity,
      packageDecorationIds,
      isLoading,
    };
  }, [productId, dessertQuantity, selectedPackageStyle, boxConfig1, boxConfig2, decorationQuantity, packageDecorationIds, isLoading]);

  const fetchPrice = useCallback(async () => {
    const { productId, dessertQuantity, selectedPackageStyle, boxConfig1, boxConfig2, decorationQuantity, packageDecorationIds, isLoading } = latestStateRef.current;
    if (!productId || isLoading) return;

    setIsPriceLoading(true);

    // 組合盒裝配置
    const boxConfigs = [];
    if (boxConfig1) {
      boxConfigs.push({
        capacity_option_id: boxConfig1.capacity.option_id,
        color_option_id: boxConfig1.color.option_id,
        quantity: boxConfig1.quantity,
      });
    }
    if (boxConfig2) {
      boxConfigs.push({
        capacity_option_id: boxConfig2.capacity.option_id,
        color_option_id: boxConfig2.color.option_id,
        quantity: boxConfig2.quantity,
      });
    }

    const response = await calculatePrice({
      product_id: productId,
      quantity: dessertQuantity,
      selected_option_ids: [],
      package_style_id: selectedPackageStyle?.option_id,
      box_configs: boxConfigs,
      package_decoration_ids: packageDecorationIds,
      package_decoration_quantity: decorationQuantity,
    });

    if (response.success && response.data) {
      setPriceData(response.data.breakdown);
      setPriceValidation(response.data.validation);
    } else {
      console.error("❌ Package price calculation failed:", response.error);
    }

    setIsPriceLoading(false);
  }, []);

  // Debounced price fetch - 只建立一次
  const debouncedFetchPrice = useRef(debounce(fetchPrice, 300));

  // 當選項變化時，呼叫後端計算價格
  useEffect(() => {
    if (!isLoading) {
      debouncedFetchPrice.current();
    }
  }, [selectedPackageStyle, boxConfig1, boxConfig2, dessertQuantity, packageDecorationIds, isLoading]);

  // ==================== 從後端數據取得價格 ====================
  const packageStylePrice = priceData?.package_style_total ?? 0;
  const packagePrice = priceData?.package_box_total ?? 0;
  const decorationPrice = priceData?.package_decoration_total ?? (decorationUnitPrice * decorationQuantity);
  const totalPrice = priceData?.package_total ?? (packageStylePrice + packagePrice + decorationPrice);

  // ==================== 包裝款式選擇處理 ====================
  const handlePackageStyleSelect = (option: PackageStyleOption) => {
    setSelectedPackageStyle(option);
    
    // 如果切換到預設包裝，清空盒裝配置
    if (option.option_id !== 7030) {
      setBoxConfig1(null);
      setBoxConfig2(null);
    }
  };

  // ==================== 清除（重設為預設）處理 ====================
  const resetToDefault = useCallback(() => {
    const defaultOption = packageStyleOptions.find((opt) => opt.is_default) || packageStyleOptions[0];
    if (defaultOption) {
      setSelectedPackageStyle(defaultOption);
    }
    setBoxConfig1(null);
    setBoxConfig2(null);
  }, [packageStyleOptions]);

  return {
    packageStyleOptions,
    selectedPackageStyle,
    handlePackageStyleSelect,
    resetToDefault,
    boxCapacityOptions,
    boxColorOptionsMap,
    boxConfig1,
    boxConfig2,
    setBoxConfig1,
    setBoxConfig2,
    decorationQuantity,
    packageStylePrice,
    packagePrice,
    decorationPrice,
    totalPrice,
    decorationUnitPrice,
    setDecorationUnitPrice,
    packageDecorationIds,
    setPackageDecorationIds,
    priceData,
    priceValidation,
    isPriceLoading,
    isLoading,
    error,
  };
}
