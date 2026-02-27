// ======================================================================
// useHierarchicalOptions.ts — 樹狀選項管理（✅ 嚴格依據 PO 篩選）
// ======================================================================

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface MasterMetadata {
  hex_code?: string;
  image_url?: string;
}

interface ProductMetadata {
  ui_x?: number;
  ui_y?: number;
  ui_width?: number;
  ui_height?: number;
  rotation?: number;
  photo_carrier_type?: "diamond" | "irregular" | "circle" | "square" | "none";
  requires_photo_upload?: boolean;
  // 禮盒專用：多照片框陣列
  photo_frames?: Array<{
    ui_x: number;
    ui_y: number;
    ui_width: number;
    ui_height: number;
    rotation?: number;
    photo_carrier_type?: string;
  }>;
}

export interface DecorationOption {
  option_id: number;
  option_name_zh: string;
  option_level: number;
  parent_id: number | null;
  is_final_option: boolean;
  price_modifier: number;
  logic_constraints?: {
    selection_type?: "SINGLE" | "MULTIPLE";
  };
  item_image_url?: string;
  thumbnail_url?: string;
  metadata_master?: MasterMetadata;
  metadata_product?: ProductMetadata;
  sort_order?: number;
}

interface UseHierarchicalOptionsReturn {
  decorationOptions: DecorationOption[];
  selectedDecorations: Set<number>;
  setSelectedDecorations: React.Dispatch<React.SetStateAction<Set<number>>>;
  openPath: number[];
  setOpenPath: React.Dispatch<React.SetStateAction<number[]>>;
  optionsMap: Record<number, DecorationOption>;
  parentMap: Record<number, number | null>;
  childrenMap: Record<number, number[]>;
  descendantsMap: Record<number, number[]>;
  toggleOption: (option: DecorationOption) => void;
  handleDecorationSelect: (option: DecorationOption, singleRoots?: number[]) => void;
  isInBranch: (id: number, root: number) => boolean;
  clearAllSelections: () => void;
  isLoading: boolean;
  error: string | null;
}

