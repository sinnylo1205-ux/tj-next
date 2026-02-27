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
    <div className="relative min-h-screen overflow-x-hidden overflow-y-auto bg-background custom-cursor">
      {/* 標題 (z-50) - 固定在最上層 */}
      <div className="absolute z-50 pt-20 mt-2 sm:mt-0 w-full sm:w-auto sm:ml-16 flex justify-center sm:justify-start sm:block">
        <div className="sm:text-left text-center">
          <h1 className="text-2xl sm:text-5xl font-bold text-ink-900 sm:text-transparent drop-shadow-sm tracking-wide">
            可客製化甜點目錄
          </h1>
        </div>
      </div>

      {/* 桌機版：統一縮放容器（包含背景和物件） */}
      <div className="hidden sm:block">
        <div
          className="absolute z-10"
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
                    className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-[1.02]"
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
            <img src={backgroundUrl} alt="背景圖" className="w-full h-full object-cover" />
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
                <div className="w-full aspect-square">
                  <img
                    src={item.product_image_url || ""}
                    alt={item.name || "產品圖片"}
                    className="w-full h-full object-contain drop-shadow-md"
                    loading="lazy"
                    width={150}
                    height={150}
                  />
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
