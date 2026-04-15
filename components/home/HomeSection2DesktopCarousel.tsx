"use client";

import ProgressiveImage from "@/components/ProgressiveImage";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from "@/components/ui/carousel";

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
}: {
  groupedGalleryItems: HomeGalleryItem[];
  onGalleryItemClick: (item: HomeGalleryItem) => void;
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="w-full max-w-[1400px] px-6">
        <Carousel opts={{ align: "start", slidesToScroll: 3 }} className="w-full">
          <CarouselContent className="-ml-4">
            {groupedGalleryItems.map((item) => (
              <CarouselItem key={item.id} className="pl-3 basis-1/6">
                <div onClick={() => onGalleryItemClick(item)} className="cursor-pointer group">
                  <div className="rounded-lg overflow-hidden shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-105">
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
          <CarouselPrevious className="-left-12" />
          <CarouselNext className="-right-12" />
        </Carousel>
      </div>
    </div>
  );
}
