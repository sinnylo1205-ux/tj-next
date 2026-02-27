import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getFullUrl } from "@/lib/site";
import { ProductNoticeClient, type ProductNoticeData } from "../ProductNoticeClient";

interface PageProps {
  params: Promise<{ slug: string }>;
}

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

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const data = await getProductNotice(slug);
  if (!data) return { title: "訂購須知 | T&J 客製化甜點" };
  const title = `${data.productName ?? slug} 訂購須知｜T&J 客製化甜點`;
  const description = `了解 ${data.productName ?? slug} 的保存方式、原料、過敏原與最低訂購量，預約取件後進入客製化設計。`;
  const url = getFullUrl(`/product/${slug}`);
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
    },
    alternates: { canonical: url },
  };
}

export default async function ProductNoticePage({ params }: PageProps) {
  const { slug } = await params;
  const data = await getProductNotice(slug);
  if (!data) notFound();
  return (
    <ProductNoticeClient
      productId={slug}
      productNotice={data.productNotice}
      productName={data.productName}
      productImageUrl={data.productImageUrl}
    />
  );
}
