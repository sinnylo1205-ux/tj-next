/** 盒裝容量：優先 metadata，其次從規格名稱解析（單入／四入等）。 */

const ZH_CAPACITY: Record<string, number> = {
  單: 1,
  一: 1,
  二: 2,
  兩: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  八: 8,
  十: 10,
};

export function getCapacityFromName(name: string): number {
  if (!name) return 1;
  const digit = name.match(/(\d+)\s*入/);
  if (digit) {
    const n = Number(digit[1]);
    return n > 0 ? n : 1;
  }
  const zh = name.match(/([單一兩二三四五六八十]+)\s*入/);
  if (zh) {
    const n = ZH_CAPACITY[zh[1]];
    if (n) return n;
  }
  if (name.includes("單入") || name.includes("一入")) return 1;
  if (name.includes("二入") || name.includes("2入")) return 2;
  if (name.includes("四入") || name.includes("4入")) return 4;
  if (name.includes("六入") || name.includes("6入")) return 6;
  return 1;
}

export function getCapacityFromOption(option: {
  capacity?: number | null;
  option_name_zh?: string | null;
}): number {
  if (typeof option.capacity === "number" && Number.isFinite(option.capacity) && option.capacity > 0) {
    return option.capacity;
  }
  return getCapacityFromName(option.option_name_zh || "");
}

/** 合成顏色（無真實色票）不可當作容量來源：其 box_capacity 常被寫成 1。 */
export function isSyntheticBoxColor(
  color: { option_id: number; option_name_zh?: string | null } | null | undefined,
  capacity: { option_id: number } | null | undefined,
): boolean {
  if (!color || !capacity) return false;
  if (color.option_id === capacity.option_id * 10000) return true;
  return color.option_name_zh === "預設";
}

/**
 * 分裝顆數跟容量規格走（metadata 或「四入」名稱），不要用顏色上的 box_capacity。
 * 虛擬顏色與 metadata 缺失時，顏色端常被寫成 1，會讓 12 顆／四入被當成 12 盒。
 */
export function resolvePackedCapacity(
  capacity: { option_id: number; option_name_zh?: string | null; capacity?: number | null } | null | undefined,
  color?: { option_id: number; option_name_zh?: string | null; box_capacity?: number | null } | null,
): number {
  if (capacity) return getCapacityFromOption(capacity);
  if (typeof color?.box_capacity === "number" && color.box_capacity > 0) return color.box_capacity;
  return 0;
}
