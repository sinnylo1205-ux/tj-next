"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from "@/components/ui/carousel";
import { useIsMobile } from "@/hooks/use-mobile";
import ProgressiveImage from "@/components/ProgressiveImage";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle } from "lucide-react";

const SECTION2_ID = "d032d21f-99d8-48ab-8234-5aa10db42cc3";
const MOBILE_BG_URL =
  "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/home_page/iphone_home_11zon.webp";
const DESKTOP_LCP_URL =
  "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/home_page/home.webp";
const LINE_ICON_URL =
  "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/Newline.png";
const LINE_URL = "https://rebrand.ly/official_web";

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
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();
  const [productNames, setProductNames] = useState<Record<string, string>>({});
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [showPaymentResult, setShowPaymentResult] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState("");

  const DESIGN_WIDTH = 1680;
  const DESIGN_HEIGHT = 1050;

  useEffect(() => {
    const rtnCode = searchParams.get("RtnCode");
    const rtnMsg = searchParams.get("RtnMsg");

    if (rtnCode) {
      const isSuccess = rtnCode === "1";
      setPaymentSuccess(isSuccess);
      setPaymentMessage(rtnMsg || (isSuccess ? "付款成功" : "付款失敗"));
      setShowPaymentResult(true);
      router.replace(pathname || "/");
      if (typeof window !== "undefined") {
        localStorage.removeItem("last_creditcard_order_id");
        localStorage.removeItem("last_creditcard_started_at");
      }
    } else if (typeof window !== "undefined") {
      const lastOrderId = localStorage.getItem("last_creditcard_order_id");
      const startedAt = localStorage.getItem("last_creditcard_started_at");
      if (lastOrderId && startedAt) {
        const elapsed = Date.now() - parseInt(startedAt, 10);
        if (elapsed < 30 * 60 * 1000) {
          setPaymentSuccess(true);
          setPaymentMessage("已完成信用卡付款流程");
          setShowPaymentResult(true);
        }
        localStorage.removeItem("last_creditcard_order_id");
        localStorage.removeItem("last_creditcard_started_at");
      }
    }
  }, [searchParams, pathname, router]);

  const handleLineClick = () => {
    if (typeof window !== "undefined" && (window as any).gtag) {
      (window as any).gtag("event", "line_click", { source: "website", position: "homepage" });
    }
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
    .map((item: any) => ({
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
    }));

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

  return (
    <>
      <h1 className="sr-only">T&J 客製化甜點 - 專業甜點客製化服務</h1>

      <Dialog open={showPaymentResult} onOpenChange={setShowPaymentResult}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {paymentSuccess ? (
                <>
                  <CheckCircle className="h-6 w-6 text-green-500" />
                  信用卡付款成功
                </>
              ) : (
                <>
                  <XCircle className="h-6 w-6 text-red-500" />
                  信用卡付款失敗
                </>
              )}
            </DialogTitle>
            <DialogDescription className="pt-2">
              {paymentMessage}
              {paymentSuccess && (
                <p className="mt-2 text-sm">您的訂單狀態已更新為「處理中」，可至會員中心查看訂單進度。</p>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setShowPaymentResult(false)}>
              關閉
            </Button>
            <Button
              onClick={() => {
                setShowPaymentResult(false);
                router.push("/member?tab=processing");
              }}
            >
              前往會員中心
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="relative w-full">
        <section className="relative w-full overflow-hidden">
          {isMobile ? (
            <ProgressiveImage
              src={MOBILE_BG_URL}
              alt="Section 1 mobile background"
              priority={true}
              width={section1Bg?.ui_width ?? undefined}
              height={section1Bg?.ui_height ?? undefined}
              aspectRatio={section1Bg?.ui_width && section1Bg?.ui_height ? undefined : 1166 / 2072}
              containerClassName="w-full"
            />
          ) : (
            <ProgressiveImage
              src={section1Bg?.photo_url || DESKTOP_LCP_URL}
              alt="Section 1 background"
              priority={true}
              width={section1Bg?.ui_width ?? undefined}
              height={section1Bg?.ui_height ?? undefined}
              aspectRatio={section1Bg?.ui_width && section1Bg?.ui_height ? undefined : 8334 / 3645}
              containerClassName="w-full"
            />
          )}

          {!isMobile && hoveredId && (
            <div className="fixed inset-0 z-20 pointer-events-none bg-black/30 transition-opacity duration-300" />
          )}

          <div
            className="absolute z-[500] pointer-events-none"
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
              return (
                <div
                  key={item.id}
                  className="absolute"
                  style={{
                    top: `${item.ui_position_y ?? 0}px`,
                    left: `${item.ui_position_x ?? 0}px`,
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

          {isMobile ? (
            <div className="absolute bottom-3 left-0 right-0 z-30 pb-6">
              <div className="flex justify-center items-end gap-2 px-4">
                {items.map((item) => (
                  <div key={item.id} className="flex-shrink-0" style={{ width: "30%", maxWidth: "120px" }}>
                    <ProgressiveImage
                      src={item.photo_url}
                      alt={item.description || "home item"}
                      className="object-contain cursor-pointer"
                      containerClassName="w-full"
                      width={item.ui_width ?? undefined}
                      height={item.ui_height ?? undefined}
                      onClick={() => handleItemClick(item)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 z-30 pointer-events-none">
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
                  return (
                    <div
                      key={item.id}
                      className="absolute transition-all duration-300 ease-out"
                      onMouseEnter={() => setHoveredId(item.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      style={{
                        top: `${item.ui_position_y ?? 0}px`,
                        left: `${item.ui_position_x ?? 0}px`,
                        width: `${item.ui_width ?? 200}px`,
                        height: `${item.ui_height ?? 200}px`,
                        zIndex: isActive ? 1000 : 30,
                        opacity: hoveredId && !isActive ? 0.15 : 1,
                      }}
                    >
                      <div
                        className={`transition-transform duration-300 ease-out ${isActive ? "scale-[2.05]" : "scale-[2]"}`}
                      >
                        <img
                          src={item.photo_url}
                          alt={item.description || "home item"}
                          className="w-full h-full object-contain cursor-pointer"
                          onClick={() => handleItemClick(item)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <a
            href={LINE_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleLineClick}
            className="absolute right-0 md:right-3 top-[60%] -translate-y-1/2 z-40 transition-transform duration-300 scale-[1] hover:scale-[1.2] md:scale-[1.3] md:hover:scale-[1.6]"
          >
            <img src={LINE_ICON_URL} alt="加入 LINE 好友" className="w-16 h-16 md:w-24 md:h-24" loading="lazy" />
          </a>
        </section>

        <section className="relative w-full">
          {!isMobile && section2Bg && (
            <ProgressiveImage
              src={section2Bg.photo_url}
              alt="Section 2 background"
              containerClassName="w-full block"
              className="object-cover"
              width={section2Bg.ui_width ?? undefined}
              height={section2Bg.ui_height ?? undefined}
              aspectRatio={section2Bg.ui_width && section2Bg.ui_height ? undefined : 16 / 9}
            />
          )}

          {isMobile && (
            <div className="w-full bg-white py-8">
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
          )}

          {!isMobile && section2Bg && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-full max-w-[1400px] px-6">
                <Carousel opts={{ align: "start", slidesToScroll: 3 }} className="w-full">
                  <CarouselContent className="-ml-4">
                    {groupedGalleryItems.map((item) => (
                      <CarouselItem key={item.id} className="pl-3 basis-1/6">
                        <div onClick={() => handleGalleryClick(item)} className="cursor-pointer group">
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
          )}
        </section>
      </div>
    </>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-muted-foreground">載入中...</div></div>}>
      <HomePageContent />
    </Suspense>
  );
}
