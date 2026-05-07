// ======================================================================
// MealBoxCustomizerPage.tsx — 餐盒客製化整合頁面（內容物 + 包裝設計）
// ======================================================================
"use client";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import { supabase } from "@/integrations/supabase/client";
import { prepareImageForUpload } from "@/lib/prepare-upload-image-client";
import { useCart } from "@/contexts/CartContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShoppingCart, X, Plus, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useQuantityInput } from "@/hooks/useQuantityInput";
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

import { useMealBoxCustomizer, DessertOption } from "@/hooks/useMealBoxCustomizer";
import { useUniversalPackageCustomizer } from "@/hooks/useUniversalPackageCustomizer";
// ✅ 移除 usePhotoUpload，Meal Box 使用簡化的獨立照片上傳邏輯
import { MealBoxPreview } from "@/components/meal-box/MealBoxPreview";
import { SlotSelector } from "@/components/meal-box/SlotSelector";
import {
  PackageStyleSelector,
  type PackageStylePhotoMetadata,
} from "@/components/universal-customizer/PackageStyleSelector";
import { PackagePreviewCanvas } from "@/components/universal-customizer/PackagePreviewCanvas";
import { PhotoUploaderButton } from "@/components/universal-customizer/PhotoUploaderButton";
import { useIsMobile } from "@/hooks/use-mobile";

