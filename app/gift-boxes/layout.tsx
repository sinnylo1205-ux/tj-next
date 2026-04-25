import type { Metadata } from "next";
import { SITE_CONFIG, getFullUrl, getJsonLdBusinessId, getJsonLdWebsiteId } from "@/lib/site";

const canonical = getFullUrl("/gift-boxes");

export const metadata: Metadata = {
  title: "企業與活動客製化禮盒｜T&J 客製化甜點",
  description:
    "T&J 企業送禮、活動贈品與客製化禮盒：多款禮盒與線上編輯設計，新北工作室製作。適合尾牙、開幕、節慶與品牌禮贈，預約取件與配送說明一站瀏覽。",
  keywords:
    "T&J,客製化禮盒,企業禮盒,活動贈品,甜點禮盒,企業送禮,客製化甜點禮盒,品牌禮贈",
  alternates: { canonical },
  openGraph: {
    title: "企業與活動客製化禮盒｜T&J 客製化甜點",
    description:
      "企業與活動專用客製化禮盒，多款尺寸與線上設計，新北工作室手作甜點禮贈。",
    url: canonical,
    type: "website",
    locale: "zh_TW",
    siteName: SITE_CONFIG.SITE_NAME,
    images: [{ url: SITE_CONFIG.OG_IMAGE }],
  },
  twitter: {
    card: "summary_large_image",
    title: "企業與活動客製化禮盒｜T&J 客製化甜點",
    description: "企業送禮、活動贈品與甜點禮盒客製化，線上設計與預約取件。",
    images: [SITE_CONFIG.OG_IMAGE],
  },
};

const giftBoxesPageJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  "@id": `${canonical}#webpage`,
  name: "企業與活動客製化禮盒｜T&J 客製化甜點",
  description:
    "T&J 企業送禮、活動贈品與客製化禮盒：多款禮盒與線上編輯設計，新北工作室製作。",
  url: canonical,
  isPartOf: { "@id": getJsonLdWebsiteId() },
  about: { "@id": getJsonLdBusinessId() },
};

export default function GiftBoxesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(giftBoxesPageJsonLd) }}
      />
      {children}
    </>
  );
}
