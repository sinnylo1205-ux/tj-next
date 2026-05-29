"use client";

import { ExternalLink, Upload } from "lucide-react";
import { SafeImage } from "@/components/SafeImage";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { asOrderCustomizationsList } from "@/lib/order-item-customizations";
import {
  buildOrderItemPreviewSlots,
  collectPreviewUrlsFromSlots,
  isLikelyImageUrl,
} from "@/lib/order-item-preview-images";
import { cn } from "@/lib/utils";

export type AdminOrderDetailOrder = {
  id: string;
  who_receive: string | null;
  phone?: string | null;
  shipping_address_text: string;
  notes: string | null;
  expected_pickup_date: string | null;
  Email?: string | null;
  shipping_way: string;
  transfer_last5: string | null;
  subtotal: number;
  shipping_fee: number;
  total_amount: number;
  TAX_title?: string | null;
  TAX_id?: number | null;
};

export type AdminOrderDetailItem = {
  order_item_id: number;
  product_name: string;
  quantity: number;
  quantity_description: string | null;
  unit_price: number;
  preview_url: string | null;
  admin_media_url?: string | null;
  customizations_json: unknown[];
  is_package_design?: boolean | null;
  linked_item_id?: number | null;
};

type AdminOrderDetailPanelProps = {
  order: AdminOrderDetailOrder;
  items: AdminOrderDetailItem[];
  buyerName: string;
  /** 手機全螢幕 Dialog：單欄、適合截圖 */
  screenshotMode?: boolean;
  uploadingItemKey?: string | null;
  onUploadItem?: (orderItemId: number, file: File) => void;
  onClearItemMedia?: (orderItemId: number) => void;
};