export default function MealBoxCustomizerPage() {
  const { boxId } = useParams<{ boxId: string }>();
  const router = useRouter();
  const { addToCartCustom } = useCart();
  const isMobile = useIsMobile();
  const { toast } = useToast(); // 🔧 正確的 hook 使用方式

  const mealBoxCaptureRef = useRef<HTMLDivElement>(null);
  const packageCaptureRef = useRef<HTMLDivElement>(null);
  const [showPriceCard, setShowPriceCard] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifyingPrice, setIsVerifyingPrice] = useState(false); // ✅ 新增：價格驗證中狀態
  const [activeSlot, setActiveSlot] = useState<string | null>(null);

  const productId = boxId || "box_6";

  // ===== 餐盒內容 Hook =====
  const {
    slots,
    selectedItems,
    basePrice,
    unitPrice,
    dessertTotal,
    minOrderQty,
    quantity,
    totalPrice: mealBoxPrice,
    isLoading: mealBoxLoading,
    error: mealBoxError,
    selectItemForSlot,
    incrementQuantity,
    decrementQuantity,
    allSlotsSelected,
    getSaltOptions,
    getSweetOptions,
    buildCustomizationsJson,
  } = useMealBoxCustomizer({ productId });

  // ===== 包裝設計 Hook =====
  const {
    packageStyleOptions,
    selectedPackageStyle,
    handlePackageStyleSelect,
    totalPrice: packageTotalPrice,
    isLoading: packageLoading,
  } = useUniversalPackageCustomizer(productId, quantity);

  // ✅ 手動輸入數量的處理函數
  const handleQuantityChange = (newQuantity: number) => {
    // 委託給 hook 的 incrementQuantity / decrementQuantity 需要改為直接設置
    // 由於 useMealBoxCustomizer 沒有暴露 setQuantity，我們需要透過 +/- 來達成
    const diff = newQuantity - quantity;
    if (diff > 0) {
      for (let i = 0; i < diff; i++) incrementQuantity();
    } else if (diff < 0) {
      for (let i = 0; i < Math.abs(diff); i++) decrementQuantity();
    }
  };

  // ✅ 使用共用 hook 處理手動輸入邏輯
  const { localValue, handleInputChange, handleInputBlur, handleKeyDown } =
    useQuantityInput({
      quantity,
      minQuantity: minOrderQty,
      onQuantityChange: handleQuantityChange,
    });

  // ===== 照片上傳（簡化版，只收集檔案，不渲染到預覽畫布）=====
  const [packageStyleRequiresPhoto, setPackageStyleRequiresPhoto] = useState(false);
  const [packageStylePhotoMetadata, setPackageStylePhotoMetadata] = useState<PackageStylePhotoMetadata | null>(null);
  const [uploadedPhotoUrl, setUploadedPhotoUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // ✅ 簡化的照片上傳函數（獨立於 usePhotoUpload，只收取照片檔案）
  const handleSimplePhotoUpload = async (file: File) => {
    if (!file) return;

    setIsUploading(true);
    try {
      // 驗證檔案類型
      if (!file.type.startsWith("image/")) {
        throw new Error("只能上傳圖片檔案");
      }

      // 原檔可較大；經 Sharp 後應明顯變小
      if (file.size > 20 * 1024 * 1024) {
        throw new Error("圖片原檔不能超過 20MB");
      }

      const webpFile = await prepareImageForUpload(file);
      if (webpFile.size > 2 * 1024 * 1024) {
        throw new Error("壓縮後圖片仍超過 2MB，請換一張較小的圖");
      }
      const cleanFileName = `mealbox_photo_${Date.now()}_${Math.random().toString(36).substring(7)}.webp`;

      const { data, error } = await supabase.storage.from("customizer_uploads").upload(cleanFileName, webpFile, {
        cacheControl: "604800",
        upsert: false,
        contentType: "image/webp",
      });

      if (error) throw error;

      // 取得公開 URL
      const { data: urlData } = supabase.storage.from("customizer_uploads").getPublicUrl(cleanFileName);

      setUploadedPhotoUrl(urlData.publicUrl);

      // 🔧 直接呼叫 toast()
      toast({
        title: "照片上傳成功",
        description: "您的照片已成功上傳",
      });
    } catch (err: any) {
      console.error("照片上傳失敗:", err);
      // 🔧 直接呼叫 toast()
      toast({
        title: "上傳失敗",
        description: err.message || "請稍後再試",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handlePackageStylePhotoRequirementChange = (requiresPhoto: boolean, metadata?: PackageStylePhotoMetadata) => {
    setPackageStyleRequiresPhoto(requiresPhoto);
    setPackageStylePhotoMetadata(metadata || null);
  };

  const saltOptions = getSaltOptions();
  const sweetOptions = getSweetOptions();

  const productName = productId === "box_6" ? "六入餐盒" : "三入餐盒";

  // 計算總價（來自後端 priceApi）
  const mealBoxSubtotal = dessertTotal;
  const packageSubtotal = packageTotalPrice;
  const grandTotal = mealBoxSubtotal + packageSubtotal;

  console.log("[MealBoxCustomizerPage] 價格信息:", { dessertTotal, mealBoxSubtotal, packageTotalPrice, packageSubtotal, grandTotal });

  // 處理 slot 點擊（電腦版）
  const slotSelectorRef = useRef<HTMLDivElement>(null);

  const handleSlotClick = (slotId: string) => {
    setActiveSlot((prev) => (prev === slotId ? null : slotId));
    setTimeout(() => {
      slotSelectorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  };

  const handleSelectItem = (slotId: string, option: DessertOption) => {
    selectItemForSlot(slotId, option);
    setActiveSlot(null);

    // ⭐ 選完後，滾回預覽區
    requestAnimationFrame(() => {
      mealBoxCaptureRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center", // 或 "start"，看你想停哪
      });
    });
  };

  // 處理 AddToCart
  const handleAddToCart = () => {
    if (!allSlotsSelected) {
      toast({
        title: "請完成所有格子的選擇",
        description: `還有 ${slots.filter((s) => !selectedItems[s]).length} 個格子尚未選擇`,
        variant: "destructive",
      });
      return;
    }
    setShowConfirmDialog(true);
  };

  // 確認後執行加入購物車
  const confirmAddToCart = async () => {
    setIsSubmitting(true);
    setIsVerifyingPrice(true);
    setShowConfirmDialog(false);

    try {
      // ✅ 新增：後端價格驗證
      const { calculatePrice } = await import("@/lib/priceApi");
      
      const verifyResponse = await calculatePrice({
        product_id: productId,
        quantity: quantity,
        selected_option_ids: [],
        package_style_id: selectedPackageStyle?.option_id,
      });

      setIsVerifyingPrice(false);

      if (!verifyResponse.success || !verifyResponse.data) {
        toast({
          title: "價格驗證失敗",
          description: "無法驗證訂單價格，請重新嘗試",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }

      const verifiedTotal = verifyResponse.data.breakdown.grand_total;

      // ✅ 驗證前端計算與後端是否一致（允許 1 元誤差）
      if (Math.abs(verifiedTotal - grandTotal) > 1) {
        console.error("[價格驗證失敗]", { verifiedTotal, grandTotal });
        toast({
          title: "價格已更新",
          description: `價格從 NT$${grandTotal.toLocaleString()} 更新為 NT$${verifiedTotal.toLocaleString()}，請重新確認`,
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }

      // 1. 截圖餐盒預覽
      let mealBoxScreenshotUrl: string | null = null;
      if (mealBoxCaptureRef.current) {
        const dataUrl = await toPng(mealBoxCaptureRef.current, { quality: 0.9, skipFonts: true, cacheBust: true });
        const blob = await fetch(dataUrl).then((res) => res.blob());
        const webpFile = await prepareImageForUpload(new File([blob], "mealbox.png", { type: "image/png" }));
        const fileName = `mealbox_${productId}_${Date.now()}.webp`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("customizer_uploads")
          .upload(fileName, webpFile, { contentType: "image/webp" });

        if (uploadError) throw uploadError;
        const { data: publicUrlData } = supabase.storage.from("customizer_uploads").getPublicUrl(uploadData.path);
        mealBoxScreenshotUrl = publicUrlData.publicUrl;
      }

      // 2. 截圖包裝預覽
      let packageScreenshotUrl: string | null = null;
      if (packageCaptureRef.current) {
        const dataUrl = await toPng(packageCaptureRef.current, { quality: 0.9, skipFonts: true, cacheBust: true });
        const blob = await fetch(dataUrl).then((res) => res.blob());
        const webpFile = await prepareImageForUpload(new File([blob], "package.png", { type: "image/png" }));
        const fileName = `package_${productId}_${Date.now()}.webp`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("customizer_uploads")
          .upload(fileName, webpFile, { contentType: "image/webp" });

        if (uploadError) throw uploadError;
        const { data: publicUrlData } = supabase.storage.from("customizer_uploads").getPublicUrl(uploadData.path);
        packageScreenshotUrl = publicUrlData.publicUrl;
      }

      // 3. 組成 customizations（整合餐盒內容 + 包裝設計）
      const customizationsJson = buildCustomizationsJson();

      const customizations: Array<{
        group_name_zh?: string;
        summary?: string;
        value?: string | number | string[] | object;
      }> = [
        {
          group_name_zh: "餐盒內容",
          summary: Object.values(selectedItems)
            .map((item) => item.name)
            .join(", "),
          value: customizationsJson.slots,
        },
        {
          group_name_zh: "包裝款式",
          summary: selectedPackageStyle?.option_name_zh || "預設包裝",
          value: { style_id: selectedPackageStyle?.option_id },
        },
      ];

      if (mealBoxScreenshotUrl) {
        customizations.push({
          group_name_zh: "餐盒預覽圖",
          summary: "已上傳",
          value: { url: mealBoxScreenshotUrl },
        });
      }

      if (packageScreenshotUrl) {
        customizations.push({
          group_name_zh: "包裝預覽圖",
          summary: "已上傳",
          value: { url: packageScreenshotUrl },
        });
      }

      if (uploadedPhotoUrl) {
        customizations.push({
          group_name_zh: "客戶上傳照片",
          summary: "已上傳",
          value: { url: uploadedPhotoUrl },
        });
      }

      // 4. 取得 expected_pickup_date
      const expectedPickupDate = localStorage.getItem("expected_pickup_date") || undefined;

      // 5. 加入購物車（使用驗證後的價格）
      await addToCartCustom({
        product_id: productId,
        name: productName,
        category: "meal_box",
        quantity: quantity,
        price: basePrice,
        total_price: verifiedTotal, // ✅ 使用驗證後的價格
        preview_url: mealBoxScreenshotUrl || undefined,
        customizations,
        expected_pickup_date: expectedPickupDate,
        is_package_design: false,
        linked_item_id: undefined,
      });

      toast({
        title: "已加入購物車",
        description: `${productName} 已成功加入購物車`,
      });

      router.push("/cart");
    } catch (err) {
      console.error("Add to cart error:", err);
      toast({
        title: "加入購物車失敗",
        description: "請稍後再試",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
      setIsVerifyingPrice(false);
    }
  };

  if (mealBoxLoading || packageLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-lg">載入中...</p>
      </div>
    );
  }

  if (mealBoxError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
        <p className="text-lg text-destructive">{mealBoxError}</p>
        <Button onClick={() => router.push("/gift-boxes")}>返回禮盒列表</Button>
      </div>
    );
  }

  // ========== 手機版佈局 ==========
  if (isMobile) {
    return (
      <div className="min-h-screen bg-background pb-32">
        {/* 預覽區（sticky） */}
        <div className="sticky top-16 z-40 bg-card border-b border-border shadow-sm">
          <div className="relative h-[35vh]">
            <div ref={mealBoxCaptureRef} className="w-full h-full">
              <MealBoxPreview slots={slots} selectedItems={selectedItems} />
            </div>

            {/* 價格 Icon 按鈕 */}
            <div className="absolute top-4 right-4 z-50">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowPriceCard(!showPriceCard)}
                className="rounded-full w-12 h-12 bg-white shadow-lg"
              >
                {showPriceCard ? <X size={20} /> : <ShoppingCart size={20} />}
              </Button>

              {!showPriceCard && (
                <div className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground text-xs font-bold rounded-full px-2 py-0.5">
                  ${grandTotal}
                </div>
              )}
            </div>

            {/* 展開的價格卡片 */}
            {showPriceCard && (
              <Card className="absolute top-20 right-4 w-64 p-4 shadow-xl z-50">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">商品</span>
                    <span className="text-base font-semibold">{productName}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-secondary-foreground/70">餐盒內容</span>
                    <span className="text-base">NT$ {mealBoxSubtotal}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-secondary-foreground/70">包裝設計</span>
                    <span className="text-base">NT$ {packageSubtotal}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-secondary-foreground/70">數量</span>
                    <div className="flex items-center gap-2">
                      <Button size="icon" variant="outline" className="h-7 w-7 rounded-full" onClick={decrementQuantity}>
                        <Minus size={14} />
                      </Button>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={localValue}
                        onChange={handleInputChange}
                        onBlur={handleInputBlur}
                        onKeyDown={handleKeyDown}
                        className="w-12 h-7 text-center text-sm font-medium"
                      />
                      <Button size="icon" variant="outline" className="h-7 w-7 rounded-full" onClick={incrementQuantity}>
                        <Plus size={14} />
                      </Button>
                    </div>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-border">
                    <span className="text-base font-bold">總計</span>
                    <span className="text-xl font-bold text-primary">NT$ {grandTotal.toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-secondary-foreground/70 text-center">最低訂購量：{minOrderQty} 組</p>
                </div>
              </Card>
            )}
          </div>
        </div>

        {/* 選項區 */}
        <div className="container py-6">
          {/* ===== 第一部分：餐盒內容選擇 ===== */}
          <h2 className="text-xl font-bold mb-4 text-center">步驟 1：選擇{productName}內容物</h2>

          <div className="grid grid-cols-1 gap-4 mb-8">
            {slots.map((slotId) => (
              <SlotSelector
                key={slotId}
                slotId={slotId}
                saltOptions={saltOptions}
                sweetOptions={sweetOptions}
                selectedItem={selectedItems[slotId]}
                onSelect={(option: DessertOption) => selectItemForSlot(slotId, option)}
              />
            ))}
          </div>

          {/* ===== 第二部分：包裝設計 ===== */}
          <h2 className="text-xl font-bold mb-4 text-center">步驟 2：選擇包裝設計</h2>

          <div className="bg-card rounded-3xl p-6 border-2 border-border shadow-sm mb-6">
            <h3 className="text-lg font-semibold mb-4">包裝款式</h3>
            <PackageStyleSelector
              options={packageStyleOptions}
              selectedOption={selectedPackageStyle}
              onSelect={handlePackageStyleSelect}
              onPhotoRequirementChange={handlePackageStylePhotoRequirementChange}
              productId={productId}
            />
          </div>

          {/* 包裝預覽 */}
          <div className="bg-card rounded-3xl p-4 border-2 border-border shadow-sm mb-6">
            <h3 className="text-lg font-semibold mb-4">包裝預覽</h3>
            <div ref={packageCaptureRef} className="relative h-[180px] flex items-center justify-center">
              <div className="w-full max-w-[200px] h-full">
                <PackagePreviewCanvas
                  selectedPackageStyle={selectedPackageStyle}
                  boxConfig1={null}
                  boxConfig2={null}
                  selectedDecorations={new Set()}
                  decorationOptions={[]}
                  uploadedPhotoUrl={uploadedPhotoUrl}
                  optionsMap={{}}
                  packageStylePhotoMetadata={packageStylePhotoMetadata}
                />
              </div>
            </div>
          </div>

          {/* 照片上傳（條件式顯示） */}
          {packageStyleRequiresPhoto && (
            <div className="bg-card rounded-3xl p-6 border-2 border-border shadow-sm mb-6">
              <h3 className="text-lg font-semibold mb-4">上傳照片</h3>

              <PhotoUploaderButton
                onUpload={handleSimplePhotoUpload}
                isUploading={isUploading}
                hasUploaded={!!uploadedPhotoUrl}
              />

              {/* 提醒文字＋熱鍵連結 */}
              <p className="mt-4 text-sm text-ink-muted leading-relaxed">
                效果僅供預覽，如果照片遭到裁切，請參考格式「
                <a
                  href="https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/psu.webp"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-600 underline underline-offset-2 hover:text-brand-700 font-medium"
                >
                  建議檔案
                </a>
                」
              </p>
            </div>
          )}
        </div>

        {/* Fixed bottom 加入購物車按鈕 */}
        <div className="fixed bottom-0 left-0 right-0 bg-white p-4 border-t shadow-lg z-50">
          <Button
            size="lg"
            onClick={handleAddToCart}
            disabled={!allSlotsSelected || isSubmitting}
            className="w-full h-14 text-lg font-bold"
          >
            {isVerifyingPrice ? "驗證價格中..." : isSubmitting ? "處理中..." : `加入購物車 · NT$ ${grandTotal}`}
          </Button>
        </div>

        {/* 確認對話框 */}
        <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>確認餐盒內容與包裝</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  <p className="font-semibold">餐盒內容：</p>
                  <ul className="list-disc list-inside text-sm">
                    {slots.map((slotId) => (
                      <li key={slotId}>
                        <span className="font-semibold">{slotId}:</span> {selectedItems[slotId]?.name || "未選擇"}
                      </li>
                    ))}
                  </ul>
                  <p className="font-semibold mt-2">包裝款式：</p>
                  <p className="text-sm">{selectedPackageStyle?.option_name_zh || "預設包裝"}</p>
                  <div className="pt-2 border-t">
                    <p>
                      訂購數量：<span className="font-bold">{quantity} 組</span>
                    </p>
                    <p>
                      餐盒小計：<span className="font-bold">NT$ {mealBoxPrice}</span>
                    </p>
                    <p>
                      包裝小計：<span className="font-bold">NT$ {packageTotalPrice}</span>
                    </p>
                    <p>
                      總計：<span className="font-bold text-primary">NT$ {grandTotal}</span>
                    </p>
                  </div>
                  <p className="pt-2 font-medium">送出設計後無法修改，確定要送出嗎？</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={confirmAddToCart}>確認送出</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // ========== 電腦版佈局 ==========
  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8 pb-16">
        <h1 className="text-2xl font-bold mb-6 text-center">{productName}客製化設計</h1>

        <div className="flex flex-col items-center">
          <div className="w-full max-w-4xl">
            {/* ===== 第一部分：餐盒內容選擇 ===== */}
            <div className="mb-12">
              <h2 className="text-xl font-bold mb-4 text-center text-primary">步驟 1：選擇{productName}內容物</h2>

              {/* 截圖區域 - 放大預覽區 */}
              <div
                ref={mealBoxCaptureRef}
                className="bg-card rounded-2xl border-2 border-border shadow-lg p-8 mx-auto"
                style={{ minHeight: "550px", maxWidth: "900px" }}
              >
                <MealBoxPreview
                  slots={slots}
                  selectedItems={selectedItems}
                  activeSlot={activeSlot}
                  onSlotClick={handleSlotClick}
                  isDesktop={true}
                />
              </div>

              {/* 選項卡 */}
              {activeSlot && (
                <div ref={slotSelectorRef} className="mt-6 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="bg-card rounded-2xl border-2 border-primary/30 shadow-xl p-6">
                    <SlotSelector
                      slotId={activeSlot}
                      saltOptions={saltOptions}
                      sweetOptions={sweetOptions}
                      selectedItem={selectedItems[activeSlot]}
                      onSelect={(option: DessertOption) => handleSelectItem(activeSlot, option)}
                      isCompact={false}
                    />
                  </div>
                </div>
              )}

              {/* 進度提示 */}
              <div className="mt-6 text-center">
                <p className="text-sm text-secondary-foreground/70">
                  已選 {Object.keys(selectedItems).length} / {slots.length} 格
                  {!allSlotsSelected && <span className="ml-2 text-amber-600">（點擊格子選擇點心）</span>}
                </p>
              </div>
            </div>

            {/* ===== 第二部分：包裝設計 ===== */}
            <div className="mb-8">
              <h2 className="text-xl font-bold mb-4 text-center text-primary">步驟 2：選擇包裝設計</h2>

              {/* 包裝預覽 */}
              <div className="bg-card p-6 mb-6">
                <div ref={packageCaptureRef} className="relative h-[250px] flex items-center justify-center">
                  <div className="w-full max-w-[280px] h-full">
                    <PackagePreviewCanvas
                      selectedPackageStyle={selectedPackageStyle}
                      boxConfig1={null}
                      boxConfig2={null}
                      selectedDecorations={new Set()}
                      decorationOptions={[]}
                      uploadedPhotoUrl={uploadedPhotoUrl}
                      optionsMap={{}}
                      packageStylePhotoMetadata={packageStylePhotoMetadata}
                    />
                  </div>
                </div>
              </div>

              {/* 包裝款式選擇 */}
              <div className="rounded-2xl p-6 mb-6">
                <h3 className="text-lg font-semibold mb-4">包裝款式</h3>
                <PackageStyleSelector
                  options={packageStyleOptions}
                  selectedOption={selectedPackageStyle}
                  onSelect={handlePackageStyleSelect}
                  onPhotoRequirementChange={handlePackageStylePhotoRequirementChange}
                  productId={productId}
                />
              </div>

              {/* 照片上傳（條件式顯示） */}
              {packageStyleRequiresPhoto && (
                <div className="bg-card rounded-2xl border-2 border-border shadow-sm p-6 mb-6">
                  <h3 className="text-lg font-semibold mb-4">上傳照片</h3>

                  <PhotoUploaderButton
                    onUpload={handleSimplePhotoUpload}
                    isUploading={isUploading}
                    hasUploaded={!!uploadedPhotoUrl}
                  />

                  {/* 提醒文字＋熱鍵連結 */}
                  <p className="mt-4 text-lg font-black text-ink leading-relaxed ">
                    ⚠️效果僅供預覽，如果照片遭到裁切，請參考照片格式指引：
                    <a
                      href="https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/psu.webp"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-600 underline underline-offset-2 hover:text-brand-700 font-medium"
                    >
                      建議格式
                    </a>
                  </p>
                </div>
              )}
            </div>

            {/* ===== 數量選擇器與價格 ===== */}
            <Card className="p-6">
              <div className="space-y-4">
                {/* 標題與單價 */}
                <div>
                  <h3 className="text-lg font-semibold">價格計算區</h3>
                  <p className="text-sm font-semibold text-secondary-foreground/70 mt-1">
                    單價：NT$ {unitPrice.toLocaleString()}元
                  </p>
                </div>

                {/* 數量選擇器（與單價對齐） */}
                <div className="flex items-center gap-3">
                  <span className="text-sm text-secondary-foreground/70">數量：</span>
                  <Button size="icon" variant="outline" className="h-10 w-10 rounded-full" onClick={decrementQuantity}>
                    <Minus size={18} />
                  </Button>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={localValue}
                    onChange={handleInputChange}
                    onBlur={handleInputBlur}
                    onKeyDown={handleKeyDown}
                    className="w-16 h-10 text-center text-lg font-semibold"
                  />
                  <Button size="icon" variant="outline" className="h-10 w-10 rounded-full" onClick={incrementQuantity}>
                    <Plus size={18} />
                  </Button>
                  <span className="text-sm text-secondary-foreground/70">組</span>
                </div>

                {/* 說明文字 */}
                <p className="text-xs text-secondary-foreground/60">
                  每組包含 {slots.length} 個點心 (最低訂購 {minOrderQty} 組)
                </p>
              </div>

              <div className="mt-4 pt-4 border-t space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-secondary-foreground/70">餐盒內容</span>
                  <span>NT$ {mealBoxSubtotal}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-secondary-foreground/70">包裝設計</span>
                  <span>NT$ {packageSubtotal}</span>
                </div>
                <div className="flex justify-between pt-2 border-t">
                  <span className="text-base font-bold">總計</span>
                  <span className="text-2xl font-bold text-primary">NT$ {grandTotal.toLocaleString()}</span>
                </div>
              </div>
            </Card>

            {/* AddToCart 按鈕 */}
            <div className="mt-6">
              <Button
                size="lg"
                onClick={handleAddToCart}
                disabled={!allSlotsSelected || isSubmitting}
                className="w-full h-14 text-lg font-bold rounded-xl"
              >
                {isVerifyingPrice ? "驗證價格中..." : isSubmitting ? "處理中..." : `加入購物車 · NT$ ${grandTotal}`}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* 確認對話框 */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認餐盒內容與包裝</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p className="font-semibold">餐盒內容：</p>
                <ul className="list-disc list-inside text-sm">
                  {slots.map((slotId) => (
                    <li key={slotId}>
                      <span className="font-semibold">{slotId}:</span> {selectedItems[slotId]?.name || "未選擇"}
                    </li>
                  ))}
                </ul>
                <p className="font-semibold mt-2">包裝款式：</p>
                <p className="text-sm">{selectedPackageStyle?.option_name_zh || "預設包裝"}</p>
                <div className="pt-2 border-t">
                  <p>
                    訂購數量：<span className="font-bold">{quantity} 組</span>
                  </p>
                  <p>
                    餐盒小計：<span className="font-bold">NT$ {mealBoxSubtotal}</span>
                  </p>
                  <p>
                    包裝小計：<span className="font-bold">NT$ {packageSubtotal}</span>
                  </p>
                  <p>
                    總計：<span className="font-bold text-primary">NT$ {grandTotal}</span>
                  </p>
                </div>
                <p className="pt-2 font-medium">送出設計後無法修改，確定要送出嗎？</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAddToCart}>確認送出</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
