// ======================================================================
// ColorPickerGroup.tsx — 通用色碼選擇器 Neo Version（可愛按鈕樣式版）
// ======================================================================

import { Button } from "@/components/ui/button";

export interface ColorOption {
  option_id: number;
  option_name_zh: string;
  hex: string;
  image_url: string;
  price_modifier: number;
  sort_order?: number;
  sort_order_master?: number;
  is_default?: boolean;
}

interface ColorPickerGroupProps {
  title?: string;
  options: ColorOption[];
  selectedOption: ColorOption | null;
  onSelect: (option: ColorOption) => void;
}

export function ColorPickerGroup({ title = "顏色選擇", options, selectedOption, onSelect }: ColorPickerGroupProps) {
  // ------------------------------
  // 1. 分組：Default / Light / Rich
  // ------------------------------
  const defaultColors = options
    .filter((o) => o.is_default === true && o.price_modifier === 0)
    .sort((a, b) => (a.sort_order ?? a.sort_order_master ?? 0) - (b.sort_order ?? b.sort_order_master ?? 0));

  const lightColors = options
    .filter((o) => o.price_modifier === 10)
    .sort((a, b) => (a.sort_order ?? a.sort_order_master ?? 0) - (b.sort_order ?? b.sort_order_master ?? 0));

  const richColors = options
    .filter((o) => o.price_modifier === 20)
    .sort((a, b) => (a.sort_order ?? a.sort_order_master ?? 0) - (b.sort_order ?? b.sort_order_master ?? 0));

  // 無加價選項（price_modifier === 0 或 null/undefined，不含 is_default）
  const freeColors = options
    .filter((o) => (o.price_modifier === 0 || o.price_modifier === null || o.price_modifier === undefined))
    .sort((a, b) => (a.sort_order ?? a.sort_order_master ?? 0) - (b.sort_order ?? b.sort_order_master ?? 0));

  // ------------------------------
  // 2. 判斷顯示模式
  // ------------------------------
  const hasDefault = defaultColors.length > 0;
  const hasLight = lightColors.length > 0;
  const hasRich = richColors.length > 0;
  const hasPriceGroups = hasDefault || hasLight || hasRich;

  let showDefault = false;
  let showLight = false;
  let showLightAsPaid = false;
  let showRich = false;
  let showFreeOnly = false;

  // Case D：無任何 price_modifier 分組 → 直接顯示全部（無加價標籤）
  if (!hasPriceGroups) {
    showFreeOnly = true;
  }
  // Case A：三類都有 → default + light + rich
  else if (hasDefault && hasLight && hasRich) {
    showDefault = true;
    showLight = true;
    showRich = true;
  }
  // Case B：default + light → default + 指定顏色(+10)
  else if (hasDefault && hasLight && !hasRich) {
    showDefault = true;
    showLightAsPaid = true;
  }
  // Case C：light + rich
  else if (!hasDefault && hasLight && hasRich) {
    showLight = true;
    showRich = true;
  }
  // Case E：只有 default（所有選項 price_modifier = 0）→ 顯示全部無加價
  else if (hasDefault && !hasLight && !hasRich) {
    showFreeOnly = true;
  }

  // ------------------------------
  // ⭐ 3.「可愛版」渲染按鈕
  // ------------------------------
  const renderColorButtons = (list: ColorOption[]) => (
    <div className="flex flex-wrap gap-2 mt-2">
      {list.map((option) => {
        const isSelected = selectedOption?.option_id === option.option_id;

        return (
          <div key={option.option_id} className="flex flex-col items-center gap-1 w-12">
            {/* 可愛圓按鈕 */}
            <button
              onClick={() => onSelect(option)}
              className={`
                w-12 h-12 rounded-full border-2 transition-all
                ${isSelected ? "border-primary scale-110 shadow-lg" : "border-gray-300 hover:scale-105"}
              `}
              style={{ backgroundColor: option.hex }}
              title={option.option_name_zh}
              aria-label={option.option_name_zh}
            />

            {/* 名稱 */}
            <span className="text-xs text-muted-foreground text-center leading-tight">{option.option_name_zh}</span>
          </div>
        );
      })}
    </div>
  );

  // ------------------------------
  // 4. Render
  // ------------------------------
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>

      {showFreeOnly && (
        <div>
          {renderColorButtons(freeColors)}
        </div>
      )}

      {showDefault && (
        <div>
          <p className="text-sm text-muted-foreground mb-1">預設顏色 (+NT$0)</p>
          {renderColorButtons(defaultColors)}
        </div>
      )}

      {showLight && (
        <div>
          <p className="text-sm text-muted-foreground mb-1">
            淺色系 <span className="text-xs">(+NT$10)</span>
          </p>
          {renderColorButtons(lightColors)}
        </div>
      )}

      {showLightAsPaid && (
        <div>
          <p className="text-sm text-muted-foreground mb-1">
            指定顏色 <span className="text-xs">(+NT$10)</span>
          </p>
          {renderColorButtons(lightColors)}
        </div>
      )}

      {showRich && (
        <div>
          <p className="text-sm text-muted-foreground mb-1">
            濃郁色系 <span className="text-xs">(+NT$20)</span>
          </p>
          {renderColorButtons(richColors)}
        </div>
      )}
    </div>
  );
}
