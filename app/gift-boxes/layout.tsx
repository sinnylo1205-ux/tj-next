import type { Metadata } from "next";
import { getFullUrl, SITE_CONFIG } from "@/lib/site";

export const metadata: Metadata = {
  title: "禮盒與盒裝｜T&J 客製化甜點",
  description:
    "T&J 客製化甜點禮盒與盒裝選項：多種尺寸與風格，適合送禮、企業訂購與派對，可客製化設計。",
  alternates: { canonical: getFullUrl("/gift-boxes") },
  openGraph: {
    title: "禮盒與盒裝｜T&J 客製化甜點",
    description: "多種禮盒與盒裝尺寸，可客製化設計，適合送禮與企業訂購。",
    type: "website",
    url: getFullUrl("/gift-boxes"),
    images: [SITE_CONFIG.OG_IMAGE],
  },
};

export default function GiftBoxesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
