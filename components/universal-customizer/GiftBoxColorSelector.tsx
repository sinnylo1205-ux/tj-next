// ======================================================================
// GiftBoxColorSelector.tsx — 禮盒顏色選擇 Grid 組件
// ======================================================================

import { cn } from "@/lib/utils";
import { SafeImage } from "@/components/SafeImage";
import type { GiftBoxColorOption } from "@/hooks/useGiftBoxColorCustomizer";

interface GiftBoxColorSelectorProps {
  title?: string;
  options: GiftBoxColorOption[];
  selectedOption: GiftBoxColorOption | null;
  onSelect: (option: GiftBoxColorOption) => void;
}

export function GiftBoxColorSelector({
  title = "禮盒顏色",
  options,
  selectedOption,
  onSelect,
}: GiftBoxColorSelectorProps) {
  if (options.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* 標題 */}
      <h3 className="text-sm font-medium text-foreground">{title}</h3>

      {/* Grid 選擇器 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {options.map((option) => {
          const isSelected = selectedOption?.option_id === option.option_id;

          return (
            <button
              key={option.option_id}
              type="button"
              onClick={() => onSelect(option)}
              className={cn(
                "relative flex flex-col items-center p-2 rounded-lg border-2 transition-all",
                "hover:border-primary/70 hover:shadow-md",
                isSelected
                  ? "border-primary bg-primary/5 shadow-md"
                  : "border-border bg-background"
              )}
            >
              {/* 圖片預覽 */}
              <div className="relative mb-2 aspect-square w-full overflow-hidden rounded-md bg-muted">
                {option.item_image_url ? (
                  <SafeImage
                    src={option.item_image_url}
                    alt={option.option_name_zh}
                    fill
                    className="object-contain"
                    sizes="120px"
                  />
                ) : (
                  <div
                    className="w-full h-full"
                    style={{ backgroundColor: option.hex }}
                  />
                )}
              </div>

              {/* 名稱 */}
              <span className="text-xs font-medium text-foreground text-center truncate w-full">
                {option.option_name_zh}
              </span>

              {/* 加價標示 */}
              {option.price_modifier > 0 && (
                <span className="text-[10px] text-primary mt-0.5">
                  +${option.price_modifier}
                </span>
              )}

              {/* 選中勾勾 */}
              {isSelected && (
                <div className="absolute top-1 right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                  <svg
                    className="w-3 h-3 text-primary-foreground"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
