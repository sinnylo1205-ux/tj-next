import type { Metadata } from "next";
import { getFullUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "關於我們｜T&J 客製化甜點",
  description:
    "了解 T&J 客製化甜點的品牌故事與理念。我們專注於提供高品質客製化甜點服務，從棉花糖到馬卡龍，每一份甜點都承載著用心與創意。",
  alternates: { canonical: getFullUrl("/about") },
  openGraph: {
    title: "關於我們｜T&J 客製化甜點",
    description: "了解 T&J 客製化甜點的品牌故事與理念。我們專注於提供高品質客製化甜點服務。",
    url: getFullUrl("/about"),
    images: [
      "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/og.png",
    ],
  },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
