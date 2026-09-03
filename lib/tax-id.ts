/** 台灣統一編號為 8 碼字串，開頭可以是 0，不可當成 number 處理。 */

export function normalizeTaxIdInput(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 8);
}

/** 從 DB／表單值轉成可顯示、可再編輯的字串（數字來源會補回開頭 0） */
export function formatStoredTaxId(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const digits = String(value).replace(/\D/g, "").slice(0, 8);
  if (!digits) return "";
  if (typeof value === "number") return digits.padStart(8, "0");
  return digits;
}

export function taxIdForDb(value: unknown): string | null {
  const digits = formatStoredTaxId(value);
  return digits.length > 0 ? digits : null;
}
