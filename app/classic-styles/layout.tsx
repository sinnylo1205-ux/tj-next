import type { Metadata } from "next";
import { SITE_CONFIG, getFullUrl, getJsonLdBusinessId, getJsonLdWebsiteId } from "@/lib/site";
import { buildBreadcrumbListJsonLd } from "@/lib/jsonld/breadcrumb-list";

const canonical = getFullUrl("/classic-styles");

export const metadata: Metadata = {
  title: "選購經典款式甜點｜T&J 客製化甜點",
  description:
    "T&J 魔法屋經典主題甜點：美人魚、獨角獸、仙子、冰雪、星空等風格，線上瀏覽經典款式並進入選購。新北工作室手作。",
  alternates: { canonical },
  openGraph: {
    title: "選購經典款式甜點｜T&J 客製化甜點",
    description: "經典主題甜點款式介紹與選購，多款風格一次瀏覽。",
    url: canonical,
    type: "website",
    locale: "zh_TW",
    siteName: SITE_CONFIG.SITE_NAME,
    images: [{ url: SITE_CONFIG.OG_IMAGE }],
  },
  twitter: {
    card: "summary_large_image",
    title: "選購經典款式甜點｜T&J 客製化甜點",
    description: "經典主題甜點與選購入口。",
    images: [SITE_CONFIG.OG_IMAGE],
  },
};

const classicBreadcrumbJsonLd = buildBreadcrumbListJsonLd([
  { name: "首頁", path: "/" },
  { name: "選購經典款式", path: "/classic-styles" },
]);

const classicPageJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  "@id": `${canonical}#webpage`,
  name: "選購經典款式甜點｜T&J 客製化甜點",
  description: "T&J 經典主題甜點款式頁。",
  url: canonical,
  isPartOf: { "@id": getJsonLdWebsiteId() },
  about: { "@id": getJsonLdBusinessId() },
};

export default function ClassicStylesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(classicBreadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(classicPageJsonLd) }}
      />
      {children}
    </>
  );
}
