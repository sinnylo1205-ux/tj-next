import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import { getFullUrl } from "@/lib/site";
import { ProductNoticeClient, type ProductNoticeData } from "../ProductNoticeClient";

interface PageProps {
  params: Promise<{ slug: string }>;
}

/** 依品項微調 SERP 文案（CTR：具體利益 + 行動暗示，避免僅「訂購須知」） */
const PRODUCT_SERP_HINTS: Record<string, { hook: string }> = {
  cupcake_cream: {
    hook: "插卡印圖、企業 LOGO、多色糖霜杯子，慶生與活動送禮。",
  },
  cupcake_choco: {
    hook: "巧克力糖霜、手寫字／簽詩款，派對與禮贈都適合。",
  },
};

async function getProductNotice(slug: string) {
  const [noticeRes, productRes] = await Promise.all([
    supabase.from("product_notice").select("*").eq("product_id", slug).maybeSingle(),
    supabase.from("products").select("name, product_image_url").eq("id", slug).maybeSingle(),
  ]);
  const notice = noticeRes.data as unknown as ProductNoticeData | null;
  const product = productRes.data;
  if (!notice) return null;
  return {
    productNotice: notice,
    productName: product?.name ?? null,
    productImageUrl: product?.product_image_url ?? null,
  };
}

type ProductPageData = NonNullable<Awaited<ReturnType<typeof getProductNotice>>>;

function buildProductMetadata(slug: string, data: ProductPageData): Metadata {
  const displayName = data.productName ?? slug;
  const hint =
    PRODUCT_SERP_HINTS[slug]?.hook ?? "線上客製設計、預約取件與配送說明，新北工作室製作。";
  const minQty = data.productNotice.min_order_qty;
  const moq =
    typeof minQty === "number" && minQty > 0
      ? `最低 ${minQty} 個起訂；`
      : "";
  const title = `客製化${displayName}｜線上設計・預約取件｜T&J`;
    const description = `${hint}${moq}此頁可選取件日、看運費與過敏原，完成後一鍵進入線上編輯器。`.slice(0, 158);
  const url = getFullUrl(`/product/${slug}`);
  const ogImages =
    data.productImageUrl && data.productImageUrl.startsWith("http")
      ? [{ url: data.productImageUrl, alt: `客製化${displayName}` }]
      : undefined;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      type: "website",
      locale: "zh_TW",
      ...(ogImages ? { images: ogImages } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(data.productImageUrl ? { images: [data.productImageUrl] } : {}),
    },
    alternates: { canonical: url },
  };
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const data = await getProductNotice(slug);
  if (!data) return { title: "訂購須知 | T&J 客製化甜點" };
  return buildProductMetadata(slug, data);
}

export default async function ProductNoticePage({ params }: PageProps) {
  const { slug } = await params;
  const data = await getProductNotice(slug);
  if (!data) notFound();

  const displayName = data.productName ?? slug;
  const url = getFullUrl(`/product/${slug}`);
  const meta = buildProductMetadata(slug, data);
  const description = typeof meta.description === "string" ? meta.description : "";

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "首頁", item: getFullUrl("/") },
      { "@type": "ListItem", position: 2, name: "客製甜點單品", item: getFullUrl("/order") },
      { "@type": "ListItem", position: 3, name: `客製化${displayName}`, item: url },
    ],
  };

  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `客製化${displayName}`,
    description,
    url,
    image: data.productImageUrl ?? undefined,
    brand: { "@type": "Brand", name: "T&J 客製化甜點" },
    ...(data.productNotice.price_min != null && data.productNotice.price_min > 0
      ? {
          offers: {
            "@type": "Offer",
            price: data.productNotice.price_min,
            priceCurrency: "TWD",
            availability: "https://schema.org/InStock",
            url,
          },
        }
      : {
          offers: {
            "@type": "Offer",
            availability: "https://schema.org/InStock",
            url,
          },
        }),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />
      <ProductNoticeClient
        productId={slug}
        productNotice={data.productNotice}
        productName={data.productName}
        productImageUrl={data.productImageUrl}
      />
    </>
  );
}
