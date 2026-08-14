// ======================================================================
// PackagePreviewCanvas.tsx — 包裝預覽畫布
// ======================================================================

import type { PackageStyleOption, BoxConfig } from "@/hooks/useUniversalPackageCustomizer";
import type { DecorationOption } from "@/hooks/useHierarchicalOptions";
import type { PackageStylePhotoMetadata } from "@/components/universal-customizer/PackageStyleSelector";
import { SafeImage } from "@/components/SafeImage";
import { cn } from "@/lib/utils";
import {
  PHOTO_FRAME_CLIP_STYLES,
  photoFrameClipContainerClass,
  photoFrameOuterClipStyle,
  photoFrameShadowStyle,
  photoFrameShapeStyle,
} from "@/lib/photo-frame-styles";

interface PackagePreviewCanvasProps {
  selectedPackageStyle: PackageStyleOption | null;
  boxConfig1: BoxConfig | null;
  boxConfig2: BoxConfig | null;
  selectedDecorations: Set<number>;
  decorationOptions: DecorationOption[];
  uploadedPhotoUrl?: string | null;
  optionsMap: Record<number, DecorationOption>;
  // 新增：包裝款式的照片 metadata
  packageStylePhotoMetadata?: PackageStylePhotoMetadata | null;
}

export function PackagePreviewCanvas({
  selectedPackageStyle,
  boxConfig1,
  boxConfig2,
  selectedDecorations,
  decorationOptions,
  uploadedPhotoUrl,
  optionsMap,
  packageStylePhotoMetadata,
}: PackagePreviewCanvasProps) {
  // 篩選出已選擇的裝飾品
  const selectedDecorItems = Array.from(selectedDecorations)
    .map((id) => optionsMap[id])
    .filter((opt) => opt && opt.is_final_option);

  // 判斷是否需要渲染照片框（來自裝飾品或包裝款式）
  const photoCarrierFromDecoration = selectedDecorItems.find((decor) => {
    const metadata = decor.metadata_product as {
      requires_photo_upload?: boolean;
    } | null;
    return metadata?.requires_photo_upload;
  });

  // 優先使用裝飾品的 metadata，否則使用包裝款式的 metadata
  // ✅ 修復：只要 packageStylePhotoMetadata 存在就使用（不需要檢查 requires_photo_upload）
  const activePhotoMetadata = photoCarrierFromDecoration
    ? (photoCarrierFromDecoration.metadata_product as PackageStylePhotoMetadata)
    : packageStylePhotoMetadata || null;

  return (
    <div className="relative w-full aspect-square bg-gradient-to-br from-background to-secondary rounded-3xl overflow-hidden border-2 border-secondary/40 shadow-lg">
      {/* 包裝容器層（z-10） */}
      <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 10 }}>
        {selectedPackageStyle?.option_id === 7030 ? (
          // 盒裝：規格一置中放大，規格二縮小於右下角
          <>
            {boxConfig1 && (
              <div className="absolute inset-0">
                <SafeImage
                  src={boxConfig1.color.item_image_url}
                  alt={`${boxConfig1.capacity.option_name_zh} - ${boxConfig1.color.option_name_zh}`}
                  fill
                  className="object-contain p-8"
                  sizes="50vw"
                />
              </div>
            )}
            {boxConfig2 && (
              <div className="absolute bottom-4 right-4 h-1/3 w-1/3">
                <SafeImage
                  src={boxConfig2.color.item_image_url}
                  alt={`${boxConfig2.capacity.option_name_zh} - ${boxConfig2.color.option_name_zh}`}
                  fill
                  className="object-contain"
                  sizes="25vw"
                />
              </div>
            )}
          </>
        ) : (
          // 預設包裝：顯示單張預設包裝圖
          selectedPackageStyle?.item_image_url && (
            <div className="relative h-full w-full">
              <SafeImage
                src={selectedPackageStyle.item_image_url}
                alt={selectedPackageStyle.option_name_zh}
                fill
                className="object-contain p-8"
                sizes="50vw"
              />
            </div>
          )
        )}
      </div>

      {/* 裝飾品層（z-20） */}
      <div className="absolute inset-0" style={{ zIndex: 20 }}>
        {selectedDecorItems.map((decor) => {
          const metadata = decor.metadata_product as {
            ui_x?: number;
            ui_y?: number;
            ui_width?: number;
            ui_height?: number;
            rotation?: number;
            requires_photo_upload?: boolean;
            photo_carrier_type?: "diamond" | "square" | "circle" | "ellipse" | "irregular" | "none";
          } | null;

          // 跳過需要照片上傳的裝飾品（在照片層渲染）
          if (metadata?.requires_photo_upload) return null;

          if (!decor.item_image_url) return null;

          const dw = metadata?.ui_width ?? 100;
          const dh = metadata?.ui_height ?? 100;
          return (
            <SafeImage
              key={decor.option_id}
              src={decor.item_image_url}
              alt={decor.option_name_zh}
              width={dw}
              height={dh}
              className="absolute max-h-none max-w-none object-contain"
              style={{
                left: metadata?.ui_x ? `calc(50% + ${metadata.ui_x}px)` : "50%",
                top: metadata?.ui_y ? `calc(50% + ${metadata.ui_y}px)` : "50%",
                width: metadata?.ui_width ? `${metadata.ui_width}px` : undefined,
                height: metadata?.ui_height ? `${metadata.ui_height}px` : undefined,
                transform: `translate(-50%, -50%) rotate(${metadata?.rotation || 0}deg)`,
              }}
              sizes="200px"
            />
          );
        })}
      </div>

      {/* 照片層（z-30）- 來自裝飾品或包裝款式的照片框 */}
      {activePhotoMetadata && (
        <div
          className="absolute flex items-center justify-center overflow-hidden"
          style={{
            zIndex: 30,
            left: activePhotoMetadata.ui_x ? `calc(50% + ${activePhotoMetadata.ui_x}px)` : "50%",
            top: activePhotoMetadata.ui_y ? `calc(50% + ${activePhotoMetadata.ui_y}px)` : "50%",
            width: activePhotoMetadata.ui_width ? `${activePhotoMetadata.ui_width}px` : "200px",
            height: activePhotoMetadata.ui_height ? `${activePhotoMetadata.ui_height}px` : "200px",
            transform: `translate(-50%, -50%) rotate(${activePhotoMetadata.rotation || 0}deg)`,
          }}
        >
          {(() => {
            const frameType = activePhotoMetadata.photo_carrier_type ?? "none";
            const frameStyles = PHOTO_FRAME_CLIP_STYLES;

            return (
              <div className="relative h-full w-full" style={photoFrameShadowStyle(frameType)}>
                {uploadedPhotoUrl ? (
                  <div
                    className={cn("relative h-full w-full", photoFrameClipContainerClass(frameType))}
                    style={{
                      ...photoFrameOuterClipStyle(frameType, frameStyles),
                      ...photoFrameShapeStyle(frameType),
                      backgroundColor: frameType === "none" ? "transparent" : "white",
                      border: frameType === "none" ? "none" : "2px solid white",
                    }}
                  >
                    <SafeImage
                      src={uploadedPhotoUrl}
                      alt="上傳的照片"
                      fill
                      className="object-contain object-center"
                      sizes="200px"
                    />
                  </div>
                ) : (
                  <div
                    className={cn(
                      "flex h-full w-full items-center justify-center text-xs text-secondary-foreground/70",
                      photoFrameClipContainerClass(frameType),
                    )}
                    style={{
                      ...photoFrameOuterClipStyle(frameType, frameStyles),
                      ...photoFrameShapeStyle(frameType),
                      border: "2px dashed #ffc0cb",
                      backgroundColor: frameType === "none" ? "transparent" : "rgba(255,255,255,0.9)",
                    }}
                  >
                    照片放置處
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* 預覽提示文字 */}
      {!selectedPackageStyle && (
        <div className="absolute inset-0 flex items-center justify-center text-secondary-foreground/70">
          <p className="text-center text-lg">請選擇包裝款式</p>
        </div>
      )}
    </div>
  );
}
