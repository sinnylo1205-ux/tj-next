import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface ProgressiveImageProps {
  src: string;
  alt: string;
  className?: string;
  containerClassName?: string;
  aspectRatio?: number; // 預設比例 (width / height)
  priority?: boolean; // 是否高優先載入
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
  aspectRatio,
  priority = false,
  onClick,
  style,
}: ProgressiveImageProps) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const imgRef = useRef<HTMLDivElement>(null);

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
      {/* 骨架載入動畫 */}
      {!isLoaded && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-muted via-muted-foreground/10 to-muted" />
      )}

      {/* 實際圖片 - 只有在視窗內才載入 */}
      {isInView && (
        <img
          src={src}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          onLoad={() => setIsLoaded(true)}
          className={cn(
            "w-full h-full object-cover transition-opacity duration-300",
            isLoaded ? "opacity-100" : "opacity-0",
            className,
          )}
        />
      )}
    </div>
  );
};

export default ProgressiveImage;
