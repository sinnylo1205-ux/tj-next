// ======================================================================
// SizeSelector.tsx — 通用尺寸選擇器（基於 PopcornCustomizer.tsx）其實是文字按鈕選擇器
// ======================================================================

import { Button } from "@/components/ui/button";

export interface SizeOption {
  option_id: number;
  option_name_zh: string;
  price_modifier: number;
  sort_order?: number;
  sort_order_master?: number;
  is_default?: boolean;
  image_url?: string;
}

interface SizeSelectorProps {
  title?: string;
  options: SizeOption[];
  selectedOption: SizeOption | null;
  onSelect: (option: SizeOption) => void;
}

export function SizeSelector({ title, options, selectedOption, onSelect }: SizeSelectorProps) {
  // 排序：優先使用 sort_order，否則使用 option_id
  const sortedOptions = [...options].sort((a, b) => (a.sort_order ?? a.option_id) - (b.sort_order ?? b.option_id));

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>

      <div className="flex flex-wrap gap-3">
        {sortedOptions.map((option) => {
          const isSelected = selectedOption?.option_id === option.option_id;
          return (
            <Button
              key={option.option_id}
              variant={isSelected ? "default" : "outline"}
              onClick={() => onSelect(option)}
              className="min-w-[120px]"
            >
              {option.option_name_zh}
              {option.price_modifier !== 0 && (
                <span className="ml-2 text-xs">
                  {option.price_modifier > 0 ? "+" : ""}NT$ {option.price_modifier}
                </span>
              )}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
