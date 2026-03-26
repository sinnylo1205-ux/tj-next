import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { getFullUrl } from "@/lib/site";
import { decodeBlogSlugParam } from "@/lib/blog-slug";
import { createSupabasePublicUncached } from "@/lib/supabase-blog-public";

interface LayoutProps {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
}

async function getArticleMeta(slug: string) {
  noStore();
  const supabase = createSupabasePublicUncached();
  const { data, error } = await supabase
    .from("product_articles")
    .select("item_name, meta_title, meta_description, og_image_url, seo_noindex")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (error || !data) return null;
  return data as {
    item_name: string;
    meta_title: string | null;
    meta_description: string | null;
    og_image_url: string | null;
    seo_noindex: boolean | null;
  };
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  noStore();
  const { slug: rawSlug } = await params;
  const slug = rawSlug ? decodeBlogSlugParam(rawSlug) : "";
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
  const encodedSlug = encodeURIComponent(slug);
  const url = getFullUrl(`/blog/${encodedSlug}`);
  const image = article.og_image_url || undefined;

  const noindex = !!article.seo_noindex;

  return {
    title,
    description,
    alternates: { canonical: url },
    robots: noindex ? { index: false, follow: true } : { index: true, follow: true },
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
