"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { LoadingScreen } from "@/components/LoadingScreen";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ProductItem {
  id: string;
  name: string;
  description?: string | null;
  product_image_url?: string | null;
  ui_position_x?: number | null;
  ui_position_y?: number | null;
  ui_width?: number | null;
  ui_height?: number | null;
}

const ORDER_QUERY_KEYS = {
  orderBackground: ["order", "background"] as const,
  orderProducts: ["order", "products"] as const,
};

export default function OrderPage() {
  const router = useRouter();
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [showCakeDialog, setShowCakeDialog] = useState(false);

  const DESIGN_WIDTH = 1680;
  const DESIGN_HEIGHT = 1050;

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const updateScale = () => {
      if (typeof window === "undefined") return;
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      const scaleX = windowWidth / DESIGN_WIDTH;
      const scaleY = windowHeight / DESIGN_HEIGHT;
      setScale(Math.max(scaleX, scaleY));
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

  const { data: backgroundUrl = "" } = useQuery({
    queryKey: ORDER_QUERY_KEYS.orderBackground,
    queryFn: async () => {
      const { data } = await supabase
        .from("Website_photo_material")
        .select("photo_url")
        .eq("id", "e7771214-c7b6-4c10-a421-a251089c71a4")
        .single();
      return data?.photo_url || "";
    },
  });

  const { data: nonGiftboxItems = [], isLoading } = useQuery({
    queryKey: ORDER_QUERY_KEYS.orderProducts,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, description, product_image_url, ui_position_x, ui_position_y, ui_width, ui_height",
        )
        .eq("category", "custom_design");

      if (error) throw error;

      return (data ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description ?? null,
        product_image_url: item.product_image_url ?? null,
        ui_position_x: item.ui_position_x ?? 0,
        ui_position_y: item.ui_position_y ?? 0,
        ui_width: item.ui_width ?? 150,
        ui_height: item.ui_height ?? 150,
      })) as ProductItem[];
    },
  });

  const handleItemClick = (productId: string) => {
    if (productId === "cake") {
      setShowCakeDialog(true);
    } else {
      router.push(`/product/${productId}`);
    }
  };

  if (isLoading) {
    return <LoadingScreen fullScreen message="載入選購目錄中..." />;
  }

  const baseScaleClass = "scale-[2]";
  const hoverScaleClass = "hover:scale-[2.05]";

  return (
    <div className="relative min-h-screen overflow-x-hidden overflow-y-auto bg-background">
      {/* 右側直排：桌機 z 須高於畫布 z-[11]，否則全幅畫布會整塊蓋住標題 */}
      <div className="pointer-events-none absolute right-2.5 top-14 z-50 sm:right-5 sm:top-16 sm:z-[12] md:right-8">
        <div className="flex flex-row-reverse items-start gap-2 sm:gap-1.5">
          <h1
            className="text-xs font-semibold tracking-[0.16em] text-ink-900 [text-shadow:0_1px_2px_rgba(255,255,255,0.9)] [writing-mode:vertical-rl] sm:text-[10px] sm:font-medium sm:tracking-[0.14em] sm:text-white/85 sm:[text-shadow:0_1px_8px_rgba(0,0,0,0.35)]"
            style={{ textOrientation: "mixed" }}
          >
            客製甜點
          </h1>
          <h2
            className="text-[8px] font-light leading-relaxed tracking-wide text-zinc-600 [text-shadow:0_0_1px_rgba(255,255,255,0.8)] [writing-mode:vertical-rl] sm:text-[7px] sm:leading-snug sm:text-white/65 sm:[text-shadow:0_1px_5px_rgba(0,0,0,0.28)]"
            style={{ textOrientation: "mixed" }}
          >
            十一項單品，皆可特製
          </h2>
        </div>
      </div>

      {/* 桌機版：統一縮放容器（包含背景和物件） */}
      <div className="hidden sm:block">
        <div
          className="absolute z-[11]"
          style={{
            width: DESIGN_WIDTH,
            height: DESIGN_HEIGHT,
            transform: `scale(${scale})`,
            transformOrigin: "center center",
            left: "50%",
            top: "50%",
            marginLeft: -DESIGN_WIDTH / 2,
            marginTop: -DESIGN_HEIGHT / 2,
          }}
        >
          {backgroundUrl && (
            <img
              src={backgroundUrl}
              alt="背景圖"
              className="absolute top-16 left-0 w-full h-[calc(100%-4rem)] object-cover"
            />
          )}
          <div className="absolute inset-0 bg-black/5" />

          {nonGiftboxItems.map((item) => (
            <div
              key={item.id}
              className="absolute group hoverable-item"
              onMouseEnter={() => setHoveredItemId(item.id)}
              onMouseLeave={() => setHoveredItemId(null)}
              style={{
                top: `${item.ui_position_y}px`,
                left: `${item.ui_position_x}px`,
                width: `${item.ui_width}px`,
                height: `${item.ui_height}px`,
                zIndex: hoveredItemId === item.id ? 99 : 20,
              }}
            >
              <div
                className={`transition-transform duration-300 ${baseScaleClass} ${hoverScaleClass} cursor-pointer`}
              >
                {item.product_image_url && (
                  <img
                    src={item.product_image_url}
                    alt={item.name}
                    className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.02] cursor-pointer"
                    onClick={() => handleItemClick(item.id)}
                  />
                )}

                <div
                  className="
                    absolute inset-0 flex items-center justify-start items-end gap-2
                    opacity-0 transition-opacity duration-500 ease-out
                    group-hover:opacity-100
                    pointer-events-none
                  "
                >
                  <div
                    className="
                      bg-white/80 text-black text-[8px] font-medium
                      px-1.5 py-2 rounded-[5px] shadow-sm
                      flex items-center justify-center text-center
                      min-h-[95px] max-h-[95px]
                    "
                    style={{
                      writingMode: "vertical-rl",
                      whiteSpace: "pre-line",
                      lineHeight: "1.4em",
                      letterSpacing: "0.08em",
                    }}
                  >
                    {(item.description || "甜點介紹").replace(/，/g, "，\n")}
                  </div>

                  <div
                    className="
                      bg-[#f9d8c8]/85 text-[#4b2e1e] text-[9.5px] font-medium
                      px-2 py-3 rounded-[5px] shadow-sm
                      flex items-center justify-center text-center
                      min-h-[95px] max-h-[95px]
                    "
                    style={{
                      writingMode: "vertical-rl",
                      lineHeight: "1.4em",
                      letterSpacing: "0.1em",
                    }}
                  >
                    {item.name}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 手機版 */}
      <div className="block sm:hidden relative min-h-screen">
        {backgroundUrl && (
          <div className="absolute inset-0 z-0">
            <img src={backgroundUrl} alt="背景圖" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-black/5" />
          </div>
        )}

        <div className="relative z-10 p-6 pt-32">
          <div className="grid grid-cols-2 gap-6">
            {nonGiftboxItems.map((item) => (
              <div
                key={item.id}
                onClick={() => handleItemClick(item.id)}
                className="flex flex-col items-center cursor-pointer"
              >
                <div className="aspect-square w-full">
                  {item.product_image_url ? (
                    <img
                      src={item.product_image_url}
                      alt={item.name || "產品圖片"}
                      width={150}
                      height={150}
                      className="h-full w-full object-contain drop-shadow-md"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-muted/30 text-xs text-muted-foreground">
                      無圖
                    </div>
                  )}
                </div>
                <p className="mt-2 text-[#4b2e1e] text-sm text-center">{item.name}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 客製化蛋糕服務彈窗 */}
      <Dialog open={showCakeDialog} onOpenChange={setShowCakeDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>客製化蛋糕服務</DialogTitle>
            <DialogDescription className="pt-4 space-y-3">
              <p>此品項目前沒有線上編輯器。</p>
              <p>請直接填寫報價單，或聯絡 LINE 官方客服，由專人為您服務。</p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-4">
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <a
                href="https://docs.google.com/forms/d/e/1FAIpQLScrt3q-K9zGyYLxzJGoK0HpYuqy1qDrtHuL52_5QjeExaB3tw/viewform"
                target="_blank"
                rel="noopener noreferrer"
              >
                填寫報價單
              </a>
            </Button>
            <Button asChild className="w-full sm:w-auto">
              <a href="https://lin.ee/Tp9U5bf" target="_blank" rel="noopener noreferrer">
                LINE 官方客服
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
