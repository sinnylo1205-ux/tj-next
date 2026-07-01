/** 結帳頁「如何認識我們」選項，值寫入 orders.customer_source */
export const CUSTOMER_SOURCE_OPTIONS = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "threads", label: "Threads" },
  { value: "google", label: "Google 搜尋" },
  { value: "referral", label: "親友介紹" },
] as const;

export type CustomerSource = (typeof CUSTOMER_SOURCE_OPTIONS)[number]["value"];

export function getCustomerSourceLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return CUSTOMER_SOURCE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}
