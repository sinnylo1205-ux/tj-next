"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SafeImage } from "@/components/SafeImage";
import { Button } from "@/components/ui/button";
import { ArrowRight, ChevronLeft } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export interface CustomOption {
  title: string;
  description: string;
}

export interface UseCase {
  title: string;
  description: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface ProductArticle {
  id: string;
  product_id: string;
  slug: string;
  item_name: string;
  intro: string;
  why_custom: string;
  custom_options: CustomOption[];
  use_cases: UseCase[];
  faq: FaqItem[];
  editor_path: string;
  meta_title: string | null;
  meta_description: string | null;
  og_image_url: string | null;
  /** template | richtext（新排版） */
  content_mode?: string | null;
  body_json?: unknown;
}

const productPaths: Record<string, string> = {
  /** 後台新增文章預設 product_id，無對應商品時導向首頁 */
  blog: "/",
  marshmallow: "/product/cotton",
  fortune_cookie: "/product/luck",
  cookies: "/product/cookie",
  cupcake_cream: "/product/cupcake_cream",
  cupcake_choco: "/product/cupcake_choco",
  macaron: "/product/macaron",
  popcake: "/product/cakeball",
  pushcake: "/product/longcake",
  rock_candy: "/product/ice",
  popcorn: "/product/popcorn",
  donut: "/product/donut",
};

const ARTICLE_FONT_ZOOM_KEY = "tj-blog-article-font-zoom";

const FONT_ZOOM_LEVELS = [
  { zoom: 1, label: "標準" },
  { zoom: 1.08, label: "舒適" },
  { zoom: 1.18, label: "大" },
] as const;

type ArticleFontZoom = (typeof FONT_ZOOM_LEVELS)[number]["zoom"];

export default function BlogArticleContent({
  article,
  richBodyHtml,
}: {
  article: ProductArticle;
  /** 由伺服端自 body_json 產生，避免把 Tiptap 整包進 client */
  richBodyHtml?: string | null;
}) {
  const noticePath = productPaths[article.product_id] || `/product/${article.product_id}`;
  const isRichtext = article.content_mode === "richtext" && richBodyHtml;

  const [fontZoom, setFontZoom] = useState<ArticleFontZoom>(() => FONT_ZOOM_LEVELS[1].zoom);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ARTICLE_FONT_ZOOM_KEY);
      if (raw === "0" || raw === "1" || raw === "2") {
        setFontZoom(FONT_ZOOM_LEVELS[Number(raw)].zoom);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const persistZoom = (z: ArticleFontZoom) => {
    setFontZoom(z);
    const idx = FONT_ZOOM_LEVELS.findIndex((l) => l.zoom === z);
    try {
      if (idx >= 0) localStorage.setItem(ARTICLE_FONT_ZOOM_KEY, String(idx));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="container py-8 md:py-12">
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/">首頁</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/blog">甜點部落格</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>客製化{article.item_name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <article className="max-w-3xl mx-auto">
        <div className="mb-5 flex flex-wrap items-center gap-2 border-b border-border pb-4">
          <span className="text-sm text-muted-foreground shrink-0">文章字體</span>
          <div className="flex flex-wrap gap-1.5">
            {FONT_ZOOM_LEVELS.map(({ zoom, label }) => (
              <Button
                key={zoom}
                type="button"
                variant={fontZoom === zoom ? "secondary" : "outline"}
                size="sm"
                className="h-8 min-w-[3.25rem] px-2 text-xs"
                onClick={() => persistZoom(zoom)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        <div className="article-readable-zone origin-top" style={{ zoom: fontZoom }}>
          {isRichtext ? (
            <>
              <header className="mb-8">
                {article.og_image_url && (
                  <div className="relative mb-4 h-64 w-full overflow-hidden rounded-xl">
                    <SafeImage
                      src={article.og_image_url}
                      alt={article.item_name}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, 768px"
                      priority
                    />
                  </div>
                )}
              </header>
              <div
                className="article-rich-body text-foreground mb-8"
                dangerouslySetInnerHTML={{ __html: richBodyHtml! }}
              />
            </>
          ) : (
            <>
              <header className="mb-8">
                {article.og_image_url && (
                  <div className="relative mb-4 h-64 w-full overflow-hidden rounded-xl">
                    <SafeImage
                      src={article.og_image_url}
                      alt={article.item_name}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, 768px"
                      priority
                    />
                  </div>
                )}
                <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">客製化{article.item_name}</h1>
                <p className="text-muted-foreground text-lg whitespace-pre-line">{article.intro}</p>
              </header>

              {article.why_custom && (
                <section className="mb-8">
                  <h2 className="text-xl font-semibold mb-4">為什麼要客製化？</h2>
                  <p className="text-foreground leading-relaxed whitespace-pre-line">{article.why_custom}</p>
                </section>
              )}

              {article.custom_options?.length > 0 && (
                <section className="mb-8">
                  <h2 className="text-xl font-semibold mb-4">客製化選項</h2>
                  <Accordion type="single" collapsible className="space-y-2">
                    {article.custom_options.map((opt, i) => (
                      <AccordionItem key={i} value={`opt-${i}`} className="border rounded-lg px-4">
                        <AccordionTrigger className="text-left font-medium">{opt.title}</AccordionTrigger>
                        <AccordionContent className="text-muted-foreground">{opt.description}</AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </section>
              )}

              {article.use_cases?.length > 0 && (
                <section className="mb-8">
                  <h2 className="text-xl font-semibold mb-4">適用場合</h2>
                  <ul className="space-y-3">
                    {article.use_cases.map((uc, i) => (
                      <li key={i}>
                        <strong className="text-foreground">{uc.title}</strong>
                        <p className="text-muted-foreground text-sm">{uc.description}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {article.faq?.length > 0 && (
                <section className="mb-8">
                  <h2 className="text-xl font-semibold mb-4">常見問題</h2>
                  <Accordion type="single" collapsible className="space-y-2">
                    {article.faq.map((item, i) => (
                      <AccordionItem key={i} value={`faq-${i}`} className="border rounded-lg px-4">
                        <AccordionTrigger className="text-left">{item.question}</AccordionTrigger>
                        <AccordionContent className="text-muted-foreground">{item.answer}</AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </section>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-4 pt-6">
          <Button asChild>
            <Link href={noticePath}>
              進入選購與設計 <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/blog">
              <ChevronLeft className="w-4 h-4 mr-2" />
              返回部落格
            </Link>
          </Button>
        </div>
      </article>
    </div>
  );
}
