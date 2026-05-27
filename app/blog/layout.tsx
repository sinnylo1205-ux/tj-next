import type { Metadata } from "next";
import { getFullUrl, SITE_CONFIG } from "@/lib/site";

export const metadata: Metadata = {
  title: "甜點部落格｜T&J 客製化甜點知識庫",
  description:
    "探索客製化甜點的世界！了解棉花糖、馬卡龍、杯子蛋糕等甜點的製作與客製化方式，讓你的派對與活動更加精彩。",
  alternates: { canonical: getFullUrl("/blog") },
  openGraph: {
    title: "甜點部落格｜T&J 客製化甜點知識庫",
    description: "探索客製化甜點的世界！了解各種甜點的製作與客製化方式。",
    type: "website",
    url: getFullUrl("/blog"),
    images: [{ url: SITE_CONFIG.OG_IMAGE }],
  },
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
