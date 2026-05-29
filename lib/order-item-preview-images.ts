import { asOrderCustomizationsList } from "@/lib/order-item-customizations";

export type OrderPreviewSlot = {
  url: string;
  label: string;
};

export type OrderItemPreviewSource = {
  order_item_id: number;
  product_name?: string | null;
  preview_url?: string | null;
  admin_media_url?: unknown;
  customizations_json?: unknown;
  is_package_design?: boolean | null;
  linked_item_id?: number | null;
};

function pickAdminMediaUrl(item: { admin_media_url?: unknown }): string | null {
  const v = item.admin_media_url;
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** 是否為可內嵌預覽的圖片 URL（排除 CSV/PDF 等） */
export function isLikelyImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed.startsWith("http")) return false;
  const path = trimmed.toLowerCase().split("?")[0];
  if (/\.(csv|pdf|xlsx?|docx?|txt|zip)(\b|$)/.test(path)) return false;
  if (/\.(png|jpe?g|webp|gif|svg|avif|bmp)(\b|$)/.test(path)) return true;
  if (
    path.includes("customizer_uploads") ||
    path.includes("website_img") ||
    path.includes("/storage/v1/object/public/")
  ) {
    return true;
  }
  return true;
}

function getCustomizationImageUrl(custom: Record<string, unknown>): string | null {
  const value = custom.value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const url = (value as { url?: unknown }).url;
    if (typeof url === "string" && url.trim()) return url.trim();
  }
  if (typeof value === "string" && value.startsWith("http")) return value.trim();

  const items = custom.items;
  if (Array.isArray(items)) {
    for (const entry of items) {
      if (entry && typeof entry === "object" && typeof (entry as { url?: unknown }).url === "string") {
        const u = (entry as { url: string }).url.trim();
        if (u) return u;
      }
    }
  }
  return null;
}

/** 客製 JSON 中屬於包裝預覽的群組（非甜點截圖、非純文字檔） */
function isPackagePreviewCustomization(custom: Record<string, unknown>): boolean {
  const group = String(custom.group ?? "");
  const nameZh = String(custom.group_name_zh ?? "");

  if (group === "package_screenshot" || group === "package_decoration_upload") return true;
  if (group === "user_design") return true;
  if (/包裝預覽|包裝設計|包裝照片|客製化照片|刊頭設計|貼紙|插卡/.test(nameZh)) return true;
  if (/包裝/.test(nameZh) && !/款式|裝飾品$/.test(nameZh)) return true;

  if (group === "screenshot" || /餐盒預覽|甜點預覽/.test(nameZh)) return false;
  if (group === "photo" || group === "text" || group === "luck_text_design") return false;
  if (group === "package_style" || group === "package_decoration" || group === "box_config") return false;

  return false;
}

function isPackageDesignLineItem(item: OrderItemPreviewSource): boolean {
  return item.is_package_design === true || !!item.product_name?.includes("包裝設計");
}

/**
 * 組出管理員預覽區要顯示的圖片（甜點 + 包裝），含關聯品項與 customizations_json 內 URL。
 */
export function buildOrderItemPreviewSlots(
  item: OrderItemPreviewSource,
  allItems: OrderItemPreviewSource[],
): OrderPreviewSlot[] {
  const slots: OrderPreviewSlot[] = [];
  const seen = new Set<string>();

  const add = (url: string | null | undefined, label: string) => {
    if (!url || !isLikelyImageUrl(url)) return;
    if (seen.has(url)) return;
    seen.add(url);
    slots.push({ url, label });
  };

  const customizations = asOrderCustomizationsList(item.customizations_json);
  const isPackageLine = isPackageDesignLineItem(item);

  if (!isPackageLine) {
    const adminUrl = pickAdminMediaUrl(item);
    if (adminUrl) add(adminUrl, "管理員附圖");
    else add(item.preview_url ?? null, "甜點預覽");

    const linkedPackage = allItems.find(
      (other) =>
        other.order_item_id !== item.order_item_id &&
        other.linked_item_id === item.order_item_id &&
        isPackageDesignLineItem(other),
    );
    if (linkedPackage) {
      const linkedAdmin = pickAdminMediaUrl(linkedPackage);
      if (linkedAdmin) add(linkedAdmin, "包裝預覽");
      else add(linkedPackage.preview_url ?? null, "包裝預覽");
    }

    for (const raw of customizations) {
      if (!raw || typeof raw !== "object") continue;
      const custom = raw as Record<string, unknown>;
      if (!isPackagePreviewCustomization(custom)) continue;
      const url = getCustomizationImageUrl(custom);
      if (!url) continue;
      const label =
        typeof custom.group_name_zh === "string" && custom.group_name_zh.trim()
          ? custom.group_name_zh.trim()
          : "包裝預覽";
      add(url, label);
    }
  } else {
    const adminUrl = pickAdminMediaUrl(item);
    if (adminUrl) add(adminUrl, "管理員附圖");
    add(item.preview_url ?? null, "包裝預覽");
  }

  return slots;
}

export function collectPreviewUrlsFromSlots(slots: OrderPreviewSlot[]): Set<string> {
  return new Set(slots.map((s) => s.url));
}