const toPublicUrl = (path?: string | null): string => {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  const cleanPath = path.replace(/^\/+/, "").replace(/^custom_assets?\//, "custom_asset/");
  return `https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/${cleanPath}`;
};

export function useHierarchicalOptions(
  productId: string,
  rootIds: number[]
): UseHierarchicalOptionsReturn {
  const [decorationOptions, setDecorationOptions] = useState<DecorationOption[]>([]);
  const [selectedDecorations, setSelectedDecorations] = useState<Set<number>>(new Set());
  const [openPath, setOpenPath] = useState<number[]>([]);
  const [optionsMap, setOptionsMap] = useState<Record<number, DecorationOption>>({});
  const [parentMap, setParentMap] = useState<Record<number, number | null>>({});
  const [childrenMap, setChildrenMap] = useState<Record<number, number[]>>({});
  const [descendantsMap, setDescendantsMap] = useState<Record<number, number[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!rootIds || rootIds.length === 0) {
      setIsLoading(false);
      return;
    }

    const loadDecorations = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const { data: productOptions, error: poError } = await supabase
          .from("product_options")
          .select("option_id, option_name_zh, item_image_url, thumbnail_url, metadata_product, sort_order_product, is_hide")
          .eq("product_id", productId)
          .neq("is_hide", true); // ✅ 過濾 is_hide=true

        if (poError) throw poError;
        if (!productOptions || productOptions.length === 0) {
          setDecorationOptions([]);
          setIsLoading(false);
          return;
        }

        const allowedOptionIds = new Set(productOptions.map((po) => po.option_id));
        const { data: masterOptions, error: moError } = await supabase
          .from("master_options")
          .select("*")
          .in("option_id", Array.from(allowedOptionIds))
          .neq("is_hide", true); // ✅ 過濾 is_hide=true

        if (moError) throw moError;

        const mergedList = (masterOptions || []).map((mo: any) => {
          const po = productOptions.find((p) => p.option_id === mo.option_id);
          return {
            option_id: mo.option_id,
            option_name_zh: po?.option_name_zh || mo.option_name_zh,
            option_level: mo.option_level,
            parent_id: mo.parent_id,
            is_final_option: mo.is_final_option,
            price_modifier: mo.price_modifier || 0,
            logic_constraints: mo.logic_constraints,
            item_image_url: toPublicUrl(po?.item_image_url || mo.metadata_master?.image_url || ""),
            thumbnail_url: toPublicUrl(po?.thumbnail_url || ""),
            metadata_master: mo.metadata_master,
            metadata_product: po?.metadata_product || {},
            sort_order: po?.sort_order_product ?? mo.sort_order_master ?? 0,
          };
        });

        const buildHierarchy = (optionList: any[]) => {
          const result: any[] = [];
          const visited = new Set<number>();

          const traverse = (parentId: number | null) => {
            optionList.forEach((opt) => {
              if (opt.parent_id === parentId && !visited.has(opt.option_id)) {
                visited.add(opt.option_id);
                result.push(opt);
                traverse(opt.option_id);
              }
            });
          };

          rootIds.forEach((rootId) => {
            const rootOpt = optionList.find((o) => o.option_id === rootId);
            if (rootOpt && !visited.has(rootId)) {
              visited.add(rootId);
              result.push(rootOpt);
              traverse(rootId);
            }
          });

          return result;
        };

        const allOptions = buildHierarchy(mergedList);
        allOptions.sort((a, b) => {
          if (a.option_level !== b.option_level) return a.option_level - b.option_level;
          return (a.sort_order || 0) - (b.sort_order || 0);
        });

        setDecorationOptions(allOptions);

        const newMap: Record<number, DecorationOption> = {};
        const newParentMap: Record<number, number | null> = {};
        const newChildrenMap: Record<number, number[]> = {};
        const newDescendantsMap: Record<number, number[]> = {};

        allOptions.forEach((opt) => {
          newMap[opt.option_id] = opt;
          newParentMap[opt.option_id] = opt.parent_id;
          if (opt.parent_id !== null) {
            if (!newChildrenMap[opt.parent_id]) newChildrenMap[opt.parent_id] = [];
            newChildrenMap[opt.parent_id].push(opt.option_id);
          }
        });

        const getDescendants = (id: number): number[] => {
          const children = newChildrenMap[id] || [];
          const descendants: number[] = [...children];
          children.forEach((childId) => descendants.push(...getDescendants(childId)));
          return descendants;
        };

        allOptions.forEach((opt) => {
          newDescendantsMap[opt.option_id] = getDescendants(opt.option_id);
        });

        setOptionsMap(newMap);
        setParentMap(newParentMap);
        setChildrenMap(newChildrenMap);
        setDescendantsMap(newDescendantsMap);

      } catch (err) {
        console.error("載入裝飾選項失敗:", err);
        setError(err instanceof Error ? err.message : "載入失敗");
      } finally {
        setIsLoading(false);
      }
    };

    loadDecorations();
  }, [productId, JSON.stringify(rootIds)]);

  // 建立開啟路徑（從選項往上追溯到根）
  const buildOpenPath = (optionId: number): number[] => {
    const path: number[] = [];
    let current: number | null = optionId;
    
    while (current !== null) {
      path.push(current);
      current = parentMap[current] ?? null;
    }
    
    return path;
  };

  const toggleOption = (option: DecorationOption) => {
    if (!option) return;

    // final option 不控制展開，只展開父層
    if (option.is_final_option) {
      setOpenPath(buildOpenPath(option.option_id));
      return;
    }

    // 一般群組：控制開合
    if (openPath.includes(option.option_id)) {
      // 目前開著 → 收起
      setOpenPath((prev) => prev.filter((id) => id !== option.option_id));
    } else {
      // 目前關著 → 展開（但仍維持只有一條 path）
      setOpenPath(buildOpenPath(option.option_id));
    }
  };

  const handleDecorationSelect = (option: DecorationOption) => {
    // 1️⃣ 如果不是 final option → 展開即可
    if (!option.is_final_option) {
      toggleOption(option);
      return;
    }

    // 2️⃣ final option → 展開父層
    toggleOption(option);

    // 3️⃣ SINGLE 互斥邏輯
    setSelectedDecorations((prev) => {
      const newSelected = new Set(prev);

      // 🔍 找祖先
      const ancestors: number[] = [];
      let cur = option.option_id;
      while (cur !== null) {
        const parent = parentMap[cur];
        if (parent === undefined || parent === null) break;
        ancestors.push(parent);
        cur = parent;
      }

      // 🔍 找出設定為 SINGLE 的祖先
      const singleAncestors = ancestors.filter((id) => {
        const opt = optionsMap[id];
        return opt?.logic_constraints?.selection_type === "SINGLE";
      });

      // 🔍 清除這些 SINGLE 祖先底下的其他 final option
      singleAncestors.forEach((ancestorId) => {
        const branch = descendantsMap[ancestorId] || [];

        branch.forEach((descId) => {
          const descOpt = optionsMap[descId];
          if (
            descOpt?.is_final_option &&
            isInBranch(descId, ancestorId) &&
            descId !== option.option_id &&
            newSelected.has(descId)
          ) {
            newSelected.delete(descId);
          }
        });
      });

      // 4️⃣ 切換自己的選中狀態
      if (newSelected.has(option.option_id)) {
        newSelected.delete(option.option_id);
      } else {
        newSelected.add(option.option_id);
      }

      return newSelected;
    });
  };

  const isInBranch = (id: number, root: number): boolean => {
    if (id === root) return true;
    return descendantsMap[root]?.includes(id) || false;
  };

  // ==================== 清除所有選項 ====================
  const clearAllSelections = useCallback(() => {
    setSelectedDecorations(new Set());
    setOpenPath([]);
  }, []);

  return {
    decorationOptions,
    selectedDecorations,
    setSelectedDecorations,
    openPath,
    setOpenPath,
    optionsMap,
    parentMap,
    childrenMap,
    descendantsMap,
    toggleOption,
    handleDecorationSelect,
    isInBranch,
    clearAllSelections,
    isLoading,
    error,
  };
}
