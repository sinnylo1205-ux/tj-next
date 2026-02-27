import type { Metadata } from "next";
import { getFullUrl, SITE_CONFIG } from "@/lib/site";

export const metadata: Metadata = {
  title: "購物車｜T&J 客製化甜點",
  description: "查看您的客製化甜點購物車，確認品項、數量與取貨時間後前往結帳。",
  alternates: { canonical: getFullUrl("/cart") },
  openGraph: {
    title: "購物車｜T&J 客製化甜點",
    type: "website",
    url: getFullUrl("/cart"),
    images: [SITE_CONFIG.OG_IMAGE],
  },
};

export default function CartLayout({ children }: { children: React.ReactNode }) {
  return children;
}
