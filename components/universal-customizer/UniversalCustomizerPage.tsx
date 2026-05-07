import React, { Suspense, useEffect, useState, useRef, useCallback, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { getProductConfig, ProductConfig } from "@/config/product-registry";
import { supabase } from "@/lib/supabase";
import { prepareImageForUpload } from "@/lib/prepare-upload-image-client";
import { useUniversalCustomizer } from "@/hooks/useUniversalCustomizer";
import { useUniversalPackageCustomizer, type BoxColorOption } from "@/hooks/useUniversalPackageCustomizer";
import { useHierarchicalOptions } from "@/hooks/useHierarchicalOptions";
import { usePhotoUpload } from "@/hooks/usePhotoUpload";
import { useTextInputRenderer } from "@/hooks/useTextInputRenderer";
import { useAddToCart } from "@/components/universal-customizer/AddToCartButton";
import { useOptionNames } from "@/hooks/useOptionNames";
import { useGiftBoxColorCustomizer } from "@/hooks/useGiftBoxColorCustomizer";
import { PreviewCanvas } from "@/components/universal-customizer/PreviewCanvas";
import { ColorPickerGroup } from "@/components/universal-customizer/ColorPickerGroup";
import { FlavorPickerGroup } from "@/components/universal-customizer/FlavorPickerGroup";
import { SizeSelector } from "@/components/universal-customizer/SizeSelector";
import { DecorationTree } from "@/components/universal-customizer/DecorationTree";
import { QuantityPriceBox } from "@/components/universal-customizer/QuantityPriceBox";
import { MobilePriceButton } from "@/components/universal-customizer/MobilePriceButton";
import { PackageStyleSelector } from "@/components/universal-customizer/PackageStyleSelector";
import { BoxConfigSelection } from "@/components/universal-customizer/BoxConfigSelection";
import { GiftBoxColorSelector } from "@/components/universal-customizer/GiftBoxColorSelector";
import { TEXT_INPUT_CONFIGS } from "@/components/text-input/TextInputInterface";
import { useMacaronColorQuantity } from "@/hooks/useMacaronColorQuantity";
import { MacaronColorQuantitySelector } from "@/components/universal-customizer/MacaronColorQuantitySelector";
import { UserDesignUploader } from "@/components/universal-customizer/UserDesignUploader";
import { ClearSettingsButton } from "@/components/universal-customizer/ClearSettingsButton";
import { RightSlideHint } from "@/components/RightSlideHint";
import { SafeImage } from "@/components/SafeImage";
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

interface ProductData {
  id: string;
  name: string;
  category: string;
  price: number;
  min_order_qty: number;
  product_image_url?: string;
}

const DEFAULT_LOADING_IMAGE =
  "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/loading/default.webp";

/** CLS 改善：loading 頁面佔滿 main body，預覽區顯示產品 loading 圖（從 notice 進入時有視覺延續） */
function CustomizerSkeleton({ productType }: { productType?: string }) {
  const loadingImageUrl = productType
    ? `https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/loading/${productType}.webp`
    : DEFAULT_LOADING_IMAGE;
  const [loadingSrc, setLoadingSrc] = useState(loadingImageUrl);
  useEffect(() => {
    setLoadingSrc(loadingImageUrl);
  }, [loadingImageUrl]);

  return (
    <div className="min-h-[calc(100vh-120px)] flex flex-col bg-background">
      {/* 主內容區：文字在 loading 圖上方 */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12 min-h-[60vh]">
        <div className="flex items-center justify-center gap-3 text-ink-muted text-lg mb-6">
          <Loader2 className="animate-spin h-6 w-6" />
          <span>客製化模組載入中…</span>
        </div>
        <div className="relative mb-8 flex aspect-square w-full max-w-[800px] max-h-[70vh] items-center justify-center">
          <SafeImage
            src={loadingSrc}
            alt="客製化須知"
            fill
            className="object-contain rounded-xl"
            sizes="(max-width: 900px) 90vw, 800px"
            onError={() => setLoadingSrc(DEFAULT_LOADING_IMAGE)}
          />
        </div>
        <p className="mt-2 text-sm text-ink-muted/80">請稍候，正在載入編輯器</p>
      </div>
    </div>
  );
}

export interface UniversalCustomizerPageProps {
  productType: string;
  navigate: (url: string) => void;
}

/** Named export for Next app: pass productType and navigate from useParams/useRouter */
export function UniversalCustomizerPageWithProps({ productType, navigate }: UniversalCustomizerPageProps) {
  const [productData, setProductData] = useState<ProductData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [minLoadingDone, setMinLoadingDone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMinLoadingDone(true);
    }, 6000);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!productType) return;

    const loadProductData = async () => {
      try {
        const [productResult, noticeResult] = await Promise.all([
          supabase
            .from("products")
            .select("id, name, category, price, product_image_url")
            .eq("id", productType)
            .single(),
          supabase.from("product_notice").select("min_order_qty").eq("product_id", productType).single(),
        ]);

        if (productResult.data && noticeResult.data) {
          setProductData({
            id: productResult.data.id,
            name: productResult.data.name || "未命名產品",
            category: productResult.data.category || "未分類",
            price: productResult.data.price,
            min_order_qty: noticeResult.data.min_order_qty || 1,
            product_image_url: productResult.data.product_image_url || undefined,
          });
        }
      } catch (err) {
        console.error("載入產品資料失敗:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadProductData();
  }, [productType]);

  if (!productType) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Card className="p-8 text-center">
          <p className="text-xl text-muted-foreground">未指定產品類型</p>
        </Card>
      </div>
    );
  }

  if (isLoading || !minLoadingDone) {
    return <CustomizerSkeleton productType={productType} />;
  }

  const config = getProductConfig(productType);

  if (!config || !productData) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Card className="p-8 text-center">
          <p className="text-xl text-muted-foreground">找不到產品配置：{productType}</p>
        </Card>
      </div>
    );
  }

  if (!config.enabledNew) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Card className="p-8 text-center">
          <p className="text-xl text-muted-foreground">此產品尚未啟用新版編輯器</p>
        </Card>
      </div>
    );
  }

  return <UniversalCustomizerContent productType={productType} config={config} productData={productData} navigate={navigate} />;
}

