"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import ProgressiveImage from "@/components/ProgressiveImage";
import {
  HomeSection2DesktopCarousel,
  type HomeGalleryItem,
} from "@/components/home/HomeSection2DesktopCarousel";

/** 與首頁 Section 2 相同（fallback）；優先用 DB 背景列 id */
const SECTION2_ID_FALLBACK = "d032d21f-99d8-48ab-8234-5aa10db42cc3";

const HOME_QUERY_KEYS = {
  homeBackground: ["home", "background"] as const,
};

/**
 * 企業頁「快速連結」：僅顯示作品圖（無背景底圖），一列六張。
 */
export function HomeWorkGallerySection({
  title = "快速連結",
  description = "快速前往選擇對應的客製化規格與取得報價。",
  className = "",
}: {
  title?: string;
  description?: string;
  className?: string;
}) {
  const router = useRouter();

  const { data: backgroundSections = [], isLoading: bgLoading } = useQuery({
    queryKey: HOME_QUERY_KEYS.homeBackground,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("Website_photo_material")
        .select("id, photo_url, sort_order, ui_width, ui_height")
        .eq("category", "home_page")
        .not("sort_order", "is", null)
        .not("photo_url", "is", null)
        .neq("photo_url", "")
        .order("sort_order", { ascending: true });
      if (error) throw new Error(error.message || "背景素材載入失敗");
      return data || [];
    },
  });

  const section2BgId =
    backgroundSections.find((bg) => bg.sort_order === 2)?.id ?? SECTION2_ID_FALLBACK;

  const {
    data: items = [],
    isLoading: itemsLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["home", "section2-gallery", section2BgId],
    enabled: Boolean(section2BgId),
    queryFn: async (): Promise<HomeGalleryItem[]> => {
      const ids = [...new Set([section2BgId, SECTION2_ID_FALLBACK].filter(Boolean))];
      const { data, error: qErr } = await supabase
        .from("Website_photo_material")
        .select("id, photo_url, metadata_tab, ui_width, ui_height, put_where")
        .eq("category", "home_page")
        .in("put_where", ids);

      if (qErr) throw new Error(qErr.message || "作品素材載入失敗");

      return (data || [])
        .map((item) => ({
          id: String(item.id),
          photo_url: item.photo_url || "",
          metadata_tab: item.metadata_tab as { product: string } | null,
          ui_width: item.ui_width ?? null,
          ui_height: item.ui_height ?? null,
        }))
        .sort((a, b) => {
          const productA = a.metadata_tab?.product || "";
          const productB = b.metadata_tab?.product || "";
          return productA.localeCompare(productB);
        });
    },
  });

  const isLoading = bgLoading || itemsLoading;
  const hasItems = items.length > 0;

  const handleGalleryClick = (item: HomeGalleryItem) => {
    const productId = item.metadata_tab?.product;
    if (productId) router.push(`/product/${productId}`);
  };

  return (
    <section className={`relative z-0 w-full ${className}`}>
      <div className="mb-4 md:mb-6">
        <h2 className="font-serif text-2xl font-semibold tracking-tight text-ink md:text-3xl">{title}</h2>
        <p className="mt-2 font-sans text-sm text-muted-foreground md:text-base">{description}</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-6 md:gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-sm text-muted-foreground">
          作品載入失敗，請重新整理再試。
          {process.env.NODE_ENV === "development" && error instanceof Error
            ? `（${error.message}）`
            : null}
        </p>
      ) : !hasItems ? (
        <p className="text-sm text-muted-foreground">尚無作品素材。</p>
      ) : (
        <>
          <div className="w-full py-2 md:hidden">
            <div className="grid grid-cols-2 gap-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleGalleryClick(item)}
                  className="cursor-pointer overflow-hidden rounded-lg shadow-md transition-shadow hover:shadow-lg"
                >
                  <ProgressiveImage
                    src={item.photo_url}
                    alt="gallery item"
                    width={item.ui_width ?? undefined}
                    height={item.ui_height ?? undefined}
                    aspectRatio={item.ui_width && item.ui_height ? undefined : 1}
                    containerClassName="w-full"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-0 hidden w-full md:block">
            <HomeSection2DesktopCarousel
              groupedGalleryItems={items}
              onGalleryItemClick={handleGalleryClick}
              columns={6}
              variant="standalone"
            />
          </div>
        </>
      )}
    </section>
  );
}
