"use client";

import ProgressiveImage from "@/components/ProgressiveImage";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from "@/components/ui/carousel";
import { cn } from "@/lib/utils";

export interface HomeGalleryItem {
  id: string;
  photo_url: string;
  metadata_tab: { product: string } | null;
  ui_width: number | null;
  ui_height: number | null;
}

export function HomeSection2DesktopCarousel({
  groupedGalleryItems,
  onGalleryItemClick,
  /** 一列幾個（預設 6） */
  columns = 6,
  /**
   * homepage：疊在背景底圖上（absolute），外側箭頭。
   * embedded：疊在背景上，箭頭內側。
   * standalone：無背景底圖，相對定位，箭頭內側。
   */
  variant = "homepage",
}: {
  groupedGalleryItems: HomeGalleryItem[];
  onGalleryItemClick: (item: HomeGalleryItem) => void;
  columns?: 5 | 6;
  variant?: "homepage" | "embedded" | "standalone";
}) {
  const basisClass = columns === 5 ? "basis-1/5" : "basis-1/6";
  const slidesToScroll = columns === 5 ? 5 : 3;
  const standalone = variant === "standalone";
  const arrowsInside = variant === "embedded" || standalone;

  return (
    <div
      className={
        standalone
          ? "relative flex w-full items-center justify-center py-2"
          : "absolute inset-0 flex items-center justify-center"
      }
    >
      <div
        className={cn(
          "w-full",
          standalone ? "px-10" : "px-6",
          arrowsInside ? "max-w-none" : "max-w-[1400px]",
        )}
      >
        <Carousel opts={{ align: "start", slidesToScroll }} className="relative w-full">
          <CarouselContent className="-ml-4">
            {groupedGalleryItems.map((item) => (
              <CarouselItem key={item.id} className={cn("pl-3", basisClass)}>
                <div onClick={() => onGalleryItemClick(item)} className="group cursor-pointer">
                  <div className="overflow-hidden rounded-lg shadow-lg transition-all duration-300 group-hover:scale-105 group-hover:shadow-xl">
                    <ProgressiveImage
                      src={item.photo_url}
                      alt="gallery item"
                      width={item.ui_width ?? undefined}
                      height={item.ui_height ?? undefined}
                      aspectRatio={item.ui_width && item.ui_height ? undefined : 1}
                      containerClassName="w-full"
                    />
                  </div>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious
            className={cn(
              arrowsInside ? "left-0 z-20" : "-left-12",
              "border bg-white/95 shadow-md hover:bg-white",
            )}
          />
          <CarouselNext
            className={cn(
              arrowsInside ? "right-0 z-20" : "-right-12",
              "border bg-white/95 shadow-md hover:bg-white",
            )}
          />
        </Carousel>
      </div>
    </div>
  );
}
