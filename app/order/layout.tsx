import type { Metadata } from "next";
import { SITE_CONFIG, getFullUrl, getJsonLdBusinessId, getJsonLdWebsiteId } from "@/lib/site";
import { buildBreadcrumbListJsonLd } from "@/lib/jsonld/breadcrumb-list";

const canonical = getFullUrl("/order");

export const metadata: Metadata = {
  title: "客製甜點單品線上選購｜T&J 客製化甜點",
  description:
    "T&J 客製化甜點單品目錄：棉花糖、馬卡龍、杯子蛋糕、餅乾等線上選購，一鍵進入訂購須知與客製編輯器。新北工作室預約取件與配送說明。",
  keywords:
    "T&J,客製甜點,線上訂購,客製化甜點單品,甜點目錄,預約取件,新北甜點工作室",
  alternates: { canonical },
  openGraph: {
    title: "客製甜點單品線上選購｜T&J 客製化甜點",
    description:
      "客製化甜點單品線上目錄，多款手作甜點可進入訂購須知與線上設計，新北工作室製作。",
    url: canonical,
    type: "website",
    locale: "zh_TW",
    siteName: SITE_CONFIG.SITE_NAME,
    images: [{ url: SITE_CONFIG.OG_IMAGE }],
  },
  twitter: {
    card: "summary_large_image",
    title: "客製甜點單品線上選購｜T&J 客製化甜點",
    description: "客製化甜點單品目錄與線上選購，訂購須知與客製編輯一站進入。",
    images: [SITE_CONFIG.OG_IMAGE],
  },
};

const orderBreadcrumbJsonLd = buildBreadcrumbListJsonLd([
  { name: "首頁", path: "/" },
  { name: "客製甜點單品", path: "/order" },
]);

const orderPageJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  "@id": `${canonical}#webpage`,
  name: "客製甜點單品線上選購｜T&J 客製化甜點",
  description: "T&J 客製化甜點單品目錄與線上選購頁。",
  url: canonical,
  isPartOf: { "@id": getJsonLdWebsiteId() },
  about: { "@id": getJsonLdBusinessId() },
};

export default function OrderLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orderBreadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orderPageJsonLd) }}
      />
      {children}
    </>
  );
}
