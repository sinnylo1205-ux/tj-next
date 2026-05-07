"use client";

import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { OrbitalSelector, type OrbitalItem } from "@/components/OrbitalSelector";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingScreen } from "@/components/LoadingScreen";
import ProgressiveImage from "@/components/ProgressiveImage";
import { QUERY_KEYS } from "@/lib/react-query-keys";
import { SafeImage } from "@/components/SafeImage";
import {
  fetchGiftBoxesBackground,
  fetchGiftBoxesForeground,
  fetchGiftBoxesProducts,
  fetchGiftBoxesNotices,
  resolveGiftBoxBackgroundDesktop,
  resolveGiftBoxBackgroundMobile,
  type GiftBoxBackgroundSection,
  type GiftBoxForegroundItem,
  type GiftBoxProductNotice,
  type GiftBoxProductRow,
} from "@/lib/gift-boxes-queries";

export type NavigateFn = (url: string) => void;

const SECTION_PRODUCT_MAPPING: Record<
  string,
  { imageId: string; productId: string; imagePosition: "left" | "right" }[]
> = {
  "8f117517-8846-4945-a259-a343b840a2a7": [
    { imageId: "d9514b72-3fd1-4120-9a31-b7669b844f03", productId: "giftbox_big", imagePosition: "left" },
    { imageId: "4de3ff16-3795-4eea-867b-36b92a009ae9", productId: "giftbox_midium", imagePosition: "right" },
    { imageId: "fe02c8c1-8602-4dd3-a948-da746639db8f", productId: "giftbox_small", imagePosition: "left" },
  ],
  "0b5d9c0a-2fd1-4572-b58b-3ca5aa8ee943": [
    { imageId: "920bb36e-26a0-4647-b5fc-ca24e131db48", productId: "box_6", imagePosition: "right" },
    { imageId: "2b1e3d19-b007-4b8d-908f-620e5b9a965a", productId: "box_3", imagePosition: "left" },
  ],
};

export const PRODUCT_NOTICE_ROUTES: Record<string, string> = {
  giftbox_big: "/product/giftbox_big",
  giftbox_midium: "/product/giftbox_midium",
  giftbox_small: "/product/giftbox_small",
  box_6: "/product/box_6",
  box_3: "/product/box_3",
};

/** 桌面／手機分層背景，避免依 JS matchMedia 切 src 造成 CLS */
function GiftBoxBackgroundMedia({
  section,
  priority,
}: {
  section: GiftBoxBackgroundSection;
  priority?: boolean;
}) {
  const desktop = resolveGiftBoxBackgroundDesktop(section);
  const mobile = resolveGiftBoxBackgroundMobile(section);
  const hasMobileAsset = Boolean(section.photo_url_mobile);

  if (!hasMobileAsset) {
    return (
      <div className="relative w-full" style={{ aspectRatio: desktop.aspectRatio }} aria-hidden>
        <ProgressiveImage
          src={desktop.url}
          alt=""
          containerClassName="absolute inset-0 h-full w-full"
          className="h-full w-full object-cover"
          width={desktop.width}
          height={desktop.height}
          priority={priority}
        />
      </div>
    );
  }

  return (
    <div className="relative w-full">
      <div className="relative w-full md:hidden" style={{ aspectRatio: mobile.aspectRatio }} aria-hidden>
        <ProgressiveImage
          src={mobile.url}
          alt=""
          containerClassName="absolute inset-0 h-full w-full"
          className="h-full w-full object-cover"
          width={mobile.width}
          height={mobile.height}
          priority={priority}
        />
      </div>
      <div className="relative hidden w-full md:block" style={{ aspectRatio: desktop.aspectRatio }} aria-hidden>
        <ProgressiveImage
          src={desktop.url}
          alt=""
          containerClassName="absolute inset-0 h-full w-full"
          className="h-full w-full object-cover"
          width={desktop.width}
          height={desktop.height}
          priority={priority}
        />
      </div>
    </div>
  );
}

