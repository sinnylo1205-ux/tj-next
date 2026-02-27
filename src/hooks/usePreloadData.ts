import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useCallback } from "react";

// Query Keys - 用於快取識別
export const QUERY_KEYS = {
  giftBoxes: ["giftBoxes"],
  giftBoxesBackground: ["giftBoxes", "background"],
  giftBoxesForeground: ["giftBoxes", "foreground"],
  giftBoxesProducts: ["giftBoxes", "products"],
  giftBoxesNotices: ["giftBoxes", "notices"],
  classicStyles: ["classicStyles"],
  classicBackground: ["classicStyles", "background"],
  classicForeground: ["classicStyles", "foreground"],
  classicSection4Text: ["classicStyles", "section4Text"],
  classicProducts: ["classicStyles", "products"],
  gallery: ["gallery"],
  order: ["order"],
  orderBackground: ["order", "background"],
  orderProducts: ["order", "products"],
  home: ["home"],
  homeBackground: ["home", "background"],
  homeForeground: ["home", "foreground"],
  about: ["about"],
  aboutBackground: ["about", "background"],
};

/**
 * 預載 GiftBoxes 頁面資料（僅資料，不等圖片）
 */
export const preloadGiftBoxesData = async (queryClient: ReturnType<typeof useQueryClient>): Promise<void> => {
  // Background sections
  await queryClient.fetchQuery({
    queryKey: QUERY_KEYS.giftBoxesBackground,
    queryFn: async () => {
      const { data } = await supabase
        .from("Website_photo_material")
        .select("id, photo_url, photo_url_mobile, sort_order, ui_width, ui_height, ui_width_mobile, ui_height_mobile")
        .eq("category", "gift_box")
        .not("sort_order", "is", null)
        .order("sort_order", { ascending: true });
      return (data || []).map((item: any) => ({
        id: item.id,
        photo_url: item.photo_url || "",
        photo_url_mobile: item.photo_url_mobile ?? null,
        sort_order: item.sort_order ?? 0,
        ui_width: item.ui_width ?? null,
        ui_height: item.ui_height ?? null,
        ui_width_mobile: item.ui_width_mobile ?? null,
        ui_height_mobile: item.ui_height_mobile ?? null,
      }));
    },
  });

  await queryClient.fetchQuery({
    queryKey: QUERY_KEYS.aboutBackground,
    queryFn: async () => {
      const { data } = await supabase
        .from("Website_photo_material")
        .select("id, photo_url, photo_url_mobile, sort_order, ui_width, ui_height, ui_width_mobile, ui_height_mobile")
        .eq("category", "about")
        .not("sort_order", "is", null)
        .order("sort_order", { ascending: true });
      return (data || []).map((item: any) => ({
        id: item.id,
        photo_url: item.photo_url || "",
        photo_url_mobile: item.photo_url_mobile ?? null,
        sort_order: item.sort_order ?? 0,
        ui_width: item.ui_width ?? null,
        ui_height: item.ui_height ?? null,
        ui_width_mobile: item.ui_width_mobile ?? null,
        ui_height_mobile: item.ui_height_mobile ?? null,
      }));
    },
  });

  // Foreground items
  await queryClient.fetchQuery({
    queryKey: QUERY_KEYS.giftBoxesForeground,
    queryFn: async () => {
      const { data } = await supabase
        .from("Website_photo_material")
        .select("*")
        .eq("category", "gift_box")
        .is("sort_order", null);
      return (data || []).filter((item: any) => item.put_where != null);
    },
  });

  // Products
  await queryClient.fetchQuery({
    queryKey: QUERY_KEYS.giftBoxesProducts,
    queryFn: async () => {
      const { data } = await supabase.from("products").select("*").in("category", ["GiftBox", "meal_box"]);
      return data || [];
    },
  });

  // Product notices
  await queryClient.fetchQuery({
    queryKey: QUERY_KEYS.giftBoxesNotices,
    queryFn: async () => {
      const { data } = await supabase
        .from("product_notice")
        .select("product_id, label, size")
        .in("product_id", ["giftbox_big", "giftbox_midium", "giftbox_small", "box_6", "box_3"]);
      return data || [];
    },
  });
};

/**
 * 預載 ClassicStyles 頁面資料（僅資料，不等圖片）
 */
