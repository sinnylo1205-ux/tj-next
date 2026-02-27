import { supabase } from "@/lib/supabase";
import type {
  ClassicProduct,
  BackgroundSection,
  Section4TextItem,
  ForegroundItem,
  ClassicInitialData,
} from "./types";

export async function getClassicData(): Promise<ClassicInitialData> {
  const [bgRes, textRes, fgRes, prodRes] = await Promise.all([
    supabase
      .from("Website_photo_material")
      .select("id, photo_url, sort_order, metadata_tab, ui_width, ui_height")
      .eq("category", "classic")
      .not("sort_order", "is", null)
      .not("photo_url", "is", null)
      .neq("photo_url", "")
      .order("sort_order", { ascending: true }),
    supabase
      .from("Website_photo_material")
      .select("id, item_name, text_left, text_right, metadata_tab, ui_width, ui_height, ui_position_x, ui_position_y")
      .eq("category", "classic")
      .eq("sort_order", 4)
      .or("photo_url.is.null,photo_url.eq."),
    supabase
      .from("Website_photo_material")
      .select("*")
      .eq("category", "classic")
      .is("sort_order", null),
    supabase
      .from("products")
      .select("id, name, description, product_image_url, category, metadata_classic")
      .eq("category", "classic")
      .neq("is_hide", true),
  ]);

  const backgroundSections: BackgroundSection[] = (bgRes.data || []).map((item) => ({
    id: item.id,
    photo_url: item.photo_url || "",
    sort_order: item.sort_order ?? 0,
    metadata_tab: item.metadata_tab as { category: string } | null,
    ui_width: item.ui_width ?? null,
    ui_height: item.ui_height ?? null,
  }));

  const section4TextItems: Section4TextItem[] = (textRes.data || []).map((item) => ({
    id: item.id,
    item_name: item.item_name,
    text_left: item.text_left,
    text_right: item.text_right,
    metadata_tab: item.metadata_tab as { category: string } | null,
    ui_width: item.ui_width,
    ui_height: item.ui_height,
    ui_position_x: item.ui_position_x,
    ui_position_y: item.ui_position_y,
  }));

  const foregroundItems: ForegroundItem[] = (fgRes.data || [])
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
    }));

  const products: ClassicProduct[] = (prodRes.data || []).map((p) => ({
    ...p,
    name: p.name || "",
    description: p.description || "",
    product_image_url: p.product_image_url || "",
    metadata_classic: p.metadata_classic as { category: string } | null,
  }));

  return {
    products,
    backgroundSections,
    section4TextItems,
    foregroundItems,
  };
}
