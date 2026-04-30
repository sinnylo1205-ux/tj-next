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
  /** 給瀏覽器／SEO 的 sizes 提示（直連時無 Next 縮圖，仍可作為未來 srcset 預留） */
  sizes?: string;
}

/**
 * 漸進式圖片載入元件（直連 `src`，不經 `/_next/image`）
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
  sizes,
}: ProgressiveImageProps) => {
  const [isLoaded, setIsLoaded] = useState(priority);
  const [isInView, setIsInView] = useState(priority);
  const imgRef = useRef<HTMLDivElement>(null);

  const aspectRatio =
    aspectRatioProp ??
    (width != null && height != null && height > 0 ? width / height : undefined);

  useEffect(() => {
    if (priority) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
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

  const loading = priority ? "eager" : "lazy";
  const fetchPriority = priority ? "high" : undefined;

  return (
    <div
      ref={imgRef}
      className={cn("relative overflow-hidden bg-transparent", containerClassName)}
      style={containerStyle}
      onClick={onClick}
    >
      {!isLoaded && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-brand-50 via-brand-100 to-brand-50" />
      )}

      {isInView && (
        <img
          src={src}
          alt={alt}
          sizes={sizes}
          loading={loading}
          fetchPriority={fetchPriority}
          decoding="async"
          onLoad={() => setIsLoaded(true)}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-300",
            priority || isLoaded ? "opacity-100" : "opacity-0",
            className,
          )}
        />
      )}
    </div>
  );
};

export default ProgressiveImage;
