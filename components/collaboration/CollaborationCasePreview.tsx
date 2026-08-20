"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { QUERY_KEYS } from "@/lib/react-query-keys";
import { optimizeImage } from "@/lib/supabase-image-url";
import { cn } from "@/lib/utils";

type CaseSlide = {
  id: string;
  slug: string;
  item_name: string;
  intro: string | null;
  why_custom: string | null;
  og_image_url: string | null;
};

const INTERVAL_MS = 3000;
const FADE_MS = 700;

function caseBody(slide: CaseSlide): string {
  const intro = (slide.intro ?? "").trim();
  if (intro) return intro;
  return (slide.why_custom ?? "").trim();
}

/**
 * 企業頁「合作案例快覽」：左 OG 圖、右文章簡介，每 3 秒交叉淡入下一篇。
 */
export function CollaborationCasePreview({ className = "" }: { className?: string }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const prefetchRef = useRef<Set<string>>(new Set());

  const { data: slidesRaw = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.homeBlogShowcase,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_articles")
        .select("id, slug, item_name, intro, why_custom, og_image_url, homepage_sort_order")
        .eq("is_published", true)
        .eq("show_on_homepage", true)
        .order("homepage_sort_order", { ascending: true, nullsFirst: false })
        .order("updated_at", { ascending: false });
      if (error) {
        console.warn("[enterprise] 合作案例載入失敗：", error.message);
        return [] as CaseSlide[];
      }
      return (data ?? []) as CaseSlide[];
    },
  });

  const slides = useMemo(
    () =>
      slidesRaw.filter((s) => {
        const slug = (s.slug ?? "").trim();
        return Boolean(slug && s.item_name);
      }),
    [slidesRaw],
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduceMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const goNext = useCallback(() => {
    setIndex((i) => {
      const len = slides.length;
      if (len === 0) return 0;
      return (Math.min(i, len - 1) + 1) % len;
    });
  }, [slides.length]);

  useEffect(() => {
    if (slides.length < 2 || paused) return;
    const id = window.setInterval(goNext, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [slides.length, paused, goNext]);

  useEffect(() => {
    const onVis = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const displayIndex = slides.length === 0 ? 0 : Math.min(index, slides.length - 1);

  useEffect(() => {
    if (slides.length === 0) return;
    const len = slides.length;
    const next = slides[(displayIndex + 1) % len];
    const url = next?.og_image_url?.trim();
    if (!url) return;
    const src = optimizeImage(url, 960, 82);
    if (prefetchRef.current.has(src)) return;
    prefetchRef.current.add(src);
    const img = new window.Image();
    img.decoding = "async";
    img.src = src;
  }, [slides, displayIndex]);

  if (isLoading) {
    return (
      <section className={cn("w-full", className)} aria-label="合作案例快覽">
        <div className="mb-4 md:mb-6">
          <h2 className="font-serif text-2xl font-semibold tracking-tight text-ink md:text-3xl">合作案例快覽</h2>
          <p className="mt-2 font-sans text-sm text-muted-foreground md:text-base">精選企業合作與活動實績。</p>
        </div>
        <div className="grid animate-pulse overflow-hidden rounded-2xl border border-border bg-muted/40 md:grid-cols-2">
          <div className="aspect-[16/9] bg-muted" />
          <div className="space-y-3 p-6 md:p-8">
            <div className="h-6 w-2/3 rounded bg-muted" />
            <div className="h-4 w-full rounded bg-muted" />
            <div className="h-4 w-5/6 rounded bg-muted" />
          </div>
        </div>
      </section>
    );
  }

  if (slides.length === 0) return null;

  return (
    <section
      className={cn("w-full", className)}
      aria-label="合作案例快覽"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="mb-4 md:mb-6">
        <h2 className="font-serif text-2xl font-semibold tracking-tight text-ink md:text-3xl">合作案例快覽</h2>
        <p className="mt-2 font-sans text-sm text-muted-foreground md:text-base">
          精選企業合作與活動實績，每三秒切換一篇。
        </p>
      </div>

      <div
        className="relative grid overflow-hidden rounded-2xl border border-brand-300/40 bg-brand-50/40 shadow-sm"
        role="region"
        aria-roledescription="輪播"
        aria-live={paused ? "polite" : "off"}
      >
        {slides.map((slide, i) => {
          const active = i === displayIndex;
          const src = slide.og_image_url ? optimizeImage(slide.og_image_url.trim(), 960, 82) : "";
          const body = caseBody(slide);
          const href = `/blog/${encodeURIComponent(slide.slug.trim())}`;

          return (
            <article
              key={slide.id}
              className={cn(
                "col-start-1 row-start-1 grid min-h-0 md:grid-cols-2",
                reduceMotion ? "transition-none" : "transition-opacity ease-out",
                active ? "relative z-[1] opacity-100" : "pointer-events-none z-0 opacity-0",
              )}
              style={reduceMotion ? undefined : { transitionDuration: `${FADE_MS}ms` }}
              aria-hidden={!active}
            >
              <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted md:aspect-auto md:min-h-[280px]">
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element -- Storage OG，與首頁案例彈窗一致
                  <img
                    src={src}
                    alt={slide.item_name}
                    className="absolute inset-0 h-full w-full object-cover"
                    loading={i === 0 ? "eager" : "lazy"}
                    decoding="async"
                    draggable={false}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                    尚未設定封面圖
                  </div>
                )}
              </div>

              <div className="flex flex-col justify-center gap-3 px-5 py-6 md:px-8 md:py-10">
                <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-600">
                  Case {String(i + 1).padStart(2, "0")}
                </p>
                <h3 className="font-serif text-xl font-semibold leading-snug tracking-tight text-ink md:text-2xl">
                  {slide.item_name}
                </h3>
                {body ? (
                  <p className="font-sans text-sm leading-relaxed text-muted-foreground md:text-base md:leading-relaxed line-clamp-6">
                    {body}
                  </p>
                ) : null}
                <Link
                  href={href}
                  tabIndex={active ? 0 : -1}
                  className="mt-1 inline-flex w-fit items-center gap-1.5 font-sans text-sm font-semibold text-brand-600 underline-offset-4 transition-colors hover:text-ink hover:underline"
                >
                  查看更多
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      {slides.length > 1 ? (
        <div className="mt-3 flex items-center justify-center gap-1.5" role="tablist" aria-label="案例頁碼">
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === displayIndex}
              aria-label={`第 ${i + 1} 篇：${s.item_name}`}
              onClick={() => setIndex(i)}
              className={cn(
                "h-2 rounded-full transition-all",
                i === displayIndex ? "w-6 bg-brand-500" : "w-2 bg-brand-300/70 hover:bg-brand-300",
              )}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
