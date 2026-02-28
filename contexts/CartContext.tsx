"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

const DISABLE_SUPABASE = false;

export interface CartItem {
  id: string;
  name: string;
  quantity: number;
  price?: number;
  total_price?: number;
  preview_url?: string;
  image_url?: string;
  expected_pickup_date?: string;
  temp_id?: string;
  category?: string;
  product_id?: string;
  customizations?: unknown[];
  user_name?: string;
  linked_item_id?: string;
  is_package_design?: boolean;
  [key: string]: unknown;
}

interface CartContextValue {
  items: CartItem[];
  hydrated: boolean;
  addToCart: (item: Omit<CartItem, "id"> & { id?: string }) => void;
  addToCartCustom: (item: Omit<CartItem, "id"> & { id?: string }) => void;
  removeFromCart: (id: string) => void;
  updateCartItem: (id: string, updates: Partial<CartItem>) => void;
  removeItemsByIds: (ids: string[]) => void;
  clearCart: () => void;
}

const CART_STORAGE_KEY = "tj-cart";

const CartContext = createContext<CartContextValue | null>(null);

function loadFromStorage(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveToStorage(items: CartItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  } catch {}
}

function getUserDisplayName(user: { user_metadata?: Record<string, unknown>; email?: string } | null): string {
  if (!user) return "";
  const meta = user.user_metadata ?? {};
  return (meta.name as string) || (meta.full_name as string) || (user.email?.split("@")[0] ?? "") || "";
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(id: string): boolean {
  return UUID_REGEX.test(id);
}

/** 差異同步到 Supabase cart：軟刪除已移除、更新既有、插入新項目，並回傳新插入的 DB 列（供呼叫端更新 item.id） */
async function persistCart(
  user: { id: string },
  newItems: CartItem[],
  getDisplayName: () => string
): Promise<{ insertedRows: { id: string; product_id: string; temp_id: string | null }[]; insertedItemIds: string[] } | null> {
  if (DISABLE_SUPABASE || !user) return null;

  const displayName = getDisplayName();

  const { data: dbRows, error: readErr } = await supabase
    .from("cart")
    .select("id, product_id, temp_id")
    .eq("user_id", user.id)
    .eq("is_submitted", false);

  if (readErr) {
    console.error("❌ persistCart 讀取 DB 失敗:", readErr);
    return null;
  }

  const existingDbRows = dbRows ?? [];
  const existingDbIdSet = new Set(existingDbRows.map((r) => r.id));
  const newItemIds = new Set(newItems.map((i) => i.id));

  // 軟刪除：DB 有但 newItems 沒有
  const removedDbIds = existingDbRows.filter((row) => !newItemIds.has(row.id)).map((row) => row.id);
  if (removedDbIds.length > 0) {
    await supabase.from("cart").update({ is_submitted: true }).in("id", removedDbIds);
  }

  // 更新既有
  const toUpdate = newItems.filter((i) => existingDbIdSet.has(i.id));
  for (const item of toUpdate) {
    await supabase
      .from("cart")
      .update({
        product_id: item.product_id ?? "",
        quantity: item.quantity,
        total_price: item.total_price ?? 0,
        user_name: (item.user_name as string) || displayName,
        preview_url: item.preview_url ?? item.image_url ?? null,
        customizations_json: item.customizations ?? null,
        temp_id: item.temp_id ?? null,
        expected_pickup_date: item.expected_pickup_date ?? null,
        linked_item_id: item.linked_item_id ?? null,
        is_package_design: item.is_package_design ?? false,
      })
      .eq("id", item.id);
  }

  // 插入新項目（id 不在 DB 的視為新項目）
  const toInsert = newItems.filter((i) => !existingDbIdSet.has(i.id));
  if (toInsert.length === 0) return { insertedRows: [], insertedItemIds: [] };

  const { data: insertedRows, error: insertError } = await supabase
    .from("cart")
    .insert(
      toInsert.map((i) => ({
        user_id: user.id,
        product_id: i.product_id ?? "",
        quantity: i.quantity,
        total_price: i.total_price ?? 0,
        user_name: (i.user_name as string) || displayName,
        preview_url: i.preview_url ?? i.image_url ?? null,
        customizations_json: i.customizations ?? null,
        temp_id: i.temp_id ?? null,
        expected_pickup_date: i.expected_pickup_date ?? null,
        linked_item_id: i.linked_item_id ?? null,
        is_package_design: i.is_package_design ?? false,
      }))
    )
    .select("id, product_id, temp_id");

  if (insertError) {
    console.error("❌ persistCart insert 失敗:", insertError);
    return null;
  }

  const rows = insertedRows ?? [];
  return { insertedRows: rows, insertedItemIds: toInsert.map((i) => i.id) };
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const getDisplayName = useCallback(() => getUserDisplayName(user), [user]);

  // 未登入：僅用 localStorage
  useEffect(() => {
    if (user) return;
    setItems(loadFromStorage());
    setHydrated(true);
  }, [user]);

  // 未登入時寫回 localStorage
  useEffect(() => {
    if (!hydrated || user) return;
    saveToStorage(items);
  }, [items, hydrated, user]);

  // 已登入：從 DB 載入 + 合併 localStorage，再同步回 DB
  useEffect(() => {
    if (DISABLE_SUPABASE || !user) return;

    const loadCart = async () => {
      const tempItems = loadFromStorage();
      const { data: cartRows, error: cartErr } = await supabase
        .from("cart")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_submitted", false);

      if (cartErr) {
        console.error("讀取 DB cart 失敗：", cartErr);
        setItems(tempItems);
        setHydrated(true);
        return;
      }

      const productIds = [...new Set((cartRows ?? []).map((c) => c.product_id).filter(Boolean))];
      const { data: productRows } =
        productIds.length > 0
          ? await supabase.from("products").select("id, name, category, price, emoji").in("id", productIds)
          : { data: [] };

      const displayName = getDisplayName();
      const dbItems: CartItem[] = (cartRows ?? []).map((row: Record<string, unknown>) => {
        const prod = (productRows ?? []).find((p: { id: string }) => p.id === row.product_id);
        return {
          id: row.id as string,
          product_id: row.product_id as string,
          name: (prod as { name?: string })?.name ?? (row.product_id as string),
          category: (prod as { category?: string })?.category ?? "",
          price: (prod as { price?: number })?.price,
          total_price: (row.total_price as number) ?? 0,
          quantity: Number(row.quantity) ?? 1,
          user_name: (row.user_name as string) || displayName,
          preview_url: (row.preview_url as string) ?? undefined,
          image_url: (row.preview_url as string) ?? undefined,
          customizations: (row.customizations_json as unknown[]) ?? undefined,
          temp_id: (row.temp_id as string) ?? undefined,
          expected_pickup_date: (row.expected_pickup_date as string) ?? undefined,
          linked_item_id: (row.linked_item_id as string) ?? undefined,
          is_package_design: (row.is_package_design as boolean) ?? false,
        } as CartItem;
      });

      let merged: CartItem[] = [...dbItems];
      const existingDbIdSet = new Set(dbItems.map((d) => d.id));

      for (const t of tempItems) {
        const tempId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `cart-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        merged.push({
          ...t,
          id: tempId,
          user_name: (t.user_name as string) || displayName,
          preview_url: t.preview_url ?? t.image_url ?? undefined,
        } as CartItem);
      }

      if (tempItems.length > 0) {
        const result = await persistCart(user, merged, getDisplayName);
        if (result && result.insertedRows.length > 0) {
          for (let i = 0; i < result.insertedRows.length; i++) {
            const idx = merged.findIndex((m) => m.id === result.insertedItemIds[i]);
            if (idx >= 0) merged[idx] = { ...merged[idx], id: result.insertedRows[i].id };
          }
        }
        localStorage.removeItem(CART_STORAGE_KEY);
      }

      setItems(merged);
      setHydrated(true);
    };

    loadCart();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const addToCart = useCallback(
    (item: Omit<CartItem, "id"> & { id?: string }) => {
      const tempId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `cart-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const newItem = { ...item, id: tempId } as CartItem;

      setItems((prev) => {
        const updated = [...prev, newItem];
        if (user && !DISABLE_SUPABASE) {
          persistCart(user, updated, getDisplayName).then((result) => {
            if (result && result.insertedRows.length > 0) {
              setItems((current) => {
                const copy = [...current];
                for (let i = 0; i < result!.insertedRows.length; i++) {
                  const idx = copy.findIndex((c) => c.id === result!.insertedItemIds[i]);
                  if (idx >= 0) copy[idx] = { ...copy[idx], id: result!.insertedRows[i].id };
                }
                return copy;
              });
            }
          });
        }
        return updated;
      });
    },
    [user, getDisplayName]
  );

  const addToCartCustom = useCallback(
    (item: Omit<CartItem, "id"> & { id?: string }) => {
      const expectedPickupDate = typeof window !== "undefined" ? localStorage.getItem("expected_pickup_date") : null;
      const mergedItem: CartItem = {
        ...item,
        expected_pickup_date: item.expected_pickup_date || expectedPickupDate || undefined,
      } as CartItem;
      addToCart(mergedItem);
    },
    [addToCart]
  );

  const removeFromCart = useCallback(
    (id: string) => {
      setItems((prev) => prev.filter((i) => i.id !== id));
      if (user && !DISABLE_SUPABASE && isUuid(id)) {
        supabase.from("cart").update({ is_submitted: true }).eq("id", id).then(({ error }) => {
          if (error) console.error("❌ 軟刪除購物車項目失敗:", error);
        });
      }
    },
    [user]
  );

  const updateCartItem = useCallback(
    (id: string, updates: Partial<CartItem>) => {
      setItems((prev) => {
        const updated = prev.map((i) => (i.id === id ? { ...i, ...updates } : i));
        if (user && !DISABLE_SUPABASE) persistCart(user, updated, getDisplayName);
        return updated;
      });
    },
    [user, getDisplayName]
  );

  const removeItemsByIds = useCallback(
    (ids: string[]) => {
      const set = new Set(ids);
      setItems((prev) => prev.filter((i) => !set.has(i.id)));
      if (user && !DISABLE_SUPABASE) {
        const uuids = ids.filter(isUuid);
        if (uuids.length > 0) {
          supabase.from("cart").update({ is_submitted: true }).in("id", uuids).then(({ error }) => {
            if (error) console.error("❌ 標記購物車項目為已提交失敗:", error);
          });
        }
      }
    },
    [user]
  );

  const clearCart = useCallback(() => {
    setItems([]);
    if (user && !DISABLE_SUPABASE) {
      supabase
        .from("cart")
        .update({ is_submitted: true })
        .eq("user_id", user.id)
        .eq("is_submitted", false)
        .then(({ error }) => {
          if (error) console.error("❌ 清空購物車失敗:", error);
        });
    } else if (!user && typeof window !== "undefined") {
      localStorage.removeItem(CART_STORAGE_KEY);
    }
  }, [user]);

  const value: CartContextValue = {
    items,
    hydrated,
    addToCart,
    addToCartCustom,
    removeFromCart,
    updateCartItem,
    removeItemsByIds,
    clearCart,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
