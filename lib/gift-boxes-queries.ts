import type { SupabaseClient } from "@supabase/supabase-js";

/** 與 `GiftBoxesClient`、預載 hook 共用之禮盒頁資料型別與查詢 */

export interface GiftBoxBackgroundSection {
  id: string;
  photo_url: string;
  photo_url_mobile: string | null;
  sort_order: number;
  ui_width: number | null;
  ui_height: number | null;
  ui_width_mobile: number | null;
  ui_height_mobile: number | null;
}

export interface GiftBoxForegroundItem {
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

export type GiftBoxProductRow = {
  id: string;
  name: string;
  description: string;
  product_image_url: string;
  hover_image_url: string | null;
  category: string;
  is_hide?: boolean | null;
};

export interface GiftBoxProductNotice {
  product_id: string;
  label: string[] | null;
  size: string | null;
}

export async function fetchGiftBoxesBackground(
  client: SupabaseClient,
): Promise<GiftBoxBackgroundSection[]> {
  const { data, error } = await client
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
  }));
}

export async function fetchGiftBoxesForeground(client: SupabaseClient): Promise<GiftBoxForegroundItem[]> {
  const { data, error } = await client
    .from("Website_photo_material")
    .select("*")
    .eq("category", "gift_box")
    .is("sort_order", null);
  if (error) throw error;
  return (data || [])
    .filter((item: { put_where: string | null }) => item.put_where != null)
    .map((item: Record<string, unknown>) => ({
      id: String(item.id),
      photo_url: (item.photo_url as string) || "",
      item_name: (item.item_name as string | null) ?? null,
      put_where: (item.put_where as string) ?? "",
      go_to_where: (item.go_to_where as string | null) ?? null,
      ui_width: (item.ui_width as number | null) ?? null,
      ui_height: (item.ui_height as number | null) ?? null,
      ui_position_x: (item.ui_position_x as number | null) ?? null,
      ui_position_y: (item.ui_position_y as number | null) ?? null,
    }));
}

export async function fetchGiftBoxesProducts(client: SupabaseClient): Promise<GiftBoxProductRow[]> {
  const { data, error } = await client
    .from("products")
    .select("*")
    .in("category", ["GiftBox", "meal_box"])
    .neq("is_hide", true);
  if (error) throw error;
  return (data || []) as GiftBoxProductRow[];
}

export async function fetchGiftBoxesNotices(client: SupabaseClient): Promise<GiftBoxProductNotice[]> {
  const { data, error } = await client
    .from("product_notice")
    .select("product_id, label, size")
    .in("product_id", ["giftbox_big", "giftbox_midium", "giftbox_small", "box_6", "box_3"]);
  if (error) throw error;
  return (data || []).map((item) => ({
    product_id: item.product_id || "",
    label: Array.isArray(item.label) ? item.label : null,
    size: item.size,
  }));
}

export async function fetchAllGiftBoxesPageData(client: SupabaseClient) {
  const [backgroundSections, foregroundItems, products, productNotices] = await Promise.all([
    fetchGiftBoxesBackground(client),
    fetchGiftBoxesForeground(client),
    fetchGiftBoxesProducts(client),
    fetchGiftBoxesNotices(client),
  ]);
  return { backgroundSections, foregroundItems, products, productNotices };
}

/** 桌面版背景（一律使用 photo_url + ui_width/ui_height） */
export function resolveGiftBoxBackgroundDesktop(section: GiftBoxBackgroundSection) {
  const width = section.ui_width;
  const height = section.ui_height;
  const aspectRatio =
    width && height && width > 0 && height > 0 ? `${width} / ${height}` : "4167 / 3523";
  return {
    url: section.photo_url,
    width: width ?? undefined,
    height: height ?? undefined,
    aspectRatio,
  };
}

/** 手機版背景（有 photo_url_mobile 時用之；尺寸用 ui_width_mobile / ui_height_mobile） */
export function resolveGiftBoxBackgroundMobile(section: GiftBoxBackgroundSection) {
  const url = section.photo_url_mobile || section.photo_url;
  const width = section.photo_url_mobile ? section.ui_width_mobile : section.ui_width;
  const height = section.photo_url_mobile ? section.ui_height_mobile : section.ui_height;
  const aspectRatio =
    width && height && width > 0 && height > 0
      ? `${width} / ${height}`
      : section.photo_url_mobile
        ? "1000 / 846"
        : "4167 / 3523";
  return {
    url,
    width: width ?? undefined,
    height: height ?? undefined,
    aspectRatio,
  };
}
