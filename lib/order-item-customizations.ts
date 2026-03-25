/**
 * order_items.customizations_json（JSONB）在實務上可能是：
 * - 陣列（預期）
 * - 單一物件（舊資料或手動寫入）
 * - JSON 字串（少數路徑未解析）
 * 若只用 `.length` 判斷，字串也會通過，但 `.map` 會拋錯。
 */
export function asOrderCustomizationsList(value: unknown): any[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return [];
    try {
      const parsed: unknown = JSON.parse(t);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === "object") return [parsed];
    } catch {
      return [];
    }
    return [];
  }
  if (typeof value === "object") return [value];
  return [];
}
