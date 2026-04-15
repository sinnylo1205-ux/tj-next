// ======================================================================
// MealBoxPreview.tsx — 餐盒預覽區（虛線格子 + 商品圖）
// ======================================================================

import { SelectedItem } from "@/hooks/useMealBoxCustomizer";
import { cn } from "@/lib/utils";
import { SafeImage } from "@/components/SafeImage";

interface MealBoxPreviewProps {
  slots: string[];
  selectedItems: Record<string, SelectedItem>;
  activeSlot?: string | null; // 電腦版：當前選中的 slot
  onSlotClick?: (slotId: string) => void; // 電腦版：點擊 slot 的回調
  isDesktop?: boolean; // 是否為電腦版
}

// 六入格子配置（3 列 × 2 行）
const SLOT_POSITIONS_6: Record<string, { row: number; col: number }> = {
  A1: { row: 0, col: 0 },
  B1: { row: 0, col: 1 },
  C1: { row: 0, col: 2 },
  A2: { row: 1, col: 0 },
  B2: { row: 1, col: 1 },
  C2: { row: 1, col: 2 },
};

// 三入格子配置（3 列 × 1 行）
const SLOT_POSITIONS_3: Record<string, { row: number; col: number }> = {
  A1: { row: 0, col: 0 },
  B1: { row: 0, col: 1 },
  C1: { row: 0, col: 2 },
};

export function MealBoxPreview({
  slots,
  selectedItems,
  activeSlot,
  onSlotClick,
  isDesktop = false,
}: MealBoxPreviewProps) {
  const isSixSlots = slots.length === 6;
  const positions = isSixSlots ? SLOT_POSITIONS_6 : SLOT_POSITIONS_3;
  const rows = isSixSlots ? 2 : 1;

  return (
    <div className="w-full h-full flex items-center justify-center p-4">
      <div
        className={cn("grid gap-4 w-full", isDesktop ? "max-w-3xl" : "max-w-md")}
        style={{
          gridTemplateColumns: "repeat(3, 1fr)",
          gridTemplateRows: `repeat(${rows}, 1fr)`,
          aspectRatio: isSixSlots ? "3/2" : "3/1",
        }}
      >
        {slots.map((slotId) => {
          const pos = positions[slotId];
          const item = selectedItems[slotId];
          const isActive = activeSlot === slotId;
          const hasItem = !!item?.image_url;

          return (
            <div
              key={slotId}
              onClick={() => onSlotClick?.(slotId)}
              className={cn(
                "relative border-2 border-dashed rounded-xl bg-secondary/30 flex flex-col items-center justify-center overflow-hidden transition-all",
                isDesktop && "cursor-pointer hover:border-primary/60 hover:bg-primary/5",
                isActive && "border-primary bg-primary/10 ring-2 ring-primary/30",
                !isActive && "border-secondary/60",
              )}
              style={{
                gridColumn: pos.col + 1,
                gridRow: pos.row + 1,
                minHeight: isDesktop ? "200px" : "120px",
              }}
            >
              {hasItem ? (
                <SafeImage src={item.image_url!} alt={item.name} fill className="object-contain p-2" sizes="200px" />
              ) : (
                <span
                  className={cn(
                    "text-sm font-medium text-center px-2",
                    isDesktop ? "text-secondary-foreground/80" : "text-secondary-foreground/60",
                  )}
                >
                  {isDesktop ? "點擊添加點心" : slotId}
                </span>
              )}

              {/* Slot 標籤 - 改成黑色 */}
              <span className="absolute top-1 left-1 text-[11px] text-black font-bold">{slotId}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
