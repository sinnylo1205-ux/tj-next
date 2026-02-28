"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { LoadingScreen } from "@/components/LoadingScreen";
import ProgressiveImage from "@/components/ProgressiveImage";

type BackgroundSection = {
  id: string;
  photo_url: string;
  sort_order: number;
  ui_width: number | null;
  ui_height: number | null;
};

const ABOUT_QUERY_KEY = ["about", "background"] as const;

const ASPECT_RATIO_BY_ORDER: Record<number, number> = {
  1: 2000 / 870,
  2: 2000 / 819,
  3: 2000 / 958,
  4: 2000 / 1249,
  5: 2000 / 1111,
};

export default function AboutPage() {
  const { data: backgroundSections = [], isLoading } = useQuery({
    queryKey: ABOUT_QUERY_KEY,
    queryFn: async () => {
      const { data } = await supabase
        .from("Website_photo_material")
        .select("id, photo_url, sort_order, ui_width, ui_height")
        .eq("category", "about")
        .not("sort_order", "is", null)
        .order("sort_order", { ascending: true });
      return (data || []).map((item) => ({
        id: item.id,
        photo_url: item.photo_url || "",
        sort_order: item.sort_order ?? 0,
        ui_width: item.ui_width,
        ui_height: item.ui_height,
      })) as BackgroundSection[];
    },
  });

  if (isLoading) {
    return <LoadingScreen fullScreen message="載入中..." />;
  }

  return (
    <main className="w-full">
      <h1 className="sr-only">關於 T&J 客製化甜點</h1>
      {backgroundSections.map((section) => {
        const aspectRatio =
          section.ui_width && section.ui_height
            ? section.ui_width / section.ui_height
            : ASPECT_RATIO_BY_ORDER[section.sort_order] ?? 2000 / 3752;
        return (
          <section key={section.id} className="w-full overflow-hidden">
            <ProgressiveImage
              src={section.photo_url}
              alt={`關於我們 ${section.sort_order}`}
              containerClassName="w-full block"
              className="object-cover"
              width={section.ui_width ?? undefined}
              height={section.ui_height ?? undefined}
              aspectRatio={aspectRatio}
              priority={section.sort_order === 1}
            />
          </section>
        );
      })}
    </main>
  );
}
