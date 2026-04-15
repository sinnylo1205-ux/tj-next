"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from "@/components/ui/carousel";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useIsMobile } from "@/hooks/use-mobile";
import ProgressiveImage from "@/components/ProgressiveImage";
import { SafeImage } from "@/components/SafeImage";
import type { ClassicInitialData, ClassicProduct } from "./types";
import type { BackgroundSection, ForegroundItem, Section4TextItem } from "./types";

const SECTION3_FALLBACK_ASPECT_RATIO = 16 / 9;

const CLASSIC_QUERY_KEYS = {
  classicBackground: ["classic", "background"] as const,
  classicSection4Text: ["classic", "section4Text"] as const,
  classicForeground: ["classic", "foreground"] as const,
  classicProducts: ["classic", "products"] as const,
};

const TAB_LABELS: Record<string, string> = {
  mermaid: "美人魚",
  pony: "獨角獸",
  fairy: "仙子",
  ice: "冰雪",
  star: "星空",
};

const TABS = [
  {
    key: "mermaid",
    image:
      "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/classic/all_botton/mermaid.webp",
  },
  {
    key: "pony",
    image:
      "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/classic/all_botton/corn.webp",
  },
  {
    key: "fairy",
    image:
      "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/classic/all_botton/f.webp",
  },
  {
    key: "ice",
    image:
      "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/classic/all_botton/ice.webp",
  },
  {
    key: "star",
    image:
      "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/classic/all_botton/st.webp",
  },
];

interface ClassicStylesClientProps {
  initialData?: ClassicInitialData | null;
}

