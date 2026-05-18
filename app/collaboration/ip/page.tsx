import type { Metadata } from "next";
import Link from "next/link";
import { getFullUrl, SITE_CONFIG } from "@/lib/site";

const path = "/collaboration/ip";

const pageDescription = "T&J 客製化甜點 IP 授權與聯名合作說明頁面建置中，敬請期待。";

export const metadata: Metadata = {
  title: "IP 授權",
  description: pageDescription,
  openGraph: {
    title: `IP 授權｜${SITE_CONFIG.SITE_NAME}`,
    description: pageDescription,
    type: "website",
    locale: "zh_TW",
    siteName: SITE_CONFIG.SITE_NAME,
    url: getFullUrl(path),
    images: [{ url: SITE_CONFIG.OG_IMAGE }],
  },
  alternates: { canonical: getFullUrl(path) },
};

export default function IpCollaborationPage() {
  return (
    <main className="mx-auto max-w-2xl rounded-2xl border border-brand-300/40 bg-brand-50 p-8 md:p-10">
      <h1 className="font-serif text-3xl font-semibold text-ink">IP 授權</h1>
      <p className="mt-4 font-sans text-base leading-relaxed text-muted-foreground">
        此單元內容尚在籌備中。若您已有企業合作或活動需求，可先參考「企業合作提案」簡報，或透過聯絡頁與我們討論。
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/collaboration/enterprise"
          className="inline-flex rounded-full bg-brand-500 px-5 py-2.5 font-sans text-sm font-medium text-ink-inverse hover:opacity-90"
        >
          前往企業合作提案
        </Link>
        <Link
          href="/contact"
          className="inline-flex rounded-full border border-brand-300 bg-white px-5 py-2.5 font-sans text-sm font-medium text-ink hover:bg-brand-50"
        >
          聯絡我們
        </Link>
      </div>
    </main>
  );
}
