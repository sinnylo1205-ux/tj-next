"use client";

import dynamic from "next/dynamic";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import ProgressiveImage from "@/components/ProgressiveImage";
import { HomeSection1Mobile } from "@/components/home/HomeSection1Mobile";
import { DESKTOP_HERO_FALLBACK_URL } from "@/lib/home-lcp-urls";
import { trackLineClick } from "@/lib/track-line-click";

const HomePaymentResultDialog = dynamic(
  () => import("@/components/home/HomePaymentResultDialog").then((m) => m.HomePaymentResultDialog),
  { ssr: false },
);

const HomeSection2DesktopCarousel = dynamic(
  () => import("@/components/home/HomeSection2DesktopCarousel").then((m) => m.HomeSection2DesktopCarousel),
  { ssr: false },
);

const SECTION2_ID = "d032d21f-99d8-48ab-8234-5aa10db42cc3";
const LINE_ICON_URL =
  "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/Newline.png";
const LINE_URL = "https://rebrand.ly/official_web";

/** Section 1 前景：在 Supabase `metadata_tab` 可為每筆素材獨立設定（與 `ui_position_*` 相加，單位：設計畫布 px） */
type HomeSection1Metadata = {
  home_offset_x?: number;
  home_offset_y?: number;
};

function homeSection1OffsetsFromMetadata(metadata_tab: unknown): { ox: number; oy: number } {
  if (!metadata_tab || typeof metadata_tab !== "object") return { ox: 0, oy: 0 };
  const m = metadata_tab as HomeSection1Metadata;
  const ox = typeof m.home_offset_x === "number" && Number.isFinite(m.home_offset_x) ? m.home_offset_x : 0;
  const oy = typeof m.home_offset_y === "number" && Number.isFinite(m.home_offset_y) ? m.home_offset_y : 0;
  return { ox, oy };
}

interface HomePageItem {
  id: string;
  photo_url: string;
  description: string | null;
  go_to_where: string | null;
  ui_position_x: number | null;
  ui_position_y: number | null;
  ui_width: number | null;
  ui_height: number | null;
  z_index: number | null;
  put_where: string;
  /** 由 `metadata_tab.home_offset_x/y` 解析，與 ui_position 疊加 */
  home_offset_x: number;
  home_offset_y: number;
}

interface BackgroundSection {
  id: string;
  photo_url: string;
  sort_order: number;
  ui_width: number | null;
  ui_height: number | null;
}

interface GalleryItem {
  id: string;
  photo_url: string;
  metadata_tab: { product: string } | null;
  ui_width: number | null;
  ui_height: number | null;
}

const HOME_QUERY_KEYS = {
  homeBackground: ["home", "background"] as const,
  homeForeground: ["home", "foreground"] as const,
};

function HomePageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const [productNames, setProductNames] = useState<Record<string, string>>({});
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [showPaymentResult, setShowPaymentResult] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState("");

  const DESIGN_WIDTH = 1680;
  const DESIGN_HEIGHT = 1050;

  /** 勿用 useSearchParams：會迫使外層 Suspense 長時間顯示 fallback，行動 LCP 變成「載入中…」 */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const rtnCode = params.get("RtnCode");
    const rtnMsg = params.get("RtnMsg");

    if (rtnCode) {
      const isSuccess = rtnCode === "1";
      setPaymentSuccess(isSuccess);
      setPaymentMessage(rtnMsg || (isSuccess ? "付款成功" : "付款失敗"));
      setShowPaymentResult(true);
      router.replace(pathname || "/");
      localStorage.removeItem("last_creditcard_order_id");
      localStorage.removeItem("last_creditcard_started_at");
    }
  }, [pathname, router]);

  const handleLineClick = () => {
    trackLineClick("homepage");
  };

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const updateScale = () => {
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      const scaleX = windowWidth / DESIGN_WIDTH;
      const scaleY = windowHeight / DESIGN_HEIGHT;
      const MIN_SCALE = 0.25;
      setScale(Math.max(Math.min(scaleX, scaleY), MIN_SCALE));
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

  const { data: backgroundSections = [] } = useQuery({
    queryKey: HOME_QUERY_KEYS.homeBackground,
    queryFn: async () => {
      const { data } = await supabase
        .from("Website_photo_material")
        .select("id, photo_url, sort_order, ui_width, ui_height")
        .eq("category", "home_page")
        .not("sort_order", "is", null)
        .not("photo_url", "is", null)
        .neq("photo_url", "")
        .order("sort_order", { ascending: true });
      return (data || []).map((item) => ({
        id: item.id,
        photo_url: item.photo_url || "",
        sort_order: item.sort_order ?? 0,
        ui_width: item.ui_width ?? null,
        ui_height: item.ui_height ?? null,
      })) as BackgroundSection[];
    },
  });

  const { data: foregroundData } = useQuery({
    queryKey: HOME_QUERY_KEYS.homeForeground,
    queryFn: async () => {
      const { data } = await supabase
        .from("Website_photo_material")
        .select("*")
        .eq("category", "home_page")
        .is("sort_order", null);
      return data || [];
    },
  });

  const section1Bg = backgroundSections.find((bg) => bg.sort_order === 1);
  const section1Id = section1Bg?.id || "";

  const items: HomePageItem[] = (foregroundData || [])
    .filter((item: any) => item.put_where === section1Id)
    .map((item: any) => {
      const { ox, oy } = homeSection1OffsetsFromMetadata(item.metadata_tab);
      return {
        id: item.id,
        photo_url: item.photo_url || "",
        description: item.description ?? null,
        go_to_where: item.go_to_where ?? null,
        ui_position_x: item.ui_position_x ?? null,
        ui_position_y: item.ui_position_y ?? null,
        ui_width: item.ui_width ?? null,
        ui_height: item.ui_height ?? null,
        z_index: item.z_index ?? 20,
        put_where: item.put_where ?? "",
        home_offset_x: ox,
        home_offset_y: oy,
      };
    });

  const galleryItems: GalleryItem[] = (foregroundData || [])
    .filter((item: any) => item.put_where === SECTION2_ID)
    .map((item: any) => ({
      id: item.id,
      photo_url: item.photo_url || "",
      metadata_tab: item.metadata_tab as { product: string } | null,
      ui_width: item.ui_width ?? null,
      ui_height: item.ui_height ?? null,
    }));

  useEffect(() => {
    const productIds = [...new Set(galleryItems.map((i) => i.metadata_tab?.product).filter(Boolean))] as string[];
    if (productIds.length === 0) return;
    supabase
      .from("products")
      .select("id, name")
      .in("id", productIds)
      .then(({ data }) => {
        if (data) {
          const namesMap: Record<string, string> = {};
          data.forEach((p) => {
            namesMap[p.id] = p.name || p.id;
          });
          setProductNames(namesMap);
        }
      });
  }, [galleryItems.length]);

  const handleItemClick = (item: HomePageItem) => {
    if (item.go_to_where) router.push(item.go_to_where);
  };

  const handleGalleryClick = (item: GalleryItem) => {
    const productId = item.metadata_tab?.product;
    if (productId) router.push(`/product/${productId}`);
  };

  const section2Bg = backgroundSections.find((bg) => bg.sort_order === 2);
  const groupedGalleryItems = [...galleryItems].sort((a, b) => {
    const productA = a.metadata_tab?.product || "";
    const productB = b.metadata_tab?.product || "";
    return productA.localeCompare(productB);
  });

  const section1HasDbAspect = Boolean(section1Bg?.ui_width && section1Bg?.ui_height);
  const section1AspectStyle = section1HasDbAspect
    ? { aspectRatio: (section1Bg!.ui_width! / section1Bg!.ui_height!) as number }
    : undefined;
  const section1AspectClass = section1HasDbAspect
    ? "relative w-full overflow-hidden"
    : "relative w-full overflow-hidden max-md:[aspect-ratio:1166/2072] md:[aspect-ratio:8334/3645]";

  return (
    <>
      <h1 className="sr-only">T&J 客製化甜點 - 專業甜點客製化服務</h1>

      <HomePaymentResultDialog
        open={showPaymentResult}
        onOpenChange={setShowPaymentResult}
        paymentSuccess={paymentSuccess}
        paymentMessage={paymentMessage}
      />

      <div className="relative w-full">
        <section className="relative w-full overflow-hidden">
          {/* 桌機：全幅背景圖（勿在行動載入大圖） */}
          <div className={`hidden md:block ${section1AspectClass}`} style={section1AspectStyle}>
            <img
              src={section1Bg?.photo_url || DESKTOP_HERO_FALLBACK_URL}
              alt="Section 1 background"
              className="absolute inset-0 h-full w-full object-cover"
              width={section1Bg?.ui_width ?? 8334}
              height={section1Bg?.ui_height ?? 3645}
              fetchPriority="high"
              decoding="async"
            />
          </div>

          {/* 手機：純色區 + 左前景圖 + 右三按鈕（無背景照片） */}
          <div className="md:hidden">
            <HomeSection1Mobile
              items={items}
              onItemImageClick={(item) => handleItemClick(item as HomePageItem)}
            />
          </div>

          {hoveredId && (
            <div className="fixed inset-0 z-20 hidden pointer-events-none bg-black/30 transition-opacity duration-300 md:block" />
          )}

          <div
            className="absolute z-[500] hidden pointer-events-none md:block"
            style={{
              width: DESIGN_WIDTH,
              height: DESIGN_HEIGHT,
              transform: `scale(${scale})`,
              transformOrigin: "center center",
              left: "50%",
              top: "55%",
              marginLeft: -DESIGN_WIDTH / 2,
              marginTop: -DESIGN_HEIGHT / 2,
            }}
          >
            {items.map((item) => {
              const isActive = hoveredId === item.id;
              if (!item.description) return null;
              const px = (item.ui_position_x ?? 0) + item.home_offset_x;
              const py = (item.ui_position_y ?? 0) + item.home_offset_y;
              return (
                <div
                  key={item.id}
                  className="absolute"
                  style={{
                    top: `${py}px`,
                    left: `${px}px`,
                    width: `${item.ui_width ?? 200}px`,
                    height: `${item.ui_height ?? 200}px`,
                    opacity: hoveredId && !isActive ? 0.2 : 1,
                  }}
                >
                  <div className="hidden sm:flex items-center justify-end h-full pr-8 translate-x-32">
                    <p
                      className="text-white font-bold text-[25px] leading-[1.3em] tracking-wider text-left"
                      style={{
                        writingMode: "vertical-rl",
                        textOrientation: "upright",
                        whiteSpace: "pre-line",
                      }}
                    >
                      {item.description.replace(/，/g, "，\n")}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="absolute inset-0 z-30 hidden pointer-events-none md:block">
              <div
                className="absolute pointer-events-auto"
                style={{
                  width: DESIGN_WIDTH,
                  height: DESIGN_HEIGHT,
                  transform: `scale(${scale})`,
                  transformOrigin: "center center",
                  left: "50%",
                  top: "55%",
                  marginLeft: -DESIGN_WIDTH / 2,
                  marginTop: -DESIGN_HEIGHT / 2,
                }}
              >
                {items.map((item) => {
                  const isActive = hoveredId === item.id;
                  const px = (item.ui_position_x ?? 0) + item.home_offset_x;
                  const py = (item.ui_position_y ?? 0) + item.home_offset_y;
                  return (
                    <div
                      key={item.id}
                      className="absolute transition-all duration-300 ease-out"
                      onMouseEnter={() => setHoveredId(item.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      style={{
                        top: `${py}px`,
                        left: `${px}px`,
                        width: `${item.ui_width ?? 200}px`,
                        height: `${item.ui_height ?? 200}px`,
                        zIndex: isActive ? 1000 : 30,
                        opacity: hoveredId && !isActive ? 0.15 : 1,
                      }}
                    >
                      <div
                        className={`relative h-full w-full transition-transform duration-300 ease-out ${isActive ? "scale-[2.05]" : "scale-[2]"}`}
                      >
                        <img
                          src={item.photo_url}
                          alt={item.description || "home item"}
                          className="h-full w-full cursor-pointer object-contain"
                          width={item.ui_width ?? 200}
                          height={item.ui_height ?? 200}
                          loading="lazy"
                          decoding="async"
                          onClick={() => handleItemClick(item)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
          </div>

          <a
            href={LINE_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleLineClick}
            className="absolute bottom-6 right-4 z-40 transition-transform duration-300 hover:scale-110 md:bottom-auto md:right-3 md:top-[60%] md:-translate-y-1/2 md:scale-[1.3] md:hover:scale-[1.6]"
          >
            <img
              src={LINE_ICON_URL}
              alt="加入 LINE 好友"
              width={96}
              height={96}
              className="h-16 w-16 md:h-24 md:w-24"
              decoding="async"
            />
          </a>
        </section>

        <section className="relative w-full">
          {section2Bg && (
            <div className="hidden md:block">
              <ProgressiveImage
                src={section2Bg.photo_url}
                alt="Section 2 background"
                containerClassName="w-full block"
                className="object-cover"
                width={section2Bg.ui_width ?? undefined}
                height={section2Bg.ui_height ?? undefined}
                aspectRatio={section2Bg.ui_width && section2Bg.ui_height ? undefined : 16 / 9}
              />
            </div>
          )}

          <div className="w-full bg-white py-8 md:hidden">
              <div className="grid grid-cols-2 gap-2 px-4">
                {groupedGalleryItems.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleGalleryClick(item)}
                    className="cursor-pointer rounded-lg overflow-hidden shadow-md hover:shadow-lg transition-shadow"
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

          {section2Bg && (
            <div className="hidden md:contents">
              <HomeSection2DesktopCarousel
                groupedGalleryItems={groupedGalleryItems}
                onGalleryItemClick={handleGalleryClick}
              />
            </div>
          )}
        </section>
      </div>
    </>
  );
}

export default function HomePage() {
  return <HomePageContent />;
}
