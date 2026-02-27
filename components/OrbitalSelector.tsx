// ======================================================================
// OrbitalSelector.tsx — 偽3D軌道選擇器組件
// ======================================================================

import { useState, useMemo, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface OrbitalItem {
  id: string;
  name: string;
  imageUrl: string;
  hoverImageUrl?: string | null;
}

interface OrbitalSelectorProps {
  items: OrbitalItem[];
  onSelect: (item: OrbitalItem) => void;
  /** 橢圓軌道的水平半徑（px） */
  radiusX?: number;
  /** 橢圓軌道的垂直半徑（px）- 控制深度感 */
  radiusY?: number;
  /** 容器高度 */
  height?: number;
  /** 選中項目的最大縮放 */
  maxScale?: number;
  /** 最遠項目的最小縮放 */
  minScale?: number;
  /** 最遠項目的最小透明度 */
  minOpacity?: number;
  /** 隱藏內建控制按鈕 */
  hideControls?: boolean;
  /** 外部控制 - 向左旋轉回調 */
  onRotateLeftRef?: React.MutableRefObject<(() => void) | null>;
  /** 外部控制 - 向右旋轉回調 */
  onRotateRightRef?: React.MutableRefObject<(() => void) | null>;
}

export function OrbitalSelector({
  items,
  onSelect,
  radiusX = 280,
  radiusY = 80,
  height = 400,
  maxScale = 1.2,
  minScale = 0.5,
  minOpacity = 0.4,
  hideControls = false,
  onRotateLeftRef,
  onRotateRightRef,
}: OrbitalSelectorProps) {
  // 角度偏移（弧度），控制軌道旋轉
  const [angleOffset, setAngleOffset] = useState(0);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const itemCount = items.length;

  // 旋轉步進角度
  const stepAngle = (2 * Math.PI) / itemCount;

  // 順時針旋轉（向右）
  const rotateRight = useCallback(() => {
    setAngleOffset((prev) => prev + stepAngle);
  }, [stepAngle]);

  // 逆時針旋轉（向左）
  const rotateLeft = useCallback(() => {
    setAngleOffset((prev) => prev - stepAngle);
  }, [stepAngle]);

  // 暴露控制函數給外部
  if (onRotateLeftRef) {
    onRotateLeftRef.current = rotateLeft;
  }
  if (onRotateRightRef) {
    onRotateRightRef.current = rotateRight;
  }

  // 計算每個項目的位置、縮放、透明度和 z-index
  const positionedItems = useMemo(() => {
    return items.map((item, index) => {
      // 每個項目的基礎角度（均勻分布）
      // 底部中心為 π/2 (90度)，這樣 active 項目會在底部
      const baseAngle = (index * 2 * Math.PI) / itemCount + Math.PI / 2;
      const angle = baseAngle + angleOffset;

      // 使用 sin/cos 計算橢圓軌道位置
      // x: 水平位置（使用 sin 讓底部中心為 0）
      // y: 垂直位置（使用 cos 讓底部為正值，頂部為負值）
      const x = Math.sin(angle) * radiusX;
      const y = -Math.cos(angle) * radiusY;

      // 深度感：底部（y 大）的項目更近，頂部（y 小）的項目更遠
      // 將 y 從 [-radiusY, radiusY] 映射到 [0, 1]
      const depthFactor = (y + radiusY) / (2 * radiusY);

      // 縮放：越近越大
      const scale = minScale + depthFactor * (maxScale - minScale);

      // 透明度：越近越不透明
      const opacity = minOpacity + depthFactor * (1 - minOpacity);

      // z-index：越近越高（使用縮放值作為基礎）
      const zIndex = Math.round(scale * 100);

      return {
        ...item,
        x,
        y,
        scale,
        opacity,
        zIndex,
        angle,
        depthFactor,
      };
    });
  }, [items, angleOffset, itemCount, radiusX, radiusY, maxScale, minScale, minOpacity]);

  // 找到最接近底部（depthFactor 最大）的項目作為 active
  const activeItem = useMemo(() => {
    return positionedItems.reduce((prev, current) => (current.depthFactor > prev.depthFactor ? current : prev));
  }, [positionedItems]);

  if (items.length === 0) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">沒有可顯示的項目</div>;
  }

  return (
    <div className="relative w-full flex flex-col items-center" style={{ height: `${height}px` }}>
      {/* 軌道容器 */}
      <div className="relative flex-1 w-full">
        {/* 視覺校正：微調水平偏移讓中心商品看起來居中 */}
        <div className="absolute left-1/2 top-1/2" style={{ transform: "translate(-52%, -40%)" }}>
          {positionedItems.map((item) => {
            const isActive = item.id === activeItem.id;
            const isHovered = item.id === hoveredId;

            return (
              <div
                key={item.id}
                className="absolute cursor-pointer transition-all duration-500 ease-out"
                style={{
                  left: `${item.x}px`,
                  top: `${item.y}px`,
                  transform: `translate(-50%, -50%) scale(${isHovered ? item.scale * 1.1 : item.scale})`,
                  opacity: item.opacity,
                  zIndex: item.zIndex,
                }}
                onClick={() => onSelect(item)}
                onMouseEnter={() => setHoveredId(item.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {/* 項目卡片 */}
                <div
                  className={`
                    relative w-40 h-40 md:w-52 md:h-52 rounded-2xl overflow-hidden
                    bg-white/10 backdrop-blur-sm
                    transition-shadow duration-300
                    ${isActive ? "shadow-2xl ring-2 ring-primary/50" : "shadow-lg"}
                    ${isHovered ? "shadow-2xl" : ""}
                  `}
                >
                  {/* 主圖片 */}
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className={`
                      w-full h-full object-contain p-2
                      transition-opacity duration-200
                      ${isHovered && item.hoverImageUrl ? "opacity-0" : "opacity-100"}
                    `}
                    draggable={false}
                    width={208}
                    height={208}
                  />

                  {/* Hover 圖片 */}
                  {item.hoverImageUrl && (
                    <img
                      src={item.hoverImageUrl}
                      alt={`${item.name} hover`}
                      className={`
                        absolute inset-0 w-full h-full object-contain p-2
                        transition-opacity duration-200
                        ${isHovered ? "opacity-100" : "opacity-0"}
                      `}
                      draggable={false}
                      width={208}
                      height={208}
                    />
                  )}

                  {/* Active 指示器 */}
                  {isActive && (
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
                      <p className="text-black text-sm font-medium whitespace-nowrap">{item.name}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 底部按鈕區域 - 可隱藏 */}
      {!hideControls && (
        <div className="flex items-center justify-center gap-4 pb-4 z-50">
          <Button
            variant="ghost"
            size="icon"
            className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm hover:bg-white/40 transition-colors"
            onClick={rotateLeft}
            aria-label="向左旋轉"
          >
            <ChevronLeft className="w-8 h-8 text-foreground" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm hover:bg-white/40 transition-colors"
            onClick={rotateRight}
            aria-label="向右旋轉"
          >
            <ChevronRight className="w-8 h-8 text-foreground" />
          </Button>
        </div>
      )}
    </div>
  );
}