export const preloadClassicStylesData = async (queryClient: ReturnType<typeof useQueryClient>): Promise<void> => {
  // Background sections
  await queryClient.fetchQuery({
    queryKey: QUERY_KEYS.classicBackground,
    queryFn: async () => {
      const { data } = await supabase
        .from("Website_photo_material")
        .select("id, photo_url, sort_order, metadata_tab, ui_width, ui_height")
        .eq("category", "classic")
        .not("sort_order", "is", null)
        .not("photo_url", "is", null)
        .neq("photo_url", "")
        .order("sort_order", { ascending: true });
      return data || [];
    },
  });

  // Section 4 text items
  await queryClient.fetchQuery({
    queryKey: QUERY_KEYS.classicSection4Text,
    queryFn: async () => {
      const { data } = await supabase
        .from("Website_photo_material")
        .select("id, item_name, text_left, text_right, metadata_tab, ui_width, ui_height, ui_position_x, ui_position_y")
        .eq("category", "classic")
        .eq("sort_order", 4)
        .or("photo_url.is.null,photo_url.eq.");
      return data || [];
    },
  });

  // Foreground items
  await queryClient.fetchQuery({
    queryKey: QUERY_KEYS.classicForeground,
    queryFn: async () => {
      const { data } = await supabase
        .from("Website_photo_material")
        .select("*")
        .eq("category", "classic")
        .is("sort_order", null);
      return (data || []).filter((item: any) => item.put_where != null);
    },
  });

  // Products
  await queryClient.fetchQuery({
    queryKey: QUERY_KEYS.classicProducts,
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, description, product_image_url, category, metadata_classic")
        .eq("category", "classic");
      return data || [];
    },
  });
};

/**
 * 預載 Gallery 頁面資料（僅資料，不等圖片）
 */
export const preloadGalleryData = async (queryClient: ReturnType<typeof useQueryClient>): Promise<void> => {
  await queryClient.fetchQuery({
    queryKey: QUERY_KEYS.gallery,
    queryFn: async () => {
      const { data } = await supabase.from("products").select("*").eq("category", "candyBar");
      return data || [];
    },
  });
};

/**
 * 預載 Order 頁面資料（僅資料，不等圖片）
 */
export const preloadOrderData = async (queryClient: ReturnType<typeof useQueryClient>): Promise<void> => {
  // Background
  await queryClient.fetchQuery({
    queryKey: QUERY_KEYS.orderBackground,
    queryFn: async () => {
      const { data } = await supabase
        .from("Website_photo_material")
        .select("photo_url")
        .eq("id", "e7771214-c7b6-4c10-a421-a251089c71a4")
        .single();
      return data?.photo_url || "";
    },
  });

  // Products
  await queryClient.fetchQuery({
    queryKey: QUERY_KEYS.orderProducts,
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, description, product_image_url, ui_position_x, ui_position_y, ui_width, ui_height")
        .eq("category", "custom_design");
      return data || [];
    },
  });
};

/**
 * 預載首頁資料（僅資料，不等圖片）
 */
export const preloadHomeData = async (queryClient: ReturnType<typeof useQueryClient>): Promise<void> => {
  // Background
  await queryClient.fetchQuery({
    queryKey: QUERY_KEYS.homeBackground,
    queryFn: async () => {
      const { data } = await supabase
        .from("Website_photo_material")
        .select("id, photo_url, sort_order")
        .eq("category", "home_page")
        .not("sort_order", "is", null)
        .not("photo_url", "is", null)
        .neq("photo_url", "")
        .order("sort_order", { ascending: true });
      return data || [];
    },
  });

  // Foreground
  await queryClient.fetchQuery({
    queryKey: QUERY_KEYS.homeForeground,
    queryFn: async () => {
      const { data } = await supabase
        .from("Website_photo_material")
        .select("*")
        .eq("category", "home_page")
        .is("sort_order", null);
      return data || [];
    },
  });
};

/**
 * Hook: 預載首頁資料（不阻塞圖片載入）
 * 圖片由 ProgressiveImage 元件處理，顯示骨架動畫
 */
export const usePreloadAllPages = () => {
  const queryClient = useQueryClient();
  const [isPreloading, setIsPreloading] = useState(true);
  const [progress, setProgress] = useState(0);

  const preloadAll = useCallback(async (): Promise<void> => {
    setIsPreloading(true);
    setProgress(0);

    try {
      // ===== 階段 1：只載入首頁「資料」（不等圖片）=====
      await preloadHomeData(queryClient);
      setProgress(100);

      // ✅ 首頁資料載入完成，立即顯示頁面！
      // 圖片由 ProgressiveImage 元件處理（顯示骨架動畫 → 淡入）
      setIsPreloading(false);

      // ===== 階段 2：背景靜默載入其他頁面資料（用戶已可操作首頁）=====
      const preloadOtherPages = async () => {
        try {
          await Promise.all([
            preloadGiftBoxesData(queryClient),
            preloadClassicStylesData(queryClient),
            preloadGalleryData(queryClient),
            preloadOrderData(queryClient),
          ]);
        } catch (error) {
          console.error("背景預載入失敗:", error);
        }
      };

      // 使用 requestIdleCallback 在瀏覽器空閒時載入
      if ("requestIdleCallback" in window) {
        (window as any).requestIdleCallback(() => preloadOtherPages(), { timeout: 5000 });
      } else {
        // fallback: 延遲 1 秒後開始背景載入
        setTimeout(preloadOtherPages, 1000);
      }
    } catch (error) {
      console.error("預載入失敗:", error);
      setIsPreloading(false);
    }
  }, [queryClient]);

  return { preloadAll, isPreloading, progress };
};
