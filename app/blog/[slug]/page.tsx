import { notFound } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import BlogArticleContent, { type ProductArticle } from "./BlogArticleContent";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function BlogSlugPage({ params }: PageProps) {
  const { slug } = await params;
  if (!slug) notFound();

  const { data, error } = await supabase
    .from("product_articles")
    .select("*")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (error || !data) notFound();

  const article: ProductArticle = {
    ...data,
    custom_options: (data.custom_options as ProductArticle["custom_options"]) || [],
    use_cases: (data.use_cases as ProductArticle["use_cases"]) || [],
    faq: (data.faq as ProductArticle["faq"]) || [],
  };

  return <BlogArticleContent article={article} />;
}
