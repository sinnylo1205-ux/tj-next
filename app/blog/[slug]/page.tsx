import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createSupabasePublicUncached } from "@/lib/supabase-blog-public";
import BlogArticleContent, { type ProductArticle } from "./BlogArticleContent";
import { articleJsonToHtml } from "@/lib/tiptap/article-json-to-html";
import { decodeBlogSlugParam } from "@/lib/blog-slug";
import { rewriteSupabaseImgSrcInArticleHtml } from "@/lib/next-image-proxy-url";
import { buildBreadcrumbListJsonLd } from "@/lib/jsonld/breadcrumb-list";
import { normalizeArticleRelatedReadingJson } from "@/lib/article-related-reading";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function BlogSlugPage({ params }: PageProps) {
  noStore();
  const { slug: rawSlug } = await params;
  if (!rawSlug) notFound();
  const slug = decodeBlogSlugParam(rawSlug);

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
    related_reading: normalizeArticleRelatedReadingJson(
      (row as { related_reading?: unknown }).related_reading,
    ),
    content_mode: row.content_mode ?? "template",
  };

  const richBodyHtml =
    row.content_mode === "richtext" && row.body_json
      ? rewriteSupabaseImgSrcInArticleHtml(articleJsonToHtml(row.body_json))
      : null;

  const articlePath = `/blog/${encodeURIComponent(slug)}`;
  const blogArticleBreadcrumbJsonLd = buildBreadcrumbListJsonLd([
    { name: "首頁", path: "/" },
    { name: "甜點部落格", path: "/blog" },
    { name: article.item_name, path: articlePath },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogArticleBreadcrumbJsonLd) }}
      />
      <BlogArticleContent article={article} richBodyHtml={richBodyHtml} />
    </>
  );
}
