import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createSupabasePublicUncached } from "@/lib/supabase-blog-public";
import BlogArticleContent, { type ProductArticle } from "./BlogArticleContent";
import { articleJsonToHtml } from "@/lib/tiptap/article-json-to-html";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function BlogSlugPage({ params }: PageProps) {
  noStore();
  const { slug } = await params;
  if (!slug) notFound();

  const supabase = createSupabasePublicUncached();
  const { data, error } = await supabase
    .from("product_articles")
    .select("*")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (error || !data) notFound();

  const row = data as ProductArticle & { content_mode?: string | null; body_json?: unknown };

  const article: ProductArticle = {
    ...row,
    custom_options: (row.custom_options as ProductArticle["custom_options"]) || [],
    use_cases: (row.use_cases as ProductArticle["use_cases"]) || [],
    faq: (row.faq as ProductArticle["faq"]) || [],
    content_mode: row.content_mode ?? "template",
  };

  const richBodyHtml =
    row.content_mode === "richtext" && row.body_json ? articleJsonToHtml(row.body_json) : null;

  return <BlogArticleContent article={article} richBodyHtml={richBodyHtml} />;
}
