// ======================================================================
// PackageStyleSelector.tsx — 包裝款式選擇器（文字按鈕 + 照片上傳支援）
// ======================================================================

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { PackageStyleOption } from "@/hooks/useUniversalPackageCustomizer";

export interface PackageStylePhotoMetadata {
  ui_x?: number;
  ui_y?: number;
  ui_width?: number;
  ui_height?: number;
  rotation?: number;
  photo_carrier_type?: "diamond" | "square" | "circle" | "ellipse" | "irregular" | "none";
  requires_photo_upload?: boolean;
}

interface PackageStyleSelectorProps {
  options: PackageStyleOption[];
  selectedOption: PackageStyleOption | null;
  onSelect: (option: PackageStyleOption) => void;
  onPhotoRequirementChange?: (requiresPhoto: boolean, metadata?: PackageStylePhotoMetadata) => void;
  productId?: string;
}

export function PackageStyleSelector({ 
  options, 
  selectedOption, 
  onSelect,
  onPhotoRequirementChange,
  productId
}: PackageStyleSelectorProps) {
  const [metadataMap, setMetadataMap] = useState<Map<number, PackageStylePhotoMetadata>>(new Map());

  // 載入所有選項的 metadata_product（以便偵測哪個選項需要照片上傳）
  useEffect(() => {
    const loadMetadata = async () => {
      if (!productId || options.length === 0) return;

      const optionIds = options.map(o => o.option_id);
      
      const { data, error } = await supabase
        .from("product_options")
        .select("option_id, metadata_product")
        .eq("product_id", productId)
        .in("option_id", optionIds);

      if (error) {
        console.error("❌ 載入 metadata 失敗:", error);
        return;
      }

      const map = new Map<number, PackageStylePhotoMetadata>();
      (data || []).forEach((item) => {
        if (item.metadata_product) {
          console.log(`[PackageStyleSelector] 選項 ${item.option_id}:`, item.metadata_product);
          map.set(item.option_id, item.metadata_product as PackageStylePhotoMetadata);
        }
      });
      setMetadataMap(map);

      // 如果已有選中的選項，檢查是否需要照片上傳
      if (selectedOption) {
        const metadata = map.get(selectedOption.option_id);
        const requiresPhotoUpload = metadata?.requires_photo_upload === true;
        console.log(`[PackageStyleSelector] 初始化選項 ${selectedOption.option_id}, requires_photo_upload:`, requiresPhotoUpload);
        onPhotoRequirementChange?.(requiresPhotoUpload, metadata);
      }
    };

    loadMetadata();
  }, [productId, options]);

  if (options.length === 0) return null;

  const handleSelect = (option: PackageStyleOption) => {
    onSelect(option);
    
    // 檢查選項的 metadata 是否需要照片上傳
    const metadata = metadataMap.get(option.option_id);
    const requiresPhotoUpload = metadata?.requires_photo_upload === true;
    console.log(`[PackageStyleSelector] 選擇選項 ${option.option_id}, metadata:`, metadata, `requires_photo_upload:`, requiresPhotoUpload);
    
    onPhotoRequirementChange?.(requiresPhotoUpload, metadata);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {options.map((option) => {
          const isSelected = selectedOption?.option_id === option.option_id;
          // ✅ 區分 null 和 0：null = 不顯示價格，0 = 顯示免費
          const price = option.price_modifier;
          const priceText = price === null || price === undefined 
            ? "" // null = 不顯示
            : price > 0 
              ? ` +$${price}` 
              : " (免費)"; // 0 = 顯示免費

          return (
            <Button
              key={option.option_id}
              variant={isSelected ? "default" : "outline"}
              onClick={() => handleSelect(option)}
              className="h-auto py-4 text-base font-medium flex flex-col gap-1"
            >
              <span>{option.option_name_zh}</span>
              {priceText && (
                <span className="text-sm opacity-80">{priceText}</span>
              )}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
