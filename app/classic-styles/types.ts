export interface ClassicProduct {
  id: string;
  name: string;
  description: string;
  product_image_url: string;
  category: string;
  metadata_classic: { category: string } | null;
}

export interface BackgroundSection {
  id: string;
  photo_url: string;
  sort_order: number;
  metadata_tab: { category: string } | null;
  ui_width: number | null;
  ui_height: number | null;
}

export interface ForegroundItem {
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

export interface Section4TextItem {
  id: string;
  item_name: string | null;
  text_left: string | null;
  text_right: string | null;
  metadata_tab: { category: string } | null;
  ui_width: number | null;
  ui_height: number | null;
  ui_position_x: number | null;
  ui_position_y: number | null;
}

export interface ClassicInitialData {
  products: ClassicProduct[];
  backgroundSections: BackgroundSection[];
  section4TextItems: Section4TextItem[];
  foregroundItems: ForegroundItem[];
}
