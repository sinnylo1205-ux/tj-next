// ======================================================================
// SlotSelector.tsx — 單一 slot 選項區塊（Tab + Grid）
// ======================================================================

import { useState } from "react";
import { DessertOption, SelectedItem } from "@/hooks/useMealBoxCustomizer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SafeImage } from "@/components/SafeImage";

interface SlotSelectorProps {
  slotId: string;
  saltOptions: DessertOption[];
  sweetOptions: DessertOption[];
  selectedItem: SelectedItem | undefined;
  onSelect: (option: DessertOption) => void;
  isCompact?: boolean; // 電腦版緊湊模式
}

export function SlotSelector({
  slotId,
  saltOptions,
  sweetOptions,
  selectedItem,
  onSelect,
  isCompact = false,
}: SlotSelectorProps) {
  const [activeTab, setActiveTab] = useState<string>("sweet");

  const renderOptionGrid = (options: DessertOption[]) => {
    // 固定一列3欄，最多3列可見（9個），超過可滾動
    const maxVisibleRows = 3;
    const itemsPerRow = 3;
    const maxVisibleItems = maxVisibleRows * itemsPerRow;
    const needsScroll = options.length > maxVisibleItems;

    const gridContent = (
      <div className="grid grid-cols-3 gap-2">
        {options.map((option) => {
          const isSelected = selectedItem?.option_id === option.option_id;
          return (
            <button
              key={option.option_id}
              onClick={() => onSelect(option)}
              className={cn(
                "flex flex-col items-center p-2 rounded-lg border-2 transition-all",
                "hover:border-primary/60 hover:bg-primary/5",
                isSelected
                  ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                  : "border-border bg-background"
              )}
            >
              {option.item_image_url ? (
                <SafeImage
                  src={option.item_image_url}
                  alt={option.option_name_zh}
                  width={isCompact ? 48 : 64}
                  height={isCompact ? 48 : 64}
                  className={cn("object-contain", isCompact ? "h-12 w-12" : "h-16 w-16")}
                  sizes={isCompact ? "48px" : "64px"}
                />
              ) : (
                <div className={cn(
                  "bg-secondary rounded flex items-center justify-center",
                  isCompact ? "w-12 h-12" : "w-16 h-16"
                )}>
                  <span className="text-xs text-secondary-foreground/70">無圖</span>
                </div>
              )}
              <span className={cn(
                "mt-1 text-center line-clamp-2 font-medium",
                isCompact ? "text-[10px]" : "text-xs"
              )}>
                {option.option_name_zh}
              </span>
            </button>
          );
        })}
      </div>
    );

    if (needsScroll) {
      return (
        <ScrollArea className="h-[280px] mt-3">
          <div className="pr-3">
            {gridContent}
          </div>
        </ScrollArea>
      );
    }

    return <div className="mt-3">{gridContent}</div>;
  };

  return (
    <div className={cn(
      "border rounded-lg bg-card shadow-sm",
      isCompact ? "p-3" : "p-4"
    )}>
      <h3 className={cn(
        "font-bold text-foreground",
        isCompact ? "text-sm mb-2" : "text-base mb-3"
      )}>
        {slotId} 放什麼？
      </h3>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="sweet" className={isCompact ? "text-xs" : ""}>甜</TabsTrigger>
          <TabsTrigger value="salt" className={isCompact ? "text-xs" : ""}>鹹</TabsTrigger>
        </TabsList>

        <TabsContent value="sweet" className="mt-0">
          {sweetOptions.length > 0 ? (
            renderOptionGrid(sweetOptions)
          ) : (
            <p className="text-sm text-secondary-foreground/70 text-center py-4">
              暫無甜點選項
            </p>
          )}
        </TabsContent>

        <TabsContent value="salt" className="mt-0">
          {saltOptions.length > 0 ? (
            renderOptionGrid(saltOptions)
          ) : (
            <p className="text-sm text-secondary-foreground/70 text-center py-4">
              暫無鹹點選項
            </p>
          )}
        </TabsContent>
      </Tabs>

      {/* 已選提示 */}
      {selectedItem && (
        <div className={cn(
          "pt-2 border-t border-secondary/40",
          isCompact ? "mt-2" : "mt-3"
        )}>
          <p className="text-xs text-secondary-foreground/70">
            已選：<span className="font-semibold text-foreground">{selectedItem.name}</span>
          </p>
        </div>
      )}
    </div>
  );
}
