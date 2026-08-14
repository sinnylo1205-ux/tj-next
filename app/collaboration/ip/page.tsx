import type { Metadata, Viewport } from "next";
import { PresentationViewer } from "@/components/collaboration/PresentationViewer";
import { ipProposalSlides, ipProposalToc } from "@/lib/ip-proposal-slides";
import { getFullUrl, SITE_CONFIG } from "@/lib/site";

const path = "/collaboration/ip";

const pageDescription =
  "T&J IP 授權與聯名甜點合作作品集：獵人、咒術迴戰、葬送的芙莉蓮、間諜家家酒等主題甜點實績。";

export const metadata: Metadata = {
  title: "IP 授權",
  description: pageDescription,
  keywords: [
    "IP 授權",
    "聯名甜點",
    "主題甜點",
    "動漫聯名",
    "客製化甜點",
    SITE_CONFIG.SITE_NAME,
  ],
  openGraph: {
    title: `IP 授權｜${SITE_CONFIG.SITE_NAME}`,
    description: pageDescription,
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
  name: "IP 授權",
  description: pageDescription,
  url: getFullUrl(path),
  inLanguage: "zh-TW",
  isPartOf: { "@id": getFullUrl("/#website") },
  about: { "@id": getFullUrl("/#local-business") },
};

export default function IpCollaborationPage() {
  return (
    <main className="w-full min-w-0 max-w-full px-2 sm:px-4">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }} />
      <header className="mx-auto mb-6 max-w-3xl text-center">
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink md:text-4xl">IP 授權</h1>
        <p className="mt-3 font-sans text-base leading-relaxed text-muted-foreground">
          T&J 具備多元 IP 聯名與主題甜點實作經驗，以下為合作作品集，歡迎洽詢授權與聯名方案。
        </p>
      </header>
      <PresentationViewer
        slides={ipProposalSlides}
        toc={ipProposalToc}
        deckTitle="IP 授權提案簡報"
        tocBeforeDeck
      />
    </main>
  );
}
