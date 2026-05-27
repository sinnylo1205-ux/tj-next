/** LINE 後台客戶標籤（與 chat_state.tag 及 DB check 一致） */
export const LINE_CUSTOMER_TAGS = [
  { value: "緊急", label: "緊急", badgeClass: "bg-red-100 text-red-800 border-red-200 hover:bg-red-200/80" },
  { value: "待處理", label: "待處理", badgeClass: "bg-amber-100 text-amber-900 border-amber-200 hover:bg-amber-200/80" },
  { value: "已下單", label: "已下單", badgeClass: "bg-emerald-100 text-emerald-900 border-emerald-200 hover:bg-emerald-200/80" },
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
