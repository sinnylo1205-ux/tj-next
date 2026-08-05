"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GripVertical, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { prepareImageForUpload } from "@/lib/prepare-upload-image-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SafeImage } from "@/components/SafeImage";
import { cn } from "@/lib/utils";

const ORDER_POPUP_CATEGORY = "order_popup";
const ORDER_POPUP_PUT_WHERE = "customer_examples";

type OrderPopupRow = {
  id: string;
  item_name: string | null;
  photo_url: string | null;
  photo_url_mobile: string | null;
  sort_order: number | null;
  description: string | null;
};

type HomepageArticleRow = {
  id: string;
  item_name: string;
  slug: string;
  og_image_url: string | null;
  is_published: boolean | null;
  homepage_sort_order: number | null;
};

function reorderList<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

type SortableRowProps = {
  id: string;
  index: number;
  dragIndex: number | null;
  overIndex: number | null;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDrop: () => void;
  onDragEnd: () => void;
  children: React.ReactNode;
};

function SortableRow({
  id,
  index,
  dragIndex,
  overIndex,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  children,
}: SortableRowProps) {
  const isDragging = dragIndex === index;
  const isOver = overIndex === index && dragIndex != null && dragIndex !== index;
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", id);
        onDragStart(index);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragOver(index);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-card p-3 transition-opacity",
        isDragging && "opacity-50 border-primary",
        isOver && "border-primary bg-primary/5",
        !isDragging && !isOver && "border-border",
      )}
    >
      <button
        type="button"
        className="shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label="拖曳排序"
        tabIndex={-1}
      >
        <GripVertical className="h-5 w-5" />
      </button>
      <span className="w-7 shrink-0 text-center text-xs font-medium text-muted-foreground">{index + 1}</span>
      {children}
    </div>
  );
}