export function GiftBoxesClient({ navigate }: { navigate: NavigateFn }) {
  const rotateLeftRef = useRef<(() => void) | null>(null);
  const rotateRightRef = useRef<(() => void) | null>(null);

  const bgQuery = useQuery({
    queryKey: QUERY_KEYS.giftBoxesBackground,
    queryFn: () => fetchGiftBoxesBackground(supabase),
  });

  const fgQuery = useQuery({
    queryKey: QUERY_KEYS.giftBoxesForeground,
    queryFn: () => fetchGiftBoxesForeground(supabase),
  });

  const prodQuery = useQuery({
    queryKey: QUERY_KEYS.giftBoxesProducts,
    queryFn: () => fetchGiftBoxesProducts(supabase),
  });

  const noticeQuery = useQuery({
    queryKey: QUERY_KEYS.giftBoxesNotices,
    queryFn: () => fetchGiftBoxesNotices(supabase),
  });

  const backgroundSections = bgQuery.data ?? [];
  const foregroundItems = fgQuery.data ?? [];
  const products = prodQuery.data ?? ([] as GiftBoxProductRow[]);
  const productNotices = noticeQuery.data ?? ([] as GiftBoxProductNotice[]);

  const hasHydratedOrFetchedData =
    bgQuery.data !== undefined ||
    fgQuery.data !== undefined ||
    prodQuery.data !== undefined ||
    noticeQuery.data !== undefined;

  const stillLoading =
    bgQuery.isPending || fgQuery.isPending || prodQuery.isPending || noticeQuery.isPending;

  /** 伺服端 dehydrate 後四份皆有資料 → 不顯示全螢幕 Loading */
  const showFullScreenLoading = stillLoading && !hasHydratedOrFetchedData;

  const hasError =
    bgQuery.isError || fgQuery.isError || prodQuery.isError || noticeQuery.isError;

  const handleProductSelect = (item: OrbitalItem) => {
    navigate(PRODUCT_NOTICE_ROUTES[item.id] ?? `/product/${item.id}`);
  };

  const orbitalItems: OrbitalItem[] = products.map((product) => ({
    id: product.id,
    name: product.name || product.id,
    imageUrl: product.product_image_url,
    hoverImageUrl: product.hover_image_url,
  }));

  const getForegroundItemsForSection = (sectionId: string) =>
    foregroundItems.filter((item: GiftBoxForegroundItem) => item.put_where === sectionId);

  const getProductInfo = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    const notice = productNotices.find((n) => n.product_id === productId);
    return { product, notice };
  };

  const ProductInfoCard = ({ productId }: { productId: string }) => {
    const { product, notice } = getProductInfo(productId);
    if (!product) return null;
    const route = PRODUCT_NOTICE_ROUTES[productId] || "/";
    return (
      <div className="flex h-full flex-col justify-center gap-1 md:gap-4">
        <h2 className="text-base font-bold leading-tight text-foreground md:text-4xl">{product.name || productId}</h2>
        {notice?.label && notice.label.length > 0 && (
          <div className="flex flex-wrap gap-1 md:gap-3">
            {notice.label.slice(0, 2).map((tag, idx) => (
              <span key={idx} className="rounded-full bg-foreground px-2 py-0.5 text-[10px] text-background md:px-3 md:py-1 md:text-sm">
                {tag}
              </span>
            ))}
            {notice.label.slice(2).map((tag, idx) => (
              <span key={idx + 2} className="hidden rounded-full bg-foreground px-3 py-1 text-sm text-background md:inline-block">
                {tag}
              </span>
            ))}
          </div>
        )}
        {product.description && (
          <div className="w-full md:max-w-[500px]">
            <p className="line-clamp-2 text-[10px] font-normal leading-relaxed text-foreground/80 md:line-clamp-3 md:text-xl md:font-bold">
              {product.description}
            </p>
          </div>
        )}
        <div className="mt-1 flex flex-col gap-1 md:mt-2 md:flex-row md:items-center md:gap-4">
          {notice?.size && (
            <span className="hidden text-[9px] text-muted-foreground md:block md:text-sm">{notice.size}</span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-6 origin-left gap-1 border-foreground bg-transparent text-foreground scale-[0.92] hover:bg-foreground/10 md:h-10 md:scale-100 md:gap-2 md:ml-auto"
            onClick={() => navigate(route)}
          >
            進入選購
            <ArrowRight className="h-3 w-3 md:h-4 md:w-4" />
          </Button>
        </div>
      </div>
    );
  };

  if (showFullScreenLoading) return <LoadingScreen fullScreen message="載入中..." />;
  if (hasError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <p className="text-lg text-destructive">載入資料時發生錯誤</p>
        <Button
          onClick={() => {
            bgQuery.refetch();
            fgQuery.refetch();
            prodQuery.refetch();
            noticeQuery.refetch();
          }}
        >
          重新載入
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full">
      {backgroundSections.map((section) => {
        const sectionForegroundItems = getForegroundItemsForSection(section.id);
        const isFirstSection = section.sort_order === 1;
        const sectionMapping = SECTION_PRODUCT_MAPPING[section.id];

        if (!isFirstSection && sectionMapping && sectionForegroundItems.length > 0) {
          const isSection2 = section.sort_order === 2;
          return (
            <section key={section.id} className="relative isolate w-full overflow-hidden bg-[#f1e1df]">
              <GiftBoxBackgroundMedia section={section} priority={false} />
              <div
                className="absolute inset-0 z-10 flex items-start"
                style={{ paddingTop: "4%", paddingBottom: isSection2 ? "3%" : "4%" }}
              >
                <div className="pointer-events-auto mx-auto w-full max-md:origin-top max-md:scale-90" style={{ maxWidth: "80%" }}>
                  <div className="flex flex-col">
                    <div className="flex flex-col gap-y-2 md:gap-y-12">
                      {sectionMapping.map((mapping) => {
                        const item = sectionForegroundItems.find((fg) => fg.id === mapping.imageId);
                        if (!item) return null;
                        const imageOnLeft = mapping.imagePosition === "left";
                        return (
                          <div
                            key={mapping.imageId}
                            className="grid items-start"
                            style={{ gridTemplateColumns: imageOnLeft ? "4fr 6fr" : "6fr 4fr", gap: "4%" }}
                          >
                            <div className={imageOnLeft ? "order-1" : "order-2"}>
                              <div className="flex justify-center">
                                <div className="relative aspect-square w-full max-w-[550px]">
                                  <div className="absolute inset-[7.5%]">
                                    <SafeImage
                                      src={item.photo_url}
                                      alt={item.item_name || "禮盒商品圖"}
                                      fill
                                      className={`object-contain transition-transform duration-300 ${item.go_to_where ? "cursor-pointer hover:scale-[1.03]" : ""}`}
                                      sizes="400px"
                                      onClick={() => item.go_to_where && navigate(item.go_to_where)}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className={imageOnLeft ? "order-2" : "order-1"}>
                              <div className="flex justify-center">
                                <div className="w-full max-w-[480px]">
                                  <ProductInfoCard productId={mapping.productId} />
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          );
        }

        return (
          <section key={section.id} className="relative isolate w-full overflow-hidden">
            <GiftBoxBackgroundMedia section={section} priority={isFirstSection} />
            <div className="absolute inset-0 z-10 flex flex-col pt-0 pb-[6%] md:pb-[9%]">
              <header className="pointer-events-none absolute left-2.5 top-2.5 z-20 max-w-[11rem] select-none text-left md:left-4 md:top-4 md:max-w-[13rem]">
                <h1 className="text-[10px] font-medium leading-snug tracking-wide text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.32)] md:text-[11px]">
                  T&J 客製化禮盒
                </h1>
                <p className="mt-0.5 text-[9px] font-normal leading-snug text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.28)] md:text-[10px] md:leading-snug">
                  企業與活動送禮｜線上設計多款禮盒
                </p>
              </header>

              <div
                className="flex min-h-[240px] flex-1 flex-col items-center px-2 pt-0 md:min-h-[300px]"
                style={{
                  transform: "translateY(-130px)",
                }}
              >
                {products.length > 0 ? (
                  <>
                    <nav
                      aria-label="軌道旋轉"
                      className="pointer-events-auto relative z-30 flex min-h-0 w-full max-w-6xl flex-1 items-center justify-center gap-4 px-1 sm:gap-7 md:gap-11 md:px-3"
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 shrink-0 rounded-full bg-background/40 shadow-md backdrop-blur-sm transition-colors hover:bg-background/60 md:h-16 md:w-16 md:bg-background/30 md:shadow-none md:backdrop-blur-sm md:hover:bg-background/50"
                        onClick={() => rotateLeftRef.current?.()}
                        aria-label="向左旋轉"
                      >
                        <ChevronLeft className="h-5 w-5 text-foreground md:h-9 md:w-9" />
                      </Button>

                      <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center">
                        <div className="hidden md:block" style={{ transform: "scale(1.5)", transformOrigin: "center center" }}>
                          <OrbitalSelector
                            items={orbitalItems}
                            onSelect={handleProductSelect}
                            radiusX={280}
                            radiusY={90}
                            height={360}
                            maxScale={1.3}
                            minScale={0.4}
                            minOpacity={0.3}
                            hideControls
                            onRotateLeftRef={rotateLeftRef}
                            onRotateRightRef={rotateRightRef}
                            priorityActiveImage
                          />
                        </div>
                        <div className="md:hidden" style={{ transform: "scale(0.38)", transformOrigin: "center center" }}>
                          <OrbitalSelector
                            items={orbitalItems}
                            onSelect={handleProductSelect}
                            radiusX={280}
                            radiusY={90}
                            height={360}
                            maxScale={1.3}
                            minScale={0.4}
                            minOpacity={0.3}
                            hideControls
                            onRotateLeftRef={rotateLeftRef}
                            onRotateRightRef={rotateRightRef}
                            priorityActiveImage
                          />
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 shrink-0 rounded-full bg-background/40 shadow-md backdrop-blur-sm transition-colors hover:bg-background/60 md:h-16 md:w-16 md:bg-background/30 md:shadow-none md:backdrop-blur-sm md:hover:bg-background/50"
                        onClick={() => rotateRightRef.current?.()}
                        aria-label="向右旋轉"
                      >
                        <ChevronRight className="h-5 w-5 text-foreground md:h-9 md:w-9" />
                      </Button>
                    </nav>
                  </>
                ) : (
                  <p className="text-center text-xs text-muted-foreground md:text-sm">目前沒有可用的禮盒選項。</p>
                )}
              </div>
            </div>
          </section>
        );
      })}
      {backgroundSections.length === 0 && (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <p className="text-muted-foreground">尚未設定頁面區塊。</p>
        </div>
      )}
    </div>
  );
}
