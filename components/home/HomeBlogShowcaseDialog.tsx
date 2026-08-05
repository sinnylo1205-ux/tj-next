"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { QUERY_KEYS } from "@/lib/react-query-keys";
import { optimizeImage } from "@/lib/supabase-image-url";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type HomepageArticleSlide = {
  id: string;
  slug: string;
  item_name: string;
  intro: string | null;
  og_image_url: string | null;
};

type HomeBlogShowcaseDialogProps = {
  /** 付款結果等其他 dialog 開啟時，暫不自動彈出 */
  suppressAutoOpen?: boolean;
};

export function HomeBlogShowcaseDialog({ suppressAutoOpen = false }: HomeBlogShowcaseDialogProps) {
  const [open, setOpen] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const autoOpenedRef = useRef(false);
  const touchStartX = useRef<number | null>(null);
  const prefetchCacheRef = useRef<Set<string>>(new Set());

  const { data: slidesRaw = [] } = useQuery({
    queryKey: QUERY_KEYS.homeBlogShowcase,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_articles")
        .select("id, slug, item_name, intro, og_image_url, homepage_sort_order")
        .eq("is_published", true)
        .eq("show_on_homepage", true)
        .order("homepage_sort_order", { ascending: true, nullsFirst: false })
        .order("updated_at", { ascending: false });
      if (error) {
        console.error("[home] blog showcase fetch:", error.message);
        return [] as HomepageArticleSlide[];
      }
      return (data ?? []) as HomepageArticleSlide[];
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
    if (slides.length === 0) {
      autoOpenedRef.current = false;
      return;
    }
    if (suppressAutoOpen || autoOpenedRef.current) return;
    const id = window.setTimeout(() => {
      setOpen(true);
      autoOpenedRef.current = true;
    }, 0);
    return () => clearTimeout(id);
  }, [slides.length, suppressAutoOpen]);

  const displayIndex = slides.length === 0 ? 0 : Math.min(slideIndex, slides.length - 1);
  const current = slides[displayIndex];
  const currentSrc = current?.og_image_url
    ? optimizeImage(current.og_image_url.trim(), 960, 82)
    : "";

  useEffect(() => {
    setImageLoaded(false);
    setImageError(false);
  }, [currentSrc, displayIndex]);

  useEffect(() => {
    if (!open || slides.length === 0) return;
    const len = slides.length;
    const indices = [displayIndex, (displayIndex + 1) % len, (displayIndex - 1 + len) % len];
    for (const idx of indices) {
      const url = slides[idx]?.og_image_url?.trim();
      if (!url) continue;
      const src = optimizeImage(url, 960, 82);
      if (prefetchCacheRef.current.has(src)) continue;
      prefetchCacheRef.current.add(src);
      const img = new window.Image();
      img.decoding = "async";
      img.src = src;
    }
  }, [open, slides, displayIndex]);

  const goPrev = useCallback(() => {
    setSlideIndex((i) => {
      const len = slides.length;
      if (len === 0) return 0;
      const start = Math.min(i, len - 1);
      return (start - 1 + len) % len;
    });
  }, [slides.length]);

  const goNext = useCallback(() => {
    setSlideIndex((i) => {
      const len = slides.length;
      if (len === 0) return 0;
      const start = Math.min(i, len - 1);
      return (start + 1) % len;
    });
  }, [slides.length]);

  const onTouchStart = useCallback((e: TouchEvent) => {
    touchStartX.current = e.changedTouches[0]?.clientX ?? null;
  }, []);

  const onTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (touchStartX.current == null) return;
      const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
      const dx = endX - touchStartX.current;
      touchStartX.current = null;
      if (Math.abs(dx) < 48) return;
      if (dx > 0) goPrev();
      else goNext();
    },
    [goPrev, goNext],
  );

  useEffect(() => {
    if (!open || slides.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, slides.length, goPrev, goNext]);

  if (slides.length === 0) return null;

  const articleHref = current ? `/blog/${encodeURIComponent(current.slug.trim())}` : "/blog";

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => {
            setSlideIndex(0);
            setOpen(true);
          }}
          className="fixed bottom-4 left-4 z-40 flex items-center gap-2 rounded-full border-2 border-[hsl(var(--color-brand-300))] bg-[hsl(var(--color-brand-100))] px-3 py-2 text-xs font-medium text-[hsl(var(--color-ink))] shadow-md transition-opacity hover:opacity-95 sm:bottom-6 sm:left-6 sm:text-sm"
          aria-label="查看首頁精選案例文章"
        >
          <BookOpen className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
          精選案例
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          overlayClassName="z-[1100]"
          className={cn(
            "!flex h-auto max-h-[min(92vh,900px)] w-[100vw] max-w-[100vw] flex-col gap-0 overflow-hidden rounded-none border-2 border-[hsl(var(--color-brand-300))] bg-white p-0 shadow-xl",
            "sm:left-[50%] sm:top-[50%] sm:max-h-[min(88vh,820px)] sm:max-w-[min(720px,92vw)] sm:w-full sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg",
            "z-[1110] [&>button.absolute]:hidden",
          )}
        >
          <DialogHeader className="relative shrink-0 space-y-0 border-b-2 border-[hsl(var(--color-brand-300))] bg-[hsl(var(--color-brand-100))] px-14 py-3 text-center sm:px-16 sm:py-3.5 sm:text-center">
            <DialogClose
              className="absolute right-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-red-600 text-white shadow-md transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 sm:right-3 sm:h-12 sm:w-12"
              aria-label="關閉"
            >
              <X className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={2.5} />
            </DialogClose>
            <DialogTitle className="w-full text-center text-sm font-semibold leading-snug text-[hsl(var(--color-ink))] sm:text-base">
              最新企業合作案例
            </DialogTitle>
            <DialogDescription className="sr-only">
              使用左右箭頭、圓點或左右滑動切換案例文章縮圖，點擊按鈕可閱讀全文。
            </DialogDescription>
          </DialogHeader>

          {current ? (
            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-white">
              <div
                role="region"
                aria-roledescription="輪播"
                aria-label="首頁精選案例文章"
                className="relative flex min-h-[min(52vh,420px)] w-full flex-1 touch-pan-y items-center justify-center bg-white px-0 py-2 sm:min-h-[min(48vh,440px)] sm:px-4 sm:py-4"
                onTouchStart={onTouchStart}
                onTouchEnd={onTouchEnd}
              >
                <div className="relative flex h-full min-h-[min(48vh,380px)] w-full flex-col items-center justify-center gap-3 px-3 sm:min-h-[min(44vh,400px)] sm:px-4">
                  {/* 固定 16:9 裁切框，各篇封面視覺尺寸一致 */}
                  <div className="relative w-full max-w-xl overflow-hidden rounded-md bg-[hsl(var(--color-brand-50))] aspect-[16/9] sm:max-w-2xl">
                    {!imageLoaded && !imageError && currentSrc ? (
                      <div
                        className="absolute inset-0 z-0 flex flex-col items-center justify-center gap-3"
                        aria-busy="true"
                        aria-live="polite"
                      >
                        <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-[hsl(var(--color-brand-50))] via-[hsl(var(--color-brand-100))] to-[hsl(var(--color-brand-50))]" />
                        <Loader2
                          className="relative z-[1] h-8 w-8 animate-spin text-[hsl(var(--color-brand-500))]"
                          aria-hidden
                        />
                        <p className="relative z-[1] text-xs text-[hsl(var(--color-ink))]/60 sm:text-sm">
                          圖片載入中…
                        </p>
                      </div>
                    ) : null}

                    {currentSrc && !imageError ? (
                      /* eslint-disable-next-line @next/next/no-img-element -- 輪播外連 Storage，與 /order 客製範例一致 */
                      <img
                        key={current.id}
                        src={currentSrc}
                        alt={current.item_name}
                        className={cn(
                          "absolute inset-0 h-full w-full object-cover transition-opacity duration-300",
                          imageLoaded ? "opacity-100" : "opacity-0",
                        )}
                        loading="eager"
                        decoding="async"
                        fetchPriority="high"
                        draggable={false}
                        onLoad={(e) => {
                          if (e.currentTarget.naturalWidth > 0) {
                            setImageLoaded(true);
                            setImageError(false);
                          }
                        }}
                        onError={() => {
                          setImageLoaded(false);
                          setImageError(true);
                        }}
                      />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-[hsl(var(--color-ink))]/55">
                        <BookOpen className="h-10 w-10 opacity-50" aria-hidden />
                        <p className="text-sm">{imageError ? "縮圖暫時無法顯示" : "此篇尚未設定封面圖"}</p>
                      </div>
                    )}
                  </div>

                  <div className="relative z-[1] w-full max-w-lg space-y-1 text-center">
                    <p className="text-sm font-semibold text-[hsl(var(--color-ink))] sm:text-base">
                      {current.item_name}
                    </p>
                    {current.intro ? (
                      <p className="line-clamp-2 text-xs text-[hsl(var(--color-ink))]/65 sm:text-sm">
                        {current.intro}
                      </p>
                    ) : null}
                  </div>
                </div>

                {slides.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={goPrev}
                      className="absolute left-1 top-1/2 z-[1] flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-[hsl(var(--color-brand-300))]/60 bg-white/90 text-[hsl(var(--color-ink))] shadow-sm backdrop-blur-sm transition-opacity hover:opacity-100 sm:left-2 sm:h-10 sm:w-10"
                      aria-label="上一篇"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={goNext}
                      className="absolute right-1 top-1/2 z-[1] flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-[hsl(var(--color-brand-300))]/60 bg-white/90 text-[hsl(var(--color-ink))] shadow-sm backdrop-blur-sm transition-opacity hover:opacity-100 sm:right-2 sm:h-10 sm:w-10"
                      aria-label="下一篇"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </>
                )}
              </div>

              <div className="flex shrink-0 flex-col gap-2 border-t border-[hsl(var(--color-brand-300))]/30 bg-white px-4 py-3 sm:px-5 sm:py-3.5">
                <Link
                  href={articleHref}
                  className="inline-flex w-full items-center justify-center rounded-full border-2 border-[hsl(var(--color-brand-500))] bg-[hsl(var(--color-brand-500))] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                >
                  閱讀案例文章
                </Link>
                {slides.length > 1 ? (
                  <div className="flex items-center justify-center gap-1.5 pt-0.5">
                    {slides.map((s, idx) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSlideIndex(idx)}
                        className={cn(
                          "h-2 w-2 rounded-full transition-colors",
                          idx === displayIndex
                            ? "bg-[hsl(var(--color-brand-500))]"
                            : "bg-[hsl(var(--color-brand-300))]/40 hover:bg-[hsl(var(--color-brand-300))]/70",
                        )}
                        aria-label={`第 ${idx + 1} 篇`}
                        aria-current={idx === displayIndex ? "true" : undefined}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