/** 內容管理 → 網站素材 → 彈跳視窗照片管理 */
export default function AdminPopupMaterialsSection() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  const [orderRows, setOrderRows] = useState<OrderPopupRow[]>([]);
  const [homeRows, setHomeRows] = useState<HomepageArticleRow[]>([]);

  const [orderDragIndex, setOrderDragIndex] = useState<number | null>(null);
  const [homeDragIndex, setHomeDragIndex] = useState<number | null>(null);
  const [orderOverIndex, setOrderOverIndex] = useState<number | null>(null);
  const [homeOverIndex, setHomeOverIndex] = useState<number | null>(null);
  const orderDragRef = useRef<{ from: number; over: number } | null>(null);
  const homeDragRef = useRef<{ from: number; over: number } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [orderRes, homeRes] = await Promise.all([
      supabase
        .from("Website_photo_material")
        .select("id, item_name, photo_url, photo_url_mobile, sort_order, description")
        .eq("category", ORDER_POPUP_CATEGORY)
        .eq("put_where", ORDER_POPUP_PUT_WHERE)
        .not("sort_order", "is", null)
        .order("sort_order", { ascending: true }),
      supabase
        .from("product_articles")
        .select("id, item_name, slug, og_image_url, is_published, homepage_sort_order")
        .eq("show_on_homepage", true)
        .order("homepage_sort_order", { ascending: true, nullsFirst: false })
        .order("updated_at", { ascending: false }),
    ]);

    if (orderRes.error) {
      toast({ title: "載入訂購頁彈窗失敗", description: orderRes.error.message, variant: "destructive" });
      setOrderRows([]);
    } else {
      setOrderRows((orderRes.data || []) as OrderPopupRow[]);
    }

    if (homeRes.error) {
      toast({ title: "載入首頁彈窗失敗", description: homeRes.error.message, variant: "destructive" });
      setHomeRows([]);
    } else {
      setHomeRows((homeRes.data || []) as HomepageArticleRow[]);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const persistOrderSort = async (rows: OrderPopupRow[]) => {
    setSaving(true);
    const updates = rows.map((row, idx) =>
      supabase.from("Website_photo_material").update({ sort_order: idx + 1 }).eq("id", row.id),
    );
    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);
    setSaving(false);
    if (failed?.error) {
      toast({ title: "儲存順序失敗", description: failed.error.message, variant: "destructive" });
      await loadData();
      return;
    }
    setOrderRows(rows.map((row, idx) => ({ ...row, sort_order: idx + 1 })));
    toast({ title: "✅ 訂購頁彈窗順序已更新" });
  };

  const persistHomeSort = async (rows: HomepageArticleRow[]) => {
    setSaving(true);
    const updates = rows.map((row, idx) =>
      supabase.from("product_articles").update({ homepage_sort_order: idx + 1 }).eq("id", row.id),
    );
    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);
    setSaving(false);
    if (failed?.error) {
      toast({ title: "儲存順序失敗", description: failed.error.message, variant: "destructive" });
      await loadData();
      return;
    }
    setHomeRows(rows.map((row, idx) => ({ ...row, homepage_sort_order: idx + 1 })));
    toast({ title: "✅ 首頁彈窗順序已更新" });
  };

  const finishOrderDrag = () => {
    const drag = orderDragRef.current;
    orderDragRef.current = null;
    setOrderDragIndex(null);
    setOrderOverIndex(null);
    if (!drag || drag.from === drag.over) return;
    const next = reorderList(orderRows, drag.from, drag.over);
    if (next === orderRows) return;
    setOrderRows(next);
    void persistOrderSort(next);
  };

  const finishHomeDrag = () => {
    const drag = homeDragRef.current;
    homeDragRef.current = null;
    setHomeDragIndex(null);
    setHomeOverIndex(null);
    if (!drag || drag.from === drag.over) return;
    const next = reorderList(homeRows, drag.from, drag.over);
    if (next === homeRows) return;
    setHomeRows(next);
    void persistHomeSort(next);
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    const webpFile = file.type.startsWith("image/") ? await prepareImageForUpload(file) : file;
    const fileName = `admin_new_add/popup_${Date.now()}_${Math.random().toString(36).slice(2)}.webp`;
    const { error } = await supabase.storage.from("custom_asset").upload(fileName, webpFile, {
      upsert: true,
      contentType: "image/webp",
    });
    if (error) {
      toast({ title: "上傳失敗", description: error.message, variant: "destructive" });
      return null;
    }
    return supabase.storage.from("custom_asset").getPublicUrl(fileName).data.publicUrl;
  };

  const handleOrderImageUpload = async (
    rowId: string,
    field: "photo_url" | "photo_url_mobile",
    file: File,
  ) => {
    const key = `${rowId}_${field}`;
    setUploadingKey(key);
    const url = await uploadImage(file);
    if (url) {
      const { error } = await supabase.from("Website_photo_material").update({ [field]: url }).eq("id", rowId);
      if (error) {
        toast({ title: "更新失敗", description: error.message, variant: "destructive" });
      } else {
        setOrderRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, [field]: url } : r)));
        toast({ title: "✅ 圖片已更新" });
      }
    }
    setUploadingKey(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        載入彈跳視窗素材…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">彈跳視窗照片管理</h2>
          <p className="text-sm text-muted-foreground">
            拖曳左側把手調整輪播順序（越上方越先顯示）。訂購頁對應客製範例；首頁對應已勾選「顯示在網站首頁」的文章封面。
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => void loadData()}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          重新載入
        </Button>
      </div>

      <Tabs defaultValue="order">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="order">訂購頁客製範例</TabsTrigger>
          <TabsTrigger value="home">首頁企業合作案例</TabsTrigger>
        </TabsList>

        <TabsContent value="order" className="mt-4 space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">/order 客製範例彈窗</CardTitle>
              <CardDescription>
                資料來源：Website_photo_material（category=order_popup, put_where=customer_examples）。可在此換圖與拖曳排序。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {orderRows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  尚無彈窗照片。請先在資料庫或頁面素材新增 category=order_popup、put_where=customer_examples 的列。
                </p>
              ) : (
                orderRows.map((row, index) => (
                  <SortableRow
                    key={row.id}
                    id={row.id}
                    index={index}
                    dragIndex={orderDragIndex}
                    overIndex={orderOverIndex}
                    onDragStart={(i) => {
                      orderDragRef.current = { from: i, over: i };
                      setOrderDragIndex(i);
                      setOrderOverIndex(i);
                    }}
                    onDragOver={(i) => {
                      if (orderDragRef.current) orderDragRef.current.over = i;
                      setOrderOverIndex(i);
                    }}
                    onDrop={finishOrderDrag}
                    onDragEnd={() => {
                      orderDragRef.current = null;
                      setOrderDragIndex(null);
                      setOrderOverIndex(null);
                    }}
                  >
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
                      {row.photo_url ? (
                        <SafeImage src={row.photo_url} alt={row.item_name || "彈窗圖"} fill className="object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">無圖</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="truncate text-sm font-medium">{row.item_name || "未命名"}</p>
                      <p className="text-xs text-muted-foreground">sort_order：{row.sort_order ?? "—"}</p>
                      <div className="flex flex-wrap gap-2">
                        <label className="inline-flex cursor-pointer items-center rounded border px-2 py-1 text-xs hover:bg-muted">
                          {uploadingKey === `${row.id}_photo_url` ? "上傳中…" : "換桌機圖"}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={!!uploadingKey || saving}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) void handleOrderImageUpload(row.id, "photo_url", f);
                              e.target.value = "";
                            }}
                          />
                        </label>
                        <label className="inline-flex cursor-pointer items-center rounded border px-2 py-1 text-xs hover:bg-muted">
                          {uploadingKey === `${row.id}_photo_url_mobile` ? "上傳中…" : "換手機圖"}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={!!uploadingKey || saving}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) void handleOrderImageUpload(row.id, "photo_url_mobile", f);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  </SortableRow>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="home" className="mt-4 space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">首頁「最新企業合作案例」</CardTitle>
              <CardDescription>
                顯示已開啟「是否顯示在網站首頁」的文章；縮圖使用 OG 封面圖。請至文章管理設定開關與封面，此處拖曳調整輪播順序。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {homeRows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  尚無首頁案例。請到「文章管理」開啟「是否顯示在網站首頁」並儲存。
                </p>
              ) : (
                homeRows.map((row, index) => (
                  <SortableRow
                    key={row.id}
                    id={row.id}
                    index={index}
                    dragIndex={homeDragIndex}
                    overIndex={homeOverIndex}
                    onDragStart={(i) => {
                      homeDragRef.current = { from: i, over: i };
                      setHomeDragIndex(i);
                      setHomeOverIndex(i);
                    }}
                    onDragOver={(i) => {
                      if (homeDragRef.current) homeDragRef.current.over = i;
                      setHomeOverIndex(i);
                    }}
                    onDrop={finishHomeDrag}
                    onDragEnd={() => {
                      homeDragRef.current = null;
                      setHomeDragIndex(null);
                      setHomeOverIndex(null);
                    }}
                  >
                    <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-md bg-muted">
                      {row.og_image_url ? (
                        <SafeImage src={row.og_image_url} alt={row.item_name} fill className="object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">無封面</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{row.item_name}</p>
                      <p className="truncate text-xs text-muted-foreground">/blog/{row.slug}</p>
                      <p className="text-xs text-muted-foreground">
                        順序：{row.homepage_sort_order ?? "—"}
                        {!row.is_published ? (
                          <span className="ml-2 rounded bg-amber-50 px-1 text-amber-800">未發布（前台不顯示）</span>
                        ) : null}
                      </p>
                    </div>
                  </SortableRow>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
