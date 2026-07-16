// ======================================================================
// PreviewCanvas.tsx — 通用預覽區域（基於 Customizer.tsx）+ 包裝縮圖
// ======================================================================

import { useState, useMemo } from "react";
import type { ProductConfig } from "@/config/product-registry";
import type { ColorOption, FlavorOption } from "@/hooks/useUniversalCustomizer";
import type { DecorationOption } from "@/hooks/useHierarchicalOptions";
import type { SizeOption } from "@/components/universal-customizer/SizeSelector";
import type { PackageStyleOption, BoxConfig, BoxCapacityOption } from "@/hooks/useUniversalPackageCustomizer";
import { useIsMobile } from "@/hooks/use-mobile";
import { Slider } from "@/components/ui/slider";
import { SafeImage } from "@/components/SafeImage";
import { cn } from "@/lib/utils";
import {
  PHOTO_FRAME_CLIP_STYLES,
  photoFrameClipContainerClass,
  photoFrameOuterClipStyle,
  photoFrameShapeStyle,
  type PhotoCarrierType,
} from "@/lib/photo-frame-styles";

interface PreviewCanvasProps {
  config: ProductConfig;
  colorGroups: Map<number, ColorOption[]>;
  selectedColors: Map<number, ColorOption>;
  flavorGroups: Map<number, FlavorOption[]>;
  selectedFlavors: Map<number, FlavorOption>;
  selectedSizes: Map<number, SizeOption>;
  selectedDecorations: Set<number>;
  decorationOptions: DecorationOption[];
  uploadedPhotoUrl: string | null;
  photoFrame: {
    type: "diamond" | "irregular" | "circle" | "square" | "ellipse" | "none";
    position: { x: number; y: number; width: number; height: number };
    rotation?: number;
  } | null;
  optionsMap: Record<number, DecorationOption>;
  isInBranch: (id: number, root: number) => boolean;
  textInputData?: any; // 文字輸入資料（用於渲染文字圖層）
  // ✅ 包裝預覽相關 props
  showPackagePreview?: boolean;
  selectedPackageStyle?: PackageStyleOption | null;
  boxConfig1?: BoxConfig | null;
  boxConfig2?: BoxConfig | null;
  // ✅ 包裝裝飾品
  packageDecorations?: Set<number>;
  packageDecorationOptionsMap?: Record<number, DecorationOption>;
  // ✅ 新增：早期容量選擇（用於在完成配置前渲染盒子預覽）
  earlyCapacitySelection?: BoxCapacityOption | null;
  // ✅ 新增：盒裝預覽圖片 URL（從容量選項獲取）
  boxPreviewImageUrl?: string;
  // ✅ 新增：馬卡龍專用預覽圖片（覆蓋顏色圖層）
  macaronPreviewImage?: string | null;
  /** 用於截圖的隱藏容器時為 true，包裝預覽改為 absolute 以出現在截圖內 */
  forScreenshot?: boolean;
  /**
   * 桌機／iOS 可見預覽也會當 toBlob 目標：與 forScreenshot 同樣強制圖片 eager + 直連原網址，
   * 避免經過任何 proxy 在 svg foreignObject 內光柵化失敗（常見：整片黑、中央黑塊、比例異常）。
   */
  exportCaptureReady?: boolean;
  /** `exportPackage`：僅渲染包裝小圖區（供獨立 toBlob），其餘為互動預覽 */
  renderMode?: "interactive" | "exportPackage";
}

