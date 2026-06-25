/** LINE 後台客戶「下單意願」標籤（與 chat_state.tag 及 DB check 一致）。
 *  已成交、沉睡由系統自動計算，不在此清單。 */
export const LINE_CUSTOMER_TAGS = [
  { value: "高意願", label: "🔥 高意願", badgeClass: "bg-red-100 text-red-800 border-red-200 hover:bg-red-200/80" },
  { value: "中意願", label: "🌤 中意願", badgeClass: "bg-amber-100 text-amber-900 border-amber-200 hover:bg-amber-200/80" },
  { value: "低意願", label: "❄️ 低意願", badgeClass: "bg-sky-100 text-sky-800 border-sky-200 hover:bg-sky-200/80" },
] as const;

export type LineCustomerTag = (typeof LINE_CUSTOMER_TAGS)[number]["value"];

export const LINE_CUSTOMER_TAG_VALUES: readonly LineCustomerTag[] = LINE_CUSTOMER_TAGS.map((t) => t.value);

export function isLineCustomerTag(value: string | null | undefined): value is LineCustomerTag {
  return LINE_CUSTOMER_TAG_VALUES.includes(value as LineCustomerTag);
}

export function lineCustomerTagStyle(tag: string | null | undefined): string {
  const found = LINE_CUSTOMER_TAGS.find((t) => t.value === tag);
  return found?.badgeClass ?? "bg-muted text-muted-foreground border-border";
}
