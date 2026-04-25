"use client";

import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { OrbitalSelector, type OrbitalItem } from "@/components/OrbitalSelector";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingScreen } from "@/components/LoadingScreen";
import ProgressiveImage from "@/components/ProgressiveImage";
import { QUERY_KEYS } from "@/hooks/usePreloadData";
import { useIsMobile } from "@/hooks/use-mobile";
import { SafeImage } from "@/components/SafeImage";

export type NavigateFn = (url: string) => void;

interface Product {
  id: string;
  name: string;
  description: string;
  product_image_url: string;
  hover_image_url: string | null;
  category: string;
}

interface ProductNotice {
  product_id: string;
  label: string[] | null;
  size: string | null;
}

interface BackgroundSection {
  id: string;
  photo_url: string;
  photo_url_mobile: string | null;
  sort_order: number;
  ui_width: number | null;
  ui_height: number | null;
  ui_width_mobile: number | null;
  ui_height_mobile: number | null;
}

interface ForegroundItem {
  id: string;
  photo_url: string;
  item_name: string | null;
  put_where: string;
  go_to_where: string | null;
  ui_width: number | null;
  ui_height: number | null;
  ui_position_x: number | null;
  ui_position_y: number | null;
}

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

const resolveBackgroundInfo = (section: BackgroundSection, isMobile: boolean) => {
  const useMobileAsset = isMobile && section.photo_url_mobile;
  const url = useMobileAsset ? section.photo_url_mobile! : section.photo_url;
  const width = useMobileAsset ? section.ui_width_mobile : section.ui_width;
  const height = useMobileAsset ? section.ui_height_mobile : section.ui_height;
  const aspectRatio =
    width && height && width > 0 && height > 0
      ? `${width} / ${height}`
      : isMobile
        ? "1000 / 846"
        : "4167 / 3523";
  return { url, width, height, aspectRatio };
};