function pickAdminMediaUrl(item: { admin_media_url?: unknown }): string | null {
  const v = item.admin_media_url;
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

export function AdminOrderDetailPanel({
  order,
  items,
  buyerName,
  screenshotMode = false,
  uploadingItemKey = null,
  onUploadItem,
  onClearItemMedia,
}: AdminOrderDetailPanelProps) {
  const showUpload = Boolean(onUploadItem);

  return (
    <div
      className={cn(
        "space-y-4 max-w-full overflow-x-hidden break-words [overflow-wrap:anywhere]",
        screenshotMode && "rounded-lg bg-[#f4ece8] p-4 text-[15px] leading-relaxed",
      )}
    >
      {screenshotMode && (
        <div className="border-b border-[#e0c7c9] pb-3 text-center">
          <p className="text-xs tracking-widest text-muted-foreground">T&amp;J 客製化甜點 · 訂單</p>
          <p className="mt-1 text-lg font-semibold text-foreground">
            #{order.id.slice(0, 6).toUpperCase()}
          </p>
          <p className="text-sm text-muted-foreground">
            取件 {order.expected_pickup_date || "未指定"}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 text-sm bg-white rounded-md p-3 border border-border">
        <div>
          <span className="font-semibold">收件人：</span>
          {order.who_receive || "未填寫"}
        </div>
        <div>
          <span className="font-semibold">電話：</span>
          {order.phone || "未填寫"}
        </div>
        <div>
          <span className="font-semibold">地址：</span>
          {order.shipping_address_text || "—"}
        </div>
        <div>
          <span className="font-semibold">備註：</span>
          {order.notes || "—"}
        </div>
      </div>

      <div className={cn("grid gap-4 text-sm", screenshotMode ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 md:gap-6")}>
        <div className="space-y-2.5 min-w-0">
          <div>
            <span className="font-medium">會員名（訂購人）：</span>
            {buyerName || "—"}
          </div>
          <div>
            <span className="font-medium">預計取件日：</span>
            {order.expected_pickup_date || "未指定"}
          </div>
          <div>
            <span className="font-medium">聯絡信箱：</span>
            {order.Email || "未填寫"}
          </div>
          <div>
            <span className="font-medium">配送方式：</span>
            {order.shipping_way || "未指定"}
          </div>
          {order.transfer_last5 ? (
            <div>
              <span className="font-medium">轉帳末五碼：</span>
              {order.transfer_last5}
            </div>
          ) : null}
        </div>
        <div className="space-y-2.5 min-w-0">
          <div>
            <span className="font-medium">商品小計：</span>
            NT$ {order.subtotal || 0}
          </div>
          <div>
            <span className="font-medium">運費：</span>
            NT$ {order.shipping_fee || 0}
          </div>
          <div className="font-semibold text-primary text-base">
            <span className="font-medium text-foreground">總計（含運費）：</span>
            NT$ {order.total_amount}
          </div>
          <div>
            <span className="font-medium">發票抬頭：</span>
            {order.TAX_title || "—"}
          </div>
          <div>
            <span className="font-medium">統一編號：</span>
            {order.TAX_id ?? "—"}
          </div>
        </div>
      </div>

      <Separator />

      <div>
        <h4 className="font-semibold mb-3">商品明細</h4>
        {!screenshotMode && showUpload && (
          <p className="text-xs text-muted-foreground mb-3">
            左側可上傳管理員附圖；並顯示甜點與包裝預覽圖（含關聯品項與客製 JSON 內圖片）。
          </p>
        )}
        {items.map((item) => {
          const customizationRows = asOrderCustomizationsList(item.customizations_json);
          const previewSlots = buildOrderItemPreviewSlots(item, items);
          const previewUrlSet = collectPreviewUrlsFromSlots(previewSlots);
          const adminUrl = pickAdminMediaUrl(item);
          const itemKey = `${order.id}-${String(item.order_item_id)}`;
          const uploadingThis = uploadingItemKey === itemKey;

          return (
            <div
              key={item.order_item_id}
              className={cn(
                "mb-4 p-3 bg-white rounded-lg border border-border/60 max-w-full overflow-hidden",
                screenshotMode ? "space-y-3" : "flex flex-col md:flex-row gap-3 md:gap-4",
              )}
            >
              {(previewSlots.length > 0 || showUpload) && (
                <div
                  className={cn(
                    "shrink-0",
                    screenshotMode
                      ? "flex flex-col items-center gap-2"
                      : "flex flex-row md:flex-col items-start md:items-center gap-2 w-full md:min-w-[104px] md:max-w-[220px]",
                  )}
                >
                  <div
                    className={cn(
                      "flex gap-2",
                      screenshotMode ? "flex-col items-center" : "flex-row flex-wrap md:flex-col",
                    )}
                  >
                    {previewSlots.length > 0 ? (
                      previewSlots.map((slot) => (
                        <div key={`${item.order_item_id}-${slot.url}`} className="flex flex-col items-center gap-1">
                          <div className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded border bg-muted/40 shrink-0">
                            <a
                              href={slot.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="relative block h-full w-full"
                              title={`開啟${slot.label}`}
                            >
                              <SafeImage
                                src={slot.url}
                                alt={`${item.product_name} ${slot.label}`}
                                fill
                                className="object-cover"
                                sizes="96px"
                              />
                            </a>
                          </div>
                          <span className="text-[10px] text-muted-foreground text-center leading-tight max-w-[96px]">
                            {slot.label}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded border bg-muted/40 shrink-0">
                        <span className="text-[10px] text-muted-foreground px-1 text-center">無圖</span>
                      </div>
                    )}
                  </div>
                  {showUpload && onUploadItem && (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className={cn("text-xs h-8 min-w-0", screenshotMode ? "w-24" : "flex-1 md:w-full")}
                      disabled={uploadingThis}
                      onClick={() => {
                        const input = document.createElement("input");
                        input.type = "file";
                        input.accept = "image/*";
                        input.onchange = () => {
                          const f = input.files?.[0];
                          if (f) onUploadItem(Number(item.order_item_id), f);
                        };
                        input.click();
                      }}
                    >
                      {uploadingThis ? (
                        "上傳中…"
                      ) : (
                        <>
                          <Upload className="h-3 w-3 mr-1 shrink-0" />
                          上傳
                        </>
                      )}
                    </Button>
                  )}
                  {adminUrl && onClearItemMedia && (
                    <button
                      type="button"
                      className="text-[10px] text-destructive hover:underline"
                      onClick={() => onClearItemMedia(Number(item.order_item_id))}
                    >
                      移除附圖
                    </button>
                  )}
                </div>
              )}
              <div className="flex-1 space-y-2 min-w-0 w-full">
                <p className="font-medium break-words">{item.product_name}</p>
                {customizationRows.length > 0 && (
                  <div className="space-y-1 text-sm text-muted-foreground min-w-0">
                    {customizationRows.map((custom: { group_name_zh?: string; summary?: string; value?: { url?: string } }, idx: number) => (
                      <div key={idx} className="min-w-0 break-words">
                        <span className="font-medium">{custom.group_name_zh}：</span>
                        <span className="break-words">{custom.summary}</span>
                        {custom.value?.url &&
                          typeof custom.value.url === "string" &&
                          !previewUrlSet.has(custom.value.url) && (
                          <a
                            href={custom.value.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 block text-primary hover:underline break-all"
                          >
                            {isLikelyImageUrl(custom.value.url) ? "開啟圖片" : "開啟連結"}{" "}
                            <ExternalLink className="ml-1 h-3 w-3 inline" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="text-sm">
                  <span className="text-muted-foreground">單價：</span>
                  NT$ {Number(item.unit_price ?? 0).toLocaleString()}
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">數量：</span>
                  {item.quantity_description || item.quantity}
                </div>
                <div className="text-sm font-semibold">
                  小計：NT$ {(item.unit_price * item.quantity).toLocaleString()}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 手機列表用：取件日 + 姓名 */
export function getMobileOrderListName(
  order: {
    is_from_quotation?: boolean;
    who_receive: string | null;
    is_manual_order?: boolean;
  },
  buyerName: string,
): string {
  if (order.is_from_quotation) {
    return order.who_receive?.trim() || "（報價單）";
  }
  if (order.who_receive?.trim()) {
    return order.who_receive.trim();
  }
  return buyerName || "未填寫";
}