export function PreviewCanvas({
  config,
  selectedColors,
  selectedFlavors,
  selectedSizes,
  selectedDecorations,
  decorationOptions,
  uploadedPhotoUrl,
  photoFrame,
  optionsMap,
  isInBranch,
  textInputData,
  showPackagePreview = false,
  selectedPackageStyle,
  boxConfig1,
  boxConfig2,
  packageDecorations,
  packageDecorationOptionsMap,
  earlyCapacitySelection,
  boxPreviewImageUrl,
  macaronPreviewImage,
  forScreenshot = false,
  exportCaptureReady = false,
  renderMode = "interactive",
}: PreviewCanvasProps) {
  const isMobile = useIsMobile();
  // 📱 手機版：這裡的 scaleFactor 只給「裝飾圖層」用
  // 之前外層有一層 transform: scale(0.85)，移除後等於整體放大了 1/0.85
  // 這裡把手機用的係數從 0.85 降到約 0.72，讓「內層 * 0.72」≈「舊版 內層 * 0.85 * 外層 0.85」
  const scaleFactor = useMemo(() => (isMobile ? 0.72 : 1), [isMobile]);
  const verticalOffset = useMemo(() => (isMobile ? -5 : 0), [isMobile]); // 手機版往上移動 15px

  // ✅ 照片框專用縮放係數（使用產品配置的 mobilePhotoScaleFactor，預設為 1）
  const photoScaleFactor = useMemo(() => {
    // 之前手機版有外層 scale(0.85)，而照片框 baseScale = 0.55
    // 現在拿掉外層 scale，為了維持和舊版接近的實際大小，這裡把 0.55 乘上 0.85 ≈ 0.47
    const baseScale = isMobile ? 0.47 : 1;
    const productPhotoScale = config.mobilePhotoScaleFactor ?? 1;
    return isMobile ? baseScale * productPhotoScale : baseScale;
  }, [isMobile, config.mobilePhotoScaleFactor]);

  // ✅ 照片縮放與位移滑桿狀態（預覽專用，不存儲到購物車）
  const [photoZoomScale, setPhotoZoomScale] = useState(1);
  const [photoOffsetX, setPhotoOffsetX] = useState(0);
  const [photoOffsetY, setPhotoOffsetY] = useState(0);

  // ✅ 包裝預覽放大狀態
  const [isPackagePreviewEnlarged, setIsPackagePreviewEnlarged] = useState(false);

  /** 截圖／匯出用：強制 eager + 原 src，利於 html-to-image */
  const captureImgProps =
    forScreenshot || renderMode === "exportPackage" || exportCaptureReady
      ? ({
          priority: true,
          loading: "eager" as const,
          decoding: "sync" as const,
        })
      : {};

  // ==================== 渲染單一圖層 ====================
  const renderLayer = (layer: ProductConfig["layerStack"][0], index: number) => {
    const { type, rootId, zIndex, name, fallbackUrl } = layer;

    // 1️⃣ 顏色圖層（來自 MO，需要 scale-[0.8] translate-y-[5%]）
    if (type === "color") {
      // ✅ 馬卡龍專用：使用 macaronPreviewImage 覆蓋
      const selectedOption = selectedColors.get(rootId);
      const imageUrl = macaronPreviewImage || selectedOption?.image_url || fallbackUrl;

      if (!imageUrl) {
        return null;
      }

      return (
        <SafeImage
          key={`${type}-${rootId}-${index}`}
          src={imageUrl}
          alt={name}
          fill
          crossOrigin="anonymous"
          {...captureImgProps}
          className="absolute inset-0 object-contain scale-[0.8] translate-y-[5%]"
          style={{ zIndex }}
          sizes="400px"
        />
      );
    }

    // 2️⃣ 口味圖層（來自 MO，需要 scale-[0.8] translate-y-[5%]）
    if (type === "flavor") {
      const selectedOption = selectedFlavors.get(rootId);
      const imageUrl = selectedOption?.image_url || fallbackUrl;

      return (
        <SafeImage
          key={`${type}-${rootId}-${index}`}
          src={imageUrl}
          alt={name}
          fill
          crossOrigin="anonymous"
          {...captureImgProps}
          className="absolute inset-0 object-contain scale-[0.8] translate-y-[5%]"
          style={{ zIndex }}
          sizes="400px"
        />
      );
    }

    // 2.5️⃣ 尺寸圖層（來自 PO item_image_url，使用 metadata_product 的絕對定位）
    if (type === "size") {
      const selectedOption = selectedSizes.get(rootId);
      const imageUrl = selectedOption?.image_url;

      if (!imageUrl) {
        return null;
      }

      return (
        <SafeImage
          key={`size-${rootId}-${index}`}
          src={imageUrl}
          alt={name}
          fill
          crossOrigin="anonymous"
          {...captureImgProps}
          className="absolute inset-0 object-contain"
          style={{ zIndex }}
          sizes="400px"
        />
      );
    }

    // 2.6️⃣ 形狀圖層（餅乾專用，來自 MO）
    if (type === "shape") {
      const selectedOption = selectedSizes.get(rootId);
      const imageUrl = selectedOption?.image_url;

      if (!imageUrl) {
        return null;
      }

      return (
        <SafeImage
          key={`shape-${rootId}-${index}`}
          src={imageUrl}
          alt={name}
          fill
          crossOrigin="anonymous"
          {...captureImgProps}
          className="absolute inset-0 object-contain"
          style={{ zIndex }}
          sizes="400px"
        />
      );
    }

    // 2.7️⃣ 文字圖層（cupcake_choco 專用，固定圖片）
    if (type === "text") {
      // 只有當有文字輸入資料時才渲染
      if (!textInputData) return null;

      const textImageUrl =
        "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/choco-color/text2.png";

      return (
        <SafeImage
          key={`text-${index}`}
          src={textImageUrl}
          alt="文字裝飾"
          fill
          crossOrigin="anonymous"
          {...captureImgProps}
          className="
            absolute inset-0
            object-contain
            scale-[0.3] translate-y-[6%]
            md:scale-[0.5] md:translate-y-[5%]
          "
          style={{ zIndex }}
          sizes="400px"
        />
      );
    }

    // 3️⃣ 裝飾品圖層（來自 PO，使用 metadata_product 的絕對定位）
    if (type === "decoration") {
      const selected = Array.from(selectedDecorations).filter((id) => isInBranch(id, rootId));

      return (
        <div key={`${type}-${rootId}-${index}`} className="absolute inset-0" style={{ zIndex }}>
          {selected.map((id) => {
            const option = optionsMap[id];
            if (!option?.item_image_url) return null;

            const meta = option.metadata_product;
            const hasPosition = meta?.ui_x !== undefined && meta?.ui_y !== undefined;
            const verticalOffset = isMobile ? -5 : 0; // 手機版往上移動 15px
            const mobileScale = isMobile ? 0.75 : 1;
            const finalScale = scaleFactor * mobileScale;

            return (
              <SafeImage
                key={id}
                src={option.item_image_url}
                alt={option.option_name_zh}
                width={meta?.ui_width || 100}
                height={meta?.ui_height || 100}
                crossOrigin="anonymous"
                {...captureImgProps}
                className="absolute"
                style={{
                  left: "50%",
                  top: "50%",
                  width: `${(meta?.ui_width || 100) * finalScale}px`,
                  height: `${(meta?.ui_height || 100) * finalScale}px`,
                  transform: `translate(
                  ${(meta?.ui_x || 0) * finalScale}px,
                  ${(meta?.ui_y || 0) * finalScale + verticalOffset}px
                ) rotate(${meta?.rotation || 0}deg)`,
                  transformOrigin: "center",
                }}
                sizes="200px"
              />
            );
          })}
        </div>
      );
    }

    // 4️⃣ 照片框架圖層（來自 PO，使用 metadata_product 的絕對定位）
    // ✅ 支援單一 option 搭配 photo_frames 陣列渲染多個照片框
    if (type === "photo") {
      // ✅ 找到需要照片上傳的裝飾品選項
      const selectedPhotoOption = Array.from(selectedDecorations).find((optionId) => {
        const option = optionsMap[optionId];
        return option?.metadata_product?.requires_photo_upload;
      });

      if (!selectedPhotoOption) return null;

      const option = optionsMap[selectedPhotoOption];
      if (!option) return null;

      const meta = option.metadata_product || {};

      // ✅ 檢查是否有 photo_frames 陣列（多照片框模式）
      const photoFrames = meta.photo_frames as
        | Array<{
            ui_x: number;
            ui_y: number;
            ui_width: number;
            ui_height: number;
            rotation?: number;
            photo_carrier_type?: string;
          }>
        | undefined;

      // ✅ 框架樣式映射（新增 flag、ellipse 類型）
      const frameStyles = PHOTO_FRAME_CLIP_STYLES;

      // ✅ 多照片框模式：使用 photo_frames 陣列
      if (photoFrames && photoFrames.length > 0) {
        return (
          <div key={`${type}-${index}`} className="absolute inset-0" style={{ zIndex }}>
            {photoFrames.map((frame, frameIndex) => {
              const frameType = (frame.photo_carrier_type ?? "none") as PhotoCarrierType;

              return (
                <div
                  key={`photo-frame-${frameIndex}`}
                  className={cn(
                    "absolute flex items-center justify-center",
                    photoFrameClipContainerClass(frameType),
                  )}
                  style={{
                    left: "50%",
                    top: "50%",
                    width: `${(frame.ui_width || 100) * photoScaleFactor}px`,
                    height: `${(frame.ui_height || 100) * photoScaleFactor}px`,
                    transform: `translate(${(frame.ui_x || 0) * photoScaleFactor}px, ${(frame.ui_y || 0) * photoScaleFactor + verticalOffset}px)`,
                    transformOrigin: "center",
                    rotate: `${frame.rotation || 0}deg`,
                    ...photoFrameOuterClipStyle(frameType, frameStyles),
                    ...photoFrameShapeStyle(frameType),
                  }}
                >
                  {uploadedPhotoUrl ? (
                    <div className="relative h-full w-full">
                      <SafeImage
                        src={uploadedPhotoUrl}
                        alt={`上傳的照片 ${frameIndex + 1}`}
                        fill
                        crossOrigin="anonymous"
                        {...captureImgProps}
                        className="object-contain object-center"
                        style={{
                          backgroundColor: frameType === "none" ? "transparent" : "white",
                          border: frameType === "none" ? "none" : "1px solid white",
                          transform: `scale(${photoZoomScale}) translate(${photoOffsetX}px, ${photoOffsetY}px)`,
                          transformOrigin: "center center", // ✅ 確保從中心縮放
                        }}
                        sizes="200px"
                      />
                    </div>
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center text-xs text-muted-foreground"
                      style={{
                        border: "2px dashed #ffc0cb",
                        backgroundColor: frameType === "none" ? "transparent" : "rgba(255,255,255,0.9)",
                      }}
                    >
                      LOGO
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      }

      // ✅ 單照片框模式（原有邏輯）- 加入 flag 支援 + 響應式修正
      const frameType = (meta.photo_carrier_type ?? "none") as PhotoCarrierType;

      // ✅ 計算響應式尺寸和位置（使用 photoScaleFactor 以支援產品專屬縮放）
      const isFlag = frameType === "flag";
      const poleWidth = 8 * photoScaleFactor; // 旗桿寬度
      const poleGap = 4 * photoScaleFactor; // 旗桿與照片間距
      // 🔹 原始尺寸（所有 frame 共用，不能動）
      const baseWidth = (meta?.ui_width || 100) * photoScaleFactor;
      const baseHeight = (meta?.ui_height || 100) * photoScaleFactor;

      // 🔹 flag 專用比例（只影響 flag）
      const FLAG_WIDTH_RATIO = 1.4; // 越大越橫
      const FLAG_HEIGHT_RATIO = 0.85; // 越小越扁

      // 🔹 最終使用尺寸
      const photoWidth = isFlag ? baseWidth * FLAG_WIDTH_RATIO : baseWidth;
      const frameHeight = isFlag ? baseHeight * FLAG_HEIGHT_RATIO : baseHeight;

      const containerWidth = isFlag ? photoWidth + poleWidth + poleGap : photoWidth;

      // ✅ flag 類型需要往左偏移，讓旗桿有空間顯示
      const frameX = (meta?.ui_x || 0) * photoScaleFactor - (isFlag ? (poleWidth + poleGap) / 2 : 0);
      const frameY = (meta?.ui_y || 0) * photoScaleFactor + verticalOffset;

      return (
        <div
          key={`${type}-${index}`}
          className="absolute" // ✅ 移除 overflow-hidden，讓旗桿可見
          style={{
            zIndex,
            left: "50%",
            top: "50%",
            width: `${containerWidth}px`,
            height: isFlag ? `${frameHeight * 1.25}px` : `${frameHeight}px`,
            transform: `translate(${frameX}px, ${frameY}px)`,
            transformOrigin: "center",
            rotate: `${meta?.rotation || 0}deg`,
          }}
        >
          {/* ✅ 旗桿：現在在容器內部左側，不會被裁切 */}
          {isFlag && (
            <div
              style={{
                position: "absolute",
                left: 0, // ✅ 容器左側
                top: 0,
                width: `${poleWidth}px`,
                height: "100%",
                backgroundColor: "#eddbb8",
                borderRadius: "4px",
                zIndex: 1,
              }}
            />
          )}

          {/* 照片區域 - overflow-hidden；circle／ellipse／square 用圓角裁切取代 img 上 clip-path */}
          <div
            className={cn("relative", photoFrameClipContainerClass(frameType))}
            style={{
              position: "absolute",
              left: isFlag ? `${poleWidth + poleGap}px` : 0, // ✅ 照片在旗桿右側
              top: 0,
              width: `${photoWidth}px`,
              height: `${frameHeight}px`,
              ...photoFrameOuterClipStyle(frameType, frameStyles),
              ...photoFrameShapeStyle(frameType),
              backgroundColor: frameType === "none" ? "transparent" : "white",
              border: frameType === "none" ? "none" : "1px solid white",
            }}
          >
            {uploadedPhotoUrl ? (
              <div className="relative h-full w-full">
                <SafeImage
                  src={uploadedPhotoUrl}
                  alt="上傳的照片"
                  fill
                  crossOrigin="anonymous"
                  {...captureImgProps}
                  className="object-contain object-center"
                  style={{
                    transform: `scale(${photoZoomScale}) translate(${photoOffsetX}px, ${photoOffsetY}px)`,
                    transformOrigin: "center center",
                  }}
                  sizes="200px"
                />
              </div>
            ) : (
              <div
                className="w-full h-full flex items-center justify-center text-xs text-muted-foreground"
                style={{
                  border: "2px dashed #ffc0cb",
                  backgroundColor: frameType === "none" ? "transparent" : "rgba(255,255,255,0.9)",
                }}
              >
                照片放置處
              </div>
            )}
          </div>
        </div>
      );
    }

    return null;
  };

  // ==================== 主渲染 ====================

  // 判斷是否為盒裝（option_id = 7030）
  const isBoxedStyle = selectedPackageStyle?.option_id === 7030;

  // ✅ 包裝預覽圖片：優先使用已確認的配置，其次使用早期容量選擇的預覽圖
  const packagePreviewImage = isBoxedStyle
    ? boxConfig1?.color.item_image_url || boxPreviewImageUrl || null
    : selectedPackageStyle?.item_image_url;

  // 獲取包裝裝飾品圖片
  const packageDecorationImages =
    packageDecorations && packageDecorationOptionsMap
      ? Array.from(packageDecorations)
          .map((id) => packageDecorationOptionsMap[id])
          .filter((opt) => opt?.item_image_url)
      : [];

  // ✅ 處理包裝預覽點擊/hover
  const handlePackagePreviewClick = () => {
    if (isMobile) {
      setIsPackagePreviewEnlarged(!isPackagePreviewEnlarged);
    }
  };

  if (renderMode === "exportPackage") {
    if (!showPackagePreview) return null;
    return (
      <div className="relative flex h-full w-full min-h-[72px] flex-col overflow-hidden rounded-lg border border-border bg-white shadow-md">
        <div className="relative min-h-0 flex-1">
          {packagePreviewImage ? (
            <SafeImage
              src={packagePreviewImage}
              alt="包裝預覽"
              crossOrigin="anonymous"
              {...captureImgProps}
              fill
              className="object-contain p-1"
              sizes="200px"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center p-1 text-center text-[9px] text-muted-foreground">
              {isBoxedStyle ? "選擇盒子" : "選擇包裝"}
            </div>
          )}
          {packageDecorationImages.map((opt, idx) => {
            const meta = opt.metadata_product as
              | {
                  ui_x?: number;
                  ui_y?: number;
                  ui_width?: number;
                  ui_height?: number;
                  rotation?: number;
                }
              | undefined;
            if (meta && (meta.ui_x !== undefined || meta.ui_y !== undefined)) {
              return (
                <SafeImage
                  key={opt.option_id}
                  src={opt.item_image_url}
                  alt={opt.option_name_zh}
                  width={100}
                  height={100}
                  crossOrigin="anonymous"
                  {...captureImgProps}
                  className="absolute object-contain"
                  style={{
                    left: meta.ui_x !== undefined ? `${meta.ui_x}%` : "0%",
                    top: meta.ui_y !== undefined ? `${meta.ui_y}%` : "0%",
                    width: meta.ui_width ? `${meta.ui_width}%` : "auto",
                    height: meta.ui_height ? `${meta.ui_height}%` : "auto",
                    transform: meta.rotation ? `rotate(${meta.rotation}deg)` : undefined,
                    zIndex: 101 + idx,
                  }}
                  sizes="100px"
                />
              );
            }
            return (
              <SafeImage
                key={opt.option_id}
                src={opt.item_image_url}
                alt={opt.option_name_zh}
                fill
                crossOrigin="anonymous"
                {...captureImgProps}
                className="absolute inset-0 object-contain p-1"
                style={{ zIndex: 101 + idx }}
                sizes="140px"
              />
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        data-capture-exclude
        className="
    absolute z-[999] pointer-events-none
    font-medium text-ink-muted

    /* 桌機：置中上方 */
    left-1/2 -translate-x-1/2
    top-6 text-lg whitespace-nowrap text-center

    /* 手機：右上角 */
    max-md:left-auto
    max-md:right-3
    max-md:top-10
    max-md:translate-x-0
    max-md:text-right
    max-md:text-xs
    max-md:leading-tight
    max-md:w-[70%]
  "
      >
        裝飾品僅供示意，實際樣式隨機出貨
        <span className="block opacity-80">（可參考縮圖樣式）</span>
      </div>

      {/* 根據 layerStack 動態渲染所有圖層 */}
      {(config?.layerStack ?? []).map((layer, index) => {
        const rendered = renderLayer(layer, index);
        return rendered;
      })}

      {/* ✅ 照片縮放滑桿（僅當有上傳照片時顯示）*/}
      {uploadedPhotoUrl && (
        <div
          data-capture-exclude
          className="
      absolute z-[70]
      bg-white/30 backdrop-blur-sm rounded-lg shadow-md
      flex gap-2

      /* ================= 手機版（預設） ================= */
      top-8 left-2
      scale-[0.95]
      origin-top-left
      p-1

      /* ================= 桌機版（md↑） ================= */
      md:top-1/4 md:-translate-y-1/2
      md:left-auto md:right-4
      md:scale-110
      md:p-2 md:gap-3
      md:origin-top-right
    "
          style={{ height: isMobile ? "100px" : "140px" }}
        >
          {/* X 軸位移 */}
          <div className="flex flex-col items-center gap-1 h-full">
            <span className="text-[10px] text-muted-foreground">X</span>
            <Slider
              orientation="vertical"
              value={[photoOffsetX]}
              onValueChange={([v]) => setPhotoOffsetX(v)}
              min={-30}
              max={30}
              step={1}
              className="flex-1"
            />
          </div>

          {/* Y 軸位移 */}
          <div className="flex flex-col items-center gap-1 h-full">
            <span className="text-[10px] text-muted-foreground">Y</span>
            <Slider
              orientation="vertical"
              value={[photoOffsetY]}
              onValueChange={([v]) => setPhotoOffsetY(v)}
              min={-30}
              max={30}
              step={1}
              className="flex-1"
            />
          </div>

          {/* 縮放 */}
          <div className="flex flex-col items-center gap-1 h-full">
            <span className="text-[10px] text-muted-foreground">縮放</span>
            <Slider
              orientation="vertical"
              value={[photoZoomScale]}
              onValueChange={([v]) => setPhotoZoomScale(v)}
              min={0.5}
              max={2}
              step={0.1}
              className="flex-1"
            />
          </div>

          {/* 重置按鈕 */}
          <button
            onClick={() => {
              setPhotoOffsetX(0);
              setPhotoOffsetY(0);
              setPhotoZoomScale(1);
            }}
            className="text-[10px] text-muted-foreground hover:text-primary self-end pb-1"
          >
            重置
          </button>
        </div>
      )}

      {/* ✅ 包裝預覽縮圖（右下角）- 支援 hover 放大（桌面）和點擊放大（手機）；截圖時用 absolute 以入鏡；主預覽 toBlob 用 filter 排除 */}
      {showPackagePreview && (
        <div
          data-capture-exclude
          className={`
            border border-border rounded-lg overflow-hidden bg-white/90 shadow-md flex flex-col
            transition-all duration-300 ease-in-out cursor-pointer
            absolute
            ${
              forScreenshot
                ? "bottom-4 right-2 w-[70px] h-[70px] z-[100]"
                : isPackagePreviewEnlarged
                  ? "bottom-4 right-4 w-[180px] h-[180px] z-40"
                  : isMobile
                    ? "bottom-6 right-2 w-[70px] h-[70px] z-40"
                    : "bottom-6 right-2 w-[140px] h-[140px] z-40 hover:w-[280px] hover:h-[280px] hover:z-40"
            }
          `}
          onClick={forScreenshot ? undefined : handlePackagePreviewClick}
          onMouseEnter={forScreenshot ? undefined : () => !isMobile && setIsPackagePreviewEnlarged(true)}
          onMouseLeave={forScreenshot ? undefined : () => !isMobile && setIsPackagePreviewEnlarged(false)}
        >
          {/* 包裝主圖 */}
          <div className="flex-1 relative">
            {packagePreviewImage ? (
              <SafeImage
                src={packagePreviewImage}
                alt="包裝預覽"
                crossOrigin="anonymous"
                {...captureImgProps}
                fill
                className="object-contain p-1"
                sizes="200px"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">
                {isBoxedStyle ? "選擇盒子容量" : "選擇包裝"}
              </div>
            )}
            {/* 包裝裝飾品疊加（支援 metadata_product 位置） */}
            {packageDecorationImages.map((opt, idx) => {
              const meta = opt.metadata_product as
                | {
                    ui_x?: number;
                    ui_y?: number;
                    ui_width?: number;
                    ui_height?: number;
                    rotation?: number;
                  }
                | undefined;

              // 如果有 metadata_product 位置資訊，使用絕對定位
              if (meta && (meta.ui_x !== undefined || meta.ui_y !== undefined)) {
                return (
                  <SafeImage
                    key={opt.option_id}
                    src={opt.item_image_url}
                    alt={opt.option_name_zh}
                    width={100}
                    height={100}
                    crossOrigin="anonymous"
                    {...captureImgProps}
                    className="absolute object-contain"
                    style={{
                      left: meta.ui_x !== undefined ? `${meta.ui_x}%` : "0%",
                      top: meta.ui_y !== undefined ? `${meta.ui_y}%` : "0%",
                      width: meta.ui_width ? `${meta.ui_width}%` : "auto",
                      height: meta.ui_height ? `${meta.ui_height}%` : "auto",
                      transform: meta.rotation ? `rotate(${meta.rotation}deg)` : undefined,
                      zIndex: 101 + idx,
                    }}
                    sizes="100px"
                  />
                );
              }

              // 沒有位置資訊，使用預設填滿
              return (
                <SafeImage
                  key={opt.option_id}
                  src={opt.item_image_url}
                  alt={opt.option_name_zh}
                  fill
                  crossOrigin="anonymous"
                  {...captureImgProps}
                  className="absolute inset-0 object-contain p-1"
                  style={{ zIndex: 101 + idx }}
                  sizes="140px"
                />
              );
            })}
          </div>
          <div className="bg-black/50 text-white text-[10px] text-center py-0.5">
            {isMobile ? (isPackagePreviewEnlarged ? "點擊縮小" : "點擊放大") : "包裝"}
          </div>
        </div>
      )}
    </>
  );
}