export function GiftBoxesClient({ navigate }: { navigate: NavigateFn }) {
  const isMobile = useIsMobile();
  const rotateLeftRef = useRef<(() => void) | null>(null);
  const rotateRightRef = useRef<(() => void) | null>(null);

  const bgQuery = useQuery({
    queryKey: QUERY_KEYS.giftBoxesBackground,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("Website_photo_material")
        .select("id, photo_url, photo_url_mobile, sort_order, ui_width, ui_height, ui_width_mobile, ui_height_mobile")
        .eq("category", "gift_box")
        .not("sort_order", "is", null)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []).map((item) => ({
        id: item.id,
        photo_url: item.photo_url || "",
        photo_url_mobile: item.photo_url_mobile ?? null,
        sort_order: item.sort_order ?? 0,
        ui_width: item.ui_width ?? null,
        ui_height: item.ui_height ?? null,
        ui_width_mobile: item.ui_width_mobile ?? null,
        ui_height_mobile: item.ui_height_mobile ?? null,
      })) as BackgroundSection[];
    },
  });

  const fgQuery = useQuery({
    queryKey: QUERY_KEYS.giftBoxesForeground,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("Website_photo_material")
        .select("*")
        .eq("category", "gift_box")
        .is("sort_order", null);
      if (error) throw error;
      return (data || [])
        .filter((item: { put_where: string | null }) => item.put_where != null)
        .map((item: Record<string, unknown>) => ({
          id: item.id,
          photo_url: item.photo_url || "",
          item_name: item.item_name ?? null,
          put_where: item.put_where ?? "",
          go_to_where: item.go_to_where ?? null,
          ui_width: item.ui_width ?? null,
          ui_height: item.ui_height ?? null,
          ui_position_x: item.ui_position_x ?? null,
          ui_position_y: item.ui_position_y ?? null,
        })) as ForegroundItem[];
    },
  });

  const prodQuery = useQuery({
    queryKey: QUERY_KEYS.giftBoxesProducts,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .in("category", ["GiftBox", "meal_box"])
        .neq("is_hide", true);
      if (error) throw error;
      return (data || []) as Product[];
    },
  });

  const noticeQuery = useQuery({
    queryKey: QUERY_KEYS.giftBoxesNotices,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_notice")
        .select("product_id, label, size")
        .in("product_id", ["giftbox_big", "giftbox_midium", "giftbox_small", "box_6", "box_3"]);
      if (error) throw error;
      return (data || []).map((item) => ({
        product_id: item.product_id || "",
        label: Array.isArray(item.label) ? item.label : null,
        size: item.size,
      })) as ProductNotice[];
    },
  });

  const backgroundSections = bgQuery.data ?? [];
  const foregroundItems = fgQuery.data ?? [];
  const products = prodQuery.data ?? [];
  const productNotices = noticeQuery.data ?? [];
  const isLoading = bgQuery.isLoading || fgQuery.isLoading || prodQuery.isLoading || noticeQuery.isLoading;
  const hasError = bgQuery.isError || fgQuery.isError || prodQuery.isError || noticeQuery.isError;

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
    foregroundItems.filter((item) => item.put_where === sectionId);

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
      <div className="flex flex-col justify-center gap-1 md:gap-4 h-full">
        <h2 className="text-base md:text-4xl font-bold text-foreground leading-tight">{product.name || productId}</h2>
        {notice?.label && notice.label.length > 0 && (
          <div className="flex flex-wrap gap-1 md:gap-3">
            {notice.label.slice(0, 2).map((tag, idx) => (
              <span key={idx} className="px-2 py-0.5 md:px-3 md:py-1 text-[10px] md:text-sm rounded-full bg-foreground text-background">
                {tag}
              </span>
            ))}
            {notice.label.slice(2).map((tag, idx) => (
              <span key={idx + 2} className="hidden md:inline-block px-3 py-1 text-sm rounded-full bg-foreground text-background">
                {tag}
              </span>
            ))}
          </div>
        )}
        {product.description && (
          <div className="w-full md:max-w-[500px]">
            <p className="text-[10px] md:text-xl text-foreground/80 leading-relaxed font-normal md:font-bold line-clamp-2 md:line-clamp-3">
              {product.description}
            </p>
          </div>
        )}
        <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-4 mt-1 md:mt-2">
          {notice?.size && (
            <span className="text-[9px] md:text-sm text-muted-foreground hidden md:block">{notice.size}</span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="border-foreground text-foreground bg-transparent hover:bg-foreground/10 gap-1 md:gap-2 w-fit md:ml-auto scale-[0.92] md:scale-100 h-6 md:h-10 origin-left"
            onClick={() => navigate(route)}
          >
            進入選購
            <ArrowRight className="w-3 h-3 md:w-4 md:h-4" />
          </Button>
        </div>
      </div>
    );
  };

  if (isLoading) return <LoadingScreen fullScreen message="載入中..." />;
  if (hasError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
        <p className="text-destructive text-lg">載入資料時發生錯誤</p>
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
        const bg = resolveBackgroundInfo(section, isMobile);

        if (!isFirstSection && sectionMapping && sectionForegroundItems.length > 0) {
          const isSection2 = section.sort_order === 2;
          return (
            <section key={section.id} className="relative isolate w-full overflow-hidden bg-[#f1e1df]">
              <div className="relative w-full" style={{ aspectRatio: bg.aspectRatio }} aria-hidden>
                <ProgressiveImage
                  src={bg.url}
                  alt=""
                  containerClassName="absolute inset-0 w-full h-full"
                  className="object-cover w-full h-full"
                  width={bg.width ?? undefined}
                  height={bg.height ?? undefined}
                />
                <div
                  className="absolute inset-0 z-10 flex items-start"
                  style={{ paddingTop: isSection2 ? "8%" : "8%", paddingBottom: isSection2 ? "3%" : "4%" }}
                >
                  <div
                    className="mx-auto w-full"
                    style={{
                      maxWidth: "80%",
                      transform: isMobile ? "scale(0.90)" : "none",
                      transformOrigin: "top center",
                    }}
                  >
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
                                  <div className="relative aspect-[1/1] w-full max-w-[550px]">
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
              </div>
            </section>
          );
        }

        return (
          <section key={section.id} className="relative isolate w-full overflow-hidden">
            <div className="relative w-full" style={{ aspectRatio: bg.aspectRatio }} aria-hidden>
              <ProgressiveImage
                src={bg.url}
                alt=""
                containerClassName="absolute inset-0 w-full h-full"
                className="object-cover w-full h-full"
                width={bg.width ?? undefined}
                height={bg.height ?? undefined}
                priority
              />
              <div className="absolute inset-0 z-10 flex flex-col py-[5%] md:py-[8%]">
                <header className="pointer-events-none absolute left-2.5 top-2.5 z-20 max-w-[11rem] select-none text-left md:left-4 md:top-4 md:max-w-[13rem]">
                  <h1 className="text-[10px] font-medium leading-snug tracking-wide text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.32)] md:text-[11px]">
                    T&J 客製化禮盒
                  </h1>
                  <p className="mt-0.5 text-[9px] font-normal leading-snug text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.28)] md:text-[10px] md:leading-snug">
                    企業與活動送禮｜線上設計多款禮盒
                  </p>
                </header>
                <div className="flex min-h-0 flex-1 items-center justify-center pb-[30%]">
                  {products.length > 0 ? (
                    <>
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
                        />
                      </div>
                      <div className="md:hidden mt-[-120px]" style={{ transform: "scale(0.38)", transformOrigin: "center center" }}>
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
                        />
                      </div>
                    </>
                  ) : (
                    <p className="text-center text-muted-foreground text-xs md:text-sm">目前沒有可用的禮盒選項。</p>
                  )}
                </div>
                {products.length > 0 && (
                  <nav className="flex justify-center px-4">
                    <div className="flex md:hidden items-center justify-center gap-6 pb-[30%] mt-[-270px]">
                      <Button variant="ghost" size="icon" className="w-9 h-9 rounded-full bg-background/40 backdrop-blur-sm hover:bg-background/60 transition-colors shadow-md" onClick={() => rotateLeftRef.current?.()} aria-label="向左旋轉">
                        <ChevronLeft className="w-5 h-5 text-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" className="w-9 h-9 rounded-full bg-background/40 backdrop-blur-sm hover:bg-background/60 transition-colors shadow-md" onClick={() => rotateRightRef.current?.()} aria-label="向右旋轉">
                        <ChevronRight className="w-5 h-5 text-foreground" />
                      </Button>
                    </div>
                    <div className="hidden md:flex items-center justify-center gap-8 pb-[30%] mt-[-300px]">
                      <Button variant="ghost" size="icon" className="w-14 h-14 rounded-full bg-background/30 backdrop-blur-sm hover:bg-background/50 transition-colors" onClick={() => rotateLeftRef.current?.()} aria-label="向左旋轉">
                        <ChevronLeft className="w-8 h-8 text-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" className="w-14 h-14 rounded-full bg-background/30 backdrop-blur-sm hover:bg-background/50 transition-colors" onClick={() => rotateRightRef.current?.()} aria-label="向右旋轉">
                        <ChevronRight className="w-8 h-8 text-foreground" />
                      </Button>
                    </div>
                  </nav>
                )}
              </div>
            </div>
          </section>
        );
      })}
      {backgroundSections.length === 0 && (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <p className="text-muted-foreground">尚未設定頁面區塊。</p>
        </div>
      )}
    </div>
  );
}
