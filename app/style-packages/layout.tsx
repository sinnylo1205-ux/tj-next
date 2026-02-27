import type { Metadata } from "next";
import { getFullUrl, SITE_CONFIG } from "@/lib/site";

export const metadata: Metadata = {
  title: "風格方案｜T&J 客製化甜點",
  description:
    "T&J 甜點茶會風格方案：選擇經典午茶、品牌風格或奢華全境方案，打造專屬活動體驗。",
  alternates: { canonical: getFullUrl("/style-packages") },
  openGraph: {
    title: "風格方案｜T&J 客製化甜點",
    description: "甜點茶會風格方案，選擇適合您的方案打造專屬活動體驗。",
    type: "website",
    url: getFullUrl("/style-packages"),
    images: [SITE_CONFIG.OG_IMAGE],
  },
};

export default function StylePackagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