function UniversalCustomizerContent({ productType, config, productData, navigate }: any) {
  const [isLoading, setIsLoading] = useState(true);

  // ✅ 打樣服務彈窗狀態
  const [showSampleDialog, setShowSampleDialog] = useState(true);
  const navigateFn = navigate;

  // 檢測是否為馬卡龍（特殊產品）
  const isMacaron = config.features.includes("color_quantity_allocation");
  // 檢測是否跳過包裝設計器（禮盒專用）
  const skipPackageCustomizer = config.features.includes("skip_package_customizer");

  // 載入所有 root option 的名稱（包含 shapeRootId）
  const allRootIds = [
    ...(config.colorRootIds || []),
    ...(config.flavorRootIds || []),
    ...(config.sizeRootIds || []),
    ...(config.shapeRootId ? [config.shapeRootId] : []),
  ];
  const { optionNames } = useOptionNames(allRootIds);

  const {
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
    unitPrice: baseUnitPrice,
    totalPrice: baseTotalPrice,
    conditionalFeeDetails,
    isLoading: isCustomizerLoading,
  } = useUniversalCustomizer(productType);

  // ✅ 馬卡龍專用 Hook
  const macaronState = useMacaronColorQuantity(quantity, baseUnitPrice);

  // ✅ 提前計算 effectiveQuantity（馬卡龍指定顏色時使用自訂數量）
  // 這需要在 packageState 之前計算，因為包裝模組需要使用這個數量
  const effectiveQuantity = isMacaron && macaronState.colorMode === "custom" ? macaronState.customQuantity : quantity;

  // ✅ 禮盒顏色選擇 Hook（禮盒專用）
  const giftBoxColorState = useGiftBoxColorCustomizer(productType);

  // ✅ 合併 decorationRootId 和 photoRootId
  const decorationRootIds = [config.decorationRootId, config.photoRootId].filter(
    (id) => id !== null && id !== undefined,
  ) as number[];
  const hierarchicalState = useHierarchicalOptions(productType, decorationRootIds);

  const photoUpload = usePhotoUpload(hierarchicalState.decorationOptions, hierarchicalState.selectedDecorations);

  // ✅ 追蹤當前選中的照片載體 option_id
  const [currentPhotoOptionId, setCurrentPhotoOptionId] = useState<number | null>(null);

  const { TextInputComponent, hasTextInput } = useTextInputRenderer(productType);
  const { addToCart } = useAddToCart();

  const [textInputData, setTextInputData] = useState<any>(null);
  const [showTextInput, setShowTextInput] = useState(false);

  // ✅ 用戶設計上傳連結狀態（luck/popcorn 專用）
  const [userDesignLink, setUserDesignLink] = useState<string | null>(null);

  // ✅ 7226/7229 客製化貼紙/插卡照片上傳狀態（獨立於 preview）
  // 儲存 { url, filePath } 以便刪除 storage 檔案
  const [packageDecorationUploads, setPackageDecorationUploads] = useState<
    Map<number, { url: string; filePath: string }>
  >(new Map());

  // ✅ 加入購物車 Loading 狀態
  const [isAddingToCart, setIsAddingToCart] = useState(false);

  // ✅ 價格計算中狀態（防止 race condition：在 debounce 期間阻擋加入購物車）
  const [isPriceStale, setIsPriceStale] = useState(false);

  // ✅ 上傳客製化貼紙/插卡照片
  const handlePackageDecorationPhotoUpload = async (optionId: number, file: File) => {
    try {
      const webpFile = file.type.startsWith("image/") ? await prepareImageForUpload(file) : file;
      const fileName = `package-deco-${optionId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.webp`;
      const { data, error } = await supabase.storage
        .from("customizer_uploads")
        .upload(fileName, webpFile, { contentType: "image/webp" });

      if (error) throw error;

      const { data: urlData } = supabase.storage.from("customizer_uploads").getPublicUrl(data.path);
      setPackageDecorationUploads((prev) => {
        const newMap = new Map(prev);
        newMap.set(optionId, { url: urlData.publicUrl, filePath: data.path });
        return newMap;
      });
    } catch (err) {
      console.error("上傳失敗:", err);
    }
  };

  // ✅ 清除客製化貼紙/插卡照片（含 storage 刪除）
  const handlePackageDecorationPhotoClear = async (optionId: number) => {
    const uploadInfo = packageDecorationUploads.get(optionId);
    if (uploadInfo?.filePath) {
      try {
        await supabase.storage.from("customizer_uploads").remove([uploadInfo.filePath]);
      } catch (err) {
        console.error("刪除 storage 檔案失敗:", err);
      }
    }
    setPackageDecorationUploads((prev) => {
      const newMap = new Map(prev);
      newMap.delete(optionId);
      return newMap;
    });
  };

  // ✅ 清除文字輸入
  const handleClearTextInput = () => {
    setTextInputData(null);
    setShowTextInput(false);
  };

  // ✅ 根據 productType 決定按鈕文字
  const getTextInputButtonLabel = (productId: string): string => {
    const labels: Record<string, string> = {
      cupcake_choco: "特別款-手寫文字杯子蛋糕",
      luck: "客製化籤文區",
    };
    return labels[productId] || "新增文字輸入";
  };

  // ✅ 截圖區 ref
  // - captureRefMobile：專門給「隱藏版」預覽，用來給 html-to-image 截圖，避免 sticky / layout 影響
  // - previewRefMobile：實際畫面上看到的手機版預覽
  // - captureRefDesktop：桌機版預覽（同時也當截圖目標）
  const captureRefMobile = useRef<HTMLDivElement | null>(null);
  const previewRefMobile = useRef<HTMLDivElement | null>(null);
  const captureRefDesktop = useRef<HTMLDivElement | null>(null);
  /** 僅包裝小圖：第二次 toBlob（獨立 customizations 欄位） */
  const captureRefPackage = useRef<HTMLDivElement | null>(null);

  // ✅ 智慧選擇截圖目標：必須截取「使用者實際看到的」預覽，比例才正確
  // - 桌面版 (lg+)：用 captureRefDesktop（畫面上看到的預覽）
  // - 手機版：非 iOS 用隱藏 300x300 容器；iOS 用畫面上 previewRefMobile（避免灰圖）
  // - 主圖 toBlob 已用 filter 排除 data-capture-exclude（提示字／滑桿／包裝小圖），與強制統一 previewRef 相比較不易改比例行為
  const getCaptureTarget = () => {
    const isIOS =
      typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);
    const isDesktopLayout =
      typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;

    if (isIOS) {
      if (
        previewRefMobile.current &&
        previewRefMobile.current.offsetWidth > 0 &&
        previewRefMobile.current.offsetHeight > 0
      ) {
        return previewRefMobile.current;
      }
      if (
        captureRefDesktop.current &&
        captureRefDesktop.current.offsetWidth > 0 &&
        captureRefDesktop.current.offsetHeight > 0
      ) {
        return captureRefDesktop.current;
      }
      if (
        captureRefMobile.current &&
        captureRefMobile.current.offsetWidth > 0 &&
        captureRefMobile.current.offsetHeight > 0
      ) {
        return captureRefMobile.current;
      }
      return null;
    }

    // 桌面版：必須用 captureRefDesktop，否則會截到 300x300 隱藏容器，裝飾品會比例放大
    if (isDesktopLayout) {
      if (
        captureRefDesktop.current &&
        captureRefDesktop.current.offsetWidth > 0 &&
        captureRefDesktop.current.offsetHeight > 0
      ) {
        return captureRefDesktop.current;
      }
    }

    // 手機版：用隱藏容器（避免 sticky/layout 偏移）
    if (
      captureRefMobile.current &&
      captureRefMobile.current.offsetWidth > 0 &&
      captureRefMobile.current.offsetHeight > 0
    ) {
      return captureRefMobile.current;
    }
    if (
      captureRefDesktop.current &&
      captureRefDesktop.current.offsetWidth > 0 &&
      captureRefDesktop.current.offsetHeight > 0
    ) {
      return captureRefDesktop.current;
    }
    return null;
  };

  // ====================================================================
  // 包裝設計器整合
  // ====================================================================
  const hasPackageSection = !skipPackageCustomizer && !!config.packageStyleRootId;

  const packageState = useUniversalPackageCustomizer(productType, effectiveQuantity);

  // ✅ Popcorn 專用：根據 size 選項篩選包裝款式（S/M/L 匹配）
  const filteredPackageStyleOptions = useMemo(() => {
    if (!config.businessRules?.packageFilterBySize) {
      return packageState.packageStyleOptions;
    }

    const sizeRootId = config.businessRules.packageFilterBySize.sizeRootId;
    const selectedSize = selectedSizes.get(sizeRootId);

    if (!selectedSize) {
      return packageState.packageStyleOptions;
    }

    // 從 size 名稱中提取 S/M/L
    const sizeName = selectedSize.option_name_zh || "";
    let sizeKey = "";
    if (sizeName.includes("Ｓ") || sizeName.includes("S")) sizeKey = "S";
    else if (sizeName.includes("Ｍ") || sizeName.includes("M")) sizeKey = "M";
    else if (sizeName.includes("Ｌ") || sizeName.includes("L")) sizeKey = "L";

    if (!sizeKey) {
      return packageState.packageStyleOptions;
    }

    // 篩選包裝款式（名稱中包含對應的 S/M/L）
    return packageState.packageStyleOptions.filter((opt) => {
      const optName = opt.option_name_zh || "";
      if (sizeKey === "S") return optName.includes("Ｓ") || optName.includes("S");
      if (sizeKey === "M") return optName.includes("Ｍ") || optName.includes("M");
      if (sizeKey === "L") return optName.includes("Ｌ") || optName.includes("L");
      return true;
    });
  }, [packageState.packageStyleOptions, selectedSizes, config.businessRules?.packageFilterBySize]);

  // 🍿 Popcorn：包裝款式必選，且「只有在尺寸變更時」才自動套用對應的「S/M/L 包裝隨機出貨」
  // 避免使用者手動點選其他包裝時被 effect 強制覆蓋回預設。
  const lastPopcornSizeKeyRef = useRef<string>("");
  useEffect(() => {
    if (productType !== "popcorn") return;
    if (!config.businessRules?.packageFilterBySize) return;
    if (!filteredPackageStyleOptions.length) return;

    const sizeRootId = config.businessRules.packageFilterBySize.sizeRootId;
    const selectedSize = selectedSizes.get(sizeRootId);
    if (!selectedSize) return;

    const sizeName = selectedSize.option_name_zh || "";
    let sizeKey = "";
    if (sizeName.includes("Ｓ") || sizeName.includes("S")) sizeKey = "S";
    else if (sizeName.includes("Ｍ") || sizeName.includes("M")) sizeKey = "M";
    else if (sizeName.includes("Ｌ") || sizeName.includes("L")) sizeKey = "L";
    if (!sizeKey) return;

    // 尺寸沒變就不干預（允許使用者自由切換包裝選項）
    if (lastPopcornSizeKeyRef.current === sizeKey) return;
    lastPopcornSizeKeyRef.current = sizeKey;

    const targetName = `${sizeKey}包裝隨機出貨`;
    const target =
      filteredPackageStyleOptions.find((o) => (o.option_name_zh || "").includes(targetName)) ||
      filteredPackageStyleOptions[0];

    if (!target) return;
    packageState.handlePackageStyleSelect(target);
  }, [productType, config.businessRules?.packageFilterBySize, filteredPackageStyleOptions, selectedSizes]);

  // 判斷是否為盒裝（option_id = 7030）
  const isBoxedStyle = packageState.selectedPackageStyle?.option_id === 7030;

  // ✅ 臨時盒子預覽狀態（顏色選擇但未確認時用於即時渲染）
  const [tempBoxColorPreview1, setTempBoxColorPreview1] = useState<BoxColorOption | null>(null);
  const [tempBoxColorPreview2, setTempBoxColorPreview2] = useState<BoxColorOption | null>(null);

  // ✅ 當配置確認後清除臨時預覽狀態
  useEffect(() => {
    if (packageState.boxConfig1) setTempBoxColorPreview1(null);
  }, [packageState.boxConfig1]);

  useEffect(() => {
    if (packageState.boxConfig2) setTempBoxColorPreview2(null);
  }, [packageState.boxConfig2]);

  // ✅ 盒裝預覽圖片（優先已確認配置，其次臨時預覽）
  const boxPreviewImageUrl =
    packageState.boxConfig1?.color.item_image_url || tempBoxColorPreview1?.item_image_url || null;

  // 計算包裝裝飾品數量（盒裝用盒數量，預設包裝用甜點數量）
  const packageDecorationQuantity = isBoxedStyle
    ? (packageState.boxConfig1?.quantity || 0) + (packageState.boxConfig2?.quantity || 0)
    : quantity;

  // ✅ 包裝裝飾品選項載入（使用 hierarchicalOptions）
  const packageDecorationRootIds = config.packageDecorationRootId ? [config.packageDecorationRootId] : [];
  const packageDecorationState = useHierarchicalOptions(productType, packageDecorationRootIds);

  // ✅ 判斷是否選擇了用戶設計上傳觸發選項
  // - popcorn: 7299 在 size root (5000) 底下
  // - luck: 7082 在 packageDecorationRootId (7028) 底下
  const hasSelectedUserDesignTrigger = useMemo(() => {
    if (!config.userDesignTriggerOptionId) return false;

    // popcorn: 從 size 判斷
    if (productType === "popcorn") {
      const sizeRootId = 5000;
      const selectedSize = selectedSizes.get(sizeRootId);
      return selectedSize?.option_id === config.userDesignTriggerOptionId;
    }

    // luck: 從 packageDecorationState 判斷
    if (productType === "luck") {
      return packageDecorationState.selectedDecorations.has(config.userDesignTriggerOptionId);
    }

    return false;
  }, [config.userDesignTriggerOptionId, productType, selectedSizes, packageDecorationState.selectedDecorations]);

  // ✅ 判斷是否隱藏包裝款式區（popcorn 選擇 7299 時隱藏）
  const shouldHidePackageStyleSection = hasSelectedUserDesignTrigger && productType === "popcorn";

  // ✅ 清除 luck 的 userDesignLink 當觸發條件失效時
  useEffect(() => {
    if (productType === "luck" && !hasSelectedUserDesignTrigger && userDesignLink) {
      setUserDesignLink(null);
    }
  }, [productType, hasSelectedUserDesignTrigger, userDesignLink]);

  // ✅ 爆米花選擇 7299 時清空所有包裝裝飾選項
  useEffect(() => {
    if (productType === "popcorn" && hasSelectedUserDesignTrigger) {
      // 清空包裝裝飾選項
      if (packageDecorationState.selectedDecorations.size > 0) {
        packageDecorationState.setSelectedDecorations(new Set());
        console.log("🍿 Popcorn 7299 selected: cleared all package decorations");
      }
    }
  }, [productType, hasSelectedUserDesignTrigger, packageDecorationState]);

  // ✅ 同步包裝裝飾品 IDs 到 packageState，讓後端計算價格
  useEffect(() => {
    const decorationIds = Array.from(packageDecorationState.selectedDecorations);
    packageState.setPackageDecorationIds(decorationIds);
  }, [packageDecorationState.selectedDecorations]);

  // ✅ 從後端取得包裝總價（包含款式價格 + 盒裝價格 + 裝飾品價格）
  const packageTotalPrice = packageState.totalPrice;

  // ====================================================================
  // 業務規則驗證邏輯
  // ====================================================================

  // 條件加價狀態
  const [conditionalFee, setConditionalFee] = useState(0);
  const [confirmedFeeOptionIds, setConfirmedFeeOptionIds] = useState<Set<number>>(new Set());

  // 驗證對話框狀態
  const [validationDialog, setValidationDialog] = useState<{
    open: boolean;
    type: "confirm" | "error";
    title: string;
    message: string;
    pendingOptionId?: number;
    onConfirm?: () => void;
  }>({ open: false, type: "error", title: "", message: "" });

  // 檢查選項是否為某群組的後代
  const isDescendantOf = useCallback(
    (optionId: number, ancestorId: number): boolean => {
      let currentId: number | null | undefined = hierarchicalState.parentMap[optionId];
      while (currentId !== undefined && currentId !== null) {
        if (currentId === ancestorId) return true;
        currentId = hierarchicalState.parentMap[currentId];
      }
      return false;
    },
    [hierarchicalState.parentMap],
  );

  // ✅ 條件加價檢查（數量 < threshold 且上傳照片）
  useEffect(() => {
    if (!config.businessRules?.conditionalFees) return;

    let totalFee = 0;
    config.businessRules.conditionalFees.forEach((rule: { triggerOptionId: number; threshold: number; fee: number }) => {
      // 檢查是否選中了觸發選項的後代
      const hasSelectedTrigger = Array.from(hierarchicalState.selectedDecorations).some(
        (id) => id === rule.triggerOptionId || isDescendantOf(id, rule.triggerOptionId),
      );

      // 檢查是否已上傳照片
      const hasUploadedPhoto = !!photoUpload.uploadedPhotoUrl;

      // 只有數量 < threshold 且已上傳照片且已確認，才加價
      if (
        hasSelectedTrigger &&
        hasUploadedPhoto &&
        quantity < rule.threshold &&
        confirmedFeeOptionIds.has(rule.triggerOptionId)
      ) {
        totalFee += rule.fee;
      }
    });

    setConditionalFee(totalFee);
  }, [
    hierarchicalState.selectedDecorations,
    photoUpload.uploadedPhotoUrl,
    quantity,
    confirmedFeeOptionIds,
    config.businessRules?.conditionalFees,
    isDescendantOf,
  ]);

  // ✅ 處理裝飾品選擇（帶業務規則驗證）
  const handleDecorationSelectWithValidation = useCallback(
    (option: any) => {
      const optionId = option.option_id;

      // 1. 檢查條件加價規則（cupcake 的 3007）- 點擊時立即顯示提示
      if (config.businessRules?.conditionalFees) {
        for (const rule of config.businessRules.conditionalFees) {
          // 檢查是否選中觸發選項或其後代
          if (optionId === rule.triggerOptionId || isDescendantOf(optionId, rule.triggerOptionId)) {
            // 只在數量低於閾值且尚未確認時顯示對話框
            if (quantity < rule.threshold && !confirmedFeeOptionIds.has(rule.triggerOptionId)) {
              // 立即顯示提示對話框
              setValidationDialog({
                open: true,
                type: "confirm",
                title: "加價提醒",
                message: `訂購數量未達 ${rule.threshold} 顆，${rule.confirmMessage.replace(/，.*/, "")}費用為 NT$ ${rule.fee.toLocaleString()} 元。上傳照片後將自動加價。`,
                pendingOptionId: rule.triggerOptionId,
                onConfirm: () => {
                  // 用戶確認後，記錄此選項已確認加價
                  setConfirmedFeeOptionIds((prev) => new Set(prev).add(rule.triggerOptionId));
                  // 執行選擇邏輯
                  hierarchicalState.handleDecorationSelect(option);
                  if (option.metadata_product?.requires_photo_upload) {
                    setCurrentPhotoOptionId(option.option_id);
                  }
                },
              });
              return; // 等待用戶確認
            }
          }
        }
      }

      // 2. 檢查 cookie optionDependencies（照片框選擇時檢查形狀匹配）
      if (config.businessRules?.optionDependencies) {
        // 檢查用戶選擇的是否是照片相關選項
        if (isDescendantOf(optionId, 3) || optionId === 3) {
          const bypassIds = config.businessRules.optionDependencyBypassOptionIds ?? [];
          const isBypassOption = bypassIds.some(
            (bypassId: number) => optionId === bypassId || isDescendantOf(optionId, bypassId),
          );

          // bypass 選項不受形狀限制（例如：無載體直噴）
          if (!isBypassOption) {
            // 獲取當前選擇的形狀
            const selectedShapeOption = selectedSizes.get(config.shapeRootId);
            const selectedShapeId = selectedShapeOption?.option_id;

            if (selectedShapeId) {
              // 找到對應的依賴規則
              const dependency = config.businessRules.optionDependencies.find(
                (dep: { sourceOptionId: number }) => dep.sourceOptionId === selectedShapeId,
              );

              if (dependency) {
                // 檢查選擇的照片框是否是 required 的那個或其後代
                const isValidPhotoFrame =
                  optionId === dependency.requiredOptionId || isDescendantOf(optionId, dependency.requiredOptionId);

                if (!isValidPhotoFrame) {
                  setValidationDialog({
                    open: true,
                    type: "error",
                    title: "提示",
                    message: dependency.errorMessage,
                  });
                  return; // 阻止選擇
                }
              }
            }
          }
        }
      }

      // 3. 檢查強制搭配規則（米紙 + 巧克力塗層）
      if (config.businessRules?.requiredCombinations) {
        for (const rule of config.businessRules.requiredCombinations) {
          // 檢查是否選中觸發群組的後代
          if (isDescendantOf(optionId, rule.triggerGroupId)) {
            const selectedColorOption = selectedColors.get(rule.colorRootId);
            const selectedColorId = selectedColorOption?.option_id;

            // 檢查是否已選擇顏色
            if (!selectedColorId) {
              setValidationDialog({
                open: true,
                type: "error",
                title: "提示",
                message: rule.errorMessage,
              });
              return; // 阻止選擇
            }

            // 檢查是否選擇了不允許的預設顏色
            if (rule.excludeDefaultColor && selectedColorId === rule.defaultColorOptionId) {
              setValidationDialog({
                open: true,
                type: "error",
                title: "提示",
                message: rule.errorMessage,
              });
              return; // 阻止選擇
            }
          }
        }
      }

      // 4. ✅ 檢查 directPrintRule（cotton 專用：3005 無載體直噴與素體綁定）
      if (config.businessRules?.directPrintRule) {
        const rule = config.businessRules.directPrintRule;

        // 檢查是否選擇了 3005 無載體直噴
        if (optionId === rule.directPrintOptionId || isDescendantOf(optionId, rule.directPrintOptionId)) {
          const selectedColorOption = selectedColors.get(rule.colorRootId);
          const selectedColorId = selectedColorOption?.option_id;

          // 必須選擇素體（2129）才能使用無載體直噴
          if (selectedColorId !== rule.requiredColorOptionId) {
            setValidationDialog({
              open: true,
              type: "error",
              title: "提示",
              message: rule.errorMessage,
            });
            return; // 阻止選擇
          }
        }

        // 如果已選擇無載體直噴 + 素體，檢查是否選擇了不相容選項
        const hasDirectPrint = Array.from(hierarchicalState.selectedDecorations).some(
          (id) => id === rule.directPrintOptionId || isDescendantOf(id, rule.directPrintOptionId),
        );
        const selectedColorOption = selectedColors.get(rule.colorRootId);
        const isPlainBody = selectedColorOption?.option_id === rule.requiredColorOptionId;

        if (hasDirectPrint && isPlainBody) {
          // 檢查要選擇的是否是不相容選項
          const isIncompatible = rule.incompatibleOptionIds.some(
            (incompId: number) => optionId === incompId || isDescendantOf(optionId, incompId),
          );
          if (isIncompatible) {
            setValidationDialog({
              open: true,
              type: "error",
              title: "提示",
              message: rule.incompatibleErrorMessage,
            });
            return; // 阻止選擇
          }
        }
      }

      // 5. 執行原有的選擇邏輯
      hierarchicalState.handleDecorationSelect(option);

      if (option.metadata_product?.requires_photo_upload) {
        setCurrentPhotoOptionId(option.option_id);
      }
    },
    [
      config.businessRules,
      config.shapeRootId,
      quantity,
      confirmedFeeOptionIds,
      isDescendantOf,
      selectedColors,
      selectedSizes,
      hierarchicalState,
    ],
  );

  // ✅ 監聽照片上傳，自動加價（已確認過的選項）
  useEffect(() => {
    if (!photoUpload.uploadedPhotoUrl || !config.businessRules?.conditionalFees) return;

    // 照片上傳後，如果用戶之前已確認加價，則自動計入 conditionalFee（在 useEffect 計算中處理）
    // 這裡不需要額外邏輯，因為 conditionalFee 的 useEffect 已經會檢查 confirmedFeeOptionIds
  }, [photoUpload.uploadedPhotoUrl, config.businessRules?.conditionalFees]);

  // ✅ Cookie 形狀匹配驗證
  const handleShapeSelectWithValidation = useCallback(
    (rootId: number, option: any) => {
      handleSizeSelect(rootId, option);

      // 清除之前的 photoFrame 選擇（如果形狀改變）
      if (config.businessRules?.optionDependencies) {
        // 當形狀改變時，如果有不匹配的 photoFrame 選擇，清除它
        const dependency = config.businessRules.optionDependencies.find(
          (dep: { sourceOptionId: number }) => dep.sourceOptionId === option.option_id,
        );

        if (dependency) {
          const bypassIds = config.businessRules.optionDependencyBypassOptionIds ?? [];
          const isBypass = (id: number) =>
            bypassIds.some((bypassId: number) => id === bypassId || isDescendantOf(id, bypassId));

          const invalidIds = Array.from(hierarchicalState.selectedDecorations).filter((id) => {
            const opt = hierarchicalState.optionsMap[id];
            if (!opt) return false;

            // 如果是照片相關選項且不是允許的選項（required 或 bypass）
            if (!isDescendantOf(id, 3)) return false;
            if (id === dependency.requiredOptionId) return false;
            if (isBypass(id)) return false;
            return true;
          });

          if (invalidIds.length > 0) {
            // ✅ 實際清除不匹配的選項（避免形狀切換後仍保留錯誤選擇）
            hierarchicalState.setSelectedDecorations((prev) => {
              const next = new Set(prev);
              invalidIds.forEach((id) => next.delete(id));
              return next;
            });

            setValidationDialog({
              open: true,
              type: "error",
              title: "提示",
              message: dependency.errorMessage,
            });
          }
        }
      }
    },
    [
      handleSizeSelect,
      config.businessRules?.optionDependencies,
      config.businessRules?.optionDependencyBypassOptionIds,
      hierarchicalState,
      isDescendantOf,
    ],
  );

  // ✅ 顏色選擇驗證（Cotton/Luck：檢查巧克力塗層取消限制 + 無載體直噴反向驗證）
  const handleColorSelectWithValidation = useCallback(
    (rootId: number, option: any) => {
      // ✅ 1. 檢查 directPrintRule 反向驗證（Cotton 專用）
      // 如果已選擇無載體直噴 (3005)，且要選擇的不是素體 (2129)，阻止選擇
      if (config.businessRules?.directPrintRule) {
        const rule = config.businessRules.directPrintRule;

        // 只檢查與此顏色 root 相關的規則
        if (rule.colorRootId === rootId) {
          // 檢查是否已選擇無載體直噴 (3005)
          const hasDirectPrint = Array.from(hierarchicalState.selectedDecorations).some(
            (id) => id === rule.directPrintOptionId || isDescendantOf(id, rule.directPrintOptionId),
          );

          // 如果已選擇無載體直噴，且要選擇的不是素體
          if (hasDirectPrint && option.option_id !== rule.requiredColorOptionId) {
            setValidationDialog({
              open: true,
              type: "error",
              title: "無法選擇此塗層",
              message: "您已選擇「無載體直噴」，此選項只能與「素體」搭配。如需更換塗層顏色，請先取消無載體直噴選項。",
            });
            return; // 阻止選擇
          }
        }
      }

      // ✅ 2. 檢查 requiredCombinations 規則（Cotton/Luck：巧克力塗層限制）
      if (config.businessRules?.requiredCombinations) {
        for (const rule of config.businessRules.requiredCombinations) {
          // 只檢查與此顏色 root 相關的規則
          if (rule.colorRootId !== rootId) continue;

          // 如果要選擇的是預設（排除）顏色
          if (rule.excludeDefaultColor && option.option_id === rule.defaultColorOptionId) {
            // 檢查是否有依賴此顏色的裝飾品被選中
            const hasDependentDecoration = Array.from(hierarchicalState.selectedDecorations).some(
              (id) => id === rule.triggerGroupId || isDescendantOf(id, rule.triggerGroupId),
            );

            if (hasDependentDecoration) {
              const triggerOption = hierarchicalState.optionsMap[rule.triggerGroupId];
              const triggerName = triggerOption?.option_name_zh || "裝飾品";

              setValidationDialog({
                open: true,
                type: "error",
                title: "無法取消巧克力塗層",
                message: `您已選擇「${triggerName}」相關選項，必須先取消該選項才能取消巧克力塗層。`,
              });
              return; // 阻止選擇
            }
          }
        }
      }

      // 通過驗證，執行原有的選擇邏輯
      handleColorSelect(rootId, option);
    },
    [
      config.businessRules?.requiredCombinations,
      config.businessRules?.directPrintRule,
      hierarchicalState,
      isDescendantOf,
      handleColorSelect,
    ],
  );

  // ✅ effectiveQuantity 已在前面提前計算（馬卡龍專用）

  // ✅ 文字輸入加價（cupcake_choco 專用，當有 textInputData 時 +40）
  const textInputPrice = textInputData && productType === "cupcake_choco" ? 40 : 0;

  // ✅ 收集裝飾品 IDs 發送給後端計算
  const decorationOptionIds = useMemo(() => {
    return Array.from(hierarchicalState.selectedDecorations);
  }, [hierarchicalState.selectedDecorations]);

  // ✅ 呼叫後端計算完整價格（包含裝飾品、文字加價等）
  const [backendUnitPrice, setBackendUnitPrice] = useState<number | null>(null);
  const [backendGrandTotal, setBackendGrandTotal] = useState<number | null>(null);
  // ✅ 新增：儲存後端分項費用（用於 UI 獨立顯示，避免雙重計算）
  const [backendDessertTotal, setBackendDessertTotal] = useState<number | null>(null);
  const [backendPackageTotal, setBackendPackageTotal] = useState<number | null>(null);
  const [backendConditionalFee, setBackendConditionalFee] = useState<number>(0);
  const [backendConditionalFeeDetails, setBackendConditionalFeeDetails] = useState<
    Array<{
      option_id: number;
      option_name_zh: string;
      fee: number;
    }>
  >([]);

  useEffect(() => {
    if (!productType) return;

    // ✅ 選項變更時立即標記價格為過時（在 debounce 前）
    setIsPriceStale(true);

    const fetchFullPrice = async () => {
      const { calculatePrice } = await import("@/lib/priceApi");

      const selectedOptionIds: number[] = [];
      selectedColors.forEach((color) => selectedOptionIds.push(color.option_id));
      selectedFlavors.forEach((flavor) => selectedOptionIds.push(flavor.option_id));
      selectedSizes.forEach((size) => selectedOptionIds.push(size.option_id));

      const response = await calculatePrice({
        product_id: productType,
        quantity: effectiveQuantity,
        selected_option_ids: selectedOptionIds,
        decoration_option_ids: decorationOptionIds,
        has_photo_uploaded: !!photoUpload.uploadedPhotoUrl,
        text_input_price: textInputPrice,
        package_style_id: packageState.selectedPackageStyle?.option_id,
        box_configs:
          packageState.boxConfig1 || packageState.boxConfig2
            ? [
                ...(packageState.boxConfig1
                  ? [
                      {
                        capacity_option_id: packageState.boxConfig1.capacity.option_id,
                        color_option_id: packageState.boxConfig1.color.option_id,
                        quantity: packageState.boxConfig1.quantity,
                      },
                    ]
                  : []),
                ...(packageState.boxConfig2
                  ? [
                      {
                        capacity_option_id: packageState.boxConfig2.capacity.option_id,
                        color_option_id: packageState.boxConfig2.color.option_id,
                        quantity: packageState.boxConfig2.quantity,
                      },
                    ]
                  : []),
              ]
            : undefined,
        package_decoration_ids: Array.from(packageDecorationState.selectedDecorations),
        package_decoration_quantity: packageDecorationQuantity,
        // ✅ 馬卡龍指定顏色模式
        macaron_custom_mode: isMacaron && macaronState.colorMode === "custom",
      });

      if (response.success && response.data) {
        setBackendUnitPrice(response.data.breakdown.unit_price ?? null);
        setBackendGrandTotal(response.data.breakdown.grand_total ?? null);
        // ✅ 新增：儲存分項費用
        setBackendDessertTotal(response.data.breakdown.dessert_total ?? null);
        setBackendPackageTotal(response.data.breakdown.package_total ?? null);
        setBackendConditionalFee(response.data.breakdown.conditional_fee ?? 0);
        setBackendConditionalFeeDetails(
          (response.data.breakdown.conditional_fee_details ?? []).map((d: { label?: string; amount?: number; option_name_zh?: string; fee?: number }, i: number) => ({
            option_id: i,
            option_name_zh: d.option_name_zh ?? d.label ?? "",
            fee: d.fee ?? d.amount ?? 0,
          }))
        );

        // ✅ 價格更新完成後標記為最新
        setIsPriceStale(false);
      }
    };

    // Debounce the call
    const timeoutId = setTimeout(fetchFullPrice, 300);
    return () => clearTimeout(timeoutId);
  }, [
    productType,
    effectiveQuantity,
    selectedColors,
    selectedFlavors,
    selectedSizes,
    decorationOptionIds,
    photoUpload.uploadedPhotoUrl,
    textInputPrice,
    packageState.selectedPackageStyle,
    packageState.boxConfig1,
    packageState.boxConfig2,
    packageDecorationState.selectedDecorations,
    packageDecorationQuantity,
    isMacaron,
    macaronState.colorMode,
  ]);

  // ✅ 最終單價 = 後端計算的單價（若尚未取得則用 baseUnitPrice）
  const unitPrice = backendUnitPrice ?? baseUnitPrice;

  // ✅ 小計 = 後端甜點總價（不含包裝、不含插卡費）
  const subtotal = backendDessertTotal ?? unitPrice * effectiveQuantity;

  // ✅ 包裝費用 = 後端計算值
  const packageFeeForDisplay = backendPackageTotal ?? packageTotalPrice;

  // ✅ 插卡費用 = 後端計算值
  const conditionalFeeForDisplay = backendConditionalFee;

  // ✅ 馬卡龍 10% 手續費
  const macaronCustomFee = isMacaron && macaronState.colorMode === "custom" ? Math.round(subtotal * 0.1) : 0;

  // ✅ 總計 = 後端 grand_total（不做前端加減法）
  const grandTotalForDisplay =
    backendGrandTotal ?? subtotal + packageFeeForDisplay + conditionalFeeForDisplay + macaronCustomFee;

  // ✅ 條件費用明細（用於 UI 顯示插卡費用細項），正規化為 { option_id, option_name_zh, fee }[] 以符合子元件型別
  const actualConditionalFeeDetails = useMemo(() => {
    const raw = backendConditionalFeeDetails.length > 0 ? backendConditionalFeeDetails : conditionalFeeDetails;
    return raw.map((d: { option_id?: number; option_name_zh?: string; fee?: number; label?: string; amount?: number }, i: number) => ({
      option_id: d.option_id ?? i,
      option_name_zh: d.option_name_zh ?? d.label ?? "",
      fee: d.fee ?? d.amount ?? 0,
    }));
  }, [backendConditionalFeeDetails, conditionalFeeDetails]);

  // ✅ 馬卡龍預覽圖片：根據模式決定顯示哪張圖片
  const macaronPreviewImage = isMacaron
    ? macaronState.colorMode === "custom" && macaronState.currentPreviewColor
      ? macaronState.currentPreviewColor.image_url
      : macaronState.defaultColorOption?.image_url || null
    : null;

  // ✅ 購物車驗證機制：驗證必要的照片上傳和設計連結
  const validateBeforeAddToCart = useCallback((): { valid: boolean; message: string } => {
    // 0. 檢查 luck 產品是否已設定籤文內容
    if (productType === "luck" && !textInputData) {
      return {
        valid: false,
        message:
          "請先完成籤文內容：點擊「客製化籤文區」按鈕，選擇「輸入純文字」、「自行設計、排版」或「店家隨機填寫正向小語」其中一項，並根據指示填寫內容，不可留空。",
      };
    }

    // 1. 檢查照片 root_id 選項（3007 等）是否上傳照片
    if (config.photoRootId) {
      const hasSelectedPhotoOption = Array.from(hierarchicalState.selectedDecorations).some(
        (id) => id === config.photoRootId || isDescendantOf(id, config.photoRootId!),
      );

      if (hasSelectedPhotoOption && !photoUpload.uploadedPhotoUrl) {
        return {
          valid: false,
          message: "您有選擇照片載體，卻沒有上傳照片，請補上傳照片或再點擊一次該選項來取消選取",
        };
      }
    }

    // 2. 檢查包裝裝飾：客製化貼紙（7226）或客製化插卡（7229）
    const customUploadOptionIds = [7226, 7229];
    for (const optionId of customUploadOptionIds) {
      if (packageDecorationState.selectedDecorations.has(optionId)) {
        if (!packageDecorationUploads.has(optionId)) {
          const optName = packageDecorationState.optionsMap[optionId]?.option_name_zh || `選項 ${optionId}`;
          return {
            valid: false,
            message: `您選擇了「${optName}」，但尚未上傳照片，請補上傳照片或取消該選項`,
          };
        }
      }
    }

    // 3. 檢查用戶設計連結（popcorn 7299 或 luck 7082）
    if (hasSelectedUserDesignTrigger && !userDesignLink) {
      const designType = productType === "popcorn" ? "包裝設計" : "刊頭設計";
      return {
        valid: false,
        message: `您選擇了自行設計${designType}，但尚未提供設計連結，您可以在方匡內寫上「下單後再將設計檔案私訊到Line」，或是提供連結or直接取消該選項，就是不可以留空。`,
      };
    }

    // 4. 檢查盒裝包裝是否完成配置（option_id = 7030 為盒裝）
    if (hasPackageSection && packageState.selectedPackageStyle?.option_id === 7030) {
      const hasBoxConfig1 = packageState.boxConfig1 !== null;
      const hasBoxConfig2 = packageState.boxConfig2 !== null;

      // 完全沒有配置盒裝
      if (!hasBoxConfig1 && !hasBoxConfig2) {
        return {
          valid: false,
          message: "您選擇了盒裝包裝，但尚未完成配置。請選擇盒子容量與顏色，或改選其他包裝方式。",
        };
      }

      // 檢查總容量是否等於甜點數量
      const totalCapacity =
        (packageState.boxConfig1?.totalCapacity || 0) + (packageState.boxConfig2?.totalCapacity || 0);

      if (totalCapacity !== effectiveQuantity) {
        return {
          valid: false,
          message: `盒裝總容量（${totalCapacity}）與甜點數量（${effectiveQuantity}）不符，請調整盒裝配置或改選其他包裝方式。`,
        };
      }
    }

    return { valid: true, message: "" };
  }, [
    productType,
    textInputData,
    config.photoRootId,
    hierarchicalState.selectedDecorations,
    photoUpload.uploadedPhotoUrl,
    packageDecorationState.selectedDecorations,
    packageDecorationUploads,
    hasSelectedUserDesignTrigger,
    userDesignLink,
    isDescendantOf,
    packageDecorationState.optionsMap,
    hasPackageSection,
    packageState.selectedPackageStyle,
    packageState.boxConfig1,
    packageState.boxConfig2,
    effectiveQuantity,
  ]);

  // ✅ 加入購物車確認視窗狀態
  const [showAddToCartConfirm, setShowAddToCartConfirm] = useState(false);

  // ✅ 點擊加入購物車按鈕：先執行驗證，通過後顯示確認視窗
  const handleAddToCartClick = () => {
    const validation = validateBeforeAddToCart();
    if (!validation.valid) {
      setValidationDialog({
        open: true,
        type: "error",
        title: "請補充資料",
        message: validation.message,
      });
      return;
    }
    setShowAddToCartConfirm(true);
  };

  // ✅ 確認後實際執行加入購物車
  const confirmAddToCart = async () => {
    setShowAddToCartConfirm(false);
    if (isAddingToCart) return;
    setIsAddingToCart(true);

    try {
      // ✅ 新增：提交前重新驗證價格（防止 race condition）
      const { calculatePrice } = await import("@/lib/priceApi");

      const selectedOptionIds: number[] = [];
      selectedColors.forEach((color) => selectedOptionIds.push(color.option_id));
      selectedFlavors.forEach((flavor) => selectedOptionIds.push(flavor.option_id));
      selectedSizes.forEach((size) => selectedOptionIds.push(size.option_id));

      const verifyResponse = await calculatePrice({
        product_id: productType,
        quantity: effectiveQuantity,
        selected_option_ids: selectedOptionIds,
        decoration_option_ids: decorationOptionIds,
        has_photo_uploaded: !!photoUpload.uploadedPhotoUrl,
        text_input_price: textInputPrice,
        package_style_id: packageState.selectedPackageStyle?.option_id,
        box_configs:
          packageState.boxConfig1 || packageState.boxConfig2
            ? [
                ...(packageState.boxConfig1
                  ? [
                      {
                        capacity_option_id: packageState.boxConfig1.capacity.option_id,
                        color_option_id: packageState.boxConfig1.color.option_id,
                        quantity: packageState.boxConfig1.quantity,
                      },
                    ]
                  : []),
                ...(packageState.boxConfig2
                  ? [
                      {
                        capacity_option_id: packageState.boxConfig2.capacity.option_id,
                        color_option_id: packageState.boxConfig2.color.option_id,
                        quantity: packageState.boxConfig2.quantity,
                      },
                    ]
                  : []),
              ]
            : undefined,
        package_decoration_ids: Array.from(packageDecorationState.selectedDecorations),
        package_decoration_quantity: packageDecorationQuantity,
        macaron_custom_mode: isMacaron && macaronState.colorMode === "custom",
      });

      if (!verifyResponse.success || !verifyResponse.data) {
        setValidationDialog({
          open: true,
          type: "error",
          title: "價格驗證失敗",
          message: "無法驗證訂單價格，請重新嘗試",
        });
        return;
      }

      const verifiedGrandTotal = verifyResponse.data.breakdown.grand_total;
      const verifiedUnitPrice = verifyResponse.data.breakdown.unit_price;
      const displayedTotal = backendGrandTotal ?? grandTotalForDisplay;

      // ✅ 驗證：後端計算價格與前端顯示價格是否一致（允許 1 元誤差）
      if (Math.abs(verifiedGrandTotal - displayedTotal) > 1) {
        console.error("[價格驗證失敗]", { verifiedGrandTotal, displayedTotal });

        // 更新為正確價格
        setBackendGrandTotal(verifiedGrandTotal);
        setBackendUnitPrice(verifiedUnitPrice);
        setBackendDessertTotal(verifyResponse.data.breakdown.dessert_total ?? null);
        setBackendPackageTotal(verifyResponse.data.breakdown.package_total ?? null);
        setBackendConditionalFee(verifyResponse.data.breakdown.conditional_fee ?? 0);
        setBackendConditionalFeeDetails(
          (verifyResponse.data.breakdown.conditional_fee_details || []).map((d: { label?: string; amount?: number; option_name_zh?: string; fee?: number }, i: number) => ({
            option_id: i,
            option_name_zh: d.option_name_zh ?? d.label ?? "",
            fee: d.fee ?? d.amount ?? 0,
          }))
        );
        setIsPriceStale(false);

        setValidationDialog({
          open: true,
          type: "error",
          title: "價格已更新",
          message: `訂單價格已從 NT$${displayedTotal.toLocaleString()} 更新為 NT$${verifiedGrandTotal.toLocaleString()}，請確認後重新提交。`,
        });
        return;
      }

      const selectedOptions: Record<string, any> = {};

      // 1. Color（非馬卡龍）
      if (!isMacaron) {
        selectedColors.forEach((option, rootId) => {
          selectedOptions[`color_${rootId}`] = option;
        });
      }

      // 2. 馬卡龍專用：顏色分配資訊（不包含 hex）
      if (isMacaron) {
        if (macaronState.colorMode === "random") {
          selectedOptions["macaron_mode"] = {
            mode: "random",
            description: "隨機出貨（六種口味）",
          };
        } else {
          // 指定顏色模式
          const colorDistribution = Array.from(macaronState.selectedColorIds).map((colorId) => {
            const option = macaronState.colorOptions.find((o) => o.option_id === colorId);
            return {
              option_id: colorId,
              option_name_zh: option?.option_name_zh || "",
              quantity: macaronState.colorQuantities.get(colorId) || 0,
            };
          });

          selectedOptions["macaron_mode"] = {
            mode: "custom",
            description: "指定顏色",
            total_quantity: macaronState.customQuantity,
            color_distribution: colorDistribution,
            custom_fee: macaronCustomFee,
          };
        }
      }

      // 3. Flavor
      selectedFlavors.forEach((option, rootId) => {
        selectedOptions[`flavor_${rootId}`] = option;
      });

      // 4. Size
      selectedSizes.forEach((option, rootId) => {
        selectedOptions[`size_${rootId}`] = option;
      });

      // 5. Decoration
      if (hierarchicalState.selectedDecorations.size > 0) {
        const selectedDecorationOptions = Array.from(hierarchicalState.selectedDecorations)
          .map((id) => hierarchicalState.optionsMap[id])
          .filter(Boolean);

        selectedOptions["decoration"] = selectedDecorationOptions;
      }

      // 6. ✅ 包裝設計（整合後新增）- 加入價格資訊
      if (hasPackageSection && packageState.selectedPackageStyle) {
        // 計算盒裝總價
        let boxTotalPrice = 0;
        if (isBoxedStyle) {
          if (packageState.boxConfig1) {
            boxTotalPrice += (packageState.boxConfig1.color.price_modifier || 0) * packageState.boxConfig1.quantity;
          }
          if (packageState.boxConfig2) {
            boxTotalPrice += (packageState.boxConfig2.color.price_modifier || 0) * packageState.boxConfig2.quantity;
          }
        }

        selectedOptions["package_style"] = {
          option_id: packageState.selectedPackageStyle.option_id,
          option_name_zh: packageState.selectedPackageStyle.option_name_zh,
          price_modifier: packageState.selectedPackageStyle.price_modifier,
          boxTotalPrice, // 盒裝總價
        };

        // 盒裝配置
        if (isBoxedStyle) {
          selectedOptions["box_config"] = {
            config1: packageState.boxConfig1
              ? {
                  capacity: packageState.boxConfig1.capacity.option_name_zh,
                  color: packageState.boxConfig1.color.option_name_zh,
                  quantity: packageState.boxConfig1.quantity,
                  unit_price: packageState.boxConfig1.color.price_modifier,
                }
              : null,
            config2: packageState.boxConfig2
              ? {
                  capacity: packageState.boxConfig2.capacity.option_name_zh,
                  color: packageState.boxConfig2.color.option_name_zh,
                  quantity: packageState.boxConfig2.quantity,
                  unit_price: packageState.boxConfig2.color.price_modifier,
                }
              : null,
          };
        }

        // 包裝裝飾品（加入價格資訊）
        if (packageDecorationState.selectedDecorations.size > 0) {
          const selectedPkgDecorations = Array.from(packageDecorationState.selectedDecorations)
            .map((id) => {
              const opt = packageDecorationState.optionsMap[id];
              if (!opt) return null;
              return {
                ...opt,
                totalPrice: (opt.price_modifier || 0) * packageDecorationQuantity,
              };
            })
            .filter(Boolean);
          selectedOptions["package_decoration"] = selectedPkgDecorations;
        }
      }

      // 7. ✅ 用戶設計連結（luck/popcorn 專用）
      if (userDesignLink) {
        const designLabel = productType === "luck" ? "刊頭設計" : "包裝設計";
        selectedOptions["user_design"] = {
          label: designLabel,
          url: userDesignLink,
        };
      }

      // 8. ✅ 客製化貼紙/插卡照片連結（7226/7229）
      if (packageDecorationUploads.size > 0) {
        const uploadLinks: Array<{ option_id: number; label: string; url: string }> = [];
        packageDecorationUploads.forEach((uploadInfo, optionId) => {
          const opt = packageDecorationState.optionsMap[optionId];
          const label = opt?.option_name_zh || `選項 ${optionId}`;
          uploadLinks.push({
            option_id: optionId,
            label: `${label}照片連結`,
            url: uploadInfo.url,
          });
        });
        selectedOptions["package_decoration_uploads"] = uploadLinks;
      }

      // ✅ 使用驗證後的價格
      await addToCart(
        productType,
        productData.name,
        productData.category,
        verifiedUnitPrice, // ✅ 使用驗證後的單價
        effectiveQuantity,
        selectedOptions,
        photoUpload.uploadedPhotoUrl ?? undefined,
        textInputData,
        productData.product_image_url ?? undefined,
        getCaptureTarget(),
        hierarchicalState.optionsMap,
        hierarchicalState.parentMap,
        optionNames,
        undefined,
        true,
        packageTotalPrice,
        (verifyResponse.data.breakdown.conditional_fee_details || []).map((d: { label?: string; amount?: number; option_name_zh?: string; fee?: number }, i: number) => ({
          option_id: i,
          option_name_zh: d.option_name_zh ?? d.label ?? "",
          fee: d.fee ?? d.amount ?? 0,
        })), // ✅ 使用驗證後的條件費用（轉成 addToCart 所需格式）
        verifiedGrandTotal, // ✅ 使用驗證後的總價
        hasPackageSection ? captureRefPackage.current : null,
      );
    } finally {
      setIsAddingToCart(false);
    }
  };

  // ✅ 等待資料載入完成
  const hasColorData = config.colorRootIds && config.colorRootIds.length > 0 ? selectedColors.size > 0 : true;
  const hasFlavorData = config.flavorRootIds && config.flavorRootIds.length > 0 ? selectedFlavors.size > 0 : true;
  // 馬卡龍需要等待顏色選項載入
  const isMacaronReady = isMacaron ? !macaronState.isLoadingColors : true;
  const isDataReady = hasColorData && hasFlavorData && isMacaronReady;

  // ====================================================================
  // 步驟渲染邏輯 (新 UI 樣式)
  // ====================================================================
  let currentStep = 1;
  const allOptionElements: React.ReactElement[] = [];

  // 0. 馬卡龍專用：顏色數量分配
  if (isMacaron) {
    const stepNumber = currentStep++;
    allOptionElements.push(
      <div key="macaron-color-quantity" className="bg-card rounded-3xl p-6 shadow-lg border border-border">
        <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <span className="w-8 h-8 bg-brand-500 text-white rounded-full flex items-center justify-center text-base font-bold">
            {stepNumber}
          </span>
          選擇馬卡龍顏色
        </h3>
        <MacaronColorQuantitySelector
          colorMode={macaronState.colorMode}
          onColorModeChange={macaronState.setColorMode}
          customQuantity={macaronState.customQuantity}
          onQuantityChange={macaronState.setCustomQuantity}
          quantityError={macaronState.quantityError}
          colorOptions={macaronState.colorOptions}
          maxSelectableColors={macaronState.maxSelectableColors}
          selectedColorIds={macaronState.selectedColorIds}
          onToggleColor={macaronState.toggleColorSelection}
          distributionMode={macaronState.distributionMode}
          onDistributionModeChange={macaronState.setDistributionMode}
          colorQuantities={macaronState.colorQuantities}
          onColorQuantityChange={macaronState.setColorQuantity}
          distributionError={macaronState.distributionError}
          currentStep={macaronState.currentStep}
          onNextStep={macaronState.goToNextStep}
          onPreviousStep={macaronState.goToPreviousStep}
        />
      </div>,
    );
  }

  // 1. 口味選擇
  if (config.features.includes("flavor_selection") && config.flavorRootIds) {
    config.flavorRootIds.forEach((rootId: number) => {
      const flavorOptions = flavorGroups.get(rootId) || [];
      if (flavorOptions.length > 0) {
        const selectedFlavor = selectedFlavors.get(rootId) || null;
        const optionName = optionNames.get(rootId) || "選擇口味";
        const stepNumber = currentStep++;

        allOptionElements.push(
          <div key={`flavor-${rootId}`} className="bg-card rounded-3xl p-6 shadow-lg border border-border">
            <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="w-8 h-8 bg-brand-500 text-white rounded-full flex items-center justify-center text-base font-bold">
                {stepNumber}
              </span>
              {optionName}
            </h3>
            <FlavorPickerGroup
              options={flavorOptions}
              selectedOption={selectedFlavor}
              onSelect={(option) => handleFlavorSelect(rootId, option)}
            />
          </div>,
        );
      }
    });
  }

  // 2. 顏色選擇
  if (config.features.includes("color_selection") && config.colorRootIds) {
    config.colorRootIds.forEach((rootId: number) => {
      const colorOptions = colorGroups.get(rootId) || [];
      if (colorOptions.length > 0) {
        const selectedColor = selectedColors.get(rootId) || null;
        const optionName = optionNames.get(rootId) || "選擇顏色";
        const stepNumber = currentStep++;

        allOptionElements.push(
          <div key={`color-${rootId}`} className="bg-card rounded-3xl p-6 shadow-lg border border-border relative">
            <ClearSettingsButton onClick={() => resetColorToDefault(rootId)} />
            <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="w-8 h-8 bg-brand-500 text-white rounded-full flex items-center justify-center text-base font-bold">
                {stepNumber}
              </span>
              {optionName}
            </h3>
            <ColorPickerGroup
              options={colorOptions}
              selectedOption={selectedColor}
              onSelect={(option) => handleColorSelectWithValidation(rootId, option)}
            />
          </div>,
        );
      }
    });
  }

  // 2.5 禮盒顏色選擇（禮盒專用）
  if (config.giftBoxColorRootId && giftBoxColorState.isSupported && giftBoxColorState.colorOptions.length > 0) {
    const stepNumber = currentStep++;

    allOptionElements.push(
      <div key="giftbox-color" className="bg-card rounded-3xl p-6 shadow-lg border border-border">
        <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <span className="w-8 h-8 bg-brand-500 text-white rounded-full flex items-center justify-center text-base font-bold">
            {stepNumber}
          </span>
          禮盒顏色
        </h3>
        <GiftBoxColorSelector
          title=""
          options={giftBoxColorState.colorOptions}
          selectedOption={giftBoxColorState.selectedColor}
          onSelect={giftBoxColorState.handleColorSelect}
        />
      </div>,
    );
  }

  // 3. 形狀選擇（cookie 專用）- 放在尺寸選擇之前
  if (config.features.includes("shape_selection") && config.shapeRootId) {
    const rootId = config.shapeRootId;
    const shapeOptions = sizeGroups.get(rootId) || [];
    if (shapeOptions.length > 0) {
      const selectedShape = selectedSizes.get(rootId) || null;
      const stepNumber = currentStep++;

      allOptionElements.push(
        <div key={`shape-${rootId}`} className="bg-card rounded-3xl p-6 shadow-lg border border-border">
          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-brand-500 text-white rounded-full flex items-center justify-center text-base font-bold">
              {stepNumber}
            </span>
            餅乾形狀
          </h3>
          <SizeSelector
            options={shapeOptions}
            selectedOption={selectedShape}
            onSelect={(option) => handleShapeSelectWithValidation(rootId, option)}
          />
        </div>,
      );
    }
  }

  // 4. 尺寸選擇 - 放在形狀選擇之後
  if (config.features.includes("size_selection") && config.sizeRootIds) {
    config.sizeRootIds.forEach((rootId: number) => {
      const sizeOptions = sizeGroups.get(rootId) || [];
      if (sizeOptions.length > 0) {
        const selectedSize = selectedSizes.get(rootId) || null;
        const optionName = optionNames.get(rootId) || "選擇尺寸";
        const stepNumber = currentStep++;

        allOptionElements.push(
          <div key={`size-${rootId}`} className="bg-card rounded-3xl p-6 shadow-lg border border-border">
            <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="w-8 h-8 bg-brand-500 text-white rounded-full flex items-center justify-center text-base font-bold">
                {stepNumber}
              </span>
              {optionName}
            </h3>
            <a
              href="https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/popcorn_cookienew.webp"
              target="_blank"
              rel="noopener noreferrer"
              className="
          text-base
          text-brand-600
          underline
          underline-offset-4
          hover:text-brand-700
          transition-colors
          whitespace-nowrap
        "
            >
              爆米花/餅乾尺寸示意圖
            </a>
            <SizeSelector
              options={sizeOptions}
              selectedOption={selectedSize}
              onSelect={(option) => handleSizeSelect(rootId, option)}
            />
          </div>,
        );
      }
    });
  }

  // 4. 裝飾品與照片
  if (config.features.includes("decorations") || config.features.includes("photo_upload")) {
    const stepNumber = currentStep++;

    allOptionElements.push(
      <div key="decorations" className="bg-card rounded-3xl p-6 shadow-lg border border-border relative">
        <ClearSettingsButton
          onClick={() => {
            hierarchicalState.clearAllSelections();
            photoUpload.handlePhotoClear();
            setCurrentPhotoOptionId(null);
            setConfirmedFeeOptionIds(new Set());
          }}
        />
        <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <span className="w-8 h-8 bg-brand-500 text-white rounded-full flex items-center justify-center text-base font-bold">
            {stepNumber}
          </span>
          甜點裝飾&放照片
        </h3>

        {/* ⭐ 連結區塊 */}
        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 mb-4">
          <a
            href="https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/phcr.webp"
            target="_blank"
            rel="noopener noreferrer"
            className="
        text-base
        text-brand-600
        underline
        underline-offset-4
        hover:text-brand-700
        transition-colors
        whitespace-nowrap
      "
          >
            ＊所有照片載體種類說明
          </a>
        </div>

        <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
          建議可先到第三方平台為照片
          <a
            href="https://www.remove.bg/zh-tw"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 underline underline-offset-2 hover:text-brand-700 mx-0.5"
          >
            remove.bg（去背工具）
          </a>
          處理去背後再上傳，預覽與成品才不會帶入雜亂背景。
        </p>

        <DecorationTree
          options={hierarchicalState.decorationOptions}
          selectedDecorations={hierarchicalState.selectedDecorations}
          openPath={hierarchicalState.openPath}
          optionsMap={hierarchicalState.optionsMap}
          childrenMap={hierarchicalState.childrenMap}
          onToggle={hierarchicalState.toggleOption}
          onSelect={(option) => {
            handleDecorationSelectWithValidation(option);
          }}
          isInBranch={hierarchicalState.isInBranch}
          onPhotoUpload={async (optionId: number, file: File) => {
            setCurrentPhotoOptionId(optionId);
            await photoUpload.handlePhotoUpload(file);
          }}
          onPhotoClear={async (optionId: number) => {
            // 清除照片並從 storage 刪除
            await photoUpload.handlePhotoClear();
            // 如果此選項有條件加價且已確認，則移除確認狀態（取消加價）
            if (config.businessRules?.conditionalFees) {
              for (const rule of config.businessRules.conditionalFees) {
                if (optionId === rule.triggerOptionId || isDescendantOf(optionId, rule.triggerOptionId)) {
                  setConfirmedFeeOptionIds((prev) => {
                    const next = new Set(prev);
                    next.delete(rule.triggerOptionId);
                    return next;
                  });
                }
              }
            }
            setCurrentPhotoOptionId(null);
          }}
          uploadedPhotos={
            photoUpload.uploadedPhotoUrl && currentPhotoOptionId ? new Set([currentPhotoOptionId]) : new Set()
          }
        />
        {isMacaron && (
          <p className="text-xs text-muted-foreground mt-2">
            馬卡龍無法印製白色，會是馬卡龍底色，建議上傳去背照片
          </p>
        )}
      </div>,
    );
  }

  // 5. ✅ 包裝設計區塊（整合後新增）
  if (hasPackageSection) {
    // 5a. 包裝款式選擇（popcorn 選擇用戶設計上傳時隱藏）
    if (!shouldHidePackageStyleSection) {
      const pkgStyleStep = currentStep++;
      allOptionElements.push(
        <div key="package-style" className="bg-card rounded-3xl p-6 shadow-lg border border-border">
          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-brand-500 text-white rounded-full flex items-center justify-center text-base font-bold">
              {pkgStyleStep}
            </span>
            包裝款式
          </h3>
          <PackageStyleSelector
            options={filteredPackageStyleOptions}
            selectedOption={packageState.selectedPackageStyle}
            onSelect={packageState.handlePackageStyleSelect}
            productId={productType}
          />
        </div>,
      );
    }

    // 5a-alt. ✅ 用戶設計上傳模組（popcorn 選擇 7299 時顯示）
    if (hasSelectedUserDesignTrigger && productType === "popcorn") {
      const designStep = currentStep++;
      allOptionElements.push(
        <div key="user-design-popcorn" className="bg-card rounded-3xl p-6 shadow-lg border border-border">
          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-brand-500 text-white rounded-full flex items-center justify-center text-base font-bold">
              {designStep}
            </span>
            包裝款式
          </h3>
          {/* 顯示「自己設計包裝」提示 */}
          <div className="text-center py-6 mb-4 bg-muted/50 rounded-xl border-2 border-dashed border-brand-300">
            <p className="text-2xl font-bold text-brand-600 mb-2">🎨 自己設計包裝</p>
            <p className="text-muted-foreground">您已選擇自行設計包裝，請在下方提供設計連結</p>
          </div>
          {/* 設計連結上傳區 */}
          <UserDesignUploader
            productId={productType}
            onDesignLinkChange={setUserDesignLink}
            designLink={userDesignLink}
          />
        </div>,
      );
    }

    // 5b. 盒裝配置（條件顯示）
    if (isBoxedStyle && !shouldHidePackageStyleSection) {
      const boxConfigStep = currentStep++;
      allOptionElements.push(
        <div key="box-config" className="bg-card rounded-3xl p-6 shadow-lg border border-border">
          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-brand-500 text-white rounded-full flex items-center justify-center text-base font-bold">
              {boxConfigStep}
            </span>
            盒裝配置
          </h3>
          <BoxConfigSelection
            dessertQuantity={effectiveQuantity}
            boxConfig1={packageState.boxConfig1}
            boxConfig2={packageState.boxConfig2}
            onConfig1Change={packageState.setBoxConfig1}
            onConfig2Change={packageState.setBoxConfig2}
            capacityOptions={packageState.boxCapacityOptions}
            colorOptionsMap={packageState.boxColorOptionsMap}
            onColorSelect={(color, configIndex) => {
              if (configIndex === 1) {
                setTempBoxColorPreview1(color);
              } else {
                setTempBoxColorPreview2(color);
              }
            }}
          />
        </div>,
      );
    }

    // 5c. 包裝裝飾品（隱藏時不顯示）+ 7226/7229 照片上傳
    if (packageDecorationState.decorationOptions.length > 0 && !shouldHidePackageStyleSection) {
      const pkgDecoStep = currentStep++;

      // ✅ 客製化貼紙/插卡需要數量>=100 的選項 IDs
      const customUploadOptionIds = [7226, 7229];

      // ✅ 包裝裝飾品選擇驗證（7226/7229 需要 qty>=100）
      const handlePackageDecorationSelectWithValidation = (option: any) => {
        const optionId = option.option_id;

        // 檢查是否為需要數量限制的選項
        if (customUploadOptionIds.includes(optionId) && effectiveQuantity < 100) {
          setValidationDialog({
            open: true,
            type: "error",
            title: "數量限制",
            message: "客製化貼紙/插卡需要訂購數量達 100 顆以上才能選擇",
          });
          return; // 阻止選擇
        }

        packageDecorationState.handleDecorationSelect(option);
      };

      allOptionElements.push(
        <div key="package-decoration" className="bg-card rounded-3xl p-6 shadow-lg border border-border relative">
          <ClearSettingsButton onClick={() => packageDecorationState.clearAllSelections()} />
          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-brand-500 text-white rounded-full flex items-center justify-center text-base font-bold">
              {pkgDecoStep}
            </span>
            包裝裝飾(依據包裝數量計價)
          </h3>
          <DecorationTree
            options={packageDecorationState.decorationOptions}
            selectedDecorations={packageDecorationState.selectedDecorations}
            openPath={packageDecorationState.openPath}
            optionsMap={packageDecorationState.optionsMap}
            childrenMap={packageDecorationState.childrenMap}
            onToggle={packageDecorationState.toggleOption}
            onSelect={handlePackageDecorationSelectWithValidation}
            isInBranch={packageDecorationState.isInBranch}
            onPhotoUpload={async (optionId: number, file: File) => {
              // 只有 7226/7229 需要照片上傳
              if (customUploadOptionIds.includes(optionId)) {
                await handlePackageDecorationPhotoUpload(optionId, file);
              }
            }}
            onPhotoClear={async (optionId: number) => {
              handlePackageDecorationPhotoClear(optionId);
            }}
            uploadedPhotos={new Set(Array.from(packageDecorationUploads.keys()))}
          />
        </div>,
      );
    }
  }

  // 5d. ✅ luck 用戶設計上傳模組（只有選到 7082 才顯示）
  if (productType === "luck" && hasSelectedUserDesignTrigger) {
    const designStep = currentStep++;
    allOptionElements.push(
      <div key="user-design-luck" className="bg-card rounded-3xl p-6 shadow-lg border border-border">
        <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <span className="w-8 h-8 bg-brand-500 text-white rounded-full flex items-center justify-center text-base font-bold">
            {designStep}
          </span>
          刊頭設計區
        </h3>
        <UserDesignUploader
          productId={productType}
          onDesignLinkChange={setUserDesignLink}
          designLink={userDesignLink}
        />
      </div>,
    );
  }
  // ====================================================================

  return (
    <div className="min-h-screen bg-background pb-16">
      {/* 標題 */}
      <div className="py-8 px-4 text-center">
        <h1
          className="
          text-2xl sm:text-3xl md:text-5xl 
          font-extrabold text-foreground 
          drop-shadow-[0_4px_10px_rgba(0,0,0,0.15)]
          leading-tight 
          whitespace-nowrap 
          overflow-hidden 
          text-ellipsis
        "
        >
          {productData.name} - 客製化編輯器
        </h1>
      </div>

      {/* 手機版佈局 (lg 以下) */}
      <div className="lg:hidden">
        {/* Sticky 預覽區（只負責畫面呈現，不給 html-to-image 截圖） */}
        <div className="sticky top-10 z-40 bg-white shadow-md border border-border">
          <div className="relative min-h-[42vh] py-1 px-2 flex flex-col items-center">
            {/* 手機版預覽不使用 transform scale，避免截圖偏移與 Safari 灰畫面；canva 靠上顯示避免被裁切 */}
            <div className="w-full flex justify-center -mt-1 flex-shrink-0">
              <div
                ref={previewRefMobile}
                className="relative aspect-square w-[300px] mx-auto overflow-hidden flex items-center justify-center bg-gradient-to-br from-brand-50 to-brand-100 rounded-lg shrink-0"
              >
                <PreviewCanvas
                  config={config}
                  colorGroups={colorGroups}
                  selectedColors={selectedColors}
                  flavorGroups={flavorGroups}
                  selectedFlavors={selectedFlavors}
                  selectedSizes={selectedSizes}
                  selectedDecorations={hierarchicalState.selectedDecorations}
                  decorationOptions={hierarchicalState.decorationOptions}
                  uploadedPhotoUrl={photoUpload.uploadedPhotoUrl}
                  photoFrame={photoUpload.photoFrame}
                  optionsMap={hierarchicalState.optionsMap}
                  isInBranch={hierarchicalState.isInBranch}
                  textInputData={textInputData}
                  showPackagePreview={hasPackageSection}
                  selectedPackageStyle={packageState.selectedPackageStyle}
                  boxConfig1={packageState.boxConfig1}
                  boxConfig2={packageState.boxConfig2}
                  packageDecorations={packageDecorationState.selectedDecorations}
                  packageDecorationOptionsMap={packageDecorationState.optionsMap}
                  macaronPreviewImage={isMacaron ? macaronPreviewImage : undefined}
                  boxPreviewImageUrl={boxPreviewImageUrl || undefined}
                  exportCaptureReady
                />
              </div>
            </div>

            {/* ⭐購物車 icon（保持原尺寸，但往下移） */}
            <MobilePriceButton
              quantity={
                isMacaron && macaronState.colorMode === "custom" ? macaronState.customQuantity : effectiveQuantity
              }
              minQuantity={isMacaron && macaronState.colorMode === "custom" ? 100 : productData.min_order_qty}
              unitPrice={unitPrice}
              subtotal={subtotal}
              packageFee={packageFeeForDisplay}
              conditionalFee={conditionalFeeForDisplay}
              grandTotal={grandTotalForDisplay}
              onQuantityChange={
                isMacaron && macaronState.colorMode === "custom" ? macaronState.setCustomQuantity : setQuantity
              }
              offsetTop={120}
              offsetRight={12}
              // ✅ 新增同步 props
              customFeeNote={isMacaron && macaronState.colorMode === "custom" ? "⚠️ 指定顏色加收 10%" : undefined}
              customFeeAmount={macaronCustomFee}
              conditionalFeeDetails={actualConditionalFeeDetails}
              hasUserDesignPackage={hasSelectedUserDesignTrigger && productType === "popcorn"}
            />
          </div>
        </div>

        {/* 選項區 */}
        <div className="px-4 pb-24 space-y-6 mt-6">
          {allOptionElements}

          {/* 文字輸入區域 */}
          {hasTextInput && (
            <div className="relative">
              {textInputData ? (
                // 已有文字資料 → 顯示「已設定」提示 + 清除按鈕
                <div className="flex items-center justify-between p-4 border rounded-lg bg-green-50">
                  <span className="text-green-700 font-medium">
                    ✅ {productType === "cupcake_choco" ? "手寫文字已設定" : "簽文已設定"}
                  </span>
                  <Button variant="destructive" size="sm" onClick={handleClearTextInput}>
                    清除
                  </Button>
                </div>
              ) : !showTextInput ? (
                // 未設定 → 顯示醒目按鈕（加粗邊框 + 淺底色）
                <Button
                  onClick={() => setShowTextInput(true)}
                  variant="outline"
                  className="w-full border-2 border-primary bg-primary/10 hover:bg-primary/20 font-semibold"
                >
                  ✏️ {getTextInputButtonLabel(productType)}
                </Button>
              ) : (
                // 正在輸入 → 顯示組件
                <Card className="p-6">
                  <Suspense
                    fallback={
                      <div className="flex justify-center py-8">
                        <Loader2 className="animate-spin" />
                      </div>
                    }
                  >
                    {TextInputComponent && (
                      <TextInputComponent
                        orderQuantity={quantity}
                        config={TEXT_INPUT_CONFIGS[productType]}
                        onConfirm={(data: unknown) => {
                          setTextInputData(data as Record<string, unknown> | null);
                          setShowTextInput(false);
                        }}
                        onCancel={() => setShowTextInput(false)}
                      />
                    )}
                  </Suspense>
                </Card>
              )}
            </div>
          )}
        </div>

        {/* Fixed bottom 加入購物車按鈕 */}
        <div className="fixed bottom-0 left-0 right-0 bg-white p-4 border-t shadow-lg z-50 lg:hidden">
          <Button
            onClick={handleAddToCartClick}
            disabled={isAddingToCart || isPriceStale}
            className="
        w-full py-4 
        text-base sm:text-lg 
        font-semibold rounded-2xl shadow-lg
        leading-tight 
        whitespace-normal
      "
          >
            {isAddingToCart
              ? "加入中..."
              : isPriceStale
                ? "計算價格中..."
                : `加入購物車 · NT$ ${grandTotalForDisplay.toLocaleString()}`}
          </Button>
        </div>
      </div>

      {/* 桌面版佈局 (lg 以上) */}
      <div className="hidden lg:block mx-auto px-8 max-w-[1500px]">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* 左側：sticky 預覽區 */}
          <div className="sticky top-24 self-start">
            <div className="bg-white rounded-3xl shadow-xl p-8 space-y-8 border border-border">
              <div className="p-6">
                <h2 className="mb-6 text-ink text-xl font-semibold">預覽區域</h2>

                <div
                  ref={captureRefDesktop}
                  className="aspect-square max-w-[800px] mx-auto bg-gradient-to-br from-brand-50 to-brand-100 rounded-lg relative overflow-hidden flex items-center justify-center"
                >
                  <PreviewCanvas
                    config={config}
                    colorGroups={colorGroups}
                    selectedColors={selectedColors}
                    flavorGroups={flavorGroups}
                    selectedFlavors={selectedFlavors}
                    selectedSizes={selectedSizes}
                    selectedDecorations={hierarchicalState.selectedDecorations}
                    decorationOptions={hierarchicalState.decorationOptions}
                    uploadedPhotoUrl={photoUpload.uploadedPhotoUrl}
                    photoFrame={photoUpload.photoFrame}
                    optionsMap={hierarchicalState.optionsMap}
                    isInBranch={hierarchicalState.isInBranch}
                    textInputData={textInputData}
                    showPackagePreview={hasPackageSection}
                    selectedPackageStyle={packageState.selectedPackageStyle}
                    boxConfig1={packageState.boxConfig1}
                    boxConfig2={packageState.boxConfig2}
                    packageDecorations={packageDecorationState.selectedDecorations}
                    packageDecorationOptionsMap={packageDecorationState.optionsMap}
                    macaronPreviewImage={isMacaron ? macaronPreviewImage : undefined}
                    boxPreviewImageUrl={boxPreviewImageUrl || undefined}
                    exportCaptureReady
                  />
                </div>
              </div>
              <QuantityPriceBox
                quantity={
                  isMacaron && macaronState.colorMode === "custom" ? macaronState.customQuantity : effectiveQuantity
                }
                minQuantity={isMacaron && macaronState.colorMode === "custom" ? 100 : productData.min_order_qty}
                unitPrice={unitPrice}
                subtotal={subtotal}
                packageFee={packageFeeForDisplay}
                conditionalFee={conditionalFeeForDisplay}
                grandTotal={grandTotalForDisplay}
                onQuantityChange={
                  isMacaron && macaronState.colorMode === "custom" ? macaronState.setCustomQuantity : setQuantity
                }
                manualInputMode={isMacaron && macaronState.colorMode === "custom"}
                quantityError={isMacaron ? macaronState.quantityError : undefined}
                customFeeNote={
                  isMacaron && macaronState.colorMode === "custom" ? "⚠️ 指定顏色將加收訂單金額 10% 手續費" : undefined
                }
                customFeeAmount={macaronCustomFee}
                conditionalFeeDetails={actualConditionalFeeDetails}
                showPhotoCardFee={
                  !!config.businessRules?.conditionalFees && !!photoUpload.uploadedPhotoUrl && quantity < 100
                }
                hasUserDesignPackage={hasSelectedUserDesignTrigger && productType === "popcorn"}
              />
            </div>
          </div>

          {/* 右側：選項區 */}
          <div className="space-y-6">
            {allOptionElements}

            {/* 文字輸入區域 */}
            {hasTextInput && (
              <div className="relative">
                {textInputData ? (
                  // 已有文字資料 → 顯示「已設定」提示 + 清除按鈕
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-green-50">
                    <span className="text-green-700 font-medium">
                      ✅ {productType === "cupcake_choco" ? "手寫文字已設定" : "簽文已設定"}
                    </span>
                    <Button variant="destructive" size="sm" onClick={handleClearTextInput}>
                      清除
                    </Button>
                  </div>
                ) : !showTextInput ? (
                  // 未設定 → 顯示醒目按鈕（加粗邊框 + 淺底色）
                  <Button
                    onClick={() => setShowTextInput(true)}
                    variant="outline"
                    className="w-full border-2 border-primary bg-primary/10 hover:bg-primary/20 font-semibold"
                  >
                    ✏️ {getTextInputButtonLabel(productType)}
                  </Button>
                ) : (
                  // 正在輸入 → 顯示組件
                  <Card className="p-6">
                    <Suspense
                      fallback={
                        <div className="flex justify-center py-8">
                          <Loader2 className="animate-spin" />
                        </div>
                      }
                    >
                      {TextInputComponent && (
                        <TextInputComponent
                          orderQuantity={quantity}
                          config={TEXT_INPUT_CONFIGS[productType]}
                          onConfirm={(data: unknown) => {
                            setTextInputData(data as Record<string, unknown> | null);
                            setShowTextInput(false);
                          }}
                          onCancel={() => setShowTextInput(false)}
                        />
                      )}
                    </Suspense>
                  </Card>
                )}
              </div>
            )}

            {/* 加入購物車按鈕 */}
            <Button
              onClick={handleAddToCartClick}
              disabled={isAddingToCart || isPriceStale}
              className="w-full py-6 text-xl font-semibold rounded-2xl mt-4 shadow-lg"
            >
              {isAddingToCart
                ? "加入中..."
                : isPriceStale
                  ? "計算價格中..."
                  : `加入購物車 · NT$ ${grandTotalForDisplay.toLocaleString()}`}
            </Button>
          </div>
        </div>
      </div>

      {/* 隱藏版截圖容器：勿用 opacity-0，否則瀏覽器常延遲／略過底層圖層光栅化，html-to-image 易只剩高 z 圖層 */}
      <div
        className="fixed -left-[9999px] top-0 pointer-events-none z-0 h-[300px] w-[300px] overflow-hidden opacity-100"
        aria-hidden="true"
      >
        <div
          ref={captureRefMobile}
          className="relative w-[300px] h-[300px] overflow-hidden flex items-center justify-center bg-gradient-to-br from-brand-50 to-brand-100 rounded-lg"
        >
          <PreviewCanvas
            config={config}
            colorGroups={colorGroups}
            selectedColors={selectedColors}
            flavorGroups={flavorGroups}
            selectedFlavors={selectedFlavors}
            selectedSizes={selectedSizes}
            selectedDecorations={hierarchicalState.selectedDecorations}
            decorationOptions={hierarchicalState.decorationOptions}
            uploadedPhotoUrl={photoUpload.uploadedPhotoUrl}
            photoFrame={photoUpload.photoFrame}
            optionsMap={hierarchicalState.optionsMap}
            isInBranch={hierarchicalState.isInBranch}
            textInputData={textInputData}
            showPackagePreview={hasPackageSection}
            selectedPackageStyle={packageState.selectedPackageStyle}
            boxConfig1={packageState.boxConfig1}
            boxConfig2={packageState.boxConfig2}
            packageDecorations={packageDecorationState.selectedDecorations}
            packageDecorationOptionsMap={packageDecorationState.optionsMap}
            macaronPreviewImage={isMacaron ? macaronPreviewImage : undefined}
            boxPreviewImageUrl={boxPreviewImageUrl || undefined}
            forScreenshot
          />
        </div>
      </div>

      {/* 隱藏：僅包裝小圖，供第二次 toBlob（與主預覽圖分開上傳） */}
      {hasPackageSection ? (
        <div
          className="fixed -left-[9999px] top-[308px] z-0 h-[88px] w-[80px] overflow-hidden opacity-100 pointer-events-none"
          aria-hidden="true"
        >
          <div
            ref={captureRefPackage}
            className="relative flex h-full w-full items-stretch justify-center rounded-lg bg-gradient-to-br from-brand-50 to-brand-100 p-0.5"
          >
            <PreviewCanvas
              config={config}
              colorGroups={colorGroups}
              selectedColors={selectedColors}
              flavorGroups={flavorGroups}
              selectedFlavors={selectedFlavors}
              selectedSizes={selectedSizes}
              selectedDecorations={hierarchicalState.selectedDecorations}
              decorationOptions={hierarchicalState.decorationOptions}
              uploadedPhotoUrl={photoUpload.uploadedPhotoUrl}
              photoFrame={photoUpload.photoFrame}
              optionsMap={hierarchicalState.optionsMap}
              isInBranch={hierarchicalState.isInBranch}
              textInputData={textInputData}
              showPackagePreview
              selectedPackageStyle={packageState.selectedPackageStyle}
              boxConfig1={packageState.boxConfig1}
              boxConfig2={packageState.boxConfig2}
              packageDecorations={packageDecorationState.selectedDecorations}
              packageDecorationOptionsMap={packageDecorationState.optionsMap}
              macaronPreviewImage={isMacaron ? macaronPreviewImage : undefined}
              boxPreviewImageUrl={boxPreviewImageUrl || undefined}
              renderMode="exportPackage"
            />
          </div>
        </div>
      ) : null}

      {/* ✅ 加入購物車確認視窗 */}
      <AlertDialog open={showAddToCartConfirm} onOpenChange={setShowAddToCartConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認送出設計嗎？</AlertDialogTitle>
            <AlertDialogDescription>
              送出後不可修改設計以及數量（數量只能在該頁面決定），確定要送出嗎？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAddToCart} disabled={isAddingToCart}>
              {isAddingToCart ? "加入中..." : "確定送出"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 業務規則驗證對話框 */}
      <AlertDialog
        open={validationDialog.open}
        onOpenChange={(open) => setValidationDialog({ ...validationDialog, open })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{validationDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>{validationDialog.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {validationDialog.type === "confirm" ? (
              <>
                <AlertDialogCancel
                  onClick={() => {
                    // 取消時，移除相關選項（如有需要）
                    if (validationDialog.pendingOptionId) {
                      // 清除上傳的照片
                      // 不執行 onConfirm
                    }
                    setValidationDialog({ ...validationDialog, open: false });
                  }}
                >
                  取消
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    validationDialog.onConfirm?.();
                    setValidationDialog({ ...validationDialog, open: false });
                  }}
                >
                  確定加價
                </AlertDialogAction>
              </>
            ) : (
              <AlertDialogAction onClick={() => setValidationDialog({ ...validationDialog, open: false })}>
                我知道了
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ✅ 打樣服務說明彈窗 */}
      <AlertDialog open={showSampleDialog} onOpenChange={setShowSampleDialog}>
  <AlertDialogContent className="sm:max-w-xl">
    <AlertDialogHeader>
      <AlertDialogTitle className="text-2xl tracking-wide">
        大量訂購打樣服務
      </AlertDialogTitle>

      <AlertDialogDescription className="space-y-8 pt-6 text-base leading-relaxed">

        {/* 打樣門檻 */}
        <div className="space-y-3">
          <p className="font-semibold text-lg tracking-wide text-foreground">
            打樣門檻
          </p>
          <p className="text-base text-muted-foreground leading-loose">
            單一設計訂購量達{" "}
            <strong className="text-foreground font-semibold">
              500 顆以上
            </strong>
            ，或禮盒訂購量達{" "}
            <strong className="text-foreground font-semibold">
              200 盒以上
            </strong>
            ，可於正式下單前申請打樣服務。
          </p>
        </div>

        {/* 如何申請 */}
        <div className="space-y-3">
          <p className="font-semibold text-lg tracking-wide text-foreground">
            如何申請打樣
          </p>
          <p className="text-base text-muted-foreground leading-loose">
            請先於編輯器完成客製化設計並加入購物車，
            將購物車明細截圖後傳送至{" "}
            <strong className="text-foreground font-semibold">
              LINE 官方客服
            </strong>
            ，並說明您的打樣需求，將由專人協助後續安排。
          </p>
        </div>

        {/* 注意事項 */}
        <div className="rounded-lg bg-rose-50 px-5 py-4">
          <p className="text-lg text-rose-800 leading-loose">
            ＊請注意：打樣需提前至少{" "}
            <strong className="font-semibold">
              一個月
            </strong>
            預約。
            <strong className="font-semibold">前兩週
            </strong>
            安排打樣與試吃確認，
            <strong className="font-semibold">
            後兩週
            </strong>
            完成正式訂單建立與出貨作業。
          </p>
        </div>

      </AlertDialogDescription>
    </AlertDialogHeader>

    <AlertDialogFooter className="pt-6">
      <AlertDialogAction
        onClick={() => setShowSampleDialog(false)}
        className="text-base px-6 py-3"
      >
        我知道了
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
<RightSlideHint />
    </div>
  );
}

