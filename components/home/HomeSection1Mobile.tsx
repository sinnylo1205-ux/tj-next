"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";
import { SECTION1_MOBILE_BACKGROUND_URL } from "@/lib/home-lcp-urls";

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
  go_to_where?: string | null;
};

function swapTopAndBottomImages<T>(list: T[]): T[] {
  if (list.length < 2) return list;
  const next = list.slice();
  const last = next.length - 1;
  [next[0], next[last]] = [next[last], next[0]];
  return next;
}

/**
 * 手機首頁 Section 1：直式滿寬背景圖 + CMS 前景圖置於三枚導向鈕內（右側、等比縮小容納於鈕內）。
 */
export function HomeSection1Mobile({ items }: { items: HomeSection1MobileItem[] }) {
  const imageItems = swapTopAndBottomImages(items);

  return (
    <div className="relative w-full">
      {/* 整張圖依螢幕寬度縮放、維持比例，不裁切（勿用 object-cover） */}
      <img
        src={SECTION1_MOBILE_BACKGROUND_URL}
        alt=""
        className="pointer-events-none block h-auto w-full max-w-full select-none"
        sizes="100vw"
        aria-hidden
        fetchPriority="high"
        decoding="async"
      />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/15 via-transparent to-background/25"
        aria-hidden
      />

      <div className="absolute inset-0 z-10 mx-auto flex max-w-lg flex-col items-center justify-center px-3 py-16 pb-24 pt-20">
        <div className="w-full min-w-0 max-w-[min(360px,92vw)]">
          <div className="flex min-w-0 flex-col gap-7 sm:gap-9">
            {SECTION1_MOBILE_CTA.map((row, index) => {
              const item = imageItems[index];
              const href = (item?.go_to_where && item.go_to_where.trim()) || row.href;
              return (
                <Link
                  key={row.href}
                  href={href}
                  className="flex min-h-0 min-w-0 flex-row items-stretch gap-2.5 overflow-hidden rounded-3xl border border-brand-100/80 bg-brand-50/95 px-3.5 py-3.5 shadow-sm transition-all hover:border-brand-300/50 hover:bg-brand-100/60 hover:shadow-md active:scale-[0.99] sm:gap-3 sm:px-4 sm:py-4"
                >
                  <div className="flex min-w-0 flex-1 flex-col justify-center pr-0.5">
                    <span className="text-[15px] font-semibold leading-tight text-foreground sm:text-[16px]">
                      {row.title}
                    </span>
                    <span className="mt-1.5 text-left text-[11px] leading-snug text-muted-foreground sm:mt-2 sm:text-xs">
                      {row.subtitle}
                    </span>
                  </div>
                  {item?.photo_url ? (
                    <div
                      className={cn(
                        "flex w-[4.5rem] shrink-0 items-center justify-center self-center sm:w-[5.25rem]",
                        "min-h-[3.25rem] max-h-[4.5rem] sm:min-h-16 sm:max-h-20",
                      )}
                    >
                      <img
                        src={item.photo_url}
                        alt={item.description || "甜點"}
                        width={item.ui_width ?? 200}
                        height={item.ui_height ?? 200}
                        className="max-h-full max-w-full object-contain object-center"
                        loading={index === 0 ? "eager" : "lazy"}
                        fetchPriority={index === 0 ? "high" : undefined}
                        decoding="async"
                      />
                    </div>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
