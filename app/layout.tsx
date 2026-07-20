import type { Metadata } from "next";
import { Noto_Sans_TC, Noto_Serif_TC } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { CartProvider } from "@/contexts/CartContext";
import { Providers } from "./providers";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import { SITE_CONFIG, getFullUrl, getJsonLdBusinessId, getJsonLdWebsiteId, getSameAsProfileUrls } from "@/lib/site";
import { productNoticeUrl } from "@/lib/product-notice-url";
import { DESKTOP_HERO_FALLBACK_URL, MOBILE_HERO_URL } from "@/lib/home-lcp-urls";
import { DeferredSpeedInsights } from "@/components/DeferredSpeedInsights";
import { MetaPixelPurchaseTracker } from "@/components/MetaPixelPurchaseTracker";

const notoSerifTC = Noto_Serif_TC({
  variable: "--font-noto-serif-tc",
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
  adjustFontFallback: true,
});

const notoSansTC = Noto_Sans_TC({
  variable: "--font-noto-sans-tc",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  adjustFontFallback: true,
});

const GA4_ID = "G-N9Q3MSMYG5";
const META_PIXEL_ID = "3936828553285127";

export const metadata: Metadata = {
  title: "T&J 客製化甜點 - 客製化手作甜點",
  description:
    "專業客製化甜點服務，提供棉花糖、馬卡龍、杯子蛋糕、幸運籤餅乾等 11 種甜點客製化，適合派對、婚禮、活動送禮。台北新店工作室，預約製作。",
  keywords: "客製化甜點,杯子蛋糕,馬卡龍,手工餅乾,企業禮品,生日蛋糕",
  authors: [{ name: "T&J 客製化甜點" }],
  openGraph: {
    title: "T&J 客製化甜點 - 客製化手作甜點",
    description: "手作甜點，為您的特別時刻增添甜蜜回憶。提供客製化杯子蛋糕、馬卡龍、手工餅乾等精緻甜點",
    type: "website",
    url: getFullUrl("/"),
    images: [{ url: SITE_CONFIG.OG_IMAGE }],
    locale: "zh_TW",
    siteName: "T&J 客製化甜點",
  },
  twitter: {
    card: "summary_large_image",
    title: "T&J 客製化甜點",
    description: "客製化手作甜點，為您的特別時刻增添甜蜜回憶",
    images: [SITE_CONFIG.OG_IMAGE],
  },
  alternates: { canonical: getFullUrl("/") },
};

const businessId = getJsonLdBusinessId();
const sameAs = getSameAsProfileUrls();

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": getJsonLdWebsiteId(),
  name: SITE_CONFIG.SITE_NAME,
  url: getFullUrl("/"),
  publisher: { "@id": businessId },
};

const localBusinessJsonLd = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "@id": businessId,
  additionalType: "https://schema.org/Bakery",
  name: SITE_CONFIG.SITE_NAME,
  image: [SITE_CONFIG.LOGO_URL, SITE_CONFIG.OG_IMAGE],
  description:
    "專業客製化甜點服務，提供棉花糖、馬卡龍、杯子蛋糕、幸運籤餅、客製化甜點，適合派對、婚禮、企業活動送禮。",
  url: getFullUrl(),
  telephone: SITE_CONFIG.CONTACT.phone,
  email: SITE_CONFIG.CONTACT.email,
  address: {
    "@type": "PostalAddress",
    streetAddress: "博愛街25巷3號1樓",
    addressLocality: "新店區",
    addressRegion: "新北市",
    postalCode: "231",
    addressCountry: "TW",
  },
  geo: { "@type": "GeoCoordinates", latitude: 24.9677, longitude: 121.5419 },
  openingHours: "Mo-Fr 09:00-18:00",
  priceRange: "$$",
  servesCuisine: "甜點",
  ...(sameAs.length ? { sameAs } : {}),
};

const itemListJsonLd = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "T&J 客製化甜點商品列表",
  description: "提供多種客製化甜點選擇",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "客製化棉花糖", url: getFullUrl(productNoticeUrl("cotton")) },
    { "@type": "ListItem", position: 2, name: "客製化馬卡龍", url: getFullUrl(productNoticeUrl("macaron")) },
    { "@type": "ListItem", position: 3, name: "客製化奶油杯子蛋糕", url: getFullUrl(productNoticeUrl("cupcake_cream")) },
    { "@type": "ListItem", position: 4, name: "客製化手工餅乾", url: getFullUrl(productNoticeUrl("cookie")) },
    { "@type": "ListItem", position: 5, name: "客製化幸運籤餅", url: getFullUrl(productNoticeUrl("fortune_cookie")) },
    { "@type": "ListItem", position: 6, name: "客製化推筒蛋糕", url: getFullUrl(productNoticeUrl("longcake")) },
    { "@type": "ListItem", position: 7, name: "客製冰晶糖", url: getFullUrl(productNoticeUrl("ice")) },
    { "@type": "ListItem", position: 8, name: "客製化甜甜圈", url: getFullUrl(productNoticeUrl("donut")) },
    { "@type": "ListItem", position: 9, name: "客製化蛋糕棒棒糖", url: getFullUrl(productNoticeUrl("cakeball")) },
    { "@type": "ListItem", position: 10, name: "客製化巧克力杯子蛋糕", url: getFullUrl(productNoticeUrl("cupcake_choco")) },
    { "@type": "ListItem", position: 11, name: "客製化爆米花", url: getFullUrl(productNoticeUrl("popcorn")) },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW" className={`${notoSerifTC.variable} ${notoSansTC.variable}`}>
      <head>
        {/* Facebook 網域驗證：須為靜態 head 輸出，不可僅由 JS 動態插入 */}
        <meta name="facebook-domain-verification" content="71x0k9tw4jpkmrjxstz1olfbhls6ur" />
        {/* next/font 字體由 /_next/static 自託管，不需 fonts.googleapis / gstatic preconnect（Lighthouse 會標未使用） */}
        <link rel="preconnect" href="https://akrxbdoxiopiubksgcrl.supabase.co" />
        <link
          rel="preload"
          as="image"
          href={DESKTOP_HERO_FALLBACK_URL}
          fetchPriority="high"
          media="(min-width: 769px)"
        />
        <link
          rel="preload"
          as="image"
          href={MOBILE_HERO_URL}
          fetchPriority="high"
          media="(max-width: 767px)"
        />
      </head>
      <body className="antialiased custom-cursor">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessJsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />
        {/* GA4 全站僅在此處載入，勿重複埋碼；lazyOnload 降低 render-blocking */}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`}
          strategy="lazyOnload"
        />
        <Script id="ga-config" strategy="lazyOnload">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA4_ID}');
          `}
        </Script>
        {/* Meta（Facebook）像素，全站僅在此處初始化，勿重複埋碼 */}
        <Script id="meta-pixel" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${META_PIXEL_ID}');
            fbq('track', 'PageView');
          `}
        </Script>
        <noscript>
          <img
            height="1"
            width="1"
            style={{ display: "none" }}
            src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
            alt=""
          />
        </noscript>
        <Providers>
          <AuthProvider>
            <CartProvider>
              <NavBar />
              {children}
              <Footer />
              <DeferredSpeedInsights />
              <MetaPixelPurchaseTracker />
            </CartProvider>
          </AuthProvider>
        </Providers>
      </body>
    </html>
  );
}
