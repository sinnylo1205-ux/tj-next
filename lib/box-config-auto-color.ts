export type BoxCapacityInput = {
  option_id: number;
  option_name_zh: string;
  price_modifier: number;
  item_image_url?: string;
  capacity?: number;
};

export type BoxColorInput = {
  option_id: number;
  option_name_zh: string;
  price_modifier: number;
  box_capacity: number;
  item_image_url: string;
  sort_order?: number;
};

export function getCapacityFromName(name: string): number {
  if (name.includes("單入") || name.includes("一入")) return 1;
  if (name.includes("二入") || name.includes("2入")) return 2;
  if (name.includes("四入") || name.includes("4入")) return 4;
  if (name.includes("六入") || name.includes("6入")) return 6;
  return 1;
}

export function getCapacityFromOption(option: BoxCapacityInput): number {
  if (option.capacity) return option.capacity;
  return getCapacityFromName(option.option_name_zh);
}

export function makeVirtualColor(capacity: BoxCapacityInput): BoxColorInput {
  return {
    option_id: capacity.option_id * 10000,
    option_name_zh: capacity.option_name_zh,
    price_modifier: capacity.price_modifier || 0,
    box_capacity: getCapacityFromOption(capacity),
    item_image_url: capacity.item_image_url || "",
    sort_order: 0,
  };
}

export function isSyntheticVirtualColor(
  color: BoxColorInput,
  capacity: BoxCapacityInput,
): boolean {
  return color.option_id === capacity.option_id * 10000;
}

/**
 * 自動帶入顏色。
 * 容量尚未寫入 map（顏色還在載入）時必須回 null，不可把「還沒載入」當成「沒有顏色」。
 * 否則會寫入 option_id*10000 的虛擬色，入車後計價會丢掉真實盒色加價、訂單也會記錯顏色。
 */
export function pickAutoColor(
  capacity: BoxCapacityInput,
  colorOptionsMap: Map<number, BoxColorInput[]>,
): BoxColorInput | null {
  if (!colorOptionsMap.has(capacity.option_id)) return null;
  const colors = colorOptionsMap.get(capacity.option_id) || [];
  if (colors.length === 1) return colors[0];
  if (colors.length === 0) return makeVirtualColor(capacity);
  return null;
}
