"use client";

import Link from "next/link";

import { MOBILE_HERO_URL } from "@/lib/home-lcp-urls";
import { cn } from "@/lib/utils";

const SECTION1_MOBILE_CTA = [
  {
    href: "/order",
    title: "單品客製化",
    subtitle: "30顆杯子蛋糕、一百份爆米花",
  },
  {
    href: "/gift-boxes",
    title: "禮／餐盒客製化",
    subtitle: "甜點自由選配",
  },
  {
    href: "/gallery",
    title: "甜點佈置",
    subtitle: "包含場地佈置與設計",
  },
] as const;

export type HomeSection1MobileItem = {
  id: string;
  photo_url: string;
  description: string | null;
  ui_width: number | null;
  ui_height: number | null;
};

function swapTopAndBottomImages<T>(list: T[]): T[] {
  if (list.length < 2) return list;
  const next = list.slice();
  const last = next.length - 1;
  [next[0], next[last]] = [next[last], next[0]];
  return next;
}

/**
 * 手機首頁 Section 1：背景圖以原始比例完整納入區塊（`object-contain`，不裁切、不拉伸）+ 淡漸層；三枚導向按鈕置中，CMS 前景圖疊於按鈕右側。
 */
export function HomeSection1Mobile({
  items,
  onItemImageClick,
}: {
  items: HomeSection1MobileItem[];
  onItemImageClick: (item: HomeSection1MobileItem) => void;
}) {
  const imageItems = swapTopAndBottomImages(items);

  return (
    <div className="relative isolate w-full min-h-[min(88dvh,640px)] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <img
          src={MOBILE_HERO_URL}
          alt=""
          className="h-auto w-auto max-h-[min(88dvh,640px)] max-w-full object-contain object-center"
          loading="eager"
          fetchPriority="high"
          decoding="async"
          sizes="100vw"
          aria-hidden
        />
      </div>
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[hsl(var(--brand-50))]/55 via-background/40 to-[hsl(var(--muted))]/45"
        aria-hidden
      />
      <div className="relative z-10 mx-auto flex min-h-[min(88dvh,640px)] max-w-lg flex-col items-center justify-center overflow-visible px-3 pb-28 pt-24">
        <div className="relative w-[min(320px,90vw)] shrink-0">
          {/* 下層：三按鈕（淡品牌粉） */}
          <div className="relative z-10 flex min-w-0 flex-col gap-8 sm:gap-10">
            {SECTION1_MOBILE_CTA.map((row) => (
              <Link
                key={row.href}
                href={row.href}
                className="flex flex-col rounded-3xl border border-brand-100/70 bg-brand-50/95 px-5 py-4.5 pr-11 shadow-sm transition-all hover:border-brand-300/40 hover:bg-brand-100/55 hover:shadow-md active:scale-[0.99] sm:px-6 sm:py-5 sm:pr-12"
              >
                <span className="text-[16px] font-semibold leading-tight text-foreground sm:text-[17px]">
                  {row.title}
                </span>
                <span className="mt-2 text-left text-xs leading-snug text-muted-foreground sm:text-[13px]">{row.subtitle}</span>
              </Link>
            ))}
          </div>

          {/* 上層：前景圖貼按鈕右側、疊在按鈕上 */}
          <div className="pointer-events-none absolute left-[54%] top-1/2 z-20 flex -translate-y-1/2 flex-col gap-2.5 sm:left-[56%]">
            {imageItems
              .filter((item) => item.photo_url)
              .map((item, index, arr) => {
                const isBottom = index === arr.length - 1;
                const isLcpCandidate = index === 0;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onItemImageClick(item)}
                    className={cn(
                      "pointer-events-auto relative w-full max-w-[140px] drop-shadow-md transition-transform active:scale-[0.98] sm:max-w-[156px]",
                      isBottom && "-translate-x-1.5 sm:-translate-x-2",
                    )}
                  >
                    <img
                      src={item.photo_url}
                      alt={item.description || "甜點"}
                      width={128}
                      height={128}
                      className="block h-auto max-h-[128px] w-full max-w-[140px] object-contain sm:max-h-[140px] sm:max-w-[156px]"
                      loading={isLcpCandidate ? "eager" : "lazy"}
                      fetchPriority={isLcpCandidate ? "low" : undefined}
                      decoding="async"
                    />
                  </button>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}
