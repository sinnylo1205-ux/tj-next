/** GA4 自訂事件：全站 LINE 連結／按鈕點擊位置識別 */
export type LineClickPosition =
  | "homepage"
  | "footer"
  | "customizer_slide_hint"
  | "order_cake_dialog"
  | "contact"
  | "style_packages"
  | "add_line_friend"
  | "checkout_line_login";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/** 送出 GA4 `line_click` 事件（gtag 未載入時靜默略過） */
export function trackLineClick(position: LineClickPosition | string) {
  if (typeof window === "undefined") return;
  window.gtag?.("event", "line_click", {
    source: "website",
    position,
  });
}
