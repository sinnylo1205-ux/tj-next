import type { Metadata } from "next";
import { SITE_CONFIG, getFullUrl } from "@/lib/site";
import { buildBreadcrumbListJsonLd } from "@/lib/jsonld/breadcrumb-list";

const canonical = getFullUrl("/faq");

export const metadata: Metadata = {
  title: "常見問與答｜T&J 客製化甜點",
  description:
    "T&J 客製化甜點常見問題：訂購流程、客製化樣式、付款單據、配送取貨、食材保存、修改取消與甜點佈置服務，一次查清楚。",
  alternates: { canonical },
  openGraph: {
    title: "常見問與答｜T&J 客製化甜點",
    description: "訂購、客製化、付款、配送與退換貨等常見問題解答。",
    url: canonical,
    type: "website",
    locale: "zh_TW",
    siteName: SITE_CONFIG.SITE_NAME,
    images: [{ url: SITE_CONFIG.OG_IMAGE }],
  },
  twitter: {
    card: "summary_large_image",
    title: "常見問與答｜T&J 客製化甜點",
    description: "客製化甜點訂購與服務相關 FAQ。",
    images: [SITE_CONFIG.OG_IMAGE],
  },
};

const jsonLd = buildBreadcrumbListJsonLd([
  { name: "首頁", path: "/" },
  { name: "常見問與答", path: "/faq" },
]);

export default function FaqLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {children}
    </>
  );
}
