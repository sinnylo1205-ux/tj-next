import type { Metadata, Viewport } from "next";
import { PresentationViewer } from "@/components/collaboration/PresentationViewer";
import { enterpriseProposalSlides, enterpriseProposalToc } from "@/lib/enterprise-proposal-slides";
import { getFullUrl, SITE_CONFIG } from "@/lib/site";

const path = "/collaboration/enterprise";

const pageDescription =
  "T&J 有豐富的企業合作經驗，從單品設計到甜點佈置，將甜點與活動完美整合；物流經驗完整，讓您下單後甜點順利送達客戶手中。";

export const metadata: Metadata = {
  title: "企業合作提案",
  description: pageDescription,
  keywords: [
    "企業甜點",
    "企業禮盒",
    "客製化甜點",
    "企業合作",
    "活動佈置",
    "茶會",
    "Candy Bar",
    SITE_CONFIG.SITE_NAME,
  ],
  openGraph: {
    title: `企業合作提案｜${SITE_CONFIG.SITE_NAME}`,
    description:
      "T&J 有豐富的企業合作經驗，從單品設計到甜點佈置與物流，讓甜點順利送達客戶手中。",
    type: "article",
    locale: "zh_TW",
    siteName: SITE_CONFIG.SITE_NAME,
    url: getFullUrl(path),
    images: [{ url: SITE_CONFIG.OG_IMAGE }],
  },
  alternates: { canonical: getFullUrl(path) },
};

/** 簡報頁：避免 iOS 將版面當作可縮放文字、並配合瀏海安全區 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const webPageJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "企業合作提案",
  description: pageDescription,
  url: getFullUrl(path),
  inLanguage: "zh-TW",
  isPartOf: { "@id": getFullUrl("/#website") },
  about: { "@id": getFullUrl("/#local-business") },
};

export default function EnterpriseCollaborationPage() {
  return (
    <main className="w-full min-w-0 max-w-full px-2 sm:px-4">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }} />
      <header className="mb-6 max-w-3xl">
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink md:text-4xl">企業合作提案</h1>
        <p className="mt-3 font-sans text-base leading-relaxed text-muted-foreground">
          T&J 有豐富的企業合作經驗，從單品設計到甜點佈置，將甜點與活動完美整合，豐富的物流經驗，讓您下單後，甜點就會順利到客戶手上。
        </p>
      </header>
      <PresentationViewer
        slides={enterpriseProposalSlides}
        toc={enterpriseProposalToc}
        deckTitle="企業合作提案簡報"
        tocBeforeDeck
      />
    </main>
  );
}
