"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { cn } from "@/lib/utils";
import { ArticleTocNav, ArticleTocSidebar, type TocItem } from "@/components/blog/ArticleTocSidebar";
import { scrollToArticleHeading } from "@/lib/article-heading-scroll";
import { classifyArticleBodyImagesIn } from "@/lib/article-body-image-frame";
import type { ArticleFaqItem } from "@/lib/article-faq";
import type { ArticleRelatedLink } from "@/lib/article-related-reading";

export interface CustomOption {
  title: string;
  description: string;
}

export interface UseCase {
  title: string;
  description: string;
}

export type FaqItem = ArticleFaqItem;

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
  editor_path: string | null;
  meta_title: string | null;
  meta_description: string | null;
  og_image_url: string | null;
  /** template | richtext（新排版） */
  content_mode?: string | null;
  body_json?: unknown;
  /** 文末延伸閱讀連結（richtext） */
  related_reading?: ArticleRelatedLink[];
}

const productPaths: Record<string, string> = {
  /** 後台預設 product_id；未在 editor_path 填路徑時會用此對照（blog → 首頁） */
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

/** 「進入選購與設計」：若 editor_path 為網址則優先使用，否則依 product_id 對照 */
function resolveBlogShopCtaHref(article: ProductArticle): string {
  const ep = (article.editor_path || "").trim();
  if (ep.startsWith("https://") || ep.startsWith("http://")) return ep;
  if (ep.startsWith("/")) return ep;
  return productPaths[article.product_id] || `/product/${article.product_id}`;
}

export default function BlogArticleContent({
  article,
  richBodyHtml,
  expectsTocAside = false,
}: {
  article: ProductArticle;
  /** 由伺服端自 body_json 產生，避免把 Tiptap 整包進 client */
  richBodyHtml?: string | null;
  /** 伺服端預測是否有 h2 目錄：首屏即雙欄，避免 hydration 後才插入側欄造成 CLS */
  expectsTocAside?: boolean;
}) {
  const shopCtaHref = resolveBlogShopCtaHref(article);
  const isRichtext = article.content_mode === "richtext" && richBodyHtml;

  const readableRef = useRef<HTMLDivElement>(null);
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const setTocItemsStable = useCallback((items: TocItem[]) => setTocItems(items), []);

  const tocRebuildKey = `${article.id}-${isRichtext ? `rt-${richBodyHtml?.length ?? 0}` : "tpl"}`;

  /** 網址帶 #錨點時：待目錄掃描並寫入 id 後再捲動 */
  useEffect(() => {
    const raw = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
    let hash = raw;
    if (raw) {
      try {
        hash = decodeURIComponent(raw);
      } catch {
        hash = raw;
      }
    }
    if (!hash || tocItems.length === 0) return;
    const t = window.setTimeout(() => {
      if (document.getElementById(hash)) scrollToArticleHeading(hash);
    }, 200);
    return () => window.clearTimeout(t);
  }, [tocItems.length, tocRebuildKey]);

  /** 內文圖依實際比例套用橫式／直式外框 */
  useEffect(() => {
    const root = readableRef.current;
    if (!root) return;
    classifyArticleBodyImagesIn(root);
    const mo = new MutationObserver(() => classifyArticleBodyImagesIn(root));
    mo.observe(root, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [tocRebuildKey]);

  /** 左欄目錄頂端與本文第一行大致對齊（有頂圖時略過圖片區；僅富文本無圖時預留 header 下緣） */
  const tocAsidePtClass =
    !expectsTocAside
      ? ""
      : article.og_image_url
        ? "lg:pt-[calc(16rem+1rem+2rem)]"
        : isRichtext
          ? "lg:pt-8"
          : "";

  return (
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
            <BreadcrumbLink asChild>
              <Link href="/blog">甜點部落格</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{article.item_name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* 左欄 sticky 目錄 + 中央閱讀欄約 680px */}
      <div
        className={cn(
          "mx-auto w-full",
          expectsTocAside
            ? "max-w-[1200px] lg:w-fit lg:grid lg:grid-cols-[minmax(11rem,240px)_minmax(0,680px)] lg:gap-x-12 xl:gap-x-16 lg:items-stretch"
            : "max-w-[680px]",
        )}
      >
        {expectsTocAside ? (
          <aside className="hidden min-w-0 lg:col-start-1 lg:row-start-1 lg:block">
            <div
              className={cn(
                "sticky top-28 max-h-[calc(100vh-8rem)] overflow-y-auto overscroll-y-contain pb-8",
                tocAsidePtClass,
              )}
            >
              <ArticleTocNav items={tocItems} />
            </div>
          </aside>
        ) : null}

        <article
          className={cn(
            "min-w-0",
            !expectsTocAside && "mx-auto",
            expectsTocAside && "lg:col-start-2",
          )}
        >
          <div
            ref={readableRef}
            className="article-readable-zone"
          >
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
                {article.faq && article.faq.length > 0 && (
                  <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">常見問題</h2>
                    <Accordion type="single" collapsible className="space-y-2">
                      {article.faq.map((item, i) => (
                        <AccordionItem key={i} value={`faq-rt-${i}`} className="border rounded-lg px-4">
                          <AccordionTrigger className="text-left">{item.question}</AccordionTrigger>
                          <AccordionContent className="text-muted-foreground whitespace-pre-line">
                            {item.answer}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </section>
                )}
                {article.related_reading && article.related_reading.filter((x) => x.href.trim()).length > 0 && (
                  <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">延伸閱讀</h2>
                    <ul className="space-y-2">
                      {article.related_reading
                        .filter((item) => item.href.trim())
                        .map((item, i) => {
                        const href = item.href.trim();
                        const label = item.label.trim() || href;
                        if (!href) return null;
                        const external = /^https?:\/\//i.test(href);
                        const path = href.startsWith("/") ? href : `/${href}`;
                        return (
                          <li key={i}>
                            {external ? (
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary underline underline-offset-2 hover:opacity-90"
                              >
                                {label}
                              </a>
                            ) : (
                              <Link href={path} className="text-primary underline underline-offset-2 hover:opacity-90">
                                {label}
                              </Link>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}
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
                  <h1 className="text-3xl font-bold text-foreground md:text-4xl mb-4">{article.item_name}</h1>
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
                          <AccordionContent className="text-muted-foreground whitespace-pre-line">{item.answer}</AccordionContent>
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
              <Link href={shopCtaHref}>
                進入選購與設計 <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/blog">
                <ChevronLeft className="mr-2 h-4 w-4" />
                返回部落格
              </Link>
            </Button>
          </div>
        </article>
      </div>

      <ArticleTocSidebar
        rootRef={readableRef}
        onItemsChange={setTocItemsStable}
        rebuildKey={tocRebuildKey}
      />
    </div>
  );
}
