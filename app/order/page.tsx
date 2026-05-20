"use client";

import { useState, useEffect, useCallback, useMemo, useRef, type TouchEvent } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { LoadingScreen } from "@/components/LoadingScreen";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Images } from "lucide-react";
import { cn } from "@/lib/utils";
import { QUERY_KEYS } from "@/lib/react-query-keys";

interface ProductItem {
  id: string;
  name: string;
  description?: string | null;
  product_image_url?: string | null;
  ui_position_x?: number | null;
  ui_position_y?: number | null;
  ui_width?: number | null;
  ui_height?: number | null;
}

/** 與 Supabase `Website_photo_material` 插入資料約定一致（見內容管理／SQL） */
const ORDER_EXAMPLES_CATEGORY = "order_popup";
const ORDER_EXAMPLES_PUT_WHERE = "customer_examples";

interface OrderExampleSlide {
  id: string;
  item_name: string | null;
  photo_url: string | null;
  photo_url_mobile: string | null;
  sort_order: number | null;
  description: string | null;
}

const ORDER_QUERY_KEYS = {
  orderBackground: QUERY_KEYS.orderBackground,
  orderProducts: QUERY_KEYS.orderProducts,
};

export default function OrderPage() {
  const router = useRouter();
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [showCakeDialog, setShowCakeDialog] = useState(false);
  const [showExamplesDialog, setShowExamplesDialog] = useState(false);
  const [exampleSlideIndex, setExampleSlideIndex] = useState(0);
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);
  const exampleTouchStartX = useRef<number | null>(null);
  /** 每次進入本頁只自動開一次；離開再進或資料清空後會重置 */
  const examplesAutoOpenedRef = useRef(false);

  const DESIGN_WIDTH = 1680;
  const DESIGN_HEIGHT = 1050;

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const updateScale = () => {
      if (typeof window === "undefined") return;
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      const scaleX = windowWidth / DESIGN_WIDTH;
      const scaleY = windowHeight / DESIGN_HEIGHT;
      setScale(Math.max(scaleX, scaleY));
    };

    const throttledUpdate = () => {
      if (timeoutId) return;
      timeoutId = setTimeout(() => {
        updateScale();
        timeoutId = null;
      }, 100);
    };

    updateScale();
    window.addEventListener("resize", throttledUpdate);
    return () => {
      window.removeEventListener("resize", throttledUpdate);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const apply = () => setIsNarrowViewport(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const { data: backgroundUrl = "" } = useQuery({
    queryKey: ORDER_QUERY_KEYS.orderBackground,
    queryFn: async () => {
      const { data } = await supabase
        .from("Website_photo_material")
        .select("photo_url")
        .eq("id", "e7771214-c7b6-4c10-a421-a251089c71a4")
        .single();
      return data?.photo_url || "";
    },
  });

  const { data: exampleSlidesRaw = [] } = useQuery({
    queryKey: QUERY_KEYS.orderCustomerExamples,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("Website_photo_material")
        .select("id, item_name, photo_url, photo_url_mobile, sort_order, description")
        .eq("category", ORDER_EXAMPLES_CATEGORY)
        .eq("put_where", ORDER_EXAMPLES_PUT_WHERE)
        .not("sort_order", "is", null)
        .order("sort_order", { ascending: true });
      if (error) {
        console.error("[order] customer examples fetch:", error.message);
        return [] as OrderExampleSlide[];
      }
      return (data ?? []) as OrderExampleSlide[];
    },
  });

  const exampleSlides = useMemo(
    () =>
      exampleSlidesRaw.filter((s) => {
        const d = (s.photo_url ?? "").trim();
        const m = (s.photo_url_mobile ?? "").trim();
        return Boolean(d || m);
      }),
    [exampleSlidesRaw],
  );

  useEffect(() => {
    if (exampleSlides.length === 0) {
      examplesAutoOpenedRef.current = false;
      return;
    }
    if (examplesAutoOpenedRef.current) return;
    const id = window.setTimeout(() => {
      setShowExamplesDialog(true);
      examplesAutoOpenedRef.current = true;
    }, 0);
    return () => clearTimeout(id);
  }, [exampleSlides.length]);

  const exampleDisplayIndex =
    exampleSlides.length === 0 ? 0 : Math.min(exampleSlideIndex, exampleSlides.length - 1);

  const handleExamplesOpenChange = useCallback((open: boolean) => {
    setShowExamplesDialog(open);
  }, []);

  const openExamplesDialog = useCallback(() => {
    setExampleSlideIndex(0);
    setShowExamplesDialog(true);
  }, []);

  const goExamplePrev = useCallback(() => {
    setExampleSlideIndex((i) => {
      const len = exampleSlides.length;
      if (len === 0) return 0;
      const start = Math.min(i, len - 1);
      return (start - 1 + len) % len;
    });
  }, [exampleSlides.length]);

  const goExampleNext = useCallback(() => {
    setExampleSlideIndex((i) => {
      const len = exampleSlides.length;
      if (len === 0) return 0;
      const start = Math.min(i, len - 1);
      return (start + 1) % len;
    });
  }, [exampleSlides.length]);

  const onExampleTouchStart = useCallback((e: TouchEvent) => {
    exampleTouchStartX.current = e.changedTouches[0]?.clientX ?? null;
  }, []);

  const onExampleTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (exampleTouchStartX.current == null) return;
      const endX = e.changedTouches[0]?.clientX ?? exampleTouchStartX.current;
      const dx = endX - exampleTouchStartX.current;
      exampleTouchStartX.current = null;
      if (Math.abs(dx) < 48) return;
      if (dx > 0) goExamplePrev();
      else goExampleNext();
    },
    [goExamplePrev, goExampleNext],
  );

  useEffect(() => {
    if (!showExamplesDialog || exampleSlides.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goExamplePrev();
      if (e.key === "ArrowRight") goExampleNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showExamplesDialog, exampleSlides.length, goExamplePrev, goExampleNext]);

  const { data: nonGiftboxItems = [], isLoading } = useQuery({
    queryKey: ORDER_QUERY_KEYS.orderProducts,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, description, product_image_url, ui_position_x, ui_position_y, ui_width, ui_height",
        )
        .eq("category", "custom_design");

      if (error) throw error;

      return (data ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description ?? null,
        product_image_url: item.product_image_url ?? null,
        ui_position_x: item.ui_position_x ?? 0,
        ui_position_y: item.ui_position_y ?? 0,
        ui_width: item.ui_width ?? 150,
        ui_height: item.ui_height ?? 150,
      })) as ProductItem[];
    },
  });

  const handleItemClick = (productId: string) => {
    if (productId === "cake") {
      setShowCakeDialog(true);
    } else {
      router.push(`/product/${productId}`);
    }
  };

  if (isLoading) {
    return <LoadingScreen fullScreen message="載入選購目錄中..." />;
  }

  const baseScaleClass = "scale-[2]";
  const hoverScaleClass = "hover:scale-[2.05]";

  const currentExample = exampleSlides[exampleDisplayIndex];
  const currentExampleSrc = currentExample
    ? isNarrowViewport
      ? (currentExample.photo_url_mobile ?? "").trim() || (currentExample.photo_url ?? "").trim()
      : (currentExample.photo_url ?? "").trim()
    : "";

  return (
    <div className="relative min-h-screen overflow-x-hidden overflow-y-auto bg-background">
      {exampleSlides.length > 0 && !showExamplesDialog && (
        <button
          type="button"
          onClick={openExamplesDialog}
          className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border-2 border-[hsl(var(--color-brand-300))] bg-[hsl(var(--color-brand-100))] px-3 py-2 text-xs font-medium text-[hsl(var(--color-ink))] shadow-md transition-opacity hover:opacity-95 sm:bottom-6 sm:right-6 sm:text-sm"
          aria-label="來看看其他客人客製化了什麼"
        >
          <Images className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
          客製範例
        </button>
      )}

      {/* 右側直排：桌機 z 須高於畫布 z-[11]，否則全幅畫布會整塊蓋住標題 */}
      <div className="pointer-events-none absolute right-2.5 top-14 z-50 sm:right-5 sm:top-16 sm:z-[12] md:right-8">
        <div className="flex flex-row-reverse items-start gap-2 sm:gap-1.5">
          <h1
            className="text-xs font-semibold tracking-[0.16em] text-ink-900 [text-shadow:0_1px_2px_rgba(255,255,255,0.9)] [writing-mode:vertical-rl] sm:text-[10px] sm:font-medium sm:tracking-[0.14em] sm:text-white/85 sm:[text-shadow:0_1px_8px_rgba(0,0,0,0.35)]"
            style={{ textOrientation: "mixed" }}
          >
            客製甜點
          </h1>
          <h2
            className="text-[8px] font-light leading-relaxed tracking-wide text-zinc-600 [text-shadow:0_0_1px_rgba(255,255,255,0.8)] [writing-mode:vertical-rl] sm:text-[7px] sm:leading-snug sm:text-white/65 sm:[text-shadow:0_1px_5px_rgba(0,0,0,0.28)]"
            style={{ textOrientation: "mixed" }}
          >
            十一項單品，皆可特製
          </h2>
        </div>
      </div>

      {/* 桌機版：統一縮放容器（包含背景和物件） */}
      <div className="hidden sm:block">
        <div
          className="absolute z-[11]"
          style={{
            width: DESIGN_WIDTH,
            height: DESIGN_HEIGHT,
            transform: `scale(${scale})`,
            transformOrigin: "center center",
            left: "50%",
            top: "50%",
            marginLeft: -DESIGN_WIDTH / 2,
            marginTop: -DESIGN_HEIGHT / 2,
          }}
        >
          {backgroundUrl && (
            <img
              src={backgroundUrl}
              alt="背景圖"
              className="absolute top-16 left-0 w-full h-[calc(100%-4rem)] object-cover"
            />
          )}
          <div className="absolute inset-0 bg-black/5" />

          {nonGiftboxItems.map((item) => (
            <div
              key={item.id}
              className="absolute group hoverable-item"
              onMouseEnter={() => setHoveredItemId(item.id)}
              onMouseLeave={() => setHoveredItemId(null)}
              style={{
                top: `${item.ui_position_y}px`,
                left: `${item.ui_position_x}px`,
                width: `${item.ui_width}px`,
                height: `${item.ui_height}px`,
                zIndex: hoveredItemId === item.id ? 99 : 20,
              }}
            >
              <div
                className={`transition-transform duration-300 ${baseScaleClass} ${hoverScaleClass} cursor-pointer`}
              >
                {item.product_image_url && (
                  <img
                    src={item.product_image_url}
                    alt={item.name}
                    className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.02] cursor-pointer"
                    onClick={() => handleItemClick(item.id)}
                  />
                )}

                <div
                  className="
                    absolute inset-0 flex items-center justify-start items-end gap-2
                    opacity-0 transition-opacity duration-500 ease-out
                    group-hover:opacity-100
                    pointer-events-none
                  "
                >
                  <div
                    className="
                      bg-white/80 text-black text-[8px] font-medium
                      px-1.5 py-2 rounded-[5px] shadow-sm
                      flex items-center justify-center text-center
                      min-h-[95px] max-h-[95px]
                    "
                    style={{
                      writingMode: "vertical-rl",
                      whiteSpace: "pre-line",
                      lineHeight: "1.4em",
                      letterSpacing: "0.08em",
                    }}
                  >
                    {(item.description || "甜點介紹").replace(/，/g, "，\n")}
                  </div>

                  <div
                    className="
                      bg-[#f9d8c8]/85 text-[#4b2e1e] text-[9.5px] font-medium
                      px-2 py-3 rounded-[5px] shadow-sm
                      flex items-center justify-center text-center
                      min-h-[95px] max-h-[95px]
                    "
                    style={{
                      writingMode: "vertical-rl",
                      lineHeight: "1.4em",
                      letterSpacing: "0.1em",
                    }}
                  >
                    {item.name}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 手機版 */}
      <div className="block sm:hidden relative min-h-screen">
        {backgroundUrl && (
          <div className="absolute inset-0 z-0">
            <img src={backgroundUrl} alt="背景圖" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-black/5" />
          </div>
        )}

        <div className="relative z-10 p-6 pt-32">
          <div className="grid grid-cols-2 gap-6">
            {nonGiftboxItems.map((item) => (
              <div
                key={item.id}
                onClick={() => handleItemClick(item.id)}
                className="flex flex-col items-center cursor-pointer"
              >
                <div className="aspect-square w-full">
                  {item.product_image_url ? (
                    <img
                      src={item.product_image_url}
                      alt={item.name || "產品圖片"}
                      width={150}
                      height={150}
                      className="h-full w-full object-contain drop-shadow-md"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-muted/30 text-xs text-muted-foreground">
                      無圖
                    </div>
                  )}
                </div>
                <p className="mt-2 text-[#4b2e1e] text-sm text-center">{item.name}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 客製範例輪播（Website_photo_material：category=order_popup, put_where=customer_examples） */}
      <Dialog open={showExamplesDialog} onOpenChange={handleExamplesOpenChange}>
        <DialogContent
          className={cn(
            "!flex h-auto max-h-[min(92vh,900px)] w-[100vw] max-w-[100vw] flex-col gap-0 overflow-hidden rounded-none border-2 border-[hsl(var(--color-brand-300))] bg-white p-0 shadow-xl",
            "sm:left-[50%] sm:top-[50%] sm:max-h-[min(88vh,820px)] sm:max-w-[min(720px,92vw)] sm:w-full sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg",
            "z-[100]",
          )}
        >
          <DialogHeader className="relative shrink-0 space-y-0 border-b-2 border-[hsl(var(--color-brand-300))] bg-[hsl(var(--color-brand-100))] px-4 py-3 pr-12 text-left sm:px-5 sm:py-3.5 sm:pr-14">
            <DialogTitle className="text-center text-sm font-semibold leading-snug text-[hsl(var(--color-ink))] sm:text-base">
              來看看其他人客製化了什麼！
            </DialogTitle>
            <DialogDescription className="sr-only">
              使用左右箭頭、圓點或左右滑動切換客製成品照片。
            </DialogDescription>
          </DialogHeader>

          {currentExample && currentExampleSrc ? (
            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-white">
              <div
                role="region"
                aria-roledescription="輪播"
                aria-label="客製成品照片"
                className="relative flex min-h-[min(52vh,420px)] w-full flex-1 touch-pan-y items-center justify-center bg-white px-0 py-2 sm:min-h-[min(48vh,440px)] sm:px-4 sm:py-4"
                onTouchStart={onExampleTouchStart}
                onTouchEnd={onExampleTouchEnd}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- 輪播外連 Supabase Storage，與本頁畫布區塊一致 */}
                <img
                  src={currentExampleSrc}
                  alt={currentExample.item_name || `客製範例 ${exampleDisplayIndex + 1}`}
                  className="h-auto max-h-[min(78vh,640px)] w-full max-w-none object-contain sm:max-h-[min(70vh,520px)] sm:max-w-full sm:rounded-md"
                  loading="eager"
                  decoding="async"
                  draggable={false}
                />

                {exampleSlides.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={goExamplePrev}
                      className="absolute left-1 top-1/2 z-[1] flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-[hsl(var(--color-brand-300))]/60 bg-white/90 text-[hsl(var(--color-ink))] shadow-sm backdrop-blur-sm transition-opacity hover:opacity-100 sm:left-2 sm:h-10 sm:w-10"
                      aria-label="上一張"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={goExampleNext}
                      className="absolute right-1 top-1/2 z-[1] flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-[hsl(var(--color-brand-300))]/60 bg-white/90 text-[hsl(var(--color-ink))] shadow-sm backdrop-blur-sm transition-opacity hover:opacity-100 sm:right-2 sm:h-10 sm:w-10"
                      aria-label="下一張"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </>
                )}
              </div>

              {exampleSlides.length > 1 && (
                <div className="flex shrink-0 items-center justify-center gap-1.5 border-t border-[hsl(var(--color-brand-300))]/30 bg-white px-3 py-2.5 sm:py-3">
                  {exampleSlides.map((s, idx) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setExampleSlideIndex(idx)}
                      className={cn(
                        "h-2 w-2 rounded-full transition-colors",
                        idx === exampleDisplayIndex
                          ? "bg-[hsl(var(--color-brand-500))]"
                          : "bg-[hsl(var(--color-brand-300))]/40 hover:bg-[hsl(var(--color-brand-300))]/70",
                      )}
                      aria-label={`第 ${idx + 1} 張`}
                      aria-current={idx === exampleDisplayIndex ? "true" : undefined}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* 客製化蛋糕服務彈窗 */}
      <Dialog open={showCakeDialog} onOpenChange={setShowCakeDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>客製化蛋糕服務</DialogTitle>
            <DialogDescription className="pt-4 space-y-3">
              <p>此品項目前沒有線上編輯器。</p>
              <p>請直接填寫報價單，或聯絡 LINE 官方客服，由專人為您服務。</p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-4">
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <a
                href="https://docs.google.com/forms/d/e/1FAIpQLScrt3q-K9zGyYLxzJGoK0HpYuqy1qDrtHuL52_5QjeExaB3tw/viewform"
                target="_blank"
                rel="noopener noreferrer"
              >
                填寫報價單
              </a>
            </Button>
            <Button asChild className="w-full sm:w-auto">
              <a href="https://lin.ee/Tp9U5bf" target="_blank" rel="noopener noreferrer">
                LINE 官方客服
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
