import type { Metadata } from "next";
import { getFullUrl, SITE_CONFIG } from "@/lib/site";

export const metadata: Metadata = {
  title: "結帳｜T&J 客製化甜點",
  description: "填寫收件資訊、選擇配送方式與取貨日期，完成 T&J 客製化甜點訂單結帳。",
  alternates: { canonical: getFullUrl("/checkout") },
  openGraph: {
    title: "結帳｜T&J 客製化甜點",
    type: "website",
    url: getFullUrl("/checkout"),
    images: [SITE_CONFIG.OG_IMAGE],
  },
};

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
