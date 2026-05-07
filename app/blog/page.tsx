import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { BookOpen } from "lucide-react";
import { buildBreadcrumbListJsonLd } from "@/lib/jsonld/breadcrumb-list";
import { createSupabasePublicUncached } from "@/lib/supabase-blog-public";
import { optimizeImage } from "@/lib/supabase-image-url";
import { SafeImage } from "@/components/SafeImage";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

interface ArticlePreview {
  slug: string;
  item_name: string;
  intro: string;
  og_image_url: string | null;
}

const defaultArticles = [
  { slug: "marshmallow", item_name: "棉花糖", product_id: "cotton" },
  { slug: "fortune_cookie", item_name: "幸運籤餅乾", product_id: "luck" },
  { slug: "cookies", item_name: "手工餅乾", product_id: "cookie" },
  { slug: "cupcake_cream", item_name: "奶油杯子蛋糕", product_id: "cupcake_cream" },
  { slug: "cupcake_choco", item_name: "巧克力杯子蛋糕", product_id: "cupcake_choco" },
  { slug: "macaron", item_name: "馬卡龍", product_id: "macaron" },
  { slug: "popcake", item_name: "蛋糕棒棒糖", product_id: "cakeball" },
  { slug: "pushcake", item_name: "推筒蛋糕", product_id: "longcake" },
  { slug: "rock_candy", item_name: "冰晶糖", product_id: "ice" },
  { slug: "popcorn", item_name: "爆米花", product_id: "popcorn" },
  { slug: "donut", item_name: "甜甜圈", product_id: "donut" },
];

/** 文章列表需即時反映後台發布狀態 */
export const dynamic = "force-dynamic";

const blogIndexBreadcrumbJsonLd = buildBreadcrumbListJsonLd([
  { name: "首頁", path: "/" },
  { name: "甜點部落格", path: "/blog" },
]);

export default async function BlogIndexPage() {
  noStore();
  const supabase = createSupabasePublicUncached();
  const { data: articles = [] } = await supabase
    .from("product_articles")
    .select("slug, item_name, intro, og_image_url")
    .eq("is_published", true)
    .order("created_at", { ascending: false });

  const list = (articles || []) as ArticlePreview[];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogIndexBreadcrumbJsonLd) }}
      />
    <div className="container py-8 md:py-12">
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">首頁</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>甜點部落格</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <header className="text-center mb-10 md:mb-14">
        <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">甜點部落格</h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          探索客製化甜點的世界，了解各種甜點的特色與客製化方式，為你的派對、活動、送禮找到最完美的選擇。
        </p>
      </header>
      {list.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {list.map((article) => (
            <Link
              key={article.slug}
              href={`/blog/${encodeURIComponent(article.slug)}`}
              className="group block bg-card rounded-xl border border-border overflow-hidden hover:shadow-lg transition-shadow"
            >
              {article.og_image_url ? (
                <div className="relative h-48 w-full overflow-hidden">
                  <SafeImage
                    src={optimizeImage(article.og_image_url, 720, 78)}
                    alt={article.item_name}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  />
                </div>
              ) : (
                <div className="w-full h-48 bg-muted flex items-center justify-center">
                  <BookOpen className="w-12 h-12 text-muted-foreground" />
                </div>
              )}
              <div className="p-5">
                <h2 className="text-xl font-semibold text-foreground mb-2 group-hover:text-primary transition-colors">
                  {article.item_name}
                </h2>
                <p className="text-muted-foreground text-sm line-clamp-3">{article.intro}</p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          <div className="text-center py-8 bg-muted/50 rounded-lg">
            <p className="text-muted-foreground mb-2">文章即將上線，敬請期待！</p>
            <p className="text-sm text-muted-foreground">以下是我們即將推出的甜點文章：</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {defaultArticles.map((article) => (
              <div
                key={article.slug}
                className="block bg-card rounded-xl border border-border overflow-hidden opacity-60"
              >
                <div className="w-full h-48 bg-muted flex items-center justify-center">
                  <BookOpen className="w-12 h-12 text-muted-foreground" />
                </div>
                <div className="p-5">
                  <h2 className="text-xl font-semibold text-foreground mb-2">{article.item_name}</h2>
                  <p className="text-muted-foreground text-sm">即將推出...</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
    </>
  );
}