export function ClassicStylesClient({ initialData }: ClassicStylesClientProps) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<string>("mermaid");

  const handleTabClick = (tabKey: string) => {
    setActiveTab(tabKey);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.getElementById("section-3-products");
        if (!el) return;
        const yOffset = -120;
        const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
        window.scrollTo({ top: y, behavior: "smooth" });
      });
    });
  };

  const { data: backgroundSections = [], isLoading: bgLoading } = useQuery({
    queryKey: CLASSIC_QUERY_KEYS.classicBackground,
    initialData: initialData?.backgroundSections,
    queryFn: async () => {
      const { data } = await supabase
        .from("Website_photo_material")
        .select("id, photo_url, sort_order, metadata_tab, ui_width, ui_height")
        .eq("category", "classic")
        .not("sort_order", "is", null)
        .not("photo_url", "is", null)
        .neq("photo_url", "")
        .order("sort_order", { ascending: true });
      return (data || []).map((item) => ({
        id: item.id,
        photo_url: item.photo_url || "",
        sort_order: item.sort_order ?? 0,
        metadata_tab: item.metadata_tab as { category: string } | null,
        ui_width: item.ui_width ?? null,
        ui_height: item.ui_height ?? null,
      })) as BackgroundSection[];
    },
  });

  const { data: section4TextItems = [], isLoading: textLoading } = useQuery({
    queryKey: CLASSIC_QUERY_KEYS.classicSection4Text,
    initialData: initialData?.section4TextItems,
    queryFn: async () => {
      const { data } = await supabase
        .from("Website_photo_material")
        .select("id, item_name, text_left, text_right, metadata_tab, ui_width, ui_height, ui_position_x, ui_position_y")
        .eq("category", "classic")
        .eq("sort_order", 4)
        .or("photo_url.is.null,photo_url.eq.");
      return (data || []).map((item) => ({
        id: item.id,
        item_name: item.item_name,
        text_left: item.text_left,
        text_right: item.text_right,
        metadata_tab: item.metadata_tab as { category: string } | null,
        ui_width: item.ui_width,
        ui_height: item.ui_height,
        ui_position_x: item.ui_position_x,
        ui_position_y: item.ui_position_y,
      })) as Section4TextItem[];
    },
  });

  const { data: foregroundItems = [], isLoading: fgLoading } = useQuery({
    queryKey: CLASSIC_QUERY_KEYS.classicForeground,
    initialData: initialData?.foregroundItems,
    queryFn: async () => {
      const { data } = await supabase
        .from("Website_photo_material")
        .select("*")
        .eq("category", "classic")
        .is("sort_order", null);
      return (data || [])
        .filter((item: { put_where: string | null }) => item.put_where != null)
        .map((item: {
          id: string;
          photo_url: string | null;
          item_name: string | null;
          put_where: string;
          go_to_where: string | null;
          ui_width: number | null;
          ui_height: number | null;
          ui_position_x: number | null;
          ui_position_y: number | null;
        }) => ({
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

  const { data: products = [], isLoading: prodLoading } = useQuery({
    queryKey: CLASSIC_QUERY_KEYS.classicProducts,
    initialData: initialData?.products,
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, description, product_image_url, category, metadata_classic")
        .eq("category", "classic")
        .neq("is_hide", true);
      return (data || []).map((p) => ({
        ...p,
        name: p.name || "",
        description: p.description || "",
        product_image_url: p.product_image_url || "",
        metadata_classic: p.metadata_classic as { category: string } | null,
      })) as ClassicProduct[];
    },
  });

  const isLoading = bgLoading || textLoading || fgLoading || prodLoading;

  const handleProductClick = (product: ClassicProduct) => {
    const tabCategory = product.metadata_classic?.category || activeTab;
    router.push(`/classic-product?productId=${product.id}&tab=${tabCategory}`);
  };

  const getForegroundItemsForSection = (sectionId: string) =>
    foregroundItems.filter((item) => item.put_where === sectionId);

  const getSection4TextItem = () =>
    section4TextItems.find((item) => item.metadata_tab?.category === activeTab) ??
    section4TextItems.find((item) => !item.metadata_tab?.category);

  const filteredProducts = products.filter((p) => p.metadata_classic?.category === activeTab);

  const section1 = backgroundSections.find((s) => s.sort_order === 1);
  const section2 = backgroundSections.find((s) => s.sort_order === 2);
  const section4 = backgroundSections.find((s) => s.sort_order === 4);
  const section3Backgrounds = backgroundSections.filter((s) => s.sort_order === 3);
  const currentTabBackground =
    section3Backgrounds.find((bg) => bg.metadata_tab?.category === activeTab) || section3Backgrounds[0];
  const currentSection4Text = getSection4TextItem();

  useEffect(() => {
    section3Backgrounds.forEach((bg) => {
      if (bg.photo_url) {
        const img = new Image();
        img.src = bg.photo_url;
      }
    });
  }, [section3Backgrounds]);

  const section3AspectRatio = useMemo(() => {
    const firstBg = section3Backgrounds[0];
    if (firstBg?.ui_width && firstBg?.ui_height) return firstBg.ui_width / firstBg.ui_height;
    return SECTION3_FALLBACK_ASPECT_RATIO;
  }, [section3Backgrounds]);

  if (isLoading) {
    return <LoadingScreen fullScreen message="載入中..." />;
  }

  const renderSection = (section: BackgroundSection, showProducts = false) => {
    const sectionForegroundItems = getForegroundItemsForSection(section.id);
    const isSection2 = section.sort_order === 2;

    return (
      <section key={section.id} className="relative w-full">
        <ProgressiveImage
          src={section.photo_url}
          alt={`Section ${section.sort_order}`}
          containerClassName="w-full block"
          className="object-cover w-full h-auto"
          width={section.ui_width ?? undefined}
          height={section.ui_height ?? undefined}
          aspectRatio={
            section.ui_width && section.ui_height
              ? section.ui_width / section.ui_height
              : 4167 / 2784
          }
          priority={section.sort_order <= 3}
        />

        {isSection2 && (
          <div className="absolute inset-0 flex">
            <div className="w-[20%] md:w-[25%]" />
            <div className="w-[80%] md:w-[75%] flex items-center px-1 md:px-16">
              <Carousel opts={{ align: "start", slidesToScroll: 1 }} className="w-full">
                <CarouselContent className="-ml-1 md:-ml-16">
                  {TABS.map((tab) => (
                    <CarouselItem key={tab.key} className="pl-1 md:pl-16 basis-[22%] md:basis-[18%]">
                      <button
                        onClick={() => handleTabClick(tab.key)}
                        className={cn(
                          "relative aspect-[3/4] w-full overflow-hidden rounded-md transition-all duration-200 md:rounded-xl",
                          "hover:scale-105",
                          activeTab === tab.key
                            ? "bg-primary ring-1 md:ring-2 ring-primary ring-offset-1 md:ring-offset-2"
                            : "bg-transparent",
                        )}
                      >
                        <SafeImage src={tab.image} alt={tab.key} fill className="object-contain" sizes="120px" />
                      </button>
                    </CarouselItem>
                  ))}
                </CarouselContent>
                <CarouselPrevious className="-left-0 md:-left-12 w-5 h-5 md:w-8 md:h-8" />
                <CarouselNext className="-right-0 md:-right-12 w-5 h-5 md:w-8 md:h-8" />
              </Carousel>
            </div>
          </div>
        )}

        {sectionForegroundItems.length > 0 && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="relative w-full h-full">
              {sectionForegroundItems.map((item, index) => {
                const isLeftAligned = index % 2 === 0;
                return (
                  <div
                    key={item.id}
                    className={`flex w-full ${isLeftAligned ? "justify-start" : "justify-end"}`}
                    style={{
                      position: "absolute",
                      top: item.ui_position_y != null ? `${item.ui_position_y}%` : `${(index + 1) * 20}%`,
                      left: item.ui_position_x != null ? `${item.ui_position_x}%` : undefined,
                      right: item.ui_position_x != null ? undefined : isLeftAligned ? undefined : "0",
                      width: item.ui_width ? `${item.ui_width}%` : "40%",
                    }}
                  >
                    <SafeImage
                      src={item.photo_url}
                      alt={item.item_name || "裝飾"}
                      width={1200}
                      height={900}
                      className={`pointer-events-auto object-contain ${
                        item.go_to_where ? "cursor-pointer transition-transform hover:scale-105" : ""
                      }`}
                      style={{
                        width: "100%",
                        height: item.ui_height ? `${item.ui_height}px` : "auto",
                      }}
                      sizes="40vw"
                      onClick={() => {
                        if (item.go_to_where) router.push(item.go_to_where);
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {showProducts && filteredProducts.length > 0 && (
          <div
            className="absolute top-0 left-0 right-0 flex justify-center items-center"
            style={{ height: "calc(min(100vw, 1400px) / 1.497 * 0.8)" }}
          >
            <div className="w-full max-w-7xl px-4 md:px-8">
              {!isMobile && (
                <div className="grid grid-cols-3 gap-6 justify-items-center">
                  {filteredProducts.map((product) => (
                    <div
                      key={product.id}
                      className="cursor-pointer transition-transform duration-300 hover:scale-110 flex flex-col items-center"
                      onClick={() => handleProductClick(product)}
                    >
                      <ProgressiveImage
                        src={product.product_image_url}
                        alt={product.name}
                        aspectRatio={1}
                        containerClassName="w-full max-w-[280px] md:max-w-[320px] p-3"
                        className="object-contain"
                        priority
                      />
                      <p className="text-center text-lg font-medium text-white mt-2 px-2 line-clamp-2 bg-black/20 rounded-md">
                        {product.name}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {isMobile && (
                <Carousel opts={{ align: "center", slidesToScroll: 1 }} className="w-full">
                  <CarouselContent className="-ml-2">
                    {filteredProducts.map((product) => (
                      <CarouselItem key={product.id} className="pl-2 basis-1/1">
                        <div
                          className="cursor-pointer transition-transform duration-300 hover:scale-105 flex flex-col items-center"
                          onClick={() => handleProductClick(product)}
                        >
                          <ProgressiveImage
                            src={product.product_image_url}
                            alt={product.name}
                            aspectRatio={1}
                            containerClassName="w-full max-w-[180px] p-0.5"
                            className="object-contain"
                            priority
                          />
                          <p className="text-center text-[9px] font-medium text-foreground mt-0 px-0.5 line-clamp-2">
                            {product.name}
                          </p>
                        </div>
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  <CarouselPrevious className="-left-1 w-6 h-6" />
                  <CarouselNext className="-right-1 w-6 h-6" />
                </Carousel>
              )}
            </div>
          </div>
        )}
      </section>
    );
  };

  // 依主題分組商品，供 SEO 區塊使用
  const productsByTab = useMemo(() => {
    const map: Record<string, ClassicProduct[]> = {};
    for (const tab of TABS) {
      map[tab.key] = products.filter((p) => p.metadata_classic?.category === tab.key);
    }
    return map;
  }, [products]);

  return (
    <main className="w-full" id="classic-styles-page">
      <h1 className="sr-only">T&J 客製化甜點經典款式</h1>

      {/* SEO：語意化商品列表，僅供爬蟲與原始碼，不影響版面 */}
      <section aria-label="經典款式商品列表" className="sr-only">
        <h2 className="sr-only">經典款式主題與商品</h2>
        {TABS.map((tab) => {
          const list = productsByTab[tab.key] ?? [];
          if (list.length === 0) return null;
          const label = TAB_LABELS[tab.key] ?? tab.key;
          return (
            <div key={tab.key}>
              <h3>{label}系列</h3>
              <ul>
                {list.map((product) => (
                  <li key={product.id}>
                    <Link href={`/classic-product?productId=${product.id}&tab=${tab.key}`}>
                      {product.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      {section1 && renderSection(section1)}
      {section2 && renderSection(section2)}

      <div
        id="section-3-products"
        className="relative w-full"
        style={{ aspectRatio: section3AspectRatio }}
      >
        {currentTabBackground && (
          <div className="absolute inset-0">{renderSection(currentTabBackground, true)}</div>
        )}
      </div>

      {section4 && (
        <section className="relative w-full">
          <SafeImage
            src={section4.photo_url}
            alt="Section 4"
            className="block h-auto w-full"
            width={section4.ui_width || 4167}
            height={section4.ui_height || 2784}
            style={{
              aspectRatio:
                section4.ui_width && section4.ui_height
                  ? `${section4.ui_width} / ${section4.ui_height}`
                  : "4167 / 2784",
            }}
            sizes="100vw"
          />
          {currentSection4Text &&
            (currentSection4Text.text_left || currentSection4Text.text_right) && (
              <div className="absolute inset-0 flex justify-between items-start px-4 md:px-12 pointer-events-none pt-8 md:pt-16">
                {currentSection4Text.text_left && (
                  <div
                    className="pointer-events-auto bg-transparent p-3 md:p-6 max-w-[32%] md:max-w-[28%] ml-auto absolute hidden md:block"
                    style={{ left: "10%", top: "5%" }}
                  >
                    <p className="text-lg lg:text-xl font-semibold leading-[2.4] text-foreground whitespace-pre-wrap">
                      {currentSection4Text.text_left}
                    </p>
                  </div>
                )}
                {currentSection4Text.text_right && (
                  <div
                    className="pointer-events-auto bg-transparent p-2 md:p-6 max-w-[45%] md:max-w-[28%] absolute"
                    style={{
                      right: isMobile ? "50%" : "10%",
                      top: isMobile ? "3%" : "22%",
                    }}
                  >
                    <p className="text-[10px] md:text-lg lg:text-xl font-semibold leading-[1.8] md:leading-[2.4] text-foreground whitespace-pre-wrap">
                      {currentSection4Text.text_right}
                    </p>
                  </div>
                )}
              </div>
            )}
        </section>
      )}

      {backgroundSections.length === 0 && (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <p className="text-muted-foreground">尚未設定頁面區塊。</p>
        </div>
      )}
    </main>
  );
}
