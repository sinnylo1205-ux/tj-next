import type { Metadata } from "next";
import { SITE_CONFIG, getFullUrl } from "@/lib/site";
import { buildBreadcrumbListJsonLd } from "@/lib/jsonld/breadcrumb-list";

const canonical = getFullUrl("/gallery");

export const metadata: Metadata = {
  title: "甜點茶會佈置｜T&J 客製化甜點",
  description:
    "瀏覽 T&J 甜點茶會與 Candy Bar 佈置作品：活動、婚禮、企業茶會等風格案例，了解佈置方案並預約諮詢。新北工作室規劃執行。",
  alternates: { canonical },
  openGraph: {
    title: "甜點茶會佈置｜T&J 客製化甜點",
    description: "甜點茶會、Candy Bar 佈置作品與活動案例展示。",
    url: canonical,
    type: "website",
    locale: "zh_TW",
    siteName: SITE_CONFIG.SITE_NAME,
    images: [{ url: SITE_CONFIG.OG_IMAGE }],
  },
  twitter: {
    card: "summary_large_image",
    title: "甜點茶會佈置｜T&J 客製化甜點",
    description: "活動甜點佈置與茶會風格作品案例。",
    images: [SITE_CONFIG.OG_IMAGE],
  },
};

const jsonLd = buildBreadcrumbListJsonLd([
  { name: "首頁", path: "/" },
  { name: "甜點茶會佈置", path: "/gallery" },
]);

export default function GalleryLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {children}
    </>
  );
}
