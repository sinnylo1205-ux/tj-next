import type { Metadata } from "next";
import { Noto_Sans_TC, Noto_Serif_TC } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { CartProvider } from "@/contexts/CartContext";
import { Providers } from "./providers";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import { SITE_CONFIG, getFullUrl } from "@/lib/site";
import { productNoticeUrl } from "@/lib/product-notice-url";
import { SpeedInsights } from "@vercel/speed-insights/next";

const notoSerifTC = Noto_Serif_TC({
  variable: "--font-noto-serif-tc",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const notoSansTC = Noto_Sans_TC({
  variable: "--font-noto-sans-tc",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const LCP_DESKTOP =
  "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/home_page/home.webp";
const LCP_MOBILE =
  "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/home_page/phone_home%20(1)_11zon.webp";
const GA4_ID = "G-N9Q3MSMYG5";

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

const localBusinessJsonLd = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  name: SITE_CONFIG.SITE_NAME,
  image: SITE_CONFIG.LOGO_URL,
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

const bakeryJsonLd = {
  "@context": "https://schema.org",
  "@type": "Bakery",
  name: SITE_CONFIG.SITE_NAME,
  description: "客製化手作甜點，提供杯子蛋糕、馬卡龍、手工餅乾等精緻甜點",
  url: getFullUrl(),
  image: SITE_CONFIG.OG_IMAGE,
  priceRange: "$$",
  servesCuisine: "甜點",
  address: { "@type": "PostalAddress", addressCountry: "TW" },
  sameAs: [],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW" className={`${notoSerifTC.variable} ${notoSansTC.variable}`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="preconnect" href="https://akrxbdoxiopiubksgcrl.supabase.co" />
        <link
          rel="preload"
          as="image"
          href={LCP_DESKTOP}
          fetchPriority="high"
          media="(min-width: 769px)"
        />
        <link
          rel="preload"
          as="image"
          href={LCP_MOBILE}
          fetchPriority="high"
          media="(max-width: 768px)"
        />
      </head>
      <body className="antialiased">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessJsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(bakeryJsonLd) }} />
        {/* GA4 全站僅在此處載入，勿重複埋碼 */}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`}
          strategy="afterInteractive"
        />
        <Script id="ga-config" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA4_ID}');
          `}
        </Script>
        <Providers>
          <AuthProvider>
            <CartProvider>
              <NavBar />
              {children}
              <Footer />
              <SpeedInsights />
            </CartProvider>
          </AuthProvider>
        </Providers>
      </body>
    </html>
  );
}
