// ======================================================================
// FlavorPickerGroup.tsx — 通用口味選擇器（基於 Customizer.tsx）
// 功能與 ColorPickerGroup 相同，但標題和用途不同
// ======================================================================

import { ColorPickerGroup, ColorOption } from "./ColorPickerGroup";

interface FlavorPickerGroupProps {
  title?: string;
  options: ColorOption[];
  selectedOption: ColorOption | null;
  onSelect: (option: ColorOption) => void;
}

export function FlavorPickerGroup(props: FlavorPickerGroupProps) {
  return <ColorPickerGroup {...props} />;
}
