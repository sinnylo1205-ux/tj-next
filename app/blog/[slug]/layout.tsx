import type { Metadata } from "next";
import { getFullUrl } from "@/lib/site";
import { supabase } from "@/lib/supabase";

interface LayoutProps {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
}

async function getArticleMeta(slug: string) {
  const { data, error } = await supabase
    .from("product_articles")
    .select("item_name, meta_title, meta_description, og_image_url")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (error || !data) return null;
  return data as {
    item_name: string;
    meta_title: string | null;
    meta_description: string | null;
    og_image_url: string | null;
  };
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleMeta(slug);

  if (!article) {
    return {
      title: "找不到文章｜T&J 客製化甜點",
    };
  }

  const title = article.meta_title || `客製化${article.item_name}｜T&J 客製化甜點`;
  const description =
    article.meta_description ||
    `探索客製化${article.item_name}的製作方式與客製化選項，讓你的派對與活動更加精彩。`;
  const url = getFullUrl(`/blog/${slug}`);
  const image = article.og_image_url || undefined;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      images: image ? [{ url: image }] : undefined,
      type: "article",
      locale: "zh_TW",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default function BlogSlugLayout({ children }: LayoutProps) {
  return children;
}
