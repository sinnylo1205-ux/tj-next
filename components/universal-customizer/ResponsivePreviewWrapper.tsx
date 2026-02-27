// ======================================================================
// ResponsivePreviewWrapper.tsx — 預覽區等比縮放容器
// ======================================================================

import { useEffect, useRef, useState } from "react";

interface ResponsivePreviewWrapperProps {
  children: React.ReactNode;
  designSize?: number; // 設計基準尺寸（預設 500px）
}

export function ResponsivePreviewWrapper({
  children,
  designSize = 500,
}: ResponsivePreviewWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current) return;
      
      const containerWidth = containerRef.current.offsetWidth;
      const newScale = containerWidth / designSize;
      setScale(newScale);
    };

    // 初始化
    updateScale();

    // 監聽視窗大小變化
    const resizeObserver = new ResizeObserver(updateScale);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [designSize]);

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden"
      style={{ aspectRatio: "1/1" }}
    >
      <div
        style={{
          width: designSize,
          height: designSize,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
}
