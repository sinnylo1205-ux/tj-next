import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface ProgressiveImageProps {
  src: string;
  alt: string;
  className?: string;
  containerClassName?: string;
  /** 預設比例 (width / height)，若同時提供 width/height 則可由此推算 */
  aspectRatio?: number;
  /** 與 height 一併使用可預留空間、減少版面跳動（來自 e.g. website_photo_material.ui_width） */
  width?: number | null;
  /** 與 width 一併使用可預留空間 */
  height?: number | null;
  priority?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

/**
 * 漸進式圖片載入元件
 * - 使用 aspect-ratio 預留空間，避免 Layout Shift
 * - 載入中顯示骨架動畫
 * - 載入完成後淡入顯示
 */
const ProgressiveImage = ({
  src,
  alt,
  className,
  containerClassName,
  aspectRatio: aspectRatioProp,
  width,
  height,
  priority = false,
  onClick,
  style,
}: ProgressiveImageProps) => {
  const [isLoaded, setIsLoaded] = useState(priority);
  const [isInView, setIsInView] = useState(priority);
  const imgRef = useRef<HTMLDivElement>(null);

  // 優先使用傳入的 aspectRatio，否則由 width/height 推算，避免版面跳動
  const aspectRatio =
    aspectRatioProp ??
    (width != null && height != null && height > 0 ? width / height : undefined);

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (priority) return; // 高優先級直接載入

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }, // 提前 200px 開始載入
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, [priority]);

  const containerStyle: React.CSSProperties = {
    ...style,
    ...(aspectRatio ? { aspectRatio: String(aspectRatio) } : {}),
  };

  return (
    <div
      ref={imgRef}
      className={cn("relative overflow-hidden bg-transparent", containerClassName)}
      style={containerStyle}
      onClick={onClick}
    >
      {/* 骨架載入動畫 - 品牌粉 */}
      {!isLoaded && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-brand-50 via-brand-100 to-brand-50" />
      )}

      {/* 實際圖片 - 只有在視窗內才載入 */}
      {isInView && (
        <img
          src={src}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          onLoad={() => setIsLoaded(true)}
          width={width ?? undefined}
          height={height ?? undefined}
          className={cn(
            "w-full h-full object-cover transition-opacity duration-300",
            priority || isLoaded ? "opacity-100" : "opacity-0",
            className,
          )}
        />
      )}
    </div>
  );
};

export default ProgressiveImage;
