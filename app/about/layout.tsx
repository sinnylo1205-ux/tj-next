import type { Metadata } from "next";
import { SITE_CONFIG, getFullUrl } from "@/lib/site";
import { buildBreadcrumbListJsonLd } from "@/lib/jsonld/breadcrumb-list";

const canonical = getFullUrl("/about");

export const metadata: Metadata = {
  title: "關於我們｜T&J 客製化甜點",
  description:
    "認識 T&J 客製化甜點：新北新店手作工作室，專注客製化棉花糖、馬卡龍、杯子蛋糕等甜點，為派對、婚禮與企業活動打造專屬甜蜜體驗。",
  alternates: { canonical },
  openGraph: {
    title: "關於我們｜T&J 客製化甜點",
    description: "新北新店手作甜點工作室，為活動與送禮提供專業客製化甜點服務。",
    url: canonical,
    type: "website",
    locale: "zh_TW",
    siteName: SITE_CONFIG.SITE_NAME,
    images: [{ url: SITE_CONFIG.OG_IMAGE }],
  },
  twitter: {
    card: "summary_large_image",
    title: "關於我們｜T&J 客製化甜點",
    description: "認識 T&J 客製化甜點手作工作室與品牌故事。",
    images: [SITE_CONFIG.OG_IMAGE],
  },
};

const jsonLd = buildBreadcrumbListJsonLd([
  { name: "首頁", path: "/" },
  { name: "關於我們", path: "/about" },
]);

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {children}
    </>
  );
}
